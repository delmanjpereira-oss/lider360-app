'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
interface Colaborador { id_groot: string; nome: string; processo: string; status: string; }
interface Ritmo { id_groot: string; ritmo_pct: number; liquida?: number; unidades?: number; horas?: number; }
interface Bancada {
  id: number; zona: string; linha: number; lado: string; posicao: number;
  tipo_principal: string; subtipo: string | null; fixo_categoria: boolean; data_referencia: string;
}
interface Alocacao {
  id: number; bancada_id: number; id_groot: string; tipo_alocacao: string;
  bancada_fixa_id: number | null; data_referencia: string;
}
interface MetasConfig { p2m_base: number; p2m_alinhado_max: number; }
interface Toast { id: number; tipo: 'success' | 'error' | 'info'; msg: string; }
interface ConfirmModal { msg: string; onConfirm: () => void; onCancel?: () => void; }
const ZONA = 'p2m';
// 🔧 BANCADAS DINÂMICAS
// Quantidade PADRÃO de cada coluna (usada na 1ª vez, depois vem do banco/config)
const LAYOUT_DEFAULT = { L1_ESQ: 5, L1_DIR: 3, L2_ESQ: 3, L2_DIR: 5 };
// LIMITE máximo de bancadas GM por coluna:
//   lado de FORA de cada linha = 6 · lado de DENTRO (perto da zona central) = 3
//   K esquerda(fora)=6 · K direita(dentro)=3 · J direita(fora)=6 · J esquerda(dentro)=3
const LAYOUT_MAX = { L1_ESQ: 6, L1_DIR: 3, L2_ESQ: 3, L2_DIR: 6 };
// Altura de cada bancada (78px) + gap (8px) — usado pra esteira crescer junto
const ALTURA_BANCADA = 78;
const GAP_BANCADA = 8;
const ALTURA_COLUNA = 422;
const SUBTIPOS_CATEGORIA = ['Saneante', 'High Value', 'Cosméticos', 'Mapa', 'Saúde', 'Alimento'];
function maxColabsPorTipo(tipo: string): number {
  if (tipo === 'CATEGORIA') return 999;
  return 2;
}
function tipoEFixoAutomatico(tipo: string): boolean {
  return tipo === 'GM' || tipo === 'PESCA';
}
function corPorMeta(liquida: number | null | undefined, metas: MetasConfig) {
  if (liquida == null || liquida === 0) {
    return { status: 'sem_dado' as const, texto: 'text-gray-400', borda: 'border-[#2a2a2a]', bg: 'bg-[#1a1a1a]', emoji: '⚪', label: 'Sem dado' };
  }
  if (liquida < metas.p2m_base) return { status: 'ofensor' as const, texto: 'text-red-400', borda: 'border-red-500/50', bg: 'bg-red-500/10', emoji: '🔴', label: 'Ofensor' };
  if (liquida <= metas.p2m_alinhado_max) return { status: 'alinhado' as const, texto: 'text-blue-400', borda: 'border-blue-500/50', bg: 'bg-blue-500/10', emoji: '🔵', label: 'Alinhado' };
  return { status: 'supera' as const, texto: 'text-green-400', borda: 'border-green-500/50', bg: 'bg-green-500/10', emoji: '🟢', label: 'Supera' };
}
function corRitmoLinha(pct: number, metas: MetasConfig) {
  if (pct === 0) return { texto: 'text-gray-400', emoji: '⚪', label: 'Sem dados' };
  if (pct < 90) return { texto: 'text-red-400', emoji: '🔴', label: 'Ofensor' };
  if (pct < 100) return { texto: 'text-yellow-400', emoji: '🟡', label: 'Bom ritmo' };
  if (pct <= 106) return { texto: 'text-blue-400', emoji: '🔵', label: 'Alinhado' };
  return { texto: 'text-green-400', emoji: '🟢', label: 'Supera' };
}
function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function corTipo(tipo: string) {
  switch (tipo) {
    case 'GM': return { hex: '#FFD700', text: 'text-yellow-400' };
    case 'PESCA': return { hex: '#3b82f6', text: 'text-blue-400' };
    case 'CATEGORIA': return { hex: '#a855f7', text: 'text-purple-400' };
    default: return { hex: '#6b7280', text: 'text-gray-400' };
  }
}
function primeiroNome(nome: string) { return nome.trim().split(/\s+/)[0]; }
// 🏷️ Desambigua nomes: se vários colabs compartilham o primeiro nome,
// retorna "Victor J.P." em vez de só "Victor"
function nomeExibido(colab: { id_groot: string; nome: string }, todos: { id_groot: string; nome: string }[]): string {
  const primeiro = primeiroNome(colab.nome);
  const homonimos = todos.filter((c) =>
    c.id_groot !== colab.id_groot &&
    primeiroNome(c.nome).toLowerCase() === primeiro.toLowerCase()
  );
  if (homonimos.length === 0) return primeiro;
  const partes = colab.nome.trim().split(/\s+/);
  if (partes.length === 1) return primeiro;
  const iniciaisSobrenome = partes.slice(1).map((p) => p[0].toUpperCase() + '.').join('');
  return primeiro + ' ' + iniciaisSobrenome;
}
const STYLES = `
  @keyframes pulseGold { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.9), 0 0 30px rgba(255, 215, 0, 0.6); } 50% { box-shadow: 0 0 0 8px rgba(255, 215, 0, 0), 0 0 40px rgba(255, 215, 0, 0.8); } }
  @keyframes pulseGreen { 0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); border-color: rgba(34, 197, 94, 0.6) !important; } 50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); border-color: rgba(34, 197, 94, 1) !important; } }
  @keyframes successFlash { 0% { background: rgba(34, 197, 94, 0.4); } 50% { background: rgba(34, 197, 94, 0.15); } 100% { background: transparent; } }
  @keyframes ghostFloat { 0%, 100% { opacity: 0.35; transform: translateY(0px); } 50% { opacity: 0.55; transform: translateY(-2px); } }
  @keyframes synergyGlow { 0%, 100% { box-shadow: 0 0 8px rgba(255, 215, 0, 0.3); } 50% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.5); } }
  @keyframes shakeError { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
  @keyframes slideIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes pulseLine { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
  @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes toastOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(20px); } }
  @keyframes floatPulse { 0%, 100% { transform: translateY(0px); filter: brightness(1); } 50% { transform: translateY(-3px); filter: brightness(1.15); } }
  @keyframes shimmerGold { 0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); } 50% { box-shadow: 0 0 20px 2px rgba(255, 215, 0, 0.4); } 100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); } }
  .card-ativo { animation: pulseGold 1.2s ease-in-out infinite !important; border-color: #FFD700 !important; border-width: 2px !important; outline: 2px solid #FFD700 !important; outline-offset: 2px !important; z-index: 50; position: relative; }
  .bancada-compativel { animation: pulseGreen 1s ease-in-out infinite; cursor: pointer !important; }
  .bancada-encaixe { animation: successFlash 0.5s ease-out; }
  .bancada-erro { animation: shakeError 0.3s ease-in-out; }
  .card-sinergia { animation: ghostFloat 2.5s ease-in-out infinite, synergyGlow 2s ease-in-out infinite; background: rgba(255, 215, 0, 0.08) !important; border: 2px dashed #FFD700 !important; position: relative; overflow: hidden; }
  .card-sinergia::after { content: 'SINERGIA'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 7px; font-weight: 900; color: rgba(255, 215, 0, 0.5); letter-spacing: 1px; pointer-events: none; white-space: nowrap; }
  .card-temporario { border-color: #FFD700 !important; border-style: dashed !important; box-shadow: 0 0 6px rgba(255, 215, 0, 0.2); }
  .card-hover { transition: all 0.15s ease; }
  .card-hover:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }
  .card-arrastando { opacity: 0.4; }
  .nome-linha-input { background: transparent; border: none; outline: 1px solid #FFD700; color: #FFD700; font-size: 10px; font-weight: bold; text-align: center; width: 100%; padding: 2px 4px; border-radius: 3px; }
  .nome-linha-display { cursor: pointer; transition: all 0.15s ease; padding: 2px 6px; border-radius: 3px; }
  .nome-linha-display:hover { background: rgba(255, 215, 0, 0.1); color: #FFD700; }
  .badge-fixo { animation: synergyGlow 2s ease-in-out infinite; }
  .slide-in { animation: slideIn 0.3s ease-out; }
  .ritmo-linha-pulse { animation: pulseLine 2s ease-in-out infinite; }
  .toast-in { animation: toastIn 0.3s ease-out; }
  .toast-out { animation: toastOut 0.3s ease-out forwards; }
  [data-flip-key] { will-change: transform; transition: transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .flip-animating [data-flip-key] { animation: floatPulse 700ms ease-in-out, shimmerGold 700ms ease-out; }
  .flip-flash { animation: shimmerGold 800ms ease-out; }
`;
export default function LinhaPage() {
  const [colabs, setColabs] = useState<Colaborador[]>([]);
  const [ritmos, setRitmos] = useState<Record<string, Ritmo>>({});
  const [bancadas, setBancadas] = useState<Bancada[]>([]);
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [metas, setMetas] = useState<MetasConfig>({ p2m_base: 329, p2m_alinhado_max: 350 });
  const [nomesLinhas, setNomesLinhas] = useState<{ linha1: string; linha2: string }>({ linha1: 'Linha 1', linha2: 'Linha 2' });
  const [editandoLinha, setEditandoLinha] = useState<number | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cardAtivo, setCardAtivo] = useState<string | null>(null);
  const [hoverBancada, setHoverBancada] = useState<number | null>(null);
  const [encaixeBancada, setEncaixeBancada] = useState<number | null>(null);
  const [erroBancada, setErroBancada] = useState<number | null>(null);
  const [modal, setModal] = useState<{ linha: number; lado: string; posicao: number; bancadaExistente?: Bancada } | null>(null);
  const [modalSubtipo, setModalSubtipo] = useState<string>('');
  const [modalRotacao, setModalRotacao] = useState(false);
  const [rotacionando, setRotacionando] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [menuSinergia, setMenuSinergia] = useState<{ x: number; y: number; aloc: Alocacao } | null>(null);
  const [modoPrint, setModoPrint] = useState(false);
  const [printando, setPrintando] = useState(false);
  // 🔧 BANCADAS DINÂMICAS: quantidade de cada coluna (vem do banco) + modo edição
  const [layout, setLayout] = useState<{ L1_ESQ: number; L1_DIR: number; L2_ESQ: number; L2_DIR: number }>(LAYOUT_DEFAULT);
  const [modoCustomizar, setModoCustomizar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  function toast(tipo: 'success' | 'error' | 'info', msg: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tipo, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }
  function confirmar(msg: string, onConfirm: () => void) {
    setConfirmModal({ msg, onConfirm });
  }
  // 📸 Gera o PNG "Alocação Time DEL P2M" — layout de exportação próprio,
  // bonito, alinhado (esquadro), identidade MELI, com reservas.
  // NÃO fotografa a tela (que é preta); monta um container claro à parte.
  async function printarLayout() {
    setPrintando(true);
    try {
      let html2canvas: any = (window as any).html2canvas;
      if (!html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('falha ao carregar html2canvas'));
          document.head.appendChild(script);
        });
        html2canvas = (window as any).html2canvas;
      }
      const container = construirLayoutExportacao();
      document.body.appendChild(container);
      // reseta o scroll pro topo (evita o html2canvas somar offset e jogar tudo pra baixo)
      const scrollYAntes = window.scrollY;
      const scrollXAntes = window.scrollX;
      window.scrollTo(0, 0);
      // torna o container visível (mas atrás de tudo) só durante a captura
      container.style.opacity = '1';
      container.style.zIndex = '-9999';
      // espera imagens (logo) carregarem
      await new Promise((r) => setTimeout(r, 250));
      const larguraReal = container.offsetWidth;
      const alturaReal = container.offsetHeight;
      const canvas = await html2canvas(container, {
        backgroundColor: '#FFFFFF',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width: larguraReal,
        height: alturaReal,
        windowWidth: larguraReal,
        windowHeight: alturaReal,
      });
      document.body.removeChild(container);
      window.scrollTo(scrollXAntes, scrollYAntes);
      const link = document.createElement('a');
      const dataStr = new Date().toLocaleDateString('pt-BR').replace(/[/:\s,]/g, '-');
      link.download = 'Alocacao-Time-DEL-P2M-' + dataStr + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('success', '📸 PNG gerado');
    } catch (err: any) {
      toast('error', 'Erro ao gerar PNG: ' + err.message);
    } finally {
      setPrintando(false);
    }
  }

  // Monta o HTML do PNG de exportação (retorna um elemento pronto pra fotografar)
  function construirLayoutExportacao(): HTMLElement {
    const AZUL = '#1B2A8F';
    const AZUL2 = '#2536B0';
    const AZUL3 = '#0F1E6B';
    const AMARELO = '#FFE600';
    const DOURADO = '#F5C518';
    const H_BANCADA = 114;
    const GAP = 14;
    const PREP = ['de', 'da', 'do', 'dos', 'das', 'e'];
    const nomePng = (c: { nome: string }) => {
      const partes = c.nome.trim().split(/\s+/);
      if (partes.length === 1) return partes[0];
      const sob = partes.slice(1);
      const sig = sob.find((s) => !PREP.includes(s.toLowerCase())) || sob[0];
      return partes[0] + ' ' + sig[0].toUpperCase() + '.';
    };
    // Nome COMPLETO pra Pesca (primeiro nome + sobrenome inteiro), pra distinguir os "Matheus"
    const nomeCompletoPng = (c: { nome: string }) => {
      const partes = c.nome.trim().split(/\s+/);
      if (partes.length === 1) return partes[0];
      const sob = partes.slice(1);
      const sig = sob.find((s) => !PREP.includes(s.toLowerCase())) || sob[0];
      return partes[0] + ' ' + sig;
    };
    const ICON_PEOPLE = (cor: string, sz: number) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" fill="${cor}"/></svg>`;
    // Avatar: círculo com ícone de pessoa (branco)
    const ICON_AVATAR = (sz: number) => `<svg width="${Math.round(sz * 0.62)}" height="${Math.round(sz * 0.62)}" viewBox="0 0 24 24" fill="none"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" fill="#fff"/></svg>`;
    const corDe = (tipo: string) => {
      if (tipo === 'GM') return { label: '#8A6100', avatar: '#F5C518', bd: '#F5C518', grad: 'linear-gradient(180deg,#FFFFFF 0%,#FFFDF3 100%)' };
      if (tipo === 'PESCA') return { label: '#1D4FB0', avatar: '#2D6BE8', bd: '#2D6BE8', grad: 'linear-gradient(180deg,#FFFFFF 0%,#F5F9FF 100%)' };
      if (tipo === 'CATEGORIA') return { label: '#6B27B8', avatar: '#8B3FE8', bd: '#8B3FE8', grad: 'linear-gradient(180deg,#FFFFFF 0%,#FBF7FF 100%)' };
      return { label: '#5B6472', avatar: '#9AA2AF', bd: '#D2D8E0', grad: 'linear-gradient(180deg,#FFFFFF 0%,#F8F9FB 100%)' };
    };
    // cardPessoa: avatar com ÍCONE de pessoa; nome completo se for Pesca
    const cardPessoa = (col: { nome: string }, c: { avatar: string }, nomeCompleto = false) =>
      `<div style="flex:1;min-width:0;background:linear-gradient(180deg,#FFFFFF,#FAFBFC);border:1px solid #ECEEF1;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 4px;box-shadow:0 3px 5px rgba(16,24,40,.08),inset 0 1px 0 rgba(255,255,255,.8);"><div style="width:24px;height:24px;border-radius:50%;background:${c.avatar};display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 4px rgba(16,24,40,.15),inset 0 1px 1px rgba(255,255,255,.3);">${ICON_AVATAR(24)}</div><span style="font-size:11px;font-weight:700;color:#1A1D23;text-align:center;line-height:13px;white-space:nowrap;">${nomeCompleto ? nomeCompletoPng(col) : nomePng(col)}</span></div>`;
    // Número contínuo da bancada seguindo o FLUXO da rotação:
    // desce um lado (1..N do topo ao fundo), sobe o outro (N+1.. do fundo ao topo)
    const numeroBancada = (linha: number, lado: string, posicao: number): number => {
      const ladoDesce = linha === 1 ? 'esquerdo' : 'direito';
      const ladoSobe = linha === 1 ? 'direito' : 'esquerdo';
      const qtdDesce = linha === 1 ? layout.L1_ESQ : layout.L2_DIR;
      const qtdSobe = linha === 1 ? layout.L1_DIR : layout.L2_ESQ;
      if (lado === ladoDesce) {
        return posicao; // desce: topo=1 ... fundo=N
      }
      if (lado === ladoSobe) {
        // sobe: fundo = qtdDesce+1, subindo até o topo
        return qtdDesce + (qtdSobe - posicao + 1);
      }
      return posicao;
    };
    const bancadaHTML = (b: Bancada, num: number) => {
      const c = corDe(b.tipo_principal);
      const ehPesca = b.tipo_principal === 'PESCA';
      const ocupantes = alocacoes.filter((a) => a.bancada_id === b.id);
      const sinergias = alocacoes.filter((a) => a.bancada_fixa_id === b.id && a.bancada_id !== b.id);
      const cols = [...ocupantes, ...sinergias].map((a) => getColab(a.id_groot)).filter(Boolean) as { nome: string }[];
      const corpo = cols.length === 0
        ? `<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;z-index:1;"><span style="font-size:11px;color:#C4CAD3;font-weight:700;letter-spacing:2px;line-height:1;">VAZIA</span></div>`
        : `<div style="flex:1;display:flex;gap:6px;align-items:center;position:relative;z-index:1;">${cols.map((x) => cardPessoa(x, c, ehPesca)).join('')}</div>`;
      const badge = num ? `<span style="font-size:13px;font-weight:900;color:${AZUL};line-height:1;flex-shrink:0;">${num}</span>` : '';
      const sub = b.subtipo ? `<span style="font-size:8.5px;color:${c.label};font-weight:700;opacity:.75;line-height:1;"> · ${b.subtipo}</span>` : '';
      return `<div style="width:172px;height:${H_BANCADA}px;background:${c.grad};border:2px solid ${c.bd};border-radius:14px;box-shadow:0 6px 16px rgba(16,24,40,.12),0 2px 4px rgba(16,24,40,.08),inset 0 1px 0 rgba(255,255,255,.9);box-sizing:border-box;display:flex;flex-direction:column;padding:11px 11px 11px 11px;position:relative;">
        <div style="flex-shrink:0;display:flex;align-items:baseline;justify-content:space-between;gap:4px;margin-bottom:9px;position:relative;z-index:2;"><span style="font-size:11px;font-weight:800;letter-spacing:.6px;color:${c.label};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.tipo_principal}${sub}</span>${badge}</div>
        ${corpo}
      </div>`;
    };
    const espacador = () => `<div style="width:172px;height:${H_BANCADA}px;"></div>`;
    const colunaHTML = (linha: number, lado: string, qtd: number, qtdMax: number, alinharFundo: boolean) => {
      let slots = '';
      if (alinharFundo) { for (let k = 0; k < qtdMax - qtd; k++) slots += espacador(); }
      for (let p = 1; p <= qtd; p++) {
        const b = getBancada(linha, lado, p);
        slots += b ? bancadaHTML(b, numeroBancada(linha, lado, p)) : `<div style="width:172px;height:${H_BANCADA}px;border:2px dashed #E0E4EA;border-radius:14px;box-sizing:border-box;"></div>`;
      }
      return `<div style="display:flex;flex-direction:column;gap:${GAP}px;">${slots}</div>`;
    };
    const esteiraHTML = (qtdMax: number) => {
      const h = qtdMax * H_BANCADA + (qtdMax - 1) * GAP;
      // Esteira de ROLETES (cilindros transversais) com trilhos escuros - estilo CD industrial
      const nRoletes = Math.max(1, Math.round((h - 6) / 15));
      let roletes = '';
      for (let i = 0; i < nRoletes; i++) {
        roletes += `<div style="height:12px;border-radius:6px;background:linear-gradient(180deg,#D8DCE2 0%,#9AA2AF 45%,#5B6472 80%,#3A404C 100%);box-shadow:inset 0 1px 1px rgba(255,255,255,.5),0 1px 2px rgba(0,0,0,.2);flex-shrink:0;"></div>`;
      }
      return `<div style="width:38px;height:${h}px;border-radius:5px;padding:3px;background:linear-gradient(90deg,#2A2E38,#3A404C 15%,#3A404C 85%,#2A2E38);box-shadow:0 6px 16px rgba(16,24,40,.3);display:flex;flex-direction:column;gap:3px;box-sizing:border-box;overflow:hidden;flex-shrink:0;">${roletes}</div>`;
    };
    const centralHTML = () => {
      const cel = (linha: number, pos: number) => {
        const b = bancadas.find((x) => x.linha === linha && x.lado === 'centro' && x.posicao === pos);
        return b ? bancadaHTML(b, 0) : `<div style="width:172px;height:${H_BANCADA}px;border:2px dashed #E0E4EA;border-radius:14px;box-sizing:border-box;"></div>`;
      };
      return `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;padding:7px 20px;background:linear-gradient(180deg,#FFFFFF,#FBFCFD);border:2px solid ${DOURADO};border-radius:22px;box-shadow:0 4px 10px rgba(16,24,40,.12),inset 0 1px 0 rgba(255,255,255,.9);"><span style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:${AZUL};text-transform:uppercase;text-shadow:0 1px 1px rgba(255,255,255,.6);line-height:1;">Zona Central</span></div>
        <div style="border:2px dashed #C9CFD8;border-radius:18px;background:linear-gradient(135deg,#FCFCFD,#F6F8FA);padding:16px;display:grid;grid-template-columns:172px 172px;gap:${GAP}px;box-shadow:inset 0 2px 6px rgba(16,24,40,.04);">${cel(1, 1)}${cel(2, 1)}${cel(1, 2)}${cel(2, 2)}</div>
      </div>`;
    };
    const tituloLinha = (nm: string) => `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;width:100%;justify-content:center;"><div style="flex:1;max-width:80px;height:4px;background:linear-gradient(90deg,transparent,${DOURADO});border-radius:2px;box-shadow:0 1px 2px rgba(245,197,24,.4);"></div><div style="width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFE87A,${DOURADO});box-shadow:0 2px 5px rgba(245,197,24,.6),inset 0 1px 1px rgba(255,255,255,.5);"></div><span style="font-size:18px;font-weight:900;letter-spacing:3px;color:${AZUL};text-transform:uppercase;white-space:nowrap;text-shadow:0 2px 3px rgba(27,42,143,.18),0 1px 0 rgba(255,255,255,.5);line-height:1;">${nm}</span><div style="width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFE87A,${DOURADO});box-shadow:0 2px 5px rgba(245,197,24,.6),inset 0 1px 1px rgba(255,255,255,.5);"></div><div style="flex:1;max-width:80px;height:4px;background:linear-gradient(90deg,${DOURADO},transparent);border-radius:2px;box-shadow:0 1px 2px rgba(245,197,24,.4);"></div></div>`;
    const linhaHTML = (linha: number, nome: string) => {
      const qEsq = linha === 1 ? layout.L1_ESQ : layout.L2_ESQ;
      const qDir = linha === 1 ? layout.L1_DIR : layout.L2_DIR;
      const qMax = Math.max(qEsq, qDir);
      const fundoEsq = linha === 2;
      const fundoDir = linha === 1;
      const cE = colunaHTML(linha, 'esquerdo', qEsq, qMax, fundoEsq);
      const cD = colunaHTML(linha, 'direito', qDir, qMax, fundoDir);
      const est = esteiraHTML(qMax);
      const cols = `${cE}${est}${cD}`;
      return `<div style="display:flex;flex-direction:column;align-items:center;">${tituloLinha(nome)}<div style="display:flex;gap:10px;align-items:flex-start;">${cols}</div></div>`;
    };
    const livresList = colabsLivres();
    const reservasHTML = () => {
      const cards = livresList.length === 0
        ? `<div style="color:#B4BAC4;font-size:12px;font-style:italic;text-align:center;padding:16px 0;">Todos alocados</div>`
        : livresList.map((c) =>
            `<div style="background:linear-gradient(180deg,#FFFFFF,#FAFBFC);border:1px solid #EEF0F3;border-radius:11px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:9px;box-shadow:0 1px 3px rgba(16,24,40,.05),inset 0 1px 0 rgba(255,255,255,.8);"><div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#FFE600,#FFC400);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 4px rgba(245,197,24,.3),inset 0 1px 1px rgba(255,255,255,.4);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" fill="${AZUL}"/></svg></div><span style="font-size:12px;font-weight:700;color:#1A1D23;white-space:nowrap;line-height:1;">${nomePng(c)}</span></div>`).join('');
      return `<div style="width:192px;flex-shrink:0;background:#fff;border:1px solid #EAEDF1;border-radius:18px;padding:16px;box-shadow:0 3px 12px rgba(16,24,40,.06);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #F0F2F5;"><span style="font-size:13px;font-weight:900;letter-spacing:1px;color:${AZUL};text-transform:uppercase;line-height:1;">Reservas</span><div style="width:28px;height:28px;border-radius:50%;background:${AZUL};display:flex;align-items:center;justify-content:center;">${ICON_PEOPLE('#fff', 15)}</div></div>
        ${cards}
      </div>`;
    };
    const totalAlocados = alocacoes.length;
    const dataExt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const cap = dataExt.charAt(0).toUpperCase() + dataExt.slice(1);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:0;left:0;z-index:-9999;opacity:0;pointer-events:none;';
    wrap.innerHTML = `<div style="width:1600px;background:linear-gradient(180deg,#FFFFFF,#F4F6FA);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="background:linear-gradient(115deg,${AZUL3} 0%,${AZUL} 45%,${AZUL2} 100%);padding:26px 34px;display:flex;align-items:center;justify-content:space-between;position:relative;overflow:hidden;box-shadow:0 4px 16px rgba(27,42,143,.25);">
        <div style="position:absolute;right:-30px;top:-50px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,230,0,.1),transparent 70%);"></div>
        <div style="position:absolute;left:40%;bottom:-80px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.05),transparent 70%);"></div>
        <div style="display:flex;align-items:center;gap:20px;position:relative;">
          <div style="width:74px;height:60px;background:${AMARELO};border-radius:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 16px rgba(0,0,0,.2);overflow:hidden;"><img src="/logos/pngwing.com.png" style="width:64px;height:auto;" crossorigin="anonymous" /></div>
          <div><div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-.5px;text-shadow:0 2px 4px rgba(0,0,0,.15);line-height:1.1;">Alocação Time <span style="color:${AMARELO};">· DEL P2M</span></div><div style="font-size:13px;color:#AEB6E8;font-weight:500;margin-top:4px;">${cap}</div></div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;position:relative;">
          <div style="background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.2);border-radius:16px;padding:11px 20px;display:flex;align-items:center;gap:10px;">${ICON_PEOPLE('#fff', 22)}<div><div style="font-size:26px;font-weight:900;color:#fff;line-height:1;">${totalAlocados}</div><div style="font-size:10px;color:#AEB6E8;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Alocados</div></div></div>
          <div style="background:${AMARELO};border-radius:16px;padding:11px 20px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 12px rgba(255,230,0,.3);">${ICON_PEOPLE(AZUL, 22)}<div><div style="font-size:26px;font-weight:900;color:${AZUL};line-height:1;">${livresList.length}</div><div style="font-size:10px;color:#8A7A00;text-transform:uppercase;letter-spacing:1px;margin-top:2px;font-weight:700;">Reservas</div></div></div>
        </div>
      </div>
      <div style="display:flex;gap:22px;padding:14px 34px;border-bottom:1px solid #E8EBF0;background:rgba(255,255,255,.6);"><span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#4B5563;"><span style="width:14px;height:14px;border-radius:4px;background:#F5C518;"></span> GM</span><span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#4B5563;"><span style="width:14px;height:14px;border-radius:4px;background:#2D6BE8;"></span> Pesca</span><span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#4B5563;"><span style="width:14px;height:14px;border-radius:4px;background:#8B3FE8;"></span> Categoria</span></div>
      <div style="display:flex;gap:28px;padding:32px 34px;align-items:flex-start;">
        ${reservasHTML()}
        <div style="flex:1;display:flex;gap:28px;align-items:flex-start;justify-content:space-around;">
          ${linhaHTML(1, nomesLinhas.linha1)}
          ${centralHTML()}
          ${linhaHTML(2, nomesLinhas.linha2)}
        </div>
      </div>
      <div style="padding:16px 34px;border-top:1px solid #E8EBF0;background:linear-gradient(90deg,${AZUL3},${AZUL});display:flex;justify-content:space-between;align-items:center;"><span style="font-size:14px;font-weight:800;color:#fff;letter-spacing:.5px;line-height:1;">LIDER <span style="color:${AMARELO};">360</span></span><span style="font-size:11px;color:#AEB6E8;">Gerado em ${new Date().toLocaleString('pt-BR')}</span></div>
    </div>`;
    return wrap.firstElementChild as HTMLElement;
  }
  useEffect(() => { carregarTudo(); }, []);
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCardAtivo(null); setDraggingId(null); setModalRotacao(false); setConfirmModal(null); setMenuSinergia(null);
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
  async function carregarTudo() {
    setLoading(true);
    await carregarMetas();
    await carregarNomesLinhas();
    await carregarLayout();
    await garantirSlotsFixos();
    await Promise.all([carregarColabs(), carregarRitmos(), carregarBancadas(), carregarAlocacoes()]);
    setLoading(false);
  }
  // 🔧 BANCADAS DINÂMICAS: lê a quantidade de cada coluna do banco (config).
  // Se não existir, usa o padrão. Sempre respeita o limite máximo de cada coluna.
  async function carregarLayout() {
    const { data } = await supabase.from('config').select('chave, valor')
      .in('chave', ['qtd_L1_ESQ', 'qtd_L1_DIR', 'qtd_L2_ESQ', 'qtd_L2_DIR']);
    const map: Record<string, number> = {};
    (data || []).forEach((c: any) => { map[c.chave] = Number(c.valor) || 0; });
    const clamp = (chave: keyof typeof LAYOUT_DEFAULT, val: number) =>
      Math.min(LAYOUT_MAX[chave], Math.max(1, val || LAYOUT_DEFAULT[chave]));
    setLayout({
      L1_ESQ: clamp('L1_ESQ', map.qtd_L1_ESQ),
      L1_DIR: clamp('L1_DIR', map.qtd_L1_DIR),
      L2_ESQ: clamp('L2_ESQ', map.qtd_L2_ESQ),
      L2_DIR: clamp('L2_DIR', map.qtd_L2_DIR),
    });
  }
  // Salva a quantidade de uma coluna no banco
  async function salvarQtdColuna(chave: keyof typeof LAYOUT_DEFAULT, valor: number) {
    await supabase.from('config').upsert({ chave: 'qtd_' + chave, valor: String(valor) }, { onConflict: 'chave' });
  }
  // Mapeia (linha, lado) → chave do layout
  function chaveColuna(linha: number, lado: string): keyof typeof LAYOUT_DEFAULT {
    if (linha === 1) return lado === 'esquerdo' ? 'L1_ESQ' : 'L1_DIR';
    return lado === 'esquerdo' ? 'L2_ESQ' : 'L2_DIR';
  }
  // ➕ Adiciona um slot no fim da coluna (respeitando o limite máximo)
  async function adicionarSlot(linha: number, lado: string) {
    const chave = chaveColuna(linha, lado);
    const atual = layout[chave];
    if (atual >= LAYOUT_MAX[chave]) {
      toast('error', 'Limite de ' + LAYOUT_MAX[chave] + ' bancadas nesta coluna');
      return;
    }
    const novo = atual + 1;
    setLayout((prev) => ({ ...prev, [chave]: novo }));
    await salvarQtdColuna(chave, novo);
    toast('success', '➕ Bancada adicionada');
  }
  // ➖ Remove o ÚLTIMO slot da coluna. Se a última bancada tiver colab, BLOQUEIA.
  async function removerSlot(linha: number, lado: string) {
    const chave = chaveColuna(linha, lado);
    const atual = layout[chave];
    if (atual <= 1) {
      toast('error', 'A coluna precisa ter pelo menos 1 bancada');
      return;
    }
    // A bancada da última posição
    const ultima = getBancada(linha, lado, atual);
    if (ultima) {
      const ocupada = alocacoes.some((a) => a.bancada_id === ultima.id);
      if (ocupada) {
        toast('error', 'Esvazie a última bancada antes de remover');
        return;
      }
    }
    const novo = atual - 1;
    // Se existe bancada nessa posição, apaga do banco pra não virar órfã
    if (ultima) {
      const { error } = await supabase.from('layout_bancadas').delete().eq('id', ultima.id);
      if (error) { toast('error', 'Erro: ' + error.message); return; }
    }
    setLayout((prev) => ({ ...prev, [chave]: novo }));
    await salvarQtdColuna(chave, novo);
    await Promise.all([carregarBancadas(), carregarAlocacoes()]);
    toast('success', '➖ Bancada removida');
  }
  async function carregarMetas() {
    const { data } = await supabase.from('config').select('chave, valor').in('chave', ['meta_p2m_base', 'meta_p2m_alinhado_max']);
    const map: Record<string, number> = {};
    (data || []).forEach((c: any) => { map[c.chave] = Number(c.valor) || 0; });
    setMetas({ p2m_base: map.meta_p2m_base || 329, p2m_alinhado_max: map.meta_p2m_alinhado_max || 350 });
  }
  async function carregarNomesLinhas() {
    const { data } = await supabase.from('config').select('chave, valor').in('chave', ['nome_linha_1', 'nome_linha_2']);
    const map: Record<string, string> = {};
    (data || []).forEach((c: any) => { map[c.chave] = String(c.valor); });
    setNomesLinhas({ linha1: map.nome_linha_1 || 'Linha 1', linha2: map.nome_linha_2 || 'Linha 2' });
  }
  async function salvarNomeLinha(linha: number, nome: string) {
    const chave = 'nome_linha_' + linha;
    await supabase.from('config').upsert({ chave, valor: nome }, { onConflict: 'chave' });
    setNomesLinhas((prev) => ({ ...prev, [linha === 1 ? 'linha1' : 'linha2']: nome }));
    setEditandoLinha(null);
  }
  async function carregarColabs() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome, processo, status')
      .order('nome');
    const filtrados = (data || []).filter((c: any) => {
      const proc = (c.processo || '').trim().toUpperCase();
      const stat = (c.status || '').trim().toLowerCase();
      return proc === 'P2M' && stat === 'ativo';
    });
    setColabs(filtrados);
  }
  // ✅ RITMOS continuam por dia (vêm do CSV diário)
  async function carregarRitmos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('ritmo_atual').select('id_groot, ritmo_pct, unidades, horas').eq('data_referencia', hoje);
    const map: Record<string, Ritmo> = {};
    (data || []).forEach((r: any) => {
      let liquida = r.ritmo_pct;
      if (r.unidades && r.horas && r.horas > 0) liquida = Math.round(r.unidades / r.horas);
      map[r.id_groot] = { ...r, liquida };
    });
    setRitmos(map);
  }
  // 🔑 OPÇÃO A: BANCADAS PERMANENTES - SEM filtro de data
  async function carregarBancadas() {
    const { data } = await supabase
      .from('layout_bancadas')
      .select('*')
      .eq('zona', ZONA)
      .order('posicao');
    setBancadas(data || []);
  }
  // 🔑 OPÇÃO A: ALOCAÇÕES PERMANENTES - SEM filtro de data
  async function carregarAlocacoes() {
    const { data } = await supabase
      .from('layout_alocacao')
      .select('*');
    setAlocacoes(data || []);
  }
  // 🔑 OPÇÃO A: SLOTS FIXOS verificam existência permanente (sem data)
  // Só cria se realmente não existir nenhum slot fixo da Zona Central
  async function garantirSlotsFixos() {
    const { data: existentes } = await supabase
      .from('layout_bancadas')
      .select('id, linha, posicao')
      .eq('zona', ZONA)
      .eq('lado', 'centro')
      .eq('fixo_categoria', true);
    const jaTem = new Set((existentes || []).map((b: any) => b.linha + '-' + b.posicao));
    const slotsFixos = [
      { linha: 1, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 1, posicao: 2, tipo_principal: 'CATEGORIA' },
      { linha: 2, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 2, posicao: 2, tipo_principal: 'CATEGORIA' },
    ];
    const aCriar = slotsFixos.filter((s) => !jaTem.has(s.linha + '-' + s.posicao));
    if (aCriar.length === 0) return;
    const hoje = new Date().toISOString().split('T')[0];
    await supabase.from('layout_bancadas').insert(aCriar.map((s) => ({
      zona: ZONA, linha: s.linha, lado: 'centro', posicao: s.posicao,
      tipo_principal: s.tipo_principal, subtipo: null, fixo_categoria: true, data_referencia: hoje,
    })));
  }
  function limparRitmos() {
    confirmar('Limpar TODOS os ritmos do dia?', async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('ritmo_atual').delete().eq('data_referencia', hoje);
      if (error) { toast('error', 'Erro: ' + error.message); return; }
      toast('success', '✅ Ritmos limpos');
      await carregarRitmos();
    });
  }
  // 🔑 NOVO: Limpar TODAS as alocações (botão "Limpar Time")
  function limparTodasAlocacoes() {
    confirmar('Tirar TODOS os colabs das bancadas? Eles voltam pra lista de livres. (Não afeta bancadas nem ritmos.)', async () => {
      const { error } = await supabase.from('layout_alocacao').delete().neq('id', 0);
      if (error) { toast('error', 'Erro: ' + error.message); return; }
      toast('success', '✅ Time esvaziado');
      await carregarAlocacoes();
    });
  }
  async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (linhas.length < 2) { toast('error', 'CSV vazio'); return; }
      const sep = linhas[0].includes(';') ? ';' : ',';
      const header = linhas[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, ''));
      const idxGroot = header.findIndex((h) => h.includes('groot') || h === 'id' || h === 'id_groot' || h === 'usuario' || h === 'matricula' || h.includes('id_colab') || h.includes('representante'));
      const idxNome = header.findIndex((h) => h === 'nome' || h.includes('nome') || h === 'colaborador' || h.includes('representante'));
      const idxRitmo = header.findIndex((h) => h.includes('liquida sist') || h.includes('liquid') || h.includes('ritmo') || h.includes('pct') || h === '%' || h.includes('produtividade') || h === 'prod' || h === 'prod_liquida');
      const idxUnid = header.findIndex((h) => h.includes('unidades') || h.includes('unid') || h.includes('qtd') || h.includes('quantidade') || h === 'pcs');
      const idxHoras = header.findIndex((h) => h.includes('tempo em processo') || h.includes('tempo efetivo') || h.includes('tempo_processo') || h.includes('tempo'));
      if (idxGroot === -1 || idxRitmo === -1) { toast('error', 'CSV inválido. Faltam colunas id_groot/ritmo'); return; }
      const hoje = new Date().toISOString().split('T')[0];
      const registros: any[] = [];
      let pulou = 0;
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(sep).map((c) => c.trim().replace(/"/g, ''));
        const id_groot = cols[idxGroot];
        if (!id_groot) { pulou++; continue; }
        const ritmoRaw = (cols[idxRitmo] || '').replace('%', '').replace(',', '.').trim();
        const ritmo_pct = Math.round(parseFloat(ritmoRaw));
        if (isNaN(ritmo_pct) || ritmo_pct < 0) { pulou++; continue; }
        const reg: any = { id_groot, ritmo_pct, data_referencia: hoje, hora_atualizacao: new Date().toISOString() };
        if (idxNome !== -1 && cols[idxNome]) reg.nome = cols[idxNome];
        if (idxUnid !== -1 && cols[idxUnid]) { const u = parseInt(cols[idxUnid].replace(/\./g, ''), 10); if (!isNaN(u)) reg.unidades = u; }
        if (idxHoras !== -1 && cols[idxHoras]) {
          const raw = cols[idxHoras].trim();
          let h = 0;
          if (raw.includes(':')) {
            const parts = raw.split(':').map((p) => parseInt(p, 10) || 0);
            h = (parts[0] || 0) + ((parts[1] || 0) / 60) + ((parts[2] || 0) / 3600);
          } else {
            h = parseFloat(raw.replace(',', '.'));
          }
          if (!isNaN(h) && h > 0) reg.horas = h;
        }
        registros.push(reg);
      }
      if (registros.length === 0) { toast('error', 'Nenhum registro válido'); return; }
      const { error } = await supabase.from('ritmo_atual').upsert(registros, { onConflict: 'id_groot,data_referencia' });
      if (error) { toast('error', 'Erro: ' + error.message); return; }
      toast('success', '✅ ' + registros.length + ' ritmo(s) atualizado(s)');
      await carregarRitmos();
    } catch (err: any) {
      toast('error', 'Erro: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  async function criarBancadaGM(linha: number, lado: string, posicao: number) {
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('layout_bancadas').insert({
      zona: ZONA, linha, lado, posicao, tipo_principal: 'GM', subtipo: null, fixo_categoria: false, data_referencia: hoje,
    });
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarBancadas();
  }
  function abrirModalEditarSubtipo(b: Bancada) {
    setModal({ linha: b.linha, lado: b.lado, posicao: b.posicao, bancadaExistente: b });
    setModalSubtipo(b.subtipo || '');
  }
  function fecharModal() { setModal(null); setModalSubtipo(''); }
  async function salvarModal() {
    if (!modal || !modal.bancadaExistente) return;
    if (!modalSubtipo) { toast('error', 'Escolha um sub-tipo'); return; }
    const { error } = await supabase.from('layout_bancadas').update({ subtipo: modalSubtipo }).eq('id', modal.bancadaExistente.id);
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarBancadas();
    fecharModal();
  }
  function limparBancada(b: Bancada) {
    if (b.fixo_categoria) { toast('error', 'Bancada fixa não pode ser removida'); return; }
    confirmar('Limpar esta bancada?', async () => {
      const { error } = await supabase.from('layout_bancadas').delete().eq('id', b.id);
      if (error) { toast('error', 'Erro: ' + error.message); return; }
      await Promise.all([carregarBancadas(), carregarAlocacoes()]);
    });
  }
  // 🔑 OPÇÃO A: aloca/move colab — sempre remove qualquer alocação anterior dele
  async function alocarColab(idGroot: string, bancada: Bancada) {
    const hoje = new Date().toISOString().split('T')[0];
    const atuais = alocacoes.filter((a) => a.bancada_id === bancada.id);
    const maxColabs = maxColabsPorTipo(bancada.tipo_principal);
    if (atuais.length >= maxColabs) {
      setErroBancada(bancada.id);
      setTimeout(() => setErroBancada(null), 400);
      toast('error', 'Bancada cheia');
      return;
    }
    const alocAtual = alocacoes.find((a) => a.id_groot === idGroot);
    let bancadaFixaId: number | null = null;
    if (alocAtual?.bancada_fixa_id) bancadaFixaId = alocAtual.bancada_fixa_id;
    else if (tipoEFixoAutomatico(bancada.tipo_principal)) bancadaFixaId = bancada.id;
    let tipoAlocacao = 'fixo';
    if (bancadaFixaId && bancadaFixaId !== bancada.id) tipoAlocacao = 'temporario';
    // SEM filtro de data - garante 1 alocação só por colab
    await supabase.from('layout_alocacao').delete().eq('id_groot', idGroot);
    const { error } = await supabase.from('layout_alocacao').insert({
      bancada_id: bancada.id, id_groot: idGroot,
      tipo_alocacao: tipoAlocacao, bancada_fixa_id: bancadaFixaId, data_referencia: hoje,
    });
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    setEncaixeBancada(bancada.id);
    setTimeout(() => setEncaixeBancada(null), 500);
    setCardAtivo(null);
    setDraggingId(null);
    await carregarAlocacoes();
  }
  async function removerColab(alocId: number) {
    const { error } = await supabase.from('layout_alocacao').delete().eq('id', alocId);
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarAlocacoes();
  }
  async function removerFixo(idGroot: string) {
    const aloc = alocacoes.find((a) => a.id_groot === idGroot);
    if (!aloc) return;
    const { error } = await supabase.from('layout_alocacao').update({ bancada_fixa_id: null, tipo_alocacao: 'fixo' }).eq('id', aloc.id);
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarAlocacoes();
  }
  async function voltarOrigem(aloc: Alocacao) {
    if (!aloc.bancada_fixa_id) { toast('error', 'Sem origem registrada'); return; }
    const bancadaOrigem = bancadas.find((b) => b.id === aloc.bancada_fixa_id);
    if (!bancadaOrigem) { toast('error', 'Bancada de origem não encontrada'); return; }
    const ocupacaoOrigem = alocacoes.filter((a) => a.bancada_id === bancadaOrigem.id && a.id !== aloc.id).length;
    if (ocupacaoOrigem >= maxColabsPorTipo(bancadaOrigem.tipo_principal)) {
      toast('error', 'Bancada de origem está cheia');
      return;
    }
    const posicoesAntes = capturarPosicoesCards();
    const { error } = await supabase
      .from('layout_alocacao')
      .update({ bancada_id: bancadaOrigem.id, tipo_alocacao: 'fixo' })
      .eq('id', aloc.id);
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarAlocacoes();
    await new Promise((r) => setTimeout(r, 50));
    animarFLIP(posicoesAntes);
    toast('success', '↩️ Voltou pra origem');
  }
  async function fixarAqui(aloc: Alocacao) {
    const { error } = await supabase
      .from('layout_alocacao')
      .update({ bancada_fixa_id: aloc.bancada_id, tipo_alocacao: 'fixo' })
      .eq('id', aloc.id);
    if (error) { toast('error', 'Erro: ' + error.message); return; }
    await carregarAlocacoes();
    toast('success', '📍 Fixado aqui');
  }
  function getBancada(linha: number, lado: string, posicao: number) {
    return bancadas.find((b) => b.zona === ZONA && b.linha === linha && b.lado === lado && b.posicao === posicao);
  }
  // ============================================================
  // 🎯 ROTAÇÃO CORRIGIDA — o sentido do ciclo estava invertido.
  // Agora: DESCE por um lado (topo→fundo), cruza embaixo,
  // SOBE pelo outro (fundo→topo), e a Pesca/Categoria ficam
  // no FIM do ciclo (a "ponte" do topo que volta pro começo).
  //
  // Linha 1 (K): desce ESQUERDA, sobe DIREITA, pesca/cat no fim
  // Linha 2 (J): desce DIREITA, sobe ESQUERDA (espelhado)
  // ============================================================
  function getCicloLinha(linha: number, comPesca: boolean): Bancada[] {
    const ciclo: Bancada[] = [];
    const ladoDesce = linha === 1 ? 'esquerdo' : 'direito';
    const ladoSobe = linha === 1 ? 'direito' : 'esquerdo';
    const qtdDesce = linha === 1 ? layout.L1_ESQ : layout.L2_DIR;
    const qtdSobe = linha === 1 ? layout.L1_DIR : layout.L2_ESQ;
    // 1) DESCE pelo ladoDesce: do TOPO ao FUNDO (posição 1 → última)
    for (let p = 1; p <= qtdDesce; p++) {
      const b = getBancada(linha, ladoDesce, p);
      if (b && b.tipo_principal === 'GM') ciclo.push(b);
    }
    // 2) SOBE pelo ladoSobe: do FUNDO ao TOPO (última → posição 1)
    //    (o cruzamento de baixo acontece aqui: fundo do ladoDesce → fundo do ladoSobe)
    for (let p = qtdSobe; p >= 1; p--) {
      const b = getBancada(linha, ladoSobe, p);
      if (b && b.tipo_principal === 'GM') ciclo.push(b);
    }
    // 3) PESCA e CATEGORIA no FIM (a ponte do topo, que fecha o ciclo pro começo)
    const cat = bancadas.find((b) => b.linha === linha && b.lado === 'centro' && b.tipo_principal === 'CATEGORIA');
    const pesca = bancadas.find((b) => b.linha === linha && b.lado === 'centro' && b.tipo_principal === 'PESCA');
    if (comPesca && pesca) ciclo.push(pesca);
    if (cat) ciclo.push(cat);
    return ciclo;
  }
  async function getHistoricoPesca(idGroot: string, linha: number): Promise<number> {
    const { data } = await supabase.from('rotacao_pesca_historico').select('id').eq('id_groot', idGroot).eq('linha', linha);
    return (data || []).length;
  }
  async function registrarPesca(idGroot: string, linha: number) {
    await supabase.from('rotacao_pesca_historico').insert({
      id_groot: idGroot, linha, data_pesca: new Date().toISOString().split('T')[0],
    });
  }
  function capturarPosicoesCards(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    document.querySelectorAll('[data-flip-key]').forEach((el) => {
      const key = (el as HTMLElement).dataset.flipKey;
      if (key) map.set(key, el.getBoundingClientRect());
    });
    return map;
  }
  function animarFLIP(posicoesAntes: Map<string, DOMRect>) {
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-flip-key]').forEach((el) => {
        const elemento = el as HTMLElement;
        const key = elemento.dataset.flipKey;
        if (!key) return;
        const antes = posicoesAntes.get(key);
        if (!antes) return;
        const depois = elemento.getBoundingClientRect();
        const dx = antes.left - depois.left;
        const dy = antes.top - depois.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        elemento.style.transition = 'none';
        elemento.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        elemento.offsetHeight;
        requestAnimationFrame(() => {
          elemento.style.transition = 'transform 700ms cubic-bezier(0.34, 1.56, 0.64, 1)';
          elemento.style.transform = 'translate(0px, 0px)';
          elemento.classList.add('flip-flash');
          setTimeout(() => {
            elemento.style.transition = '';
            elemento.style.transform = '';
            elemento.classList.remove('flip-flash');
          }, 800);
        });
      });
    });
  }
  async function aplicarRotacao(tipo: 1 | 2 | 3) {
    setRotacionando(true);
    try {
      const posicoesAntes = capturarPosicoesCards();
      if (tipo === 3) await rotacaoNivelar();
      else await rotacaoCiclo(tipo === 2);
      // Após rotação: todos viram fixos da bancada atual (sem sinergia residual)
      const { data: alocsAtuais } = await supabase
        .from('layout_alocacao')
        .select('id, bancada_id');
      if (alocsAtuais && alocsAtuais.length > 0) {
        await Promise.all(
          alocsAtuais.map((a: any) =>
            supabase
              .from('layout_alocacao')
              .update({ bancada_fixa_id: a.bancada_id, tipo_alocacao: 'fixo' })
              .eq('id', a.id)
          )
        );
      }
      await carregarAlocacoes();
      await new Promise((r) => setTimeout(r, 50));
      animarFLIP(posicoesAntes);
      await new Promise((r) => setTimeout(r, 800));
      toast('success', '✅ Rotação ' + tipo + ' aplicada');
    } catch (err: any) {
      toast('error', 'Erro: ' + err.message);
    } finally {
      setRotacionando(false);
      setModalRotacao(false);
    }
  }
  async function rotacaoCiclo(comPesca: boolean) {
    const hoje = new Date().toISOString().split('T')[0];
    for (const linha of [1, 2]) {
      const ciclo = getCicloLinha(linha, comPesca);
      if (ciclo.length === 0) continue;
      const ocupantes: Array<{ bancada: Bancada; alocs: Alocacao[] }> = ciclo.map((b) => ({
        bancada: b,
        alocs: alocacoes.filter((a) => a.bancada_id === b.id),
      }));
      const novas: Array<{ id_groot: string; bancada_id: number; bancada_fixa_id: number | null; tipo: string }> = [];
      for (let i = 0; i < ocupantes.length; i++) {
        const proximaIdx = (i + 1) % ocupantes.length;
        const proximaBancada = ocupantes[proximaIdx].bancada;
        for (const aloc of ocupantes[i].alocs) {
          let novoFixoId: number | null = null;
          let novoTipo = 'fixo';
          if (tipoEFixoAutomatico(proximaBancada.tipo_principal)) {
            novoFixoId = proximaBancada.id;
            novoTipo = 'fixo';
          } else {
            novoFixoId = aloc.bancada_fixa_id;
            novoTipo = novoFixoId ? 'temporario' : 'fixo';
          }
          novas.push({
            id_groot: aloc.id_groot,
            bancada_id: proximaBancada.id,
            bancada_fixa_id: novoFixoId,
            tipo: novoTipo,
          });
        }
      }
      if (comPesca) {
        const idxPesca = ciclo.findIndex((b) => b.tipo_principal === 'PESCA');
        const idxCat = ciclo.findIndex((b) => b.tipo_principal === 'CATEGORIA');
        if (idxPesca >= 0 && idxCat >= 0) {
          const indoPesca = novas.filter((n) => n.bancada_id === ciclo[idxPesca].id);
          const indoCat = novas.filter((n) => n.bancada_id === ciclo[idxCat].id);
          const candidatos = [...indoPesca, ...indoCat];
          if (candidatos.length === 2) {
            const c1 = candidatos[0];
            const c2 = candidatos[1];
            const v1 = await getHistoricoPesca(c1.id_groot, linha);
            const v2 = await getHistoricoPesca(c2.id_groot, linha);
            let paraPesca: typeof c1;
            let paraCat: typeof c2;
            if (v1 < v2) { paraPesca = c1; paraCat = c2; }
            else if (v2 < v1) { paraPesca = c2; paraCat = c1; }
            else { paraPesca = Math.random() < 0.5 ? c1 : c2; paraCat = paraPesca === c1 ? c2 : c1; }
            paraPesca.bancada_id = ciclo[idxPesca].id;
            paraPesca.bancada_fixa_id = ciclo[idxPesca].id;
            paraPesca.tipo = 'fixo';
            paraCat.bancada_id = ciclo[idxCat].id;
            paraCat.tipo = paraCat.bancada_fixa_id ? 'temporario' : 'fixo';
            await registrarPesca(paraPesca.id_groot, linha);
          }
        }
      }
      const bancadasLinhaIds = ciclo.map((b) => b.id);
      const idsRemove = alocacoes.filter((a) => bancadasLinhaIds.includes(a.bancada_id)).map((a) => a.id);
      if (idsRemove.length > 0) {
        await supabase.from('layout_alocacao').delete().in('id', idsRemove);
      }
      if (novas.length > 0) {
        await supabase.from('layout_alocacao').insert(
          novas.map((n) => ({
            bancada_id: n.bancada_id,
            id_groot: n.id_groot,
            tipo_alocacao: n.tipo,
            bancada_fixa_id: n.bancada_fixa_id,
            data_referencia: hoje,
          }))
        );
      }
    }
  }
  async function rotacaoNivelar() {
    for (const linha of [1, 2]) {
      for (const lado of ['esquerdo', 'direito']) {
        const qtd = linha === 1
          ? (lado === 'esquerdo' ? layout.L1_ESQ : layout.L1_DIR)
          : (lado === 'esquerdo' ? layout.L2_ESQ : layout.L2_DIR);
        if (qtd < 2) continue;
        const bTopo = getBancada(linha, lado, 1);
        const bUltimo = getBancada(linha, lado, qtd);
        if (!bTopo || !bUltimo) continue;
        if (bTopo.tipo_principal !== 'GM' || bUltimo.tipo_principal !== 'GM') continue;
        const alocsTopo = alocacoes.filter((a) => a.bancada_id === bTopo.id);
        const alocsUltimo = alocacoes.filter((a) => a.bancada_id === bUltimo.id);
        for (const a of alocsTopo) {
          await supabase.from('layout_alocacao').update({
            bancada_id: bUltimo.id,
            bancada_fixa_id: bUltimo.id,
            tipo_alocacao: 'fixo',
          }).eq('id', a.id);
        }
        for (const a of alocsUltimo) {
          await supabase.from('layout_alocacao').update({
            bancada_id: bTopo.id,
            bancada_fixa_id: bTopo.id,
            tipo_alocacao: 'fixo',
          }).eq('id', a.id);
        }
      }
    }
  }
  function getAlocacoesBancada(bancadaId: number) { return alocacoes.filter((a) => a.bancada_id === bancadaId); }
  function getColab(idGroot: string) { return colabs.find((c) => c.id_groot === idGroot); }
  function colabsLivres() {
    const ids = new Set(alocacoes.map((a) => a.id_groot));
    return colabs.filter((c) => !ids.has(c.id_groot));
  }
  function sinergiasDe(bancadaId: number) {
    return alocacoes.filter((a) => a.bancada_fixa_id === bancadaId && a.bancada_id !== bancadaId);
  }
  function bancadaCompativel(bancada: Bancada): boolean {
    if (!cardAtivo && !draggingId) return false;
    const idCheck = cardAtivo || draggingId;
    const alocAtual = alocacoes.find((a) => a.id_groot === idCheck);
    if (alocAtual?.bancada_id === bancada.id) return false;
    const atuais = alocacoes.filter((a) => a.bancada_id === bancada.id);
    return atuais.length < maxColabsPorTipo(bancada.tipo_principal);
  }
  function calcularRitmoLinha(linha: number) {
    const bancadasGM = bancadas.filter((b) => b.linha === linha && b.tipo_principal === 'GM');
    const bancadasIds = new Set(bancadasGM.map((b) => b.id));
    const alocsLinha = alocacoes.filter((a) => bancadasIds.has(a.bancada_id));
    let totalUnidades = 0;
    let totalHoras = 0;
    let supera = 0, alinhado = 0, ofensor = 0, semDado = 0;
    alocsLinha.forEach((a) => {
      const ritmo = ritmos[a.id_groot];
      if (!ritmo) { semDado++; return; }
      const liq = ritmo.liquida;
      if (ritmo.unidades && ritmo.horas && ritmo.horas > 0) {
        totalUnidades += ritmo.unidades;
        totalHoras += ritmo.horas;
      }
      if (liq == null || liq === 0) { semDado++; return; }
      if (liq < metas.p2m_base) ofensor++;
      else if (liq <= metas.p2m_alinhado_max) alinhado++;
      else supera++;
    });
    const totalAtivos = alocsLinha.length;
    if (totalHoras === 0) {
      const liquidas: number[] = [];
      alocsLinha.forEach((a) => {
        const ritmo = ritmos[a.id_groot];
        if (ritmo?.liquida && ritmo.liquida > 0) liquidas.push(ritmo.liquida);
      });
      if (liquidas.length === 0) {
        return {
          pctMedio: 0, pecasHora: 0, totalUnidades: 0, totalHoras: 0,
          totalAtivos, supera, alinhado, ofensor, semDado
        };
      }
      const mediaLiq = liquidas.reduce((a, b) => a + b, 0) / liquidas.length;
      const pctMedio = Math.round((mediaLiq / metas.p2m_base) * 100);
      return {
        pctMedio,
        pecasHora: Math.round(mediaLiq),
        totalUnidades: 0,
        totalHoras: 0,
        totalAtivos, supera, alinhado, ofensor, semDado
      };
    }
    const pecasHora = totalUnidades / totalHoras;
    const pctMedio = Math.round((pecasHora / metas.p2m_base) * 100);
    return {
      pctMedio,
      pecasHora: Math.round(pecasHora),
      totalUnidades,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalAtivos, supera, alinhado, ofensor, semDado
    };
  }
  function CardColabSidebar({ c }: { c: Colaborador }) {
    const ritmo = ritmos[c.id_groot];
    const cor = corPorMeta(ritmo?.liquida, metas);
    const isDragging = draggingId === c.id_groot;
    const isAtivo = cardAtivo === c.id_groot;
    return (
      <div
        draggable
        onDragStart={(e) => { setDraggingId(c.id_groot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id_groot); }}
        onDragEnd={() => { setDraggingId(null); setHoverBancada(null); }}
        onDoubleClick={() => setCardAtivo(isAtivo ? null : c.id_groot)}
        className={cor.bg + ' ' + cor.borda + ' border-2 rounded-md px-2 py-1.5 mb-1.5 cursor-grab active:cursor-grabbing card-hover' + (isDragging ? ' card-arrastando' : '') + (isAtivo ? ' card-ativo' : '')}
        title="Arrasta pra alocar | Double-click pra ativar"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={'text-[10px] font-bold ' + cor.texto + ' flex-shrink-0'}>{iniciais(c.nome)}</span>
            <span className="text-[10px] text-white truncate">{nomeExibido(c, colabs)}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {ritmo?.liquida != null && ritmo.liquida > 0 && (<span className={'text-[9px] font-bold ' + cor.texto}>{ritmo.liquida}</span>)}
            <span className="text-[9px]">{cor.emoji}</span>
          </div>
        </div>
      </div>
    );
  }
  function CardColabBancada({ aloc, expandido, bancadaAtual }: { aloc: Alocacao; expandido?: boolean; bancadaAtual: Bancada }) {
    const c = getColab(aloc.id_groot);
    if (!c) return null;
    const ritmo = ritmos[aloc.id_groot];
    const cor = corPorMeta(ritmo?.liquida, metas);
    const liquida = ritmo?.liquida;
    const eFixoAqui = aloc.bancada_fixa_id === bancadaAtual.id && aloc.bancada_id === bancadaAtual.id;
    const eTemporario = aloc.tipo_alocacao === 'temporario';
    const isDragging = draggingId === aloc.id_groot;
    const isAtivo = cardAtivo === aloc.id_groot;
    const dragHandlers = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => { e.stopPropagation(); setDraggingId(aloc.id_groot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', aloc.id_groot); },
      onDragEnd: () => { setDraggingId(null); setHoverBancada(null); },
      onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); setCardAtivo(isAtivo ? null : aloc.id_groot); },
      onContextMenu: (e: React.MouseEvent) => {
        if (!eTemporario) return;
        e.preventDefault();
        e.stopPropagation();
        setMenuSinergia({ x: e.clientX, y: e.clientY, aloc });
      },
    };
    const titulo = c.nome + (liquida ? ' · ' + liquida + ' pç/h · ' + cor.label : '') + (eFixoAqui ? ' · fixo' : '') + (eTemporario ? ' · temp' : '');
    if (expandido) {
      return (
        <div {...dragHandlers} title={titulo}
          data-flip-key={'colab-' + aloc.id_groot}
          className={'relative group ' + cor.borda + ' ' + cor.bg + ' border rounded px-2 py-1 flex items-center justify-between gap-2 transition-all slide-in cursor-grab active:cursor-grabbing card-hover flex-shrink-0' + (isDragging ? ' card-arrastando' : '') + (isAtivo ? ' card-ativo' : '') + (eTemporario ? ' card-temporario' : '')}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={'text-[9px] font-bold ' + cor.texto}>{iniciais(c.nome)}</span>
            <span className="text-[10px] text-white truncate">{nomeExibido(c, colabs)}</span>
            {eFixoAqui && !modoPrint && <span className="text-[9px] badge-fixo" title="Fixo">📍</span>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!modoPrint && (liquida != null && liquida > 0 ? (<span className={'text-[10px] font-black ' + cor.texto}>{liquida}</span>) : (<span className="text-gray-600 text-[10px]">—</span>))}
            {!modoPrint && (
              <button onClick={(e) => { e.stopPropagation(); removerColab(aloc.id); }}
                className="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-400 text-[11px] leading-none ml-0.5"
                title="Remover">×</button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div {...dragHandlers} title={titulo}
        data-flip-key={'colab-' + aloc.id_groot}
        className={'relative group flex-1 h-full rounded border ' + (modoPrint ? 'border-gray-700 bg-[#1a1a1a]' : cor.borda + ' ' + cor.bg) + ' flex flex-col items-center justify-center transition-all slide-in cursor-grab active:cursor-grabbing card-hover' + (isDragging ? ' card-arrastando' : '') + (isAtivo ? ' card-ativo' : '') + (eTemporario ? ' card-temporario' : '')}>
        {eFixoAqui && !modoPrint && (<span className="absolute top-0 left-0.5 text-[8px] badge-fixo" title="Fixo">📍</span>)}
        {modoPrint ? (
          <span className="text-[11px] font-bold text-white text-center px-1 leading-tight">{nomeExibido(c, colabs)}</span>
        ) : (
          <>
            {liquida != null && liquida > 0 ? (<span className={'text-base font-black ' + cor.texto + ' leading-none tracking-tight'}>{liquida}</span>) : (<span className="text-gray-600 text-sm">—</span>)}
            <span className="text-[7px] text-gray-500 mt-0.5">{nomeExibido(c, colabs)}</span>
          </>
        )}
        {!modoPrint && (
          <button onClick={(e) => { e.stopPropagation(); removerColab(aloc.id); }}
            className="absolute top-0 right-0.5 opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-400 text-[10px] leading-none"
            title="Remover">×</button>
        )}
      </div>
    );
  }
  function CardSinergia({ aloc, expandido }: { aloc: Alocacao; expandido?: boolean }) {
    const c = getColab(aloc.id_groot);
    if (!c) return null;
    function handleContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      confirmar('Remover marca de fixo de ' + c!.nome + '?', () => removerFixo(aloc.id_groot));
    }
    if (expandido) {
      return (
        <div className="card-sinergia rounded px-2 py-1 flex items-center justify-between gap-2 flex-shrink-0"
          title={c.nome + ' (fixo aqui · right-click pra remover)'}
          onContextMenu={handleContextMenu}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-bold text-yellow-400/70">{iniciais(c.nome)}</span>
            <span className="text-[10px] text-yellow-400/70 truncate">{nomeExibido(c, colabs)}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="card-sinergia flex-1 h-full rounded flex flex-col items-center justify-center"
        title={c.nome + ' (fixo aqui · right-click pra remover)'}
        onContextMenu={handleContextMenu}>
        <span className="text-[10px] font-bold text-yellow-400/70 leading-none">{iniciais(c.nome)}</span>
        <span className="text-[7px] text-yellow-400/50 mt-0.5">{nomeExibido(c, colabs)}</span>
      </div>
    );
  }
  function SlotBancada({ linha, lado, posicao }: { linha: number; lado: string; posicao: number }) {
    const b = getBancada(linha, lado, posicao);
    if (!b) {
      return (
        <div onClick={() => criarBancadaGM(linha, lado, posicao)}
          className="w-[140px] h-[78px] border-2 border-dashed border-[#2a2a2a] rounded-md flex items-center justify-center cursor-pointer hover:border-yellow-500/40 hover:bg-yellow-500/5 transition"
          title="Criar bancada GM">
          <span className="text-2xl text-[#3a3a3a]">+</span>
        </div>
      );
    }
    const cor = corTipo(b.tipo_principal);
    const alocs = getAlocacoesBancada(b.id);
    const sinergias = sinergiasDe(b.id);
    const isHover = hoverBancada === b.id;
    const isEncaixe = encaixeBancada === b.id;
    const isErro = erroBancada === b.id;
    const isCategoria = b.tipo_principal === 'CATEGORIA';
    const isCompativel = (cardAtivo || draggingId) && bancadaCompativel(b);
    const classes = [
      'w-[140px] h-[78px]',
      'bg-[#0f0f0f] border rounded border-l-[3px] flex flex-col transition-all duration-200',
      isCompativel ? 'bancada-compativel' : '',
      isEncaixe ? 'bancada-encaixe' : '',
      isErro ? 'bancada-erro' : '',
      isHover && !isCompativel ? 'ring-2 ring-green-500/80 shadow-xl shadow-green-500/20' : '',
    ].join(' ');
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHoverBancada(b.id); }}
        onDragLeave={() => setHoverBancada(null)}
        onDrop={(e) => {
          e.preventDefault(); setHoverBancada(null);
          const idDropped = e.dataTransfer.getData('text/plain') || draggingId;
          if (idDropped) alocarColab(idDropped, b);
        }}
        onClick={() => { if (cardAtivo && bancadaCompativel(b)) alocarColab(cardAtivo, b); }}
        className={classes}
        style={{ borderColor: '#1f1f1f', borderLeftColor: cor.hex }}>
        <div className="flex items-center justify-between px-1.5 pt-0.5 pb-0 flex-shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className={'text-[9px] font-bold ' + cor.text + ' uppercase tracking-wider'}>{b.tipo_principal}</span>
            {b.subtipo && <span className="text-[8px] text-purple-300/70 truncate">· {b.subtipo}</span>}
            {isCategoria && alocs.length > 0 && (<span className="text-[8px] text-gray-500 ml-0.5">({alocs.length})</span>)}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {b.tipo_principal === 'CATEGORIA' && !modoPrint && (
              <button onClick={(e) => { e.stopPropagation(); abrirModalEditarSubtipo(b); }}
                className="text-gray-600 hover:text-white text-[9px] leading-none" title="Editar sub-tipo">✏️</button>
            )}
            {!b.fixo_categoria && !modoPrint && (
              <button onClick={(e) => { e.stopPropagation(); limparBancada(b); }}
                className="text-gray-600 hover:text-red-400 text-[10px] leading-none" title="Limpar">×</button>
            )}
          </div>
        </div>
        {isCategoria ? (
          <div className="flex-1 flex flex-col gap-0.5 px-1 pb-1 pt-0.5 overflow-y-auto min-h-0">
            {alocs.length === 0 && sinergias.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[9px] text-gray-700 italic">Arrasta colabs</div>
            ) : (
              <>
                {alocs.map((a) => <CardColabBancada key={a.id} aloc={a} expandido bancadaAtual={b} />)}
                {sinergias.map((s) => <CardSinergia key={'syn-' + s.id} aloc={s} expandido />)}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex gap-1 px-1 pb-1 pt-0.5 min-h-0">
            {alocs.length === 0 && sinergias.length === 0 ? (<div className="flex-1" />) : (
              <>
                {alocs.map((a) => <CardColabBancada key={a.id} aloc={a} bancadaAtual={b} />)}
                {sinergias.map((s) => <CardSinergia key={'syn-' + s.id} aloc={s} />)}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
  function Esteira({ altura }: { altura: number }) {
    return (<div className="w-[44px] mx-1 rounded-sm border border-[#444] transition-all duration-300" style={{ minHeight: altura + 'px', background: 'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 8px, #1a1a1a 8px, #1a1a1a 16px)' }} aria-hidden="true" />);
  }
  // Altura de uma coluna com N bancadas (pra esteira crescer junto)
  function alturaDeColuna(qtd: number): number {
    return Math.max(ALTURA_COLUNA, qtd * ALTURA_BANCADA + (qtd - 1) * GAP_BANCADA);
  }
  function ColunaBancadas({ linha, lado, qtd, alturaColuna, alinharFundo = false }: { linha: number; lado: string; qtd: number; alturaColuna: number; alinharFundo?: boolean }) {
    const chave = chaveColuna(linha, lado);
    const noMax = qtd >= LAYOUT_MAX[chave];
    const noMin = qtd <= 1;
    return (
      <div className={'flex flex-col gap-2 ' + (alinharFundo ? 'justify-end' : 'justify-start')} style={{ minHeight: alturaColuna + 'px' }}>
        {Array.from({ length: qtd }, (_, i) => (
          <SlotBancada key={linha + '-' + lado + '-' + (i + 1)} linha={linha} lado={lado} posicao={i + 1} />
        ))}
        {/* ➕➖ Controles de bancada (só no modo customizar) */}
        {modoCustomizar && !modoPrint && (
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <button
              onClick={() => removerSlot(linha, lado)}
              disabled={noMin}
              className={'w-8 h-8 rounded-md border flex items-center justify-center text-lg font-bold transition ' + (noMin ? 'border-[#2a2a2a] text-[#3a3a3a] cursor-not-allowed' : 'border-red-500/40 text-red-400 hover:bg-red-500/15 active:scale-95')}
              title={noMin ? 'Mínimo 1 bancada' : 'Remover última bancada'}
            >−</button>
            <span className="text-[9px] text-gray-500 font-mono w-10 text-center">{qtd}/{LAYOUT_MAX[chave]}</span>
            <button
              onClick={() => adicionarSlot(linha, lado)}
              disabled={noMax}
              className={'w-8 h-8 rounded-md border flex items-center justify-center text-lg font-bold transition ' + (noMax ? 'border-[#2a2a2a] text-[#3a3a3a] cursor-not-allowed' : 'border-green-500/40 text-green-400 hover:bg-green-500/15 active:scale-95')}
              title={noMax ? 'Limite de ' + LAYOUT_MAX[chave] + ' bancadas' : 'Adicionar bancada'}
            >+</button>
          </div>
        )}
      </div>
    );
  }
  function calcularRitmoPescaCat(linha: number, tipo: 'PESCA' | 'CATEGORIA') {
    const bancadasMatch = bancadas.filter((b) => b.linha === linha && b.tipo_principal === tipo);
    const ids = new Set(bancadasMatch.map((b) => b.id));
    const alocs = alocacoes.filter((a) => ids.has(a.bancada_id));
    if (alocs.length === 0) return null;
    let totalUnid = 0, totalH = 0;
    const liquidas: number[] = [];
    alocs.forEach((a) => {
      const r = ritmos[a.id_groot];
      if (!r) return;
      if (r.unidades && r.horas && r.horas > 0) { totalUnid += r.unidades; totalH += r.horas; }
      if (r.liquida && r.liquida > 0) liquidas.push(r.liquida);
    });
    if (totalH > 0) return Math.round(totalUnid / totalH);
    if (liquidas.length > 0) return Math.round(liquidas.reduce((a, b) => a + b, 0) / liquidas.length);
    return null;
  }
  function ZonaCentral() {
    const p1 = calcularRitmoPescaCat(1, 'PESCA');
    const c1 = calcularRitmoPescaCat(1, 'CATEGORIA');
    const p2 = calcularRitmoPescaCat(2, 'PESCA');
    const c2 = calcularRitmoPescaCat(2, 'CATEGORIA');
    const temAlgum = p1 != null || c1 != null || p2 != null || c2 != null;
    return (
      <div className="flex flex-col items-center gap-2">
        {temAlgum && !modoPrint && (
          <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded px-3 py-1 flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600 font-bold">L1:</span>
              <span className="text-blue-400">🐟 {p1 ?? '—'}</span>
              <span className="text-gray-700">·</span>
              <span className="text-purple-400">📦 {c1 ?? '—'}</span>
            </div>
            <span className="text-gray-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600 font-bold">L2:</span>
              <span className="text-blue-400">🐟 {p2 ?? '—'}</span>
              <span className="text-gray-700">·</span>
              <span className="text-purple-400">📦 {c2 ?? '—'}</span>
            </div>
          </div>
        )}
        <div
          style={{
            position: 'relative',
            width: '320px',
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              border: '2px dashed #3a3a2a',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          />
          <div className="text-center mb-2 relative">
            <span className="text-[10px] text-yellow-500/80 font-bold tracking-widest uppercase">Zona Central</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 140px',
              gridTemplateRows: '78px 78px',
              columnGap: '8px',
              rowGap: '8px',
              position: 'relative',
            }}
          >
            <div style={{ overflow: 'hidden' }}><SlotBancada linha={1} lado="centro" posicao={1} /></div>
            <div style={{ overflow: 'hidden' }}><SlotBancada linha={2} lado="centro" posicao={1} /></div>
            <div style={{ overflow: 'hidden' }}><SlotBancada linha={1} lado="centro" posicao={2} /></div>
            <div style={{ overflow: 'hidden' }}><SlotBancada linha={2} lado="centro" posicao={2} /></div>
          </div>
        </div>
      </div>
    );
  }
  function HeaderLinha({ linha }: { linha: number }) {
    const nome = linha === 1 ? nomesLinhas.linha1 : nomesLinhas.linha2;
    const editando = editandoLinha === linha;
    const ritmoLinha = calcularRitmoLinha(linha);
    const corLinha = corRitmoLinha(ritmoLinha.pctMedio, metas);
    return (
      <div className="flex flex-col items-center gap-1 mb-2">
        {editando ? (
          <input autoFocus type="text" maxLength={30} value={nomeTemp}
            onChange={(e) => setNomeTemp(e.target.value)}
            onBlur={() => { if (nomeTemp.trim()) salvarNomeLinha(linha, nomeTemp.trim()); else setEditandoLinha(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && nomeTemp.trim()) salvarNomeLinha(linha, nomeTemp.trim()); if (e.key === 'Escape') setEditandoLinha(null); }}
            className="nome-linha-input" />
        ) : (
          <span className="nome-linha-display text-[11px] text-gray-400 font-bold uppercase tracking-widest"
            onClick={() => { setEditandoLinha(linha); setNomeTemp(nome); }} title="Click pra editar">{nome} {!modoPrint && '🖊️'}</span>
        )}
        {!modoPrint && (ritmoLinha.totalAtivos > 0 ? (
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-md px-3 py-1.5 flex items-center gap-2 ritmo-linha-pulse">
            <span className="text-[10px] text-gray-500 font-bold">RITMO:</span>
            <span className={'text-base font-black ' + corLinha.texto}>{ritmoLinha.pctMedio}%</span>
            <span className="text-sm">{corLinha.emoji}</span>
            {ritmoLinha.pecasHora > 0 && (
              <span className="text-[9px] text-gray-500">· {ritmoLinha.pecasHora} pç/h</span>
            )}
            {ritmoLinha.totalUnidades > 0 && (
              <span className="text-[9px] text-gray-600">({ritmoLinha.totalUnidades} pç / {ritmoLinha.totalHoras}h)</span>
            )}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-[#2a2a2a]">
              {ritmoLinha.supera > 0 && <span className="text-[10px] text-green-400">🟢 {ritmoLinha.supera}</span>}
              {ritmoLinha.alinhado > 0 && <span className="text-[10px] text-blue-400">🔵 {ritmoLinha.alinhado}</span>}
              {ritmoLinha.ofensor > 0 && <span className="text-[10px] text-red-400">🔴 {ritmoLinha.ofensor}</span>}
              {ritmoLinha.semDado > 0 && <span className="text-[10px] text-gray-500">⚪ {ritmoLinha.semDado}</span>}
            </div>
          </div>
        ) : (
          <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-md px-3 py-1 text-[9px] text-gray-600 italic">Sem colabs alocados</div>
        ))}
      </div>
    );
  }
  const livres = colabsLivres();
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <header className="border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">
            🏭 <span className="text-yellow-400">Mapeamento Linha</span>
            <span className="text-gray-500 text-sm font-normal ml-2">· P2M</span>
          </h1>
          <span className="text-[10px] text-gray-500">{new Date().toLocaleDateString('pt-BR')}</span>
          <span className="text-[10px] text-gray-500">· Metas: {metas.p2m_base}-{metas.p2m_alinhado_max}</span>
          <span className="text-[10px] text-gray-500">· Colabs: {colabs.length}</span>
          {cardAtivo && (<span className="text-[10px] text-yellow-400 font-bold animate-pulse">✨ Card ativado · click na bancada (ESC)</span>)}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleUploadCSV} className="hidden" />
          <button onClick={() => setModoCustomizar((v) => !v)}
            className={'text-xs px-3 py-1.5 rounded border transition active:scale-95 ' + (modoCustomizar ? 'bg-green-500/20 border-green-500/60 text-green-300' : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-green-500/40 hover:text-green-300')}
            title="Adicionar ou remover bancadas nas colunas">
            {modoCustomizar ? '✓ Editando bancadas' : '⚙️ Customizar'}
          </button>
          <button onClick={printarLayout} disabled={printando}
            className="bg-blue-500/10 border border-blue-500/50 text-blue-300 text-xs px-3 py-1.5 rounded hover:bg-blue-500/20 transition disabled:opacity-50"
            title="Gera imagem do layout sem ritmos/líquidas pra reportar no grupo">
            {printando ? '⏳ Gerando...' : '📸 Printar Layout'}
          </button>
          <button onClick={() => setModalRotacao(true)} disabled={rotacionando}
            className="bg-purple-500/10 border border-purple-500/50 text-purple-300 text-xs px-3 py-1.5 rounded hover:bg-purple-500/20 transition disabled:opacity-50">🔄 Rotacionar</button>
          <button onClick={limparTodasAlocacoes}
            className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs px-2 py-1.5 rounded hover:bg-orange-500/20 transition"
            title="Esvazia o time (tira todos das bancadas)">🧽 Esvaziar Time</button>
          <button onClick={limparRitmos}
            className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-2 py-1.5 rounded hover:bg-red-500/20 transition"
            title="Limpar ritmos do dia">🧹 Limpar CSV</button>
          <button onClick={() => fileInputRef.current?.click()}
            className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-xs px-3 py-1.5 rounded hover:bg-yellow-500/20 transition">↑ Upload Boletim</button>
        </div>
      </header>
      {loading && (<div className="text-center text-gray-500 py-20 text-sm">Carregando linha...</div>)}
      {!loading && (
        <div className="flex gap-3 p-3 min-w-0 overflow-x-auto">
          <aside className="w-[150px] flex-shrink-0">
            <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-md p-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Livres</span>
                <span className="text-[10px] text-gray-500">{livres.length}</span>
              </div>
              <div className="text-[9px] text-gray-600 italic mb-2 px-1">Arrasta ou double-click</div>
              <div className="max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
                {livres.length === 0 ? (
                  <div className="text-[10px] text-gray-600 italic text-center py-4">Todos alocados</div>
                ) : (livres.map((c) => <CardColabSidebar key={c.id_groot} c={c} />))}
              </div>
            </div>
          </aside>
          <main id="mapa-canvas" className="flex-1 flex gap-4 items-start justify-around">
            <section className="flex flex-col items-center">
              <HeaderLinha linha={1} />
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={1} lado="esquerdo" qtd={layout.L1_ESQ} alturaColuna={alturaDeColuna(Math.max(layout.L1_ESQ, layout.L1_DIR))} />
                <Esteira altura={alturaDeColuna(Math.max(layout.L1_ESQ, layout.L1_DIR))} />
                <ColunaBancadas linha={1} lado="direito" qtd={layout.L1_DIR} alturaColuna={alturaDeColuna(Math.max(layout.L1_ESQ, layout.L1_DIR))} alinharFundo />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>
            <section className="flex flex-col items-center mt-8">
              <ZonaCentral />
            </section>
            <section className="flex flex-col items-center">
              <HeaderLinha linha={2} />
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={2} lado="esquerdo" qtd={layout.L2_ESQ} alturaColuna={alturaDeColuna(Math.max(layout.L2_ESQ, layout.L2_DIR))} alinharFundo />
                <Esteira altura={alturaDeColuna(Math.max(layout.L2_ESQ, layout.L2_DIR))} />
                <ColunaBancadas linha={2} lado="direito" qtd={layout.L2_DIR} alturaColuna={alturaDeColuna(Math.max(layout.L2_ESQ, layout.L2_DIR))} />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>
          </main>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const corClass = t.tipo === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-300' :
                          t.tipo === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-300' :
                          'bg-blue-500/20 border-blue-500/50 text-blue-300';
          return (
            <div key={t.id}
              className={'toast-in ' + corClass + ' border rounded-lg px-4 py-2 text-xs font-medium shadow-xl backdrop-blur-sm min-w-[200px] max-w-[400px]'}>
              {t.msg}
            </div>
          );
        })}
      </div>
      {menuSinergia && (() => {
        const c = getColab(menuSinergia.aloc.id_groot);
        const bancadaOrigem = bancadas.find((b) => b.id === menuSinergia.aloc.bancada_fixa_id);
        const labelOrigem = bancadaOrigem
          ? bancadaOrigem.tipo_principal + ' L' + bancadaOrigem.linha + (bancadaOrigem.lado !== 'centro' ? ' ' + bancadaOrigem.lado : '')
          : 'origem';
        return (
          <>
            <div className="fixed inset-0 z-[95]" onClick={() => setMenuSinergia(null)} onContextMenu={(e) => { e.preventDefault(); setMenuSinergia(null); }} />
            <div
              className="fixed z-[96] bg-[#1a1a1a] border border-yellow-500/40 rounded-md shadow-2xl py-1 min-w-[200px] slide-in"
              style={{ left: Math.min(menuSinergia.x, window.innerWidth - 220) + 'px', top: Math.min(menuSinergia.y, window.innerHeight - 120) + 'px' }}
            >
              <div className="px-3 py-1 border-b border-[#2a2a2a]">
                <div className="text-[10px] text-yellow-400/80 font-bold">{c?.nome}</div>
                <div className="text-[9px] text-gray-500">em sinergia</div>
              </div>
              <button
                onClick={() => { voltarOrigem(menuSinergia.aloc); setMenuSinergia(null); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-yellow-500/10 transition flex items-center gap-2"
              >
                <span>↩️</span>
                <span>Voltar pra origem <span className="text-gray-500">({labelOrigem})</span></span>
              </button>
              <button
                onClick={() => { fixarAqui(menuSinergia.aloc); setMenuSinergia(null); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-yellow-500/10 transition flex items-center gap-2"
              >
                <span>📍</span>
                <span>Fixar aqui</span>
              </button>
            </div>
          </>
        );
      })()}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90] p-4"
          onClick={() => setConfirmModal(null)}>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-sm w-full slide-in"
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-white mb-4">{confirmModal.msg}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmModal(null)}
                className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition">Cancelar</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="px-4 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition">Confirmar</button>
            </div>
          </div>
        </div>
      )}
      {modalRotacao && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModalRotacao(false)}>
          <div className="bg-[#1a1a1a] border border-purple-500/30 rounded-lg p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-purple-300 mb-3">🔄 Rotacionar</h2>
            <div className="space-y-2">
              <button onClick={() => aplicarRotacao(1)} disabled={rotacionando}
                className="w-full text-left bg-[#0f0f0f] border border-[#2a2a2a] hover:border-purple-500/50 rounded p-3 transition disabled:opacity-50">
                <div className="text-xs font-bold text-white mb-0.5">Rotação 1 · Sem Pesca</div>
                <div className="text-[10px] text-gray-500">Desce um lado → sobe o outro → Categoria</div>
              </button>
              <button onClick={() => aplicarRotacao(2)} disabled={rotacionando}
                className="w-full text-left bg-[#0f0f0f] border border-[#2a2a2a] hover:border-purple-500/50 rounded p-3 transition disabled:opacity-50">
                <div className="text-xs font-bold text-white mb-0.5">Rotação 2 · Com Pesca</div>
                <div className="text-[10px] text-gray-500">Dupla atravessa: Pesca + Categoria</div>
              </button>
              <button onClick={() => aplicarRotacao(3)} disabled={rotacionando}
                className="w-full text-left bg-[#0f0f0f] border border-[#2a2a2a] hover:border-purple-500/50 rounded p-3 transition disabled:opacity-50">
                <div className="text-xs font-bold text-white mb-0.5">Rotação 3 · Nivelar Dia</div>
                <div className="text-[10px] text-gray-500">Topo ↔ Último (mesmo lado)</div>
              </button>
            </div>
            <button onClick={() => setModalRotacao(false)} disabled={rotacionando}
              className="w-full mt-3 text-[10px] text-gray-500 hover:text-white transition py-1 disabled:opacity-50">Cancelar</button>
            {rotacionando && (<div className="text-center text-[10px] text-purple-400 mt-2 animate-pulse">Rotacionando...</div>)}
          </div>
        </div>
      )}
      {modal && modal.bancadaExistente && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={fecharModal}>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-1">Editar Categoria</h2>
            <p className="text-xs text-gray-500 mb-4">Linha {modal.linha} · Zona Central</p>
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1.5 block">Sub-tipo:</label>
              <div className="grid grid-cols-2 gap-2">
                {SUBTIPOS_CATEGORIA.map((s) => (
                  <button key={s} onClick={() => setModalSubtipo(s)}
                    className={'py-1.5 px-2 rounded text-xs font-medium border transition ' + (modalSubtipo === s ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]')}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-[#2a2a2a]">
              <button onClick={fecharModal} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition">Cancelar</button>
              <button onClick={salvarModal} className="px-4 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

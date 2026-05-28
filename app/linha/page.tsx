'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// ============================================================
// TIPOS
// ============================================================
interface Colaborador {
  id_groot: string;
  nome: string;
  processo: string;
  status: string;
}
interface Ritmo {
  id_groot: string;
  ritmo_pct: number;
  liquida?: number;
  unidades?: number;
  horas?: number;
}
interface Bancada {
  id: number;
  zona: string;
  linha: number;
  lado: string;
  posicao: number;
  tipo_principal: string;
  subtipo: string | null;
  fixo_categoria: boolean;
  data_referencia: string;
}
interface Alocacao {
  id: number;
  bancada_id: number;
  id_groot: string;
  tipo_alocacao: string;
  bancada_fixa_id: number | null;
  data_referencia: string;
}
interface MetasConfig {
  p2m_base: number;
  p2m_alinhado_max: number;
}

// ============================================================
// CONSTANTES
// ============================================================
const ZONA = 'p2m';
const LAYOUT = {
  L1_ESQ: 5,
  L1_DIR: 3,
  L2_ESQ: 3,
  L2_DIR: 5,
};
const ALTURA_COLUNA = 422;
const SUBTIPOS_CATEGORIA = [
  'Saneante', 'High Value', 'Cosméticos', 'Mapa', 'Saúde', 'Alimento',
];

function maxColabsPorTipo(tipo: string): number {
  if (tipo === 'CATEGORIA') return 999;
  return 2;
}

// Tipos que viram FIXO automático
function tipoEFixoAutomatico(tipo: string): boolean {
  return tipo === 'GM' || tipo === 'PESCA';
}

// ============================================================
// HELPERS DE COR
// ============================================================
function corPorMeta(liquida: number | null | undefined, metas: MetasConfig) {
  if (liquida == null || liquida === 0) {
    return { status: 'sem_dado' as const, texto: 'text-gray-400', borda: 'border-[#2a2a2a]', bg: 'bg-[#1a1a1a]', emoji: '⚪', label: 'Sem dado' };
  }
  if (liquida < metas.p2m_base) {
    return { status: 'ofensor' as const, texto: 'text-red-400', borda: 'border-red-500/50', bg: 'bg-red-500/10', emoji: '🔴', label: 'Ofensor' };
  }
  if (liquida <= metas.p2m_alinhado_max) {
    return { status: 'alinhado' as const, texto: 'text-blue-400', borda: 'border-blue-500/50', bg: 'bg-blue-500/10', emoji: '🔵', label: 'Alinhado' };
  }
  return { status: 'supera' as const, texto: 'text-green-400', borda: 'border-green-500/50', bg: 'bg-green-500/10', emoji: '🟢', label: 'Supera' };
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function corTipo(tipo: string) {
  switch (tipo) {
    case 'GM': return { hex: '#FFD700', text: 'text-yellow-400', emoji: '⭐' };
    case 'PESCA': return { hex: '#3b82f6', text: 'text-blue-400', emoji: '🐟' };
    case 'CATEGORIA': return { hex: '#a855f7', text: 'text-purple-400', emoji: '📦' };
    default: return { hex: '#6b7280', text: 'text-gray-400', emoji: '❓' };
  }
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0];
}

// ============================================================
// CSS DAS ANIMAÇÕES (injetado uma vez)
// ============================================================
const STYLES = `
  @keyframes pulseGold {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7), 0 0 30px rgba(255, 215, 0, 0.4);
      transform: scale(1.08);
    }
    50% {
      box-shadow: 0 0 0 12px rgba(255, 215, 0, 0), 0 0 40px rgba(255, 215, 0, 0.6);
      transform: scale(1.12);
    }
  }
  @keyframes pulseGreen {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7), 0 0 20px rgba(34, 197, 94, 0.3);
      border-color: rgba(34, 197, 94, 0.6);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(34, 197, 94, 0), 0 0 30px rgba(34, 197, 94, 0.5);
      border-color: rgba(34, 197, 94, 1);
      transform: scale(1.03);
    }
  }
  @keyframes successFlash {
    0% { transform: scale(0.85); background: rgba(34, 197, 94, 0.4); box-shadow: 0 0 20px rgba(34, 197, 94, 0.8); }
    50% { transform: scale(1.1); background: rgba(34, 197, 94, 0.15); }
    100% { transform: scale(1); background: transparent; }
  }
  @keyframes ghostFloat {
    0%, 100% { opacity: 0.35; transform: translateY(0px); }
    50% { opacity: 0.55; transform: translateY(-3px); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes synergyGlow {
    0%, 100% { box-shadow: 0 0 8px rgba(255, 215, 0, 0.3), inset 0 0 8px rgba(255, 215, 0, 0.1); }
    50% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.5), inset 0 0 12px rgba(255, 215, 0, 0.2); }
  }
  @keyframes shakeError {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px) scale(0.9); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .card-ativo {
    animation: pulseGold 1.2s ease-in-out infinite;
    cursor: grabbing !important;
    z-index: 50;
    position: relative;
  }
  .bancada-compativel {
    animation: pulseGreen 1s ease-in-out infinite;
    cursor: pointer !important;
  }
  .bancada-encaixe {
    animation: successFlash 0.5s ease-out;
  }
  .bancada-erro {
    animation: shakeError 0.3s ease-in-out;
  }
  .card-sinergia {
    animation: ghostFloat 2.5s ease-in-out infinite, synergyGlow 2s ease-in-out infinite;
    background: linear-gradient(110deg, rgba(255, 215, 0, 0.05) 0%, rgba(255, 215, 0, 0.15) 50%, rgba(255, 215, 0, 0.05) 100%) !important;
    background-size: 200% 100% !important;
    animation: ghostFloat 2.5s ease-in-out infinite, synergyGlow 2s ease-in-out infinite, shimmer 3s linear infinite;
    border: 2px dashed #FFD700 !important;
    position: relative;
    overflow: hidden;
  }
  .card-sinergia::after {
    content: 'SINERGIA';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-15deg);
    font-size: 8px;
    font-weight: 900;
    color: rgba(255, 215, 0, 0.5);
    letter-spacing: 1px;
    pointer-events: none;
    white-space: nowrap;
  }
  .card-sidebar-hover {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .card-sidebar-hover:hover {
    transform: scale(1.05) translateX(2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  .card-arrastando {
    opacity: 0.35;
    transform: scale(0.92);
  }
  .nome-linha-input {
    background: transparent;
    border: none;
    outline: 1px solid #FFD700;
    color: #FFD700;
    font-size: 10px;
    font-weight: bold;
    text-align: center;
    width: 100%;
    padding: 2px 4px;
    border-radius: 3px;
  }
  .nome-linha-display {
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .nome-linha-display:hover {
    background: rgba(255, 215, 0, 0.1);
    color: #FFD700;
  }
  .badge-fixo {
    animation: synergyGlow 2s ease-in-out infinite;
  }
  .slide-in {
    animation: slideIn 0.3s ease-out;
  }
`;

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
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
  
  // Drag e seleção
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [cardAtivo, setCardAtivo] = useState<string | null>(null);  // double-click
  const [hoverBancada, setHoverBancada] = useState<number | null>(null);
  const [encaixeBancada, setEncaixeBancada] = useState<number | null>(null);  // animação flash
  const [erroBancada, setErroBancada] = useState<number | null>(null);  // animação shake
  
  const [modal, setModal] = useState<{
    linha: number; lado: string; posicao: number; bancadaExistente?: Bancada;
  } | null>(null);
  const [modalSubtipo, setModalSubtipo] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { carregarTudo(); }, []);

  // ESC pra desativar card
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCardAtivo(null);
        setDraggingId(null);
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  async function carregarTudo() {
    setLoading(true);
    await carregarMetas();
    await carregarNomesLinhas();
    await garantirSlotsFixos();
    await Promise.all([carregarColabs(), carregarRitmos(), carregarBancadas(), carregarAlocacoes()]);
    setLoading(false);
  }

  async function carregarMetas() {
    const { data } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['meta_p2m_base', 'meta_p2m_alinhado_max']);
    const map: Record<string, number> = {};
    (data || []).forEach((c: any) => { map[c.chave] = Number(c.valor) || 0; });
    setMetas({
      p2m_base: map.meta_p2m_base || 329,
      p2m_alinhado_max: map.meta_p2m_alinhado_max || 350,
    });
  }

  async function carregarNomesLinhas() {
    const { data } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['nome_linha_1', 'nome_linha_2']);
    const map: Record<string, string> = {};
    (data || []).forEach((c: any) => { map[c.chave] = String(c.valor); });
    setNomesLinhas({
      linha1: map.nome_linha_1 || 'Linha 1',
      linha2: map.nome_linha_2 || 'Linha 2',
    });
  }

  async function salvarNomeLinha(linha: number, nome: string) {
    const chave = 'nome_linha_' + linha;
    await supabase.from('config').upsert({ chave, valor: nome }, { onConflict: 'chave' });
    setNomesLinhas((prev) => ({
      ...prev,
      [linha === 1 ? 'linha1' : 'linha2']: nome,
    }));
    setEditandoLinha(null);
  }

  async function carregarColabs() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome, processo, status')
      .eq('status', 'Ativo')
      .eq('processo', 'P2M')
      .order('nome');
    setColabs(data || []);
  }

  async function carregarRitmos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('ritmo_atual')
      .select('id_groot, ritmo_pct, unidades, horas')
      .eq('data_referencia', hoje);
    const map: Record<string, Ritmo> = {};
    (data || []).forEach((r: any) => {
      let liquida = r.ritmo_pct;
      if (r.unidades && r.horas && r.horas > 0) {
        liquida = Math.round(r.unidades / r.horas);
      }
      map[r.id_groot] = { ...r, liquida };
    });
    setRitmos(map);
  }

  async function carregarBancadas() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('layout_bancadas')
      .select('*')
      .eq('zona', ZONA)
      .eq('data_referencia', hoje)
      .order('posicao');
    setBancadas(data || []);
  }

  async function carregarAlocacoes() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('layout_alocacao')
      .select('*')
      .eq('data_referencia', hoje);
    setAlocacoes(data || []);
  }

  async function garantirSlotsFixos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data: existentes } = await supabase
      .from('layout_bancadas')
      .select('id, linha, posicao')
      .eq('zona', ZONA).eq('lado', 'centro').eq('fixo_categoria', true).eq('data_referencia', hoje);
    const jaTem = new Set((existentes || []).map((b: any) => b.linha + '-' + b.posicao));
    const slotsFixos = [
      { linha: 1, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 1, posicao: 2, tipo_principal: 'CATEGORIA' },
      { linha: 2, posicao: 1, tipo_principal: 'PESCA' },
      { linha: 2, posicao: 2, tipo_principal: 'CATEGORIA' },
    ];
    const aCriar = slotsFixos.filter((s) => !jaTem.has(s.linha + '-' + s.posicao));
    if (aCriar.length === 0) return;
    await supabase.from('layout_bancadas').insert(
      aCriar.map((s) => ({
        zona: ZONA, linha: s.linha, lado: 'centro', posicao: s.posicao,
        tipo_principal: s.tipo_principal, subtipo: null, fixo_categoria: true, data_referencia: hoje,
      }))
    );
  }

  async function handleUploadCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (linhas.length < 2) { alert('CSV vazio.'); return; }
      const sep = linhas[0].includes(';') ? ';' : ',';
      const header = linhas[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, ''));
      const idxGroot = header.findIndex((h) => h.includes('groot') || h === 'id' || h === 'id_groot' || h === 'usuario' || h === 'matricula' || h.includes('id_colab'));
      const idxNome = header.findIndex((h) => h === 'nome' || h.includes('nome') || h === 'colaborador');
      const idxRitmo = header.findIndex((h) => h.includes('ritmo') || h.includes('pct') || h === '%' || h.includes('liquid') || h.includes('produtividade') || h === 'prod' || h === 'prod_liquida');
      const idxUnid = header.findIndex((h) => h.includes('unid') || h.includes('qtd') || h.includes('quantidade') || h === 'pcs');
      const idxHoras = header.findIndex((h) => h.includes('hora') || h === 'h' || h === 'tempo');
      if (idxGroot === -1 || idxRitmo === -1) {
        alert('CSV inválido!\nColunas: ' + header.join(' | '));
        return;
      }
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
        if (idxUnid !== -1 && cols[idxUnid]) {
          const u = parseInt(cols[idxUnid].replace(/\./g, ''), 10);
          if (!isNaN(u)) reg.unidades = u;
        }
        if (idxHoras !== -1 && cols[idxHoras]) {
          const h = parseFloat(cols[idxHoras].replace(',', '.'));
          if (!isNaN(h)) reg.horas = h;
        }
        registros.push(reg);
      }
      if (registros.length === 0) { alert('Nenhum registro válido.'); return; }
      const { error } = await supabase.from('ritmo_atual').upsert(registros, { onConflict: 'id_groot,data_referencia' });
      if (error) { alert('Erro: ' + error.message); return; }
      alert('✅ ' + registros.length + ' atualizado(s).' + (pulou > 0 ? '\n⚠️ ' + pulou + ' pulada(s)' : ''));
      await carregarRitmos();
    } catch (err: any) {
      alert('Erro: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function criarBancadaGM(linha: number, lado: string, posicao: number) {
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('layout_bancadas').insert({
      zona: ZONA, linha, lado, posicao, tipo_principal: 'GM', subtipo: null, fixo_categoria: false, data_referencia: hoje,
    });
    if (error) { alert('Erro: ' + error.message); return; }
    await carregarBancadas();
  }

  function abrirModalEditarSubtipo(b: Bancada) {
    setModal({ linha: b.linha, lado: b.lado, posicao: b.posicao, bancadaExistente: b });
    setModalSubtipo(b.subtipo || '');
  }

  function fecharModal() {
    setModal(null);
    setModalSubtipo('');
  }

  async function salvarModal() {
    if (!modal || !modal.bancadaExistente) return;
    if (!modalSubtipo) { alert('Escolha um sub-tipo.'); return; }
    const { error } = await supabase.from('layout_bancadas').update({ subtipo: modalSubtipo }).eq('id', modal.bancadaExistente.id);
    if (error) { alert('Erro: ' + error.message); return; }
    await carregarBancadas();
    fecharModal();
  }

  async function limparBancada(b: Bancada) {
    if (b.fixo_categoria) { alert('Esta bancada é fixa.'); return; }
    if (!confirm('Limpar esta bancada?')) return;
    const { error } = await supabase.from('layout_bancadas').delete().eq('id', b.id);
    if (error) { alert('Erro: ' + error.message); return; }
    await Promise.all([carregarBancadas(), carregarAlocacoes()]);
  }

  // ============================================================
  // ALOCAÇÃO COM LÓGICA DE FIXO/SINERGIA
  // ============================================================
  async function alocarColab(idGroot: string, bancada: Bancada) {
    const hoje = new Date().toISOString().split('T')[0];
    const atuais = alocacoes.filter((a) => a.bancada_id === bancada.id);
    const maxColabs = maxColabsPorTipo(bancada.tipo_principal);
    
    if (atuais.length >= maxColabs) {
      // Mostra erro com shake
      setErroBancada(bancada.id);
      setTimeout(() => setErroBancada(null), 400);
      return;
    }
    
    // Busca alocação atual do colab (se houver)
    const alocAtual = alocacoes.find((a) => a.id_groot === idGroot);
    
    // Determina bancada_fixa_id:
    // - Se já tinha bancada_fixa_id, mantém
    // - Se está sendo alocado pela 1ª vez em GM ou PESCA → marca como fixa
    let bancadaFixaId: number | null = null;
    
    if (alocAtual?.bancada_fixa_id) {
      // Já tinha fixo de antes - mantém
      bancadaFixaId = alocAtual.bancada_fixa_id;
    } else if (tipoEFixoAutomatico(bancada.tipo_principal)) {
      // Está indo pra GM ou PESCA pela 1ª vez → vira fixo aqui
      bancadaFixaId = bancada.id;
    }
    
    // Remove alocação anterior
    await supabase.from('layout_alocacao').delete().eq('id_groot', idGroot).eq('data_referencia', hoje);
    
    // Cria nova
    const { error } = await supabase.from('layout_alocacao').insert({
      bancada_id: bancada.id,
      id_groot: idGroot,
      tipo_alocacao: 'fixo',
      bancada_fixa_id: bancadaFixaId,
      data_referencia: hoje,
    });
    
    if (error) { alert('Erro: ' + error.message); return; }
    
    // Animação de encaixe
    setEncaixeBancada(bancada.id);
    setTimeout(() => setEncaixeBancada(null), 500);
    
    setCardAtivo(null);
    setDraggingId(null);
    await carregarAlocacoes();
  }

  async function removerColab(alocId: number) {
    const { error } = await supabase.from('layout_alocacao').delete().eq('id', alocId);
    if (error) { alert('Erro: ' + error.message); return; }
    await carregarAlocacoes();
  }

  // Retornar colab pra bancada fixa (click na sinergia)
  async function voltarParaBancadaFixa(idGroot: string, bancadaFixaId: number) {
    const bancadaFixa = bancadas.find((b) => b.id === bancadaFixaId);
    if (!bancadaFixa) return;
    await alocarColab(idGroot, bancadaFixa);
  }

  // Remover marca de fixo (desativar sinergia permanente)
  async function removerFixo(alocId: number) {
    const { error } = await supabase.from('layout_alocacao').update({ bancada_fixa_id: null }).eq('id', alocId);
    if (error) { alert('Erro: ' + error.message); return; }
    await carregarAlocacoes();
  }

  function getBancada(linha: number, lado: string, posicao: number) {
    return bancadas.find((b) => b.zona === ZONA && b.linha === linha && b.lado === lado && b.posicao === posicao);
  }

  function getAlocacoesBancada(bancadaId: number) {
    return alocacoes.filter((a) => a.bancada_id === bancadaId);
  }

  function getColab(idGroot: string) {
    return colabs.find((c) => c.id_groot === idGroot);
  }

  function colabsLivres() {
    const alocadosIds = new Set(alocacoes.map((a) => a.id_groot));
    return colabs.filter((c) => !alocadosIds.has(c.id_groot));
  }

  // Retorna sinergias visíveis pra uma bancada (colabs que tem essa bancada como fixa MAS estão alocados em outra)
  function sinergiasDe(bancadaId: number) {
    return alocacoes.filter(
      (a) => a.bancada_fixa_id === bancadaId && a.bancada_id !== bancadaId
    );
  }

  // Card pode ser arrastado pra essa bancada?
  function bancadaCompativel(bancada: Bancada): boolean {
    if (!cardAtivo && !draggingId) return false;
    const atuais = alocacoes.filter((a) => a.bancada_id === bancada.id);
    return atuais.length < maxColabsPorTipo(bancada.tipo_principal);
  }

  // ============================================================
  // CARD COLAB SIDEBAR
  // ============================================================
  function CardColabSidebar({ c }: { c: Colaborador }) {
    const ritmo = ritmos[c.id_groot];
    const cor = corPorMeta(ritmo?.liquida, metas);
    const isDragging = draggingId === c.id_groot;
    const isAtivo = cardAtivo === c.id_groot;
    
    return (
      <div
        draggable
        onDragStart={(e) => {
          setDraggingId(c.id_groot);
          e.dataTransfer.effectAllowed = 'move';
          // Imagem de drag customizada (transparente)
          const img = new Image();
          img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
          e.dataTransfer.setDragImage(img, 0, 0);
        }}
        onDragEnd={() => { setDraggingId(null); setHoverBancada(null); }}
        onDoubleClick={() => {
          // Toggle ativo
          setCardAtivo(isAtivo ? null : c.id_groot);
        }}
        className={
          cor.bg + ' ' + cor.borda +
          ' border-2 rounded-md px-2 py-1.5 mb-1.5' +
          ' cursor-grab active:cursor-grabbing' +
          ' card-sidebar-hover' +
          (isDragging ? ' card-arrastando' : '') +
          (isAtivo ? ' card-ativo' : '')
        }
        title={'Double-click pra ativar | Arrasta pra alocar'}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={'text-[10px] font-bold ' + cor.texto + ' flex-shrink-0'}>
              {iniciais(c.nome)}
            </span>
            <span className="text-[10px] text-white truncate">{primeiroNome(c.nome)}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {ritmo?.liquida != null && ritmo.liquida > 0 && (
              <span className={'text-[9px] font-bold ' + cor.texto}>{ritmo.liquida}</span>
            )}
            <span className="text-[9px]">{cor.emoji}</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // CARD COLAB NA BANCADA
  // ============================================================
  function CardColabBancada({ aloc, expandido, bancadaAtual }: { aloc: Alocacao; expandido?: boolean; bancadaAtual: Bancada }) {
    const c = getColab(aloc.id_groot);
    if (!c) return null;
    const ritmo = ritmos[aloc.id_groot];
    const cor = corPorMeta(ritmo?.liquida, metas);
    const liquida = ritmo?.liquida;
    
    // É fixo nesta bancada?
    const eFixoAqui = aloc.bancada_fixa_id === bancadaAtual.id;
    // Tem fixo em outro lugar?
    const eFixoEmOutro = aloc.bancada_fixa_id && aloc.bancada_fixa_id !== bancadaAtual.id;
    
    if (expandido) {
      return (
        <div
          className={'relative group ' + cor.borda + ' ' + cor.bg + ' border rounded px-2 py-1 flex items-center justify-between gap-2 transition-all slide-in'}
          title={c.nome + (liquida ? ' · ' + liquida + ' pç/h · ' + cor.label : '') + (eFixoEmOutro ? ' · sinergia em outra' : '')}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={'text-[9px] font-bold ' + cor.texto}>{iniciais(c.nome)}</span>
            <span className="text-[10px] text-white truncate">{primeiroNome(c.nome)}</span>
            {eFixoAqui && <span className="text-[9px] badge-fixo" title="Fixo aqui">📍</span>}
            {eFixoEmOutro && <span className="text-[9px] opacity-60" title="Fixo em outra">↩️</span>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {liquida != null && liquida > 0 ? (
              <span className={'text-[10px] font-black ' + cor.texto}>{liquida}</span>
            ) : (
              <span className="text-gray-600 text-[10px]">—</span>
            )}
            <button
              onClick={() => removerColab(aloc.id)}
              className="opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-400 text-[11px] leading-none ml-0.5"
              title="Remover"
            >×</button>
          </div>
        </div>
      );
    }
    
    return (
      <div
        className={'relative group flex-1 h-full rounded border ' + cor.borda + ' ' + cor.bg + ' flex flex-col items-center justify-center cursor-default transition-all slide-in'}
        title={c.nome + (liquida ? ' · ' + liquida + ' pç/h · ' + cor.label : '') + (eFixoEmOutro ? ' · sinergia em outra' : '')}
      >
        {eFixoAqui && (
          <span className="absolute top-0 left-0.5 text-[8px] badge-fixo" title="Fixo aqui">📍</span>
        )}
        {eFixoEmOutro && (
          <span className="absolute top-0 left-0.5 text-[8px] opacity-60" title="Fixo em outra">↩️</span>
        )}
        {liquida != null && liquida > 0 ? (
          <span className={'text-base font-black ' + cor.texto + ' leading-none tracking-tight'}>{liquida}</span>
        ) : (
          <span className="text-gray-600 text-sm">—</span>
        )}
        <span className="text-[7px] text-gray-500 mt-0.5">{primeiroNome(c.nome)}</span>
        <button
          onClick={() => removerColab(aloc.id)}
          className="absolute top-0 right-0.5 opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-400 text-[10px] leading-none"
          title="Remover"
        >×</button>
      </div>
    );
  }

  // ============================================================
  // CARD SINERGIA (transparente)
  // ============================================================
  function CardSinergia({ aloc, expandido }: { aloc: Alocacao; expandido?: boolean }) {
    const c = getColab(aloc.id_groot);
    if (!c) return null;
    
    if (expandido) {
      return (
        <div
          className="card-sinergia rounded px-2 py-1 flex items-center justify-between gap-2 cursor-pointer"
          onClick={() => aloc.bancada_fixa_id && voltarParaBancadaFixa(aloc.id_groot, aloc.bancada_fixa_id)}
          title={c.nome + ' (fixo aqui · click pra trazer de volta · shift+click pra remover fixo)'}
          onContextMenu={(e) => {
            e.preventDefault();
            if (confirm('Remover marca de fixo de ' + c.nome + '?')) {
              removerFixo(aloc.id);
            }
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-bold text-yellow-400/70">{iniciais(c.nome)}</span>
            <span className="text-[10px] text-yellow-400/70 truncate">{primeiroNome(c.nome)}</span>
          </div>
          <span className="text-[8px] text-yellow-400/50">↩️</span>
        </div>
      );
    }
    
    return (
      <div
        className="card-sinergia flex-1 h-full rounded flex flex-col items-center justify-center cursor-pointer"
        onClick={() => aloc.bancada_fixa_id && voltarParaBancadaFixa(aloc.id_groot, aloc.bancada_fixa_id)}
        title={c.nome + ' (fixo aqui · click pra trazer de volta)'}
        onContextMenu={(e) => {
          e.preventDefault();
          if (confirm('Remover marca de fixo de ' + c.nome + '?')) {
            removerFixo(aloc.id);
          }
        }}
      >
        <span className="text-[10px] font-bold text-yellow-400/70 leading-none">{iniciais(c.nome)}</span>
        <span className="text-[7px] text-yellow-400/50 mt-0.5">{primeiroNome(c.nome)}</span>
      </div>
    );
  }

  // ============================================================
  // SLOT BANCADA
  // ============================================================
  function SlotBancada({ linha, lado, posicao }: { linha: number; lado: string; posicao: number }) {
    const b = getBancada(linha, lado, posicao);

    if (!b) {
      return (
        <div
          onClick={() => criarBancadaGM(linha, lado, posicao)}
          className="w-[140px] h-[78px] border-2 border-dashed border-[#2a2a2a] rounded-md flex items-center justify-center cursor-pointer hover:border-yellow-500/40 hover:bg-yellow-500/5 transition"
          title="Criar bancada GM"
        >
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
    
    const alturaClass = isCategoria 
      ? (alocs.length > 0 || sinergias.length > 0 ? 'min-h-[78px]' : 'h-[78px]') 
      : 'h-[78px]';
    
    const classes = [
      'w-[140px]', alturaClass,
      'bg-[#0f0f0f] border rounded border-l-[3px] flex flex-col transition-all duration-200',
      isCompativel ? 'bancada-compativel' : '',
      isEncaixe ? 'bancada-encaixe' : '',
      isErro ? 'bancada-erro' : '',
      isHover && !isCompativel ? 'ring-2 ring-green-500/80 scale-[1.03] shadow-xl shadow-green-500/20' : '',
    ].join(' ');
    
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setHoverBancada(b.id);
        }}
        onDragLeave={() => setHoverBancada(null)}
        onDrop={(e) => {
          e.preventDefault();
          setHoverBancada(null);
          if (draggingId) {
            alocarColab(draggingId, b);
          }
        }}
        onClick={() => {
          // Click direto quando há card ativo (substitui drag)
          if (cardAtivo && bancadaCompativel(b)) {
            alocarColab(cardAtivo, b);
          }
        }}
        className={classes}
        style={{ borderColor: '#1f1f1f', borderLeftColor: cor.hex }}
      >
        <div className="flex items-center justify-between px-1.5 pt-0.5 pb-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className={'text-[9px] font-bold ' + cor.text + ' uppercase tracking-wider'}>
              {b.tipo_principal}
            </span>
            {b.subtipo && <span className="text-[8px] text-purple-300/70 truncate">· {b.subtipo}</span>}
            {isCategoria && alocs.length > 0 && (
              <span className="text-[8px] text-gray-500 ml-0.5">({alocs.length})</span>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {b.tipo_principal === 'CATEGORIA' && (
              <button
                onClick={(e) => { e.stopPropagation(); abrirModalEditarSubtipo(b); }}
                className="text-gray-600 hover:text-white text-[9px] leading-none"
                title="Editar sub-tipo"
              >✏️</button>
            )}
            {!b.fixo_categoria && (
              <button
                onClick={(e) => { e.stopPropagation(); limparBancada(b); }}
                className="text-gray-600 hover:text-red-400 text-[10px] leading-none"
                title="Limpar"
              >×</button>
            )}
          </div>
        </div>
        
        {isCategoria ? (
          <div className="flex-1 flex flex-col gap-0.5 px-1 pb-1 pt-0.5">
            {alocs.length === 0 && sinergias.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[9px] text-gray-700 italic">
                Arrasta colabs
              </div>
            ) : (
              <>
                {alocs.map((a) => <CardColabBancada key={a.id} aloc={a} expandido bancadaAtual={b} />)}
                {sinergias.map((s) => <CardSinergia key={'syn-' + s.id} aloc={s} expandido />)}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex gap-1 px-1 pb-1 pt-0.5">
            {alocs.length === 0 && sinergias.length === 0 ? (
              <div className="flex-1" />
            ) : (
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

  function Esteira() {
    return (
      <div
        className="w-[44px] mx-1 rounded-sm border border-[#444]"
        style={{
          minHeight: ALTURA_COLUNA + 'px',
          background: 'repeating-linear-gradient(45deg, #2a2a2a, #2a2a2a 8px, #1a1a1a 8px, #1a1a1a 16px)',
        }}
        aria-hidden="true"
      />
    );
  }

  function ColunaBancadas({ linha, lado, qtd, alinharFundo = false }: { linha: number; lado: string; qtd: number; alinharFundo?: boolean }) {
    return (
      <div
        className={'flex flex-col gap-2 ' + (alinharFundo ? 'justify-end' : 'justify-start')}
        style={{ minHeight: ALTURA_COLUNA + 'px' }}
      >
        {Array.from({ length: qtd }, (_, i) => (
          <SlotBancada key={linha + '-' + lado + '-' + (i + 1)} linha={linha} lado={lado} posicao={i + 1} />
        ))}
      </div>
    );
  }

  function ZonaCentral() {
    return (
      <div className="border-2 border-dashed border-[#3a3a2a] rounded-md p-3 self-start">
        <div className="text-center mb-2">
          <span className="text-[10px] text-yellow-500/80 font-bold tracking-widest uppercase">
            Zona Central
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 items-start">
          <SlotBancada linha={1} lado="centro" posicao={1} />
          <SlotBancada linha={2} lado="centro" posicao={1} />
          <SlotBancada linha={1} lado="centro" posicao={2} />
          <SlotBancada linha={2} lado="centro" posicao={2} />
        </div>
      </div>
    );
  }

  function NomeLinha({ linha }: { linha: number }) {
    const nome = linha === 1 ? nomesLinhas.linha1 : nomesLinhas.linha2;
    const editando = editandoLinha === linha;
    
    if (editando) {
      return (
        <input
          autoFocus
          type="text"
          maxLength={30}
          value={nomeTemp}
          onChange={(e) => setNomeTemp(e.target.value)}
          onBlur={() => {
            if (nomeTemp.trim()) salvarNomeLinha(linha, nomeTemp.trim());
            else setEditandoLinha(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nomeTemp.trim()) salvarNomeLinha(linha, nomeTemp.trim());
            if (e.key === 'Escape') setEditandoLinha(null);
          }}
          className="nome-linha-input"
        />
      );
    }
    
    return (
      <span
        className="nome-linha-display text-[10px] text-gray-500 font-bold uppercase tracking-widest"
        onClick={() => { setEditandoLinha(linha); setNomeTemp(nome); }}
        title="Click pra editar"
      >
        {nome} 🖊️
      </span>
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
          {cardAtivo && (
            <span className="text-[10px] text-yellow-400 font-bold animate-pulse">
              ✨ Card ativado · click numa bancada (ESC pra cancelar)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleUploadCSV} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 text-xs px-3 py-1.5 rounded hover:bg-yellow-500/20 transition"
          >
            ↑ Upload Boletim
          </button>
        </div>
      </header>

      {loading && (
        <div className="text-center text-gray-500 py-20 text-sm">Carregando linha...</div>
      )}

      {!loading && (
        <div className="flex gap-3 p-3">
          <aside className="w-[180px] flex-shrink-0">
            <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-md p-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Livres</span>
                <span className="text-[10px] text-gray-500">{livres.length}</span>
              </div>
              <div className="text-[9px] text-gray-600 italic mb-2 px-1">
                Double-click pra ativar
              </div>
              <div className="max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
                {livres.length === 0 ? (
                  <div className="text-[10px] text-gray-600 italic text-center py-4">Todos alocados</div>
                ) : (
                  livres.map((c) => <CardColabSidebar key={c.id_groot} c={c} />)
                )}
              </div>
            </div>
          </aside>

          <main className="flex-1 flex gap-4 items-start justify-center overflow-x-auto">
            <section className="flex flex-col items-center">
              <div className="mb-2">
                <NomeLinha linha={1} />
              </div>
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={1} lado="esquerdo" qtd={LAYOUT.L1_ESQ} />
                <Esteira />
                <ColunaBancadas linha={1} lado="direito" qtd={LAYOUT.L1_DIR} alinharFundo />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>

            <section className="flex flex-col items-center mt-5">
              <ZonaCentral />
            </section>

            <section className="flex flex-col items-center">
              <div className="mb-2">
                <NomeLinha linha={2} />
              </div>
              <div className="flex gap-1 items-stretch">
                <ColunaBancadas linha={2} lado="esquerdo" qtd={LAYOUT.L2_ESQ} alinharFundo />
                <Esteira />
                <ColunaBancadas linha={2} lado="direito" qtd={LAYOUT.L2_DIR} />
              </div>
              <div className="text-gray-700 text-xs mt-2">↓</div>
            </section>
          </main>
        </div>
      )}

      {modal && modal.bancadaExistente && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={fecharModal}
        >
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white mb-1">Editar Categoria</h2>
            <p className="text-xs text-gray-500 mb-4">Linha {modal.linha} · Zona Central</p>
            <div className="mb-4">
              <label className="text-xs text-gray-400 mb-1.5 block">Sub-tipo:</label>
              <div className="grid grid-cols-2 gap-2">
                {SUBTIPOS_CATEGORIA.map((s) => (
                  <button
                    key={s}
                    onClick={() => setModalSubtipo(s)}
                    className={
                      'py-1.5 px-2 rounded text-xs font-medium border transition ' +
                      (modalSubtipo === s
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                        : 'border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]')
                    }
                  >{s}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-[#2a2a2a]">
              <button onClick={fecharModal} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition">
                Cancelar
              </button>
              <button onClick={salvarModal} className="px-4 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

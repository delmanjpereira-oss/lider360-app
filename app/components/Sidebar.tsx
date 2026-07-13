'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface Atalho {
  id: number;
  slot: number;
  nome_curto: string;      // emoji
  nome_completo?: string;  // 🆕 nome que aparece embaixo
  url: string;
}

interface StatsAtalho {
  atalho_id: number;
  clicks_mes: number;
  clicks_total: number;
  pct_uso: number;  // % em relação ao mais clicado do mês
}

const MENU = [
  {
    titulo: 'OPERAÇÃO DIÁRIA',
    items: [
      { nome: 'Calculadora NET', href: '/calculadora', icon: '🎯' },
      { nome: 'Lista de Presença', href: '/presenca', icon: '📋' },
      { nome: 'Mapeamento Linha', href: '/linha', icon: '🏭' },
      { nome: 'Copiloto IA', href: '/copiloto', icon: '🤖' },
    ],
  },
  {
    titulo: 'GESTÃO DE TIME',
    items: [
      { nome: 'Meu Time', href: '/meu-time', icon: '👥' },
      { nome: 'Calibração', href: '/calibracao', icon: '⚖️' },
      { nome: 'Boletim', href: '/boletim', icon: '📊' },
    ],
  },
  {
    titulo: 'CONFIGURAÇÕES',
    items: [
      { nome: 'Configurações', href: '/configuracoes-app', icon: '⚙️' },
    ],
  },
];

const TOTAL_SLOTS = 16; // 🆕 aumentado de 12 pra 16 (grid 4x4)
const STORAGE_KEY = 'lider360_sidebar_aberta';

export default function Sidebar() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);
  const [stats, setStats] = useState<Record<number, StatsAtalho>>({});
  const [modalSlot, setModalSlot] = useState<number | null>(null);
  const [modalEditar, setModalEditar] = useState<Atalho | null>(null);
  const [modalStats, setModalStats] = useState(false); // 🆕
  const [formNome, setFormNome] = useState('');
  const [formNomeCompleto, setFormNomeCompleto] = useState(''); // 🆕
  const [formUrl, setFormUrl] = useState('');
  const [emojiPreview, setEmojiPreview] = useState('🔗');
  const [gerandoEmoji, setGerandoEmoji] = useState(false);
  const [emojiManual, setEmojiManual] = useState(false);
  const [toast, setToast] = useState<{ tipo: 'success' | 'error'; msg: string } | null>(null);
  const [confirmRemover, setConfirmRemover] = useState<Atalho | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setAberta(saved === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(aberta));
  }, [aberta]);

  useEffect(() => { 
    carregarAtalhos(); 
    carregarStats();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setAberta((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setModalSlot(null);
        setModalEditar(null);
        setModalStats(false);
        setConfirmRemover(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const modalAberto = modalSlot !== null || modalEditar !== null || confirmRemover !== null || modalStats;
    if (typeof document === 'undefined') return;
    if (modalAberto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [modalSlot, modalEditar, confirmRemover, modalStats]);

  function showToast(tipo: 'success' | 'error', msg: string) {
    setToast({ tipo, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function carregarAtalhos() {
    const { data } = await supabase.from('atalhos_sidebar').select('*').order('slot');
    setAtalhos(data || []);
  }
  
  // 🆕 Carrega estatísticas de uso
  async function carregarStats() {
    const agora = new Date();
    const mesAtual = agora.getMonth() + 1;
    const anoAtual = agora.getFullYear();
    
    try {
      // Busca clicks do mês atual
      const { data: clicksMes } = await supabase
        .from('atalhos_clicks')
        .select('atalho_id')
        .eq('mes', mesAtual)
        .eq('ano', anoAtual);
      
      // Busca total geral
      const { data: clicksTotal } = await supabase
        .from('atalhos_clicks')
        .select('atalho_id');
      
      // Agrupa por atalho_id
      const contagemMes: Record<number, number> = {};
      (clicksMes || []).forEach((c: any) => {
        contagemMes[c.atalho_id] = (contagemMes[c.atalho_id] || 0) + 1;
      });
      
      const contagemTotal: Record<number, number> = {};
      (clicksTotal || []).forEach((c: any) => {
        contagemTotal[c.atalho_id] = (contagemTotal[c.atalho_id] || 0) + 1;
      });
      
      // Acha o mais clicado do mês pra calcular %
      const maiorMes = Math.max(...Object.values(contagemMes), 1);
      
      // Monta stats
      const novoStats: Record<number, StatsAtalho> = {};
      Object.keys(contagemMes).forEach((idStr) => {
        const id = Number(idStr);
        novoStats[id] = {
          atalho_id: id,
          clicks_mes: contagemMes[id] || 0,
          clicks_total: contagemTotal[id] || 0,
          pct_uso: Math.round(((contagemMes[id] || 0) / maiorMes) * 100),
        };
      });
      
      setStats(novoStats);
      console.log('📊 Stats carregados:', novoStats);
    } catch (e) {
      console.warn('Erro carregando stats:', e);
    }
  }

  async function gerarEmojiIA(nome: string, url: string) {
    if (!nome.trim() || nome.length < 2) { setEmojiPreview('🔗'); return; }
    if (emojiManual) return;
    setGerandoEmoji(true);
    try {
      const res = await fetch('/api/ia/gerar-emoji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, url }),
      });
      const data = await res.json();
      if (data.emoji) setEmojiPreview(data.emoji);
    } catch (err) {
      console.error('Erro gerar emoji:', err);
    } finally {
      setGerandoEmoji(false);
    }
  }

  useEffect(() => {
    if (modalSlot === null && modalEditar === null) return;
    if (emojiManual) return;
    const timer = setTimeout(() => { gerarEmojiIA(formNome, formUrl); }, 800);
    return () => clearTimeout(timer);
  }, [formNome, formUrl, emojiManual]);

  function abrirModalNovo(slot: number) {
    setModalSlot(slot);
    setFormNome('');
    setFormNomeCompleto(''); // 🆕
    setFormUrl('');
    setEmojiPreview('🔗');
    setEmojiManual(false);
  }

  function abrirModalEditar(atalho: Atalho) {
    setModalEditar(atalho);
    setFormNome(atalho.nome_completo || atalho.nome_curto); // 🆕
    setFormNomeCompleto(atalho.nome_completo || ''); // 🆕
    setFormUrl(atalho.url);
    setEmojiPreview(atalho.nome_curto);
    setEmojiManual(true);
  }

  function fecharModal() {
    setModalSlot(null);
    setModalEditar(null);
    setFormNome('');
    setFormNomeCompleto('');
    setFormUrl('');
    setEmojiPreview('🔗');
    setEmojiManual(false);
    setGerandoEmoji(false);
  }

  function usarManual() {
    setEmojiManual(true);
    setEmojiPreview(formNome.substring(0, 4) || '🔗');
  }

  function voltarParaIA() {
    setEmojiManual(false);
    gerarEmojiIA(formNome, formUrl);
  }

  async function salvarAtalho() {
    if (!formUrl.trim()) { showToast('error', 'Preencha a URL'); return; }
    if (!formNome.trim()) { showToast('error', 'Preencha o nome'); return; }
    
    let urlFinal = formUrl.trim();
    if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
      urlFinal = 'https://' + urlFinal;
    }
    
    const emojiFinal = emojiPreview.substring(0, 4);
    // 🆕 Nome completo pra mostrar embaixo (máximo 12 chars)
    const nomeCompletoFinal = (formNomeCompleto.trim() || formNome.trim()).substring(0, 12);
    
    if (modalEditar) {
      const { error } = await supabase.from('atalhos_sidebar')
        .update({ 
          nome_curto: emojiFinal, 
          nome_completo: nomeCompletoFinal, // 🆕
          url: urlFinal 
        })
        .eq('id', modalEditar.id);
      if (error) { showToast('error', 'Erro: ' + error.message); return; }
      showToast('success', '✅ Atalho atualizado');
    } else if (modalSlot) {
      const { error } = await supabase.from('atalhos_sidebar').insert({
        slot: modalSlot, 
        nome_curto: emojiFinal, 
        nome_completo: nomeCompletoFinal, // 🆕
        url: urlFinal,
      });
      if (error) { showToast('error', 'Erro: ' + error.message); return; }
      showToast('success', '✅ Atalho criado');
    }
    fecharModal();
    await carregarAtalhos();
  }

  async function removerAtalho(atalho: Atalho) {
    const { error } = await supabase.from('atalhos_sidebar').delete().eq('id', atalho.id);
    if (error) { showToast('error', 'Erro: ' + error.message); return; }
    showToast('success', '✅ Atalho removido');
    setConfirmRemover(null);
    fecharModal();
    await carregarAtalhos();
    await carregarStats();
  }

  // 🆕 Track click no atalho
  async function clickAtalho(atalho: Atalho) {
    window.open(atalho.url, '_blank', 'noopener,noreferrer');
    
    // Registra click no Supabase
    const agora = new Date();
    try {
      await supabase.from('atalhos_clicks').insert({
        atalho_id: atalho.id,
        clicado_em: agora.toISOString(),
        mes: agora.getMonth() + 1,
        ano: agora.getFullYear(),
      });
      // Recarrega stats
      setTimeout(() => carregarStats(), 500);
    } catch (e) {
      console.warn('Erro registrando click:', e);
    }
  }

  function getAtalhoSlot(slot: number): Atalho | null {
    return atalhos.find((a) => a.slot === slot) || null;
  }
  
  // 🆕 Ranking dos atalhos por uso
  function getRanking() {
    const comStats = atalhos.map((a) => ({
      atalho: a,
      stats: stats[a.id] || { clicks_mes: 0, clicks_total: 0, pct_uso: 0 },
    }));
    return comStats.sort((a, b) => b.stats.clicks_mes - a.stats.clicks_mes);
  }
  
  const widthClass = aberta ? 'w-64' : 'w-14';
  const totalClicksMes = Object.values(stats).reduce((s, x) => s + x.clicks_mes, 0);

  const modaisJSX = (
    <>
      {/* MODAL: Criar/Editar atalho */}
      {(modalSlot !== null || modalEditar !== null) && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadein"
          style={{ zIndex: 9999 }}
          onClick={fecharModal}
        >
          <div
            className="bg-[#1a1a1a] border border-yellow-500/40 rounded-xl p-6 max-w-md w-full animate-slidein"
            style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.9), 0 0 40px rgba(255,215,0,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  {modalEditar ? '✏️ Editar Atalho' : '🔗 Novo Atalho'}
                </h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Slot {modalEditar ? modalEditar.slot : modalSlot}
                </p>
              </div>
              <button
                onClick={fecharModal}
                className="text-gray-500 hover:text-white transition text-lg leading-none"
                title="Fechar (ESC)"
              >×</button>
            </div>
            
            {/* Preview do atalho */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={'w-14 h-14 bg-[#1a1a1a] border border-yellow-500/30 rounded-lg flex items-center justify-center text-2xl ' + (gerandoEmoji ? 'animate-pulse' : '')}>
                  {gerandoEmoji ? (
                    <span className="text-yellow-400">⚡</span>
                  ) : (
                    <span>{emojiPreview || '🔗'}</span>
                  )}
                </div>
                {/* 🆕 Preview do nome embaixo */}
                <p className="text-[8px] text-yellow-300 mt-1 font-bold truncate max-w-[56px] text-center">
                  {(formNomeCompleto || formNome || '').substring(0, 12) || '...'}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 mb-1">
                  {gerandoEmoji ? (
                    <span className="text-yellow-400">🤖 IA pensando...</span>
                  ) : emojiManual ? (
                    <span>✏️ Texto manual</span>
                  ) : (
                    <span className="text-purple-300">🤖 Gerado por IA</span>
                  )}
                </p>
                <div className="flex gap-2">
                  {!emojiManual && (
                    <button
                      onClick={usarManual}
                      className="text-[10px] text-gray-500 hover:text-white transition px-2 py-0.5 rounded border border-[#2a2a2a]"
                      title="Usar texto em vez de emoji"
                    >Usar texto</button>
                  )}
                  {emojiManual && formNome.trim().length >= 2 && (
                    <button
                      onClick={voltarParaIA}
                      className="text-[10px] text-purple-400 hover:text-purple-300 transition px-2 py-0.5 rounded border border-purple-500/30"
                      title="Voltar pro emoji da IA"
                    >🤖 Usar IA</button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">
                Nome do site
              </label>
              <input
                type="text"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Mercado Livre, Dashboard, Gmail..."
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white focus:border-yellow-500/50 focus:outline-none transition"
                autoFocus
              />
              <p className="text-[9px] text-gray-600 mt-1">A IA gera o emoji a partir desse nome</p>
            </div>
            
            {/* 🆕 NOVO CAMPO: Nome exibido embaixo */}
            <div className="mb-3">
              <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">
                Nome exibido embaixo <span className="text-gray-600 normal-case font-normal">(opcional, máx 12)</span>
              </label>
              <input
                type="text"
                value={formNomeCompleto}
                onChange={(e) => setFormNomeCompleto(e.target.value.substring(0, 12))}
                placeholder={formNome.substring(0, 12) || "Curto (ex: MELI)"}
                maxLength={12}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white focus:border-yellow-500/50 focus:outline-none transition"
              />
              <p className="text-[9px] text-gray-600 mt-1">
                Se vazio, usa o nome do site (max 12 chars)
              </p>
            </div>
            
            <div className="mb-5">
              <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">URL do site</label>
              <input
                type="text"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://meusite.com"
                onKeyDown={(e) => { if (e.key === 'Enter') salvarAtalho(); }}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-white focus:border-yellow-500/50 focus:outline-none transition font-mono"
              />
            </div>
            
            <div className="flex gap-2 justify-between items-center pt-3 border-t border-[#2a2a2a]">
              {modalEditar ? (
                <button
                  onClick={() => setConfirmRemover(modalEditar)}
                  className="text-[11px] text-red-400 hover:text-red-300 transition flex items-center gap-1"
                >🗑️ Remover</button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  onClick={fecharModal}
                  className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition"
                >Cancelar</button>
                <button
                  onClick={salvarAtalho}
                  disabled={gerandoEmoji}
                  className="px-4 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition disabled:opacity-50"
                >Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 🆕 MODAL: Estatísticas */}
      {modalStats && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadein"
          style={{ zIndex: 9999 }}
          onClick={() => setModalStats(false)}
        >
          <div
            className="bg-[#1a1a1a] border border-cyan-500/40 rounded-xl p-6 max-w-lg w-full animate-slidein max-h-[85vh] overflow-y-auto"
            style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.9), 0 0 40px rgba(6,182,212,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  📊 Estatísticas de Uso
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setModalStats(false)}
                className="text-gray-500 hover:text-white transition text-lg leading-none"
              >×</button>
            </div>
            
            {/* Card de resumo */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-[#0a0a0a] rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Atalhos</p>
                <p className="text-2xl font-black text-white">{atalhos.length}</p>
              </div>
              <div className="bg-cyan-500/10 rounded-lg p-3 text-center">
                <p className="text-[10px] text-cyan-400 uppercase font-bold">Clicks (mês)</p>
                <p className="text-2xl font-black text-cyan-400">{totalClicksMes}</p>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Sem uso</p>
                <p className="text-2xl font-black text-orange-400">
                  {atalhos.filter((a) => !stats[a.id] || stats[a.id].clicks_mes === 0).length}
                </p>
              </div>
            </div>
            
            {/* Ranking */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase font-bold mb-2">🏆 Ranking do mês</p>
              {getRanking().map((item, idx) => {
                const semUso = item.stats.clicks_mes === 0;
                return (
                  <div
                    key={item.atalho.id}
                    className={`flex items-center gap-3 p-2 rounded-lg ${
                      semUso 
                        ? 'bg-orange-500/5 border border-orange-500/20' 
                        : idx < 3 
                        ? 'bg-yellow-500/5 border border-yellow-500/20'
                        : 'bg-[#0a0a0a] border border-[#2a2a2a]'
                    }`}
                  >
                    <span className="text-xl w-8 text-center">
                      {idx === 0 && '🥇'}
                      {idx === 1 && '🥈'}
                      {idx === 2 && '🥉'}
                      {idx > 2 && !semUso && `${idx + 1}º`}
                      {semUso && '💤'}
                    </span>
                    <div className="w-10 h-10 bg-[#0a0a0a] border border-yellow-500/30 rounded flex items-center justify-center text-lg flex-shrink-0">
                      {item.atalho.nome_curto}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {item.atalho.nome_completo || item.atalho.nome_curto}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#2a2a2a] rounded overflow-hidden">
                          <div 
                            className={`h-full ${semUso ? 'bg-orange-500' : 'bg-yellow-500'}`}
                            style={{ width: `${item.stats.pct_uso}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {item.stats.pct_uso}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-white">{item.stats.clicks_mes}</p>
                      <p className="text-[9px] text-gray-500">clicks</p>
                    </div>
                  </div>
                );
              })}
              
              {atalhos.length === 0 && (
                <p className="text-center text-gray-500 text-sm py-4">
                  Sem atalhos ainda. Adiciona o primeiro!
                </p>
              )}
            </div>
            
            {/* Sugestão */}
            {atalhos.filter((a) => !stats[a.id] || stats[a.id].clicks_mes === 0).length > 0 && (
              <div className="mt-4 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <p className="text-xs text-orange-300 font-bold mb-1">💡 Sugestão</p>
                <p className="text-[11px] text-orange-200/80">
                  {atalhos.filter((a) => !stats[a.id] || stats[a.id].clicks_mes === 0).length} atalho(s) 
                  sem uso esse mês. Considere removê-los pra deixar espaço pra outros mais úteis!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* MODAL: Confirmar remoção */}
      {confirmRemover && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadein"
          style={{ zIndex: 10000 }}
          onClick={() => setConfirmRemover(null)}
        >
          <div
            className="bg-[#1a1a1a] border border-red-500/50 rounded-xl p-5 max-w-xs w-full animate-slidein"
            style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.9), 0 0 40px rgba(239,68,68,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white mb-4">
              Remover atalho <strong className="text-yellow-400">{confirmRemover.nome_completo || confirmRemover.nome_curto}</strong>?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmRemover(null)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
              >Cancelar</button>
              <button
                onClick={() => removerAtalho(confirmRemover)}
                className="px-3 py-1.5 text-xs font-bold bg-red-500/20 border border-red-500/50 text-red-400 rounded hover:bg-red-500/30"
              >Remover</button>
            </div>
          </div>
        </div>
      )}
      
      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-4 right-4 animate-slidein" style={{ zIndex: 10001 }}>
          <div className={
            'border rounded-lg px-4 py-2 text-xs font-medium shadow-xl backdrop-blur-sm min-w-[200px] ' +
            (toast.tipo === 'success'
              ? 'bg-green-500/20 border-green-500/50 text-green-300'
              : 'bg-red-500/20 border-red-500/50 text-red-300')
          }>
            {toast.msg}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slidein { from { opacity: 0; transform: scale(0.95) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-fadein { animation: fadein 0.15s ease-out; }
        .animate-slidein { animation: slidein 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </>
  );

  return (
    <>
      <aside className={widthClass + ' bg-[#0a0a0a] border-r border-[#2a2a2a] flex flex-col h-screen sticky top-0 transition-all duration-300'}>
        {/* TOPO COM BOTÃO ☰ + LOGO */}
        <div className="border-b border-[#2a2a2a] flex items-center" style={{ minHeight: '76px' }}>
          <button
            onClick={() => setAberta(!aberta)}
            className="flex items-center justify-center text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 transition-all"
            style={{ width: '56px', height: '76px', flexShrink: 0 }}
            title={aberta ? 'Fechar sidebar (Ctrl+B)' : 'Abrir sidebar (Ctrl+B)'}
          >
            <span className="text-xl">☰</span>
          </button>
          {aberta && (
            <Link href="/" className="flex items-center gap-2 flex-1 pr-3">
              <span className="text-2xl">🚀</span>
              <div>
                <h1 className="text-lg font-black text-white">
                  LIDER <span className="text-[#FFD700]">360</span>
                </h1>
                <p className="text-[10px] text-gray-500">RC01 Perus · MELI</p>
              </div>
            </Link>
          )}
        </div>
        
        {aberta && (
          <>
            <nav className="flex-1 overflow-y-auto py-4">
              {MENU.map((secao) => (
                <div key={secao.titulo} className="mb-6">
                  <p className="px-5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    {secao.titulo}
                  </p>
                  <ul>
                    {secao.items.map((item: any) => {
                      const ativo = pathname === item.href ||
                                    (item.href !== '/' && pathname.startsWith(item.href));
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-all relative ${
                              ativo
                                ? 'bg-[#FFD700]/10 text-[#FFD700] border-l-4 border-[#FFD700]'
                                : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border-l-4 border-transparent'
                            }`}
                          >
                            <span className="text-lg">{item.icon}</span>
                            <span className="font-bold">{item.nome}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              
              {/* ATALHOS - COM STATS */}
              <div className="mt-2 pt-4 border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between px-5 mb-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Atalhos ({atalhos.length}/{TOTAL_SLOTS})
                  </p>
                  <button
                    onClick={() => setModalStats(true)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
                    title="Ver estatísticas de uso"
                  >
                    📊 Stats
                  </button>
                </div>
                
                {/* 🆕 GRID 4x4 (16 slots) */}
                <div className="grid grid-cols-4 gap-1.5 px-3">
                  {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                    const slot = i + 1;
                    const atalho = getAtalhoSlot(slot);
                    
                    if (atalho) {
                      const s = stats[atalho.id];
                      const pctUso = s?.pct_uso || 0;
                      const clicksMes = s?.clicks_mes || 0;
                      const semUso = clicksMes === 0;
                      
                      return (
                        <button
                          key={slot}
                          onClick={() => clickAtalho(atalho)}
                          onContextMenu={(e) => { e.preventDefault(); abrirModalEditar(atalho); }}
                          className={`aspect-square bg-[#1a1a1a] border rounded flex flex-col items-center justify-between p-1 transition-all hover:scale-105 hover:bg-yellow-500/10 ${
                            semUso 
                              ? 'border-orange-500/20 hover:border-orange-400/50' 
                              : 'border-[#2a2a2a] hover:border-yellow-500/50'
                          }`}
                          title={`${atalho.nome_completo || atalho.nome_curto} · ${clicksMes} clicks esse mês · ${atalho.url}\n(Right-click pra editar)`}
                          style={{ minHeight: '58px' }}
                        >
                          {/* 🆕 EMOJI EM CIMA */}
                          <div className="text-[15px] leading-tight font-bold text-yellow-300 mt-0.5">
                            {atalho.nome_curto}
                          </div>
                          
                          {/* 🆕 NOME EMBAIXO */}
                          <div className="text-[7px] text-gray-400 truncate w-full text-center leading-tight">
                            {atalho.nome_completo || ''}
                          </div>
                          
                          {/* 🆕 BARRINHA DE USO */}
                          <div className="w-full h-0.5 bg-[#0a0a0a] rounded overflow-hidden">
                            <div 
                              className={semUso ? 'h-full bg-gray-700' : 'h-full bg-yellow-500'}
                              style={{ width: `${Math.max(pctUso, semUso ? 0 : 10)}%` }}
                            />
                          </div>
                        </button>
                      );
                    }
                    
                    return (
                      <button
                        key={slot}
                        onClick={() => abrirModalNovo(slot)}
                        className="aspect-square border-2 border-dashed border-[#2a2a2a] rounded flex items-center justify-center text-[14px] text-gray-700 hover:border-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/5 transition-all"
                        title="Adicionar atalho"
                        style={{ minHeight: '58px' }}
                      >
                        +
                      </button>
                    );
                  })}
                </div>
                
                {/* 🆕 Rodapé com resumo */}
                {atalhos.length > 0 && totalClicksMes > 0 && (
                  <div className="px-5 mt-3 text-[9px] text-gray-500 text-center">
                    {totalClicksMes} clicks este mês
                  </div>
                )}
              </div>
            </nav>
            
            <div className="p-4 border-t border-[#2a2a2a]">
              <div className="text-[10px] text-gray-500">
                <p>dev. Delman J. Pereira</p>
                <p>Team Lider · RC01</p>
              </div>
            </div>
          </>
        )}
      </aside>
      
      {mounted && createPortal(modaisJSX, document.body)}
    </>
  );
}

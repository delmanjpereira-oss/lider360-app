'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface Atalho {
  id: number;
  slot: number;
  nome_curto: string;
  url: string;
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

const TOTAL_SLOTS = 12;
const STORAGE_KEY = 'lider360_sidebar_aberta';

export default function Sidebar() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(true);
  const [mounted, setMounted] = useState(false); // 🔑 garante que portal só renderiza no client
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);
  const [modalSlot, setModalSlot] = useState<number | null>(null);
  const [modalEditar, setModalEditar] = useState<Atalho | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [emojiPreview, setEmojiPreview] = useState('🔗');
  const [gerandoEmoji, setGerandoEmoji] = useState(false);
  const [emojiManual, setEmojiManual] = useState(false);
  const [toast, setToast] = useState<{ tipo: 'success' | 'error'; msg: string } | null>(null);
  const [confirmRemover, setConfirmRemover] = useState<Atalho | null>(null);

  // Marca como montado pra ativar o portal só no client (evita erro SSR do Next)
  useEffect(() => { setMounted(true); }, []);

  // Carrega estado da sidebar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setAberta(saved === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(aberta));
  }, [aberta]);

  useEffect(() => { carregarAtalhos(); }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setAberta((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setModalSlot(null);
        setModalEditar(null);
        setConfirmRemover(null);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // 🔒 Bloqueia scroll do body quando modal aberto
  useEffect(() => {
    const modalAberto = modalSlot !== null || modalEditar !== null || confirmRemover !== null;
    if (typeof document === 'undefined') return;
    if (modalAberto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [modalSlot, modalEditar, confirmRemover]);

  function showToast(tipo: 'success' | 'error', msg: string) {
    setToast({ tipo, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function carregarAtalhos() {
    const { data } = await supabase.from('atalhos_sidebar').select('*').order('slot');
    setAtalhos(data || []);
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
    setFormUrl('');
    setEmojiPreview('🔗');
    setEmojiManual(false);
  }

  function abrirModalEditar(atalho: Atalho) {
    setModalEditar(atalho);
    setFormNome(atalho.nome_curto);
    setFormUrl(atalho.url);
    setEmojiPreview(atalho.nome_curto);
    setEmojiManual(true);
  }

  function fecharModal() {
    setModalSlot(null);
    setModalEditar(null);
    setFormNome('');
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
    let urlFinal = formUrl.trim();
    if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
      urlFinal = 'https://' + urlFinal;
    }
    const nomeFinal = emojiPreview.substring(0, 4);
    if (modalEditar) {
      const { error } = await supabase.from('atalhos_sidebar')
        .update({ nome_curto: nomeFinal, url: urlFinal })
        .eq('id', modalEditar.id);
      if (error) { showToast('error', 'Erro: ' + error.message); return; }
      showToast('success', '✅ Atalho atualizado');
    } else if (modalSlot) {
      const { error } = await supabase.from('atalhos_sidebar').insert({
        slot: modalSlot, nome_curto: nomeFinal, url: urlFinal,
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
  }

  function clickAtalho(atalho: Atalho) {
    window.open(atalho.url, '_blank', 'noopener,noreferrer');
  }

  function getAtalhoSlot(slot: number): Atalho | null {
    return atalhos.find((a) => a.slot === slot) || null;
  }

  const widthClass = aberta ? 'w-64' : 'w-14';

  // 🎯 MODAIS via PORTAL - renderizam no <body>, ficam na tela inteira
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

            {/* Preview do emoji/texto */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg">
              <div className={'w-14 h-14 bg-[#1a1a1a] border border-yellow-500/30 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 ' + (gerandoEmoji ? 'animate-pulse' : '')}>
                {gerandoEmoji ? (
                  <span className="text-yellow-400">⚡</span>
                ) : (
                  <span>{emojiPreview || '🔗'}</span>
                )}
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
              Remover atalho <strong className="text-yellow-400">{confirmRemover.nome_curto}</strong>?
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

      {/* Animações dos modais */}
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
                            {item.destaque && !ativo && (
                              <span className="ml-auto text-[9px] bg-gradient-to-br from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                                NOVO
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {/* ATALHOS */}
              <div className="mt-2 pt-4 border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between px-5 mb-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Atalhos</p>
                  <span className="text-[9px] text-gray-600">🤖 IA</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 px-3">
                  {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                    const slot = i + 1;
                    const atalho = getAtalhoSlot(slot);
                    if (atalho) {
                      return (
                        <button
                          key={slot}
                          onClick={() => clickAtalho(atalho)}
                          onContextMenu={(e) => { e.preventDefault(); abrirModalEditar(atalho); }}
                          className="aspect-square bg-[#1a1a1a] border border-[#2a2a2a] rounded flex items-center justify-center text-[16px] font-bold text-yellow-300 hover:border-yellow-500/50 hover:bg-yellow-500/10 transition-all hover:scale-105"
                          title={atalho.url + ' (Right-click pra editar)'}
                        >
                          {atalho.nome_curto}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={slot}
                        onClick={() => abrirModalNovo(slot)}
                        className="aspect-square border-2 border-dashed border-[#2a2a2a] rounded flex items-center justify-center text-[14px] text-gray-700 hover:border-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/5 transition-all"
                        title="Adicionar atalho"
                      >
                        +
                      </button>
                    );
                  })}
                </div>
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

      {/* 🎯 PORTAL: renderiza modais no <body> pra escapar do stacking context da sidebar */}
      {mounted && createPortal(modaisJSX, document.body)}
    </>
  );
}

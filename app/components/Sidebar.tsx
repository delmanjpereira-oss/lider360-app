'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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
      { nome: 'Mapeamento Linha', href: '/linha', icon: '🏭', destaque: true },
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
      { nome: 'Configurações', href: '/configuracoes', icon: '⚙️' },
    ],
  },
];

const SIDEBAR_STORAGE_KEY = 'lider360_sidebar_aberta';
const TOTAL_SLOTS = 8;

const STYLES = `
  @keyframes slideInSidebar {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes modalSlideIn {
    from { opacity: 0; transform: scale(0.9) translateY(-10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .sidebar-transition {
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .atalho-slot {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .atalho-slot:hover {
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.15);
  }
  .atalho-slot-empty {
    border-style: dashed;
    border-color: #2a2a2a;
  }
  .atalho-slot-empty:hover {
    border-color: #FFD700;
    background: rgba(255, 215, 0, 0.05);
  }
  .toggle-btn {
    transition: all 0.2s ease;
  }
  .toggle-btn:hover {
    background: rgba(255, 215, 0, 0.15);
  }
  .sidebar-content {
    animation: slideInSidebar 0.3s ease-out;
  }
  .modal-atalho {
    animation: modalSlideIn 0.25s ease-out;
  }
  .toast-feedback {
    animation: toastIn 0.3s ease-out;
  }
`;

export default function Sidebar() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(true);
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);
  const [modalSlot, setModalSlot] = useState<number | null>(null);
  const [modalEditar, setModalEditar] = useState<Atalho | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [toast, setToast] = useState<{ tipo: 'success' | 'error'; msg: string } | null>(null);
  const [confirmRemover, setConfirmRemover] = useState<Atalho | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) setAberta(saved === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(aberta));
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

  function showToast(tipo: 'success' | 'error', msg: string) {
    setToast({ tipo, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function carregarAtalhos() {
    const { data } = await supabase.from('atalhos_sidebar').select('*').order('slot');
    setAtalhos(data || []);
  }

  function abrirModalNovo(slot: number) {
    setModalSlot(slot);
    setFormNome('');
    setFormUrl('');
  }

  function abrirModalEditar(atalho: Atalho) {
    setModalEditar(atalho);
    setFormNome(atalho.nome_curto);
    setFormUrl(atalho.url);
  }

  function fecharModal() {
    setModalSlot(null);
    setModalEditar(null);
    setFormNome('');
    setFormUrl('');
  }

  async function salvarAtalho() {
    if (!formNome.trim() || !formUrl.trim()) {
      showToast('error', 'Preencha nome e URL');
      return;
    }
    let urlFinal = formUrl.trim();
    if (!urlFinal.startsWith('http://') && !urlFinal.startsWith('https://')) {
      urlFinal = 'https://' + urlFinal;
    }
    let nomeFinal = formNome.trim().substring(0, 4);

    if (modalEditar) {
      const { error } = await supabase.from('atalhos_sidebar')
        .update({ nome_curto: nomeFinal, url: urlFinal })
        .eq('id', modalEditar.id);
      if (error) { showToast('error', 'Erro: ' + error.message); return; }
      showToast('success', '✅ Atalho atualizado');
    } else if (modalSlot) {
      const { error } = await supabase.from('atalhos_sidebar').insert({
        slot: modalSlot,
        nome_curto: nomeFinal,
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
    await carregarAtalhos();
  }

  function clickAtalho(atalho: Atalho) {
    window.open(atalho.url, '_blank', 'noopener,noreferrer');
  }

  function getAtalhoSlot(slot: number): Atalho | null {
    return atalhos.find((a) => a.slot === slot) || null;
  }

  const widthClass = aberta ? 'w-64' : 'w-12';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      
      <aside
        className={'sidebar-transition bg-[#0a0a0a] border-r border-[#2a2a2a] flex flex-col h-screen sticky top-0 ' + widthClass}
        style={{ overflow: 'hidden' }}
      >
        {/* TOPO - Botão toggle + Logo */}
        <div className="border-b border-[#2a2a2a] flex items-center" style={{ minHeight: '76px' }}>
          <button
            onClick={() => setAberta(!aberta)}
            className="toggle-btn flex items-center justify-center text-yellow-400 hover:text-yellow-300"
            style={{ width: '48px', height: '76px', flexShrink: 0 }}
            title={aberta ? 'Fechar (Ctrl+B)' : 'Abrir (Ctrl+B)'}
          >
            <span className="text-lg">☰</span>
          </button>
          {aberta && (
            <Link href="/" className="flex items-center gap-2 flex-1 pr-3 py-3">
              <span className="text-2xl">🦅</span>
              <div>
                <h1 className="text-lg font-black text-white">
                  LIDER <span className="text-[#FFD700]">360</span>
                </h1>
                <p className="text-[10px] text-gray-500">RC01 Perus · MELI</p>
              </div>
            </Link>
          )}
        </div>

        {/* CONTEÚDO - só se aberta */}
        {aberta && (
          <>
            <nav className="sidebar-content flex-1 overflow-y-auto py-4">
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
                            className={
                              'flex items-center gap-3 px-5 py-2.5 text-sm transition-all relative ' + (
                              ativo
                                ? 'bg-[#FFD700]/10 text-[#FFD700] border-l-4 border-[#FFD700]'
                                : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border-l-4 border-transparent'
                              )
                            }
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

              {/* ATALHOS - Grid 4x2 */}
              <div className="mt-2 pt-4 border-t border-[#2a2a2a]">
                <p className="px-5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Atalhos
                </p>
                <div className="grid grid-cols-4 gap-1.5 px-3">
                  {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                    const slot = i + 1;
                    const atalho = getAtalhoSlot(slot);
                    
                    if (atalho) {
                      return (
                        <button
                          key={slot}
                          onClick={() => clickAtalho(atalho)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            abrirModalEditar(atalho);
                          }}
                          className="atalho-slot aspect-square bg-[#1a1a1a] border border-[#2a2a2a] rounded flex items-center justify-center text-[11px] font-bold text-yellow-300 hover:border-yellow-500/50 hover:bg-yellow-500/10"
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
                        className="atalho-slot atalho-slot-empty aspect-square border-2 rounded flex items-center justify-center text-[14px] text-gray-700 hover:text-yellow-400"
                        title="Adicionar atalho"
                      >
                        +
                      </button>
                    );
                  })}
                </div>
              </div>
            </nav>

            {/* FOOTER */}
            <div className="p-4 border-t border-[#2a2a2a]">
              <div className="text-[10px] text-gray-500">
                <p>Delman Pereira</p>
                <p>TL P2M · RC01</p>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* MODAL: Criar/Editar atalho */}
      {(modalSlot !== null || modalEditar !== null) && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
          onClick={fecharModal}
        >
          <div
            className="modal-atalho bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold text-white mb-1">
              {modalEditar ? '✏️ Editar Atalho' : '🔗 Novo Atalho'}
            </h2>
            <p className="text-[10px] text-gray-500 mb-4">
              {modalEditar ? 'Slot ' + modalEditar.slot : 'Slot ' + modalSlot}
            </p>
            
            <div className="mb-3">
              <label className="text-[10px] text-gray-400 mb-1 block">
                Nome curto (3 letras ou emoji):
              </label>
              <input
                type="text"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                maxLength={4}
                placeholder="📊 ou ML"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white focus:border-yellow-500/50 focus:outline-none"
                autoFocus
              />
            </div>
            
            <div className="mb-4">
              <label className="text-[10px] text-gray-400 mb-1 block">URL do site:</label>
              <input
                type="text"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://meusite.com"
                onKeyDown={(e) => { if (e.key === 'Enter') salvarAtalho(); }}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
              />
            </div>
            
            <div className="flex gap-2 justify-between items-center pt-2 border-t border-[#2a2a2a]">
              {modalEditar ? (
                <button
                  onClick={() => setConfirmRemover(modalEditar)}
                  className="text-[10px] text-red-400 hover:text-red-300 transition"
                >🗑️ Remover</button>
              ) : <div />}
              <div className="flex gap-2">
                <button
                  onClick={fecharModal}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition"
                >Cancelar</button>
                <button
                  onClick={salvarAtalho}
                  className="px-3 py-1.5 text-xs font-bold bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 rounded hover:bg-yellow-500/30 transition"
                >Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar remoção */}
      {confirmRemover && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4"
          onClick={() => setConfirmRemover(null)}
        >
          <div
            className="modal-atalho bg-[#1a1a1a] border border-red-500/30 rounded-lg p-4 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white mb-3">Remover atalho <strong className="text-yellow-400">{confirmRemover.nome_curto}</strong>?</p>
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
        <div className="fixed bottom-4 right-4 z-[120] toast-feedback">
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
    </>
  );
}

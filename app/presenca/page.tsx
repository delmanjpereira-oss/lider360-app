'use client';

import { useState, useEffect, useCallback } from 'react';

type Pendencia = {
  linha: number;
  coluna: number;
  data: string;
  dataISO: string;
  isHoje: boolean;
  nome: string;
  idGroot: string;
  cpf: string;
  teamLeader: string;
  processo: string;
  turno: string;
};

type PresencaData = {
  pendencias: Pendencia[];
  stats: { pendentesHoje: number; totalPendentes: number };
  filtros: { teamLeaders: string[]; datas: string[]; processos: string[] };
  hoje: string;
  atualizadoEm: string;
  fromCache?: boolean;
  error?: string;
};

type Modal = {
  pendencia: Pendencia;
  motivo: string;
  comentario: string;
};

const CATEGORIA: Record<string, { label: string; cor: string }> = {
  'P':   { label: 'Presente',            cor: 'text-green-400'  },
  'HE':  { label: 'Hora Extra',           cor: 'text-green-300'  },
  'PCO': { label: 'Pres. c/ Comp.',       cor: 'text-green-400'  },
  'FI':  { label: 'Falta Injustificada',  cor: 'text-red-400'    },
  'AB':  { label: 'Abandono',             cor: 'text-red-500'    },
  'AD':  { label: 'Advertência',          cor: 'text-orange-400' },
  'FJ':  { label: 'Falta Justificada',    cor: 'text-yellow-400' },
  'FE':  { label: 'Férias',               cor: 'text-blue-400'   },
  'FR':  { label: 'Feriado',              cor: 'text-blue-300'   },
  'HCD': { label: 'Hora Compensada',      cor: 'text-purple-400' },
  'HTF': { label: 'HT de Folga',          cor: 'text-purple-300' },
  'AP':  { label: 'Afastamento',          cor: 'text-gray-400'   },
  'SIE': { label: 'Sem Info. Externa',    cor: 'text-gray-400'   },
  'CE':  { label: 'Comp. Externo',        cor: 'text-cyan-400'   },
  'ON':  { label: 'Outras Naturezas',     cor: 'text-gray-300'   },
  'TR':  { label: 'Treinamento',          cor: 'text-teal-400'   },
};

function getSigla(motivo: string): string {
  return motivo.split(' - ')[0] ?? motivo;
}

function getCategoria(sigla: string) {
  return CATEGORIA[sigla] ?? { label: sigla, cor: 'text-gray-300' };
}

export default function PresencaPage() {
  const [dados, setDados] = useState<PresencaData | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);

  // Filtros
  const [filtroTL, setFiltroTL] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState('');
  const [filtroNome, setFiltroNome] = useState('');

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    try {
      const [presRes, motivosRes] = await Promise.all([
        fetch(`/api/presenca${forcar ? '?forcar=1' : ''}`),
        fetch('/api/presenca/motivos'),
      ]);
      const presJson = await presRes.json();
      const motivosJson = await motivosRes.json();

      setDados(presJson);
      setMotivos(Array.isArray(motivosJson) ? motivosJson : []);
    } catch {
      window.showToast?.('error', 'Erro ao carregar presença');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function confirmarMarcacao() {
    if (!modal || !modal.motivo) {
      window.showToast?.('warning', 'Selecione um motivo');
      return;
    }
    const p = modal.pendencia;
    const key = `${p.linha}-${p.coluna}`;
    setMarcando(key);
    try {
      const res = await fetch('/api/presenca/marcar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linha: p.linha,
          coluna: p.coluna,
          motivo: getSigla(modal.motivo),
          comentario: modal.comentario,
        }),
      });
      const json = await res.json();
      if (json.success) {
        window.showToast?.('success', `✅ ${p.nome} — ${modal.motivo}`);
        setDados(prev => {
          if (!prev) return prev;
          const novas = prev.pendencias.filter(
            x => !(x.linha === p.linha && x.coluna === p.coluna)
          );
          return {
            ...prev,
            pendencias: novas,
            stats: {
              pendentesHoje: novas.filter(x => x.isHoje).length,
              totalPendentes: novas.length,
            },
          };
        });
        setModal(null);
      } else {
        window.showToast?.('error', json.error ?? 'Erro ao marcar presença');
      }
    } catch {
      window.showToast?.('error', 'Erro de rede ao marcar presença');
    } finally {
      setMarcando(null);
    }
  }

  const pendenciasFiltradas = (dados?.pendencias ?? []).filter(p => {
    if (filtroTL && p.teamLeader !== filtroTL) return false;
    if (filtroData && p.data !== filtroData) return false;
    if (filtroProcesso && p.processo !== filtroProcesso) return false;
    if (filtroNome && !p.nome.toLowerCase().includes(filtroNome.toLowerCase())) return false;
    return true;
  });

  const semCredencial = dados?.error?.includes('GOOGLE_SERVICE_ACCOUNT_KEY');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black mb-1">
            📅 Lista de <span className="text-[#FFD700]">Presença</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Semana atual · Pendências sem registro na planilha MELI
          </p>
        </div>
        <button
          onClick={() => carregar(true)}
          disabled={carregando}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-[#FFD700]/30 text-gray-300 hover:text-white rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm font-bold whitespace-nowrap"
        >
          <span className={carregando ? 'animate-spin' : ''}>🔄</span>
          {carregando ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {/* Aviso sem credencial */}
      {semCredencial && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
          <p className="text-yellow-400 font-bold mb-1">⚙️ Configuração necessária</p>
          <p className="text-yellow-200/70 text-sm leading-relaxed">
            Adicione a variável de ambiente <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-xs">GOOGLE_SERVICE_ACCOUNT_KEY</code> com o JSON
            do Service Account que tem acesso à planilha <strong>Visão Geral</strong>.
          </p>
          <p className="text-yellow-200/50 text-xs mt-2">
            Google Cloud → IAM → Service Accounts → criar chave JSON → compartilhar planilha com o e-mail do SA
          </p>
        </div>
      )}

      {/* Erro genérico */}
      {dados?.error && !semCredencial && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-red-400 text-sm font-bold">Erro ao carregar dados:</p>
          <p className="text-red-300/70 text-xs mt-1 font-mono">{dados.error}</p>
        </div>
      )}

      {/* Stats cards */}
      {dados && !dados.error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-red-500/15 to-red-600/5 border border-red-500/20 rounded-2xl p-4">
            <p className="text-3xl font-black text-red-400">{dados.stats.pendentesHoje}</p>
            <p className="text-gray-400 text-sm mt-1">Pendentes hoje</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <p className="text-3xl font-black text-white">{dados.stats.totalPendentes}</p>
            <p className="text-gray-400 text-sm mt-1">Total na semana</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <p className="text-3xl font-black text-[#FFD700]">{pendenciasFiltradas.length}</p>
            <p className="text-gray-400 text-sm mt-1">Exibindo</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 flex flex-col justify-between">
            <p className="text-xs text-gray-500 font-mono">{dados.hoje}</p>
            <p className="text-xs text-gray-600 mt-1">
              {dados.fromCache ? '🗄 do cache' : '🔴 ao vivo'}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {dados && !dados.error && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="🔍 Buscar nome..."
              value={filtroNome}
              onChange={e => setFiltroNome(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
            <select
              value={filtroTL}
              onChange={e => setFiltroTL(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors"
            >
              <option value="">👤 Todos os TLs</option>
              {dados.filtros.teamLeaders.map(tl => (
                <option key={tl} value={tl}>{tl}</option>
              ))}
            </select>
            <select
              value={filtroData}
              onChange={e => setFiltroData(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors"
            >
              <option value="">📆 Todas as datas</option>
              {dados.filtros.datas.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={filtroProcesso}
              onChange={e => setFiltroProcesso(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors"
            >
              <option value="">🏭 Todos os processos</option>
              {dados.filtros.processos.map(pr => (
                <option key={pr} value={pr}>{pr}</option>
              ))}
            </select>
          </div>
          {(filtroTL || filtroData || filtroProcesso || filtroNome) && (
            <button
              onClick={() => { setFiltroTL(''); setFiltroData(''); setFiltroProcesso(''); setFiltroNome(''); }}
              className="mt-3 text-xs text-gray-500 hover:text-[#FFD700] transition-colors"
            >
              ✕ Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {carregando && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-[#2a2a2a] rounded" />
                  <div className="h-3 w-24 bg-[#2a2a2a] rounded" />
                </div>
                <div className="h-9 w-28 bg-[#2a2a2a] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de pendências */}
      {!carregando && dados && !dados.error && (
        <div className="space-y-2">
          {pendenciasFiltradas.length === 0 ? (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
              <span className="text-5xl block mb-3">✅</span>
              <p className="text-gray-300 font-bold text-lg">Nenhuma pendência</p>
              <p className="text-gray-500 text-sm mt-1">Todas as presenças da semana estão registradas!</p>
            </div>
          ) : (
            pendenciasFiltradas.map(p => {
              const key = `${p.linha}-${p.coluna}`;
              const estaMarcando = marcando === key;
              return (
                <div
                  key={key}
                  className={`
                    bg-[#1a1a1a] border rounded-2xl p-4 transition-all
                    ${p.isHoje
                      ? 'border-red-500/30 bg-gradient-to-r from-red-500/5 to-transparent'
                      : 'border-[#2a2a2a]'}
                  `}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">{p.nome}</span>
                        {p.isHoje && (
                          <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                            ⚠️ HOJE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm text-gray-400">{p.data}</span>
                        {p.teamLeader && (
                          <span className="text-xs text-gray-500">TL: {p.teamLeader}</span>
                        )}
                        {p.processo && (
                          <span className="text-xs text-gray-600 bg-[#2a2a2a] px-2 py-0.5 rounded-full">
                            {p.processo}
                          </span>
                        )}
                        {p.cpf && (
                          <span className="text-xs text-gray-600 font-mono">{p.cpf}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setModal({ pendencia: p, motivo: '', comentario: '' })}
                      disabled={estaMarcando}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#FFD700]/10 hover:bg-[#FFD700]/20 border border-[#FFD700]/30 hover:border-[#FFD700]/60 text-[#FFD700] rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm font-bold"
                    >
                      {estaMarcando ? (
                        <span className="animate-spin">⏳</span>
                      ) : (
                        <>✏️ Marcar</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal de marcação */}
      {modal && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1f1f1f] to-[#161616] border-2 border-[#2a2a2a] rounded-3xl p-6 w-full max-w-md shadow-2xl"
            style={{ boxShadow: '0 30px 80px -10px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-2xl shadow-lg shadow-yellow-500/30 flex-shrink-0">
                ✏️
              </div>
              <div>
                <h3 className="text-white font-black text-lg">Marcar presença</h3>
                <p className="text-gray-400 text-sm">{modal.pendencia.nome}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Data</p>
                  <p className="text-white font-bold text-sm">{modal.pendencia.data}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">ID Groot</p>
                  <p className="text-white font-mono text-sm">{modal.pendencia.idGroot || '—'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2 font-bold">
                  Motivo <span className="text-red-400">*</span>
                </label>
                <select
                  value={modal.motivo}
                  onChange={e => setModal(m => m ? { ...m, motivo: e.target.value } : m)}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                >
                  <option value="">Selecione o motivo...</option>
                  <optgroup label="✅ Presente">
                    {motivos.filter(m => ['P', 'HE', 'PCO'].includes(getSigla(m))).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🔴 Ausência grave">
                    {motivos.filter(m => ['FI', 'AB', 'AD'].includes(getSigla(m))).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                  <optgroup label="🟡 Ausência justificada">
                    {motivos.filter(m => !['P', 'HE', 'PCO', 'FI', 'AB', 'AD'].includes(getSigla(m))).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                </select>

                {modal.motivo && (
                  <p className={`mt-2 text-xs font-bold ${getCategoria(getSigla(modal.motivo)).cor}`}>
                    {getCategoria(getSigla(modal.motivo)).label}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2 font-bold">
                  Comentário <span className="text-gray-600">(opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={modal.comentario}
                  onChange={e => setModal(m => m ? { ...m, comentario: e.target.value } : m)}
                  placeholder="Observação ou justificativa..."
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700]/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none transition-colors resize-none text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold rounded-xl transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarMarcacao}
                disabled={!modal.motivo || !!marcando}
                className="flex-1 py-3 bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black font-black rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/20"
              >
                {marcando ? '⏳ Enviando...' : '✅ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

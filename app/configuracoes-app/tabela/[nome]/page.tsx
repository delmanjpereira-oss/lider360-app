'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';

type TabelaConfig = {
  nome: string;
  label: string;
  icone: string;
  descricao: string;
  cor: string;
};

type GrupoUpload = {
  arquivo: string;
  registros: number;
  primeiraData: string | null;
  ultimaData: string | null;
};

const TABELAS_CONFIG: Record<string, TabelaConfig> = {
  historico: {
    nome: 'historico',
    label: 'Histórico de Produtividade',
    icone: '📊',
    descricao: 'Registros de produção diária (CSVs de Checkin, P2M e Sorting)',
    cor: 'cyan',
  },
  dpmo_eventos: {
    nome: 'dpmo_eventos',
    label: 'DPMO Detalhado',
    icone: '📦',
    descricao: 'Eventos detalhados do inventário (CSV INVENTÁRIO DPMO)',
    cor: 'purple',
  },
  dpmo_agregado: {
    nome: 'dpmo_agregado',
    label: 'DPMO Agregado',
    icone: '📋',
    descricao: 'DPMO já calculado por semana (CSV TABELA DINÂMICA)',
    cor: 'cyan',
  },
};

export default function TabelaDetalhePage() {
  const router = useRouter();
  const params = useParams();
  const nomeTabela = params.nome as string;

  const config = TABELAS_CONFIG[nomeTabela];

  const [grupos, setGrupos] = useState<GrupoUpload[]>([]);
  const [semOrigem, setSemOrigem] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apagando, setApagando] = useState<string | null>(null);

  useEffect(() => {
    if (config) carregar();
    else setLoading(false);
  }, [nomeTabela]);

  async function carregar() {
    setLoading(true);
    try {
      // Pega TODOS os registros pra agrupar (limita a 50k pra segurança)
      const { data, error, count } = await supabase
        .from(nomeTabela)
        .select('arquivo_origem, criado_em', { count: 'exact' })
        .limit(50000);

      if (error) throw new Error(error.message);

      setTotal(count || 0);

      if (data) {
        // Agrupa por arquivo_origem
        const mapa: Record<string, { registros: number; datas: string[] }> = {};
        let semOrig = 0;

        data.forEach((r: { arquivo_origem: string | null; criado_em: string | null }) => {
          if (!r.arquivo_origem || r.arquivo_origem.trim() === '') {
            semOrig++;
            return;
          }
          if (!mapa[r.arquivo_origem]) {
            mapa[r.arquivo_origem] = { registros: 0, datas: [] };
          }
          mapa[r.arquivo_origem].registros++;
          if (r.criado_em) mapa[r.arquivo_origem].datas.push(r.criado_em);
        });

        const lista: GrupoUpload[] = Object.entries(mapa).map(([arquivo, dados]) => {
          const datasOrdenadas = dados.datas.sort();
          return {
            arquivo,
            registros: dados.registros,
            primeiraData: datasOrdenadas[0] || null,
            ultimaData: datasOrdenadas[datasOrdenadas.length - 1] || null,
          };
        });

        // Ordena por mais recente primeiro
        lista.sort((a, b) => {
          if (!a.ultimaData) return 1;
          if (!b.ultimaData) return -1;
          return b.ultimaData.localeCompare(a.ultimaData);
        });

        setGrupos(lista);
        setSemOrigem(semOrig);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('error', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function apagarUpload(grupo: GrupoUpload) {
    const ok = await window.showConfirm({
      title: `Apagar este upload?`,
      message: `Vai remover os ${grupo.registros.toLocaleString('pt-BR')} registros do arquivo "${grupo.arquivo}". Essa ação NÃO pode ser desfeita!`,
      confirmText: `Apagar ${grupo.registros} registros`,
      cancelText: 'Cancelar',
      danger: true,
    });

    if (!ok) return;

    setApagando(grupo.arquivo);
    try {
      const { error } = await supabase
        .from(nomeTabela)
        .delete()
        .eq('arquivo_origem', grupo.arquivo);

      if (error) throw new Error(error.message);

      window.showToast('success', `Upload removido! ${grupo.registros.toLocaleString('pt-BR')} registros apagados.`);
      carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      window.showToast('error', 'Erro: ' + msg);
    } finally {
      setApagando(null);
    }
  }

  async function apagarSemOrigem() {
    const ok = await window.showConfirm({
      title: 'Apagar registros sem origem?',
      message: `Vai remover ${semOrigem.toLocaleString('pt-BR')} registros antigos que não têm arquivo_origem definido. Essa ação NÃO pode ser desfeita!`,
      confirmText: `Apagar ${semOrigem} registros`,
      cancelText: 'Cancelar',
      danger: true,
    });

    if (!ok) return;

    try {
      const { error } = await supabase
        .from(nomeTabela)
        .delete()
        .or('arquivo_origem.is.null,arquivo_origem.eq.');

      if (error) throw new Error(error.message);

      window.showToast('success', `${semOrigem} registros apagados!`);
      carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      window.showToast('error', 'Erro: ' + msg);
    }
  }

  function formatarData(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function tempoAtras(iso: string | null): string {
    if (!iso) return '';
    const agora = new Date();
    const data = new Date(iso);
    const diff = agora.getTime() - data.getTime();
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (dias === 0) {
      const horas = Math.floor(diff / (1000 * 60 * 60));
      if (horas === 0) {
        const minutos = Math.floor(diff / (1000 * 60));
        return `${minutos}min atrás`;
      }
      return `${horas}h atrás`;
    }
    if (dias === 1) return 'Ontem';
    if (dias < 7) return `${dias}d atrás`;
    return `${Math.floor(dias / 7)} semana(s) atrás`;
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Link href="/configuracoes-app" className="text-gray-400 hover:text-white inline-flex items-center gap-2">
          ← Voltar
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold">Tabela não encontrada ou não suportada pra visualização detalhada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/configuracoes-app"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para Configurações
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
          <span className="text-5xl">{config.icone}</span>
          <span>{config.label}</span>
        </h1>
        <p className="text-gray-400">{config.descricao}</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-${config.cor}-500/10 border border-${config.cor}-500/30 rounded-2xl p-4`}>
          <p className="text-xs text-gray-400 uppercase mb-1">Total de registros</p>
          <p className="text-3xl font-black text-white">{total.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase mb-1">Uploads únicos</p>
          <p className="text-3xl font-black text-white">{grupos.length}</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase mb-1">Sem origem (antigos)</p>
          <p className="text-3xl font-black text-yellow-400">{semOrigem.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-5xl block mb-4 animate-pulse">⏳</span>
          <p className="text-gray-400">Carregando uploads...</p>
        </div>
      ) : (
        <>
          {/* Lista de uploads */}
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5)' }}
          >
            <h2 className="text-lg font-bold text-[#FFD700] mb-4 flex items-center gap-2">
              📁 Uploads (mais recente primeiro)
            </h2>

            {grupos.length === 0 ? (
              <div className="text-center py-12">
                <span className="text-6xl block mb-3">📭</span>
                <p className="text-gray-400">Nenhum upload encontrado nessa tabela</p>
              </div>
            ) : (
              <div className="space-y-3">
                {grupos.map((g) => (
                  <div
                    key={g.arquivo}
                    className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap hover:border-[#FFD700]/30 transition-all"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-[250px]">
                      <div className="text-3xl">📄</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-sm font-mono break-all">
                          {g.arquivo}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>📅 {formatarData(g.ultimaData)}</span>
                          <span className="text-gray-600">·</span>
                          <span className="text-cyan-400">{tempoAtras(g.ultimaData)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-black text-white">
                          {g.registros.toLocaleString('pt-BR')}
                        </p>
                        <p className="text-xs text-gray-500">registros</p>
                      </div>
                      <button
                        onClick={() => apagarUpload(g)}
                        disabled={apagando === g.arquivo}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-4 py-2 rounded-lg transition-all text-xs disabled:opacity-30 border border-red-500/30 hover:border-red-500/50"
                      >
                        {apagando === g.arquivo ? '⏳ Apagando...' : '🗑️ Apagar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registros sem origem (antigos) */}
          {semOrigem > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-2 flex items-center gap-2">
                ⚠️ Registros sem arquivo de origem
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Existem <strong className="text-yellow-400">{semOrigem.toLocaleString('pt-BR')}</strong> registros antigos
                que não têm o campo "arquivo_origem" preenchido. Esses registros foram criados
                antes da gente começar a rastrear a origem dos uploads.
              </p>
              <button
                onClick={apagarSemOrigem}
                className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 font-bold px-4 py-2 rounded-lg transition-all text-sm border border-yellow-500/30"
              >
                🗑️ Apagar {semOrigem.toLocaleString('pt-BR')} registros sem origem
              </button>
            </div>
          )}

          {/* Dicas */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
            <p className="font-bold mb-2">💡 Como funciona:</p>
            <ul className="space-y-1 list-disc pl-5 text-xs">
              <li>Cada arquivo CSV que você sobe gera vários registros — todos com o mesmo "arquivo_origem"</li>
              <li>Apagar um upload remove SÓ os registros que vieram daquele CSV específico</li>
              <li>Os outros uploads permanecem intactos</li>
              <li>Útil pra refazer um upload com erro sem perder tudo</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

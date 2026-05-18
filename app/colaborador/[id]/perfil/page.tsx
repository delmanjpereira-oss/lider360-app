'use client';

/**
 * ====================================================
 * TELA: Perfil Comportamental
 * URL: /colaborador/[id]/perfil
 *
 * Busca: GET /api/perfil/[id]
 * ====================================================
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { PerfilComportamental } from '../../../../lib/perfil-comportamental';

// ============================================
// MAPEAMENTO DE CORES (Tag.cor → classes Tailwind)
// ============================================

const CORES_TAG: Record<string, string> = {
  verde: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  azul: 'bg-blue-500/15 border-blue-500/40 text-blue-300',
  amarelo: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
  laranja: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
  vermelho: 'bg-red-500/15 border-red-500/40 text-red-300',
  cinza: 'bg-gray-500/15 border-gray-500/40 text-gray-300',
};

const CORES_SINAL: Record<string, string> = {
  alto: 'bg-red-500/10 border-red-500/50 text-red-200',
  medio: 'bg-orange-500/10 border-orange-500/40 text-orange-200',
  baixo: 'bg-yellow-500/5 border-yellow-500/30 text-yellow-200',
};

const ICONES_PADRAO: Record<string, string> = {
  'estavel-alto': '💎',
  'alto-com-oscilacao': '⚡',
  'evoluindo': '📈',
  'em-queda': '📉',
  'medio': '⚖️',
  'compensacao': '🎢',
  'baixo-consistente': '🔻',
};

const LABEL_PADRAO: Record<string, string> = {
  'estavel-alto': 'Top performer',
  'alto-com-oscilacao': 'Alto com oscilação',
  'evoluindo': 'Em evolução',
  'em-queda': 'Em queda',
  'medio': 'Performance média',
  'compensacao': 'Compensação',
  'baixo-consistente': 'Baixo consistente',
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PerfilColaboradorPage() {
  const params = useParams();
  const router = useRouter();
  const idGroot = (params?.id as string) || '';

  const [perfil, setPerfil] = useState<PerfilComportamental | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    fetch(`/api/perfil/${idGroot}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.erro || 'Falha ao buscar perfil');
        return json as PerfilComportamental;
      })
      .then((data) => {
        if (!cancelado) setPerfil(data);
      })
      .catch((err) => {
        if (!cancelado) setErro(err.message || 'Erro desconhecido');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [idGroot]);

  // ============================================
  // LOADING
  // ============================================
  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[#FFD700] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-300 text-lg">Gerando perfil comportamental...</p>
          <p className="text-gray-500 text-sm mt-1">
            Analisando histórico, feedbacks, DPMO e padrões
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // ERRO
  // ============================================
  if (erro || !perfil) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-red-500/40 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl text-white font-bold mb-2">
            Não foi possível gerar o perfil
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            {erro || 'Colaborador não encontrado'}
          </p>
          <p className="text-gray-500 text-xs mb-5">
            ID Groot: <span className="font-mono">{idGroot}</span>
          </p>
          <button
            onClick={() => router.back()}
            className="px-5 py-2.5 bg-[#FFD700] text-black font-bold rounded-xl hover:brightness-110 transition-all"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // PERFIL CARREGADO
  // ============================================
  const corProcesso =
    (perfil.cadastro.processo || '').toLowerCase().includes('p2m')
      ? 'text-orange-400'
      : 'text-cyan-400';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-[#FFD700] transition-colors text-sm flex items-center gap-2"
          >
            ← Voltar
          </button>
          <p className="text-xs text-gray-500">
            Gerado em {perfil.geradoEm}
          </p>
        </div>

        {/* TÍTULO */}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-1 flex items-center gap-3 justify-center sm:justify-start">
            <span>🧠</span>
            <span>
              Perfil <span className="text-[#FFD700]">Comportamental</span>
            </span>
          </h1>
          <p className="text-gray-400 text-sm">
            Análise heurística baseada em dados reais
          </p>
        </div>

        {/* CARD COLABORADOR */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black text-white truncate">
                {perfil.cadastro.nome}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                <span className="text-gray-400">
                  ID Groot:{' '}
                  <span className="font-mono text-white">
                    {perfil.cadastro.idGroot}
                  </span>
                </span>
                <span className={`font-bold ${corProcesso}`}>
                  {perfil.cadastro.processo}
                </span>
                <span className="text-gray-500">
                  Status: {perfil.cadastro.status}
                </span>
              </div>
            </div>

            {/* PADRÃO DOMINANTE BADGE */}
            <div className="bg-gradient-to-br from-[#FFD700]/15 to-[#FFD700]/5 border border-[#FFD700]/30 rounded-xl px-4 py-3 text-center">
              <div className="text-2xl mb-0.5">
                {ICONES_PADRAO[perfil.padraoDominante] || '🎯'}
              </div>
              <p className="text-[#FFD700] font-bold text-xs uppercase tracking-wider">
                {LABEL_PADRAO[perfil.padraoDominante] || perfil.padraoDominante}
              </p>
            </div>
          </div>

          {/* TAGS */}
          {perfil.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {perfil.tags.map((tag, i) => (
                <span
                  key={i}
                  className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                    CORES_TAG[tag.cor] || CORES_TAG.cinza
                  }`}
                >
                  {tag.texto}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* RESUMO EXECUTIVO */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-l-4 border-[#FFD700] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">💬</span>
            <h3 className="text-[#FFD700] font-bold text-sm uppercase tracking-wider">
              Resumo Executivo
            </h3>
          </div>
          <p className="text-white text-base leading-relaxed">
            {perfil.resumo}
          </p>
        </div>

        {/* PERFORMANCE - GRID DE STATS */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📊</span>
            <h3 className="text-white font-bold text-lg">
              Performance{' '}
              <span className="text-gray-500 text-sm font-normal">
                (últimos 30 dias)
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* TAXA BATIDA */}
            <Stat
              valor={`${perfil.performance.taxaBatida}%`}
              label="Taxa batida"
              sub={`${perfil.performance.diasBateram}/${perfil.performance.totalDias} dias`}
              cor={
                perfil.performance.taxaBatida >= 80
                  ? 'text-emerald-400'
                  : perfil.performance.taxaBatida >= 50
                  ? 'text-yellow-400'
                  : 'text-red-400'
              }
            />
            {/* DIAS SUPERA */}
            <Stat
              valor={perfil.performance.diasSupera}
              label="Dias Supera"
              sub={`meta ${perfil.performance.metaSupera}`}
              cor={
                perfil.performance.diasSupera >= 5
                  ? 'text-emerald-400'
                  : 'text-gray-300'
              }
            />
            {/* MÉDIA */}
            <Stat
              valor={perfil.performance.mediaLiquida}
              label="Média líquida"
              sub={`meta base ${perfil.performance.metaBase}`}
              cor={
                perfil.performance.mediaLiquida >= perfil.performance.metaBase
                  ? 'text-emerald-400'
                  : 'text-orange-400'
              }
            />
            {/* DPMO */}
            <Stat
              valor={perfil.dpmo.atual || '—'}
              label="DPMO atual"
              sub={
                perfil.dpmo.nivel === 'bom'
                  ? 'Excelente'
                  : perfil.dpmo.nivel === 'medio'
                  ? 'Médio'
                  : perfil.dpmo.nivel === 'ruim'
                  ? 'Ruim'
                  : ''
              }
              cor={
                perfil.dpmo.nivel === 'bom'
                  ? 'text-emerald-400'
                  : perfil.dpmo.nivel === 'medio'
                  ? 'text-yellow-400'
                  : 'text-red-400'
              }
            />
          </div>

          {/* DETALHES EXTRAS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#2a2a2a]">
            <Detail label="Pico máximo" valor={`${perfil.performance.liquidaMax} und/h`} />
            <Detail label="Variação" valor={`${perfil.performance.variacao}%`} />
            <Detail
              label="Consistência"
              valor={
                perfil.performance.consistencia === 'consistente'
                  ? 'Consistente'
                  : perfil.performance.consistencia === 'inconsistente'
                  ? 'Inconsistente'
                  : 'Muito oscilante'
              }
            />
            <Detail
              label="Tendência"
              valor={
                perfil.performance.tendencia === 'crescente'
                  ? '📈 Crescente'
                  : perfil.performance.tendencia === 'decrescente'
                  ? '📉 Decrescente'
                  : '➡️ Estável'
              }
            />
            {perfil.performance.dataMaiorPico && (
              <Detail
                label="Maior pico em"
                valor={perfil.performance.dataMaiorPico}
              />
            )}
            <Detail
              label="DPMO tendência"
              valor={
                perfil.dpmo.tendencia === 'melhorando'
                  ? '📉 Melhorando'
                  : perfil.dpmo.tendencia === 'piorando'
                  ? '📈 Piorando'
                  : '➡️ Estável'
              }
            />
          </div>
        </div>

        {/* SINAIS DE ATENÇÃO */}
        {perfil.sinaisAtencao.length > 0 && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🚨</span>
              <h3 className="text-white font-bold text-lg">
                Sinais de Atenção
              </h3>
              <span className="text-xs text-gray-500">
                ({perfil.sinaisAtencao.length})
              </span>
            </div>
            <div className="space-y-2">
              {perfil.sinaisAtencao.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    CORES_SINAL[s.nivel] || CORES_SINAL.baixo
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{s.icone}</span>
                  <div className="flex-1">
                    <p className="text-sm">{s.texto}</p>
                    <p className="text-[10px] uppercase tracking-wider opacity-60 mt-0.5">
                      {s.nivel === 'alto'
                        ? '🔴 Urgente'
                        : s.nivel === 'medio'
                        ? '🟠 Médio'
                        : '🟡 Baixo'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PONTOS FORTES */}
        {perfil.pontosFortes.length > 0 && (
          <div className="bg-gradient-to-br from-emerald-950/30 to-[#141414] border border-emerald-500/30 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">✨</span>
              <h3 className="text-emerald-300 font-bold text-lg">
                Pontos Fortes
              </h3>
              <span className="text-xs text-emerald-500/60">
                ({perfil.pontosFortes.length})
              </span>
            </div>
            <div className="space-y-2">
              {perfil.pontosFortes.map((p, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl"
                >
                  <span className="text-xl flex-shrink-0">{p.icone}</span>
                  <p className="text-sm text-emerald-100">{p.texto}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUGESTÕES */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#FFD700]/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💡</span>
            <h3 className="text-[#FFD700] font-bold text-lg">
              Sugestões de Ação
            </h3>
          </div>
          <div className="space-y-2">
            {perfil.sugestoes.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-[#FFD700]/5 border border-[#FFD700]/15 rounded-xl"
              >
                <span className="text-[#FFD700] font-bold flex-shrink-0">
                  {i + 1}.
                </span>
                <p className="text-sm text-white">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FEEDBACKS */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💬</span>
            <h3 className="text-white font-bold text-lg">
              Feedbacks{' '}
              <span className="text-gray-500 text-sm font-normal">
                (histórico completo)
              </span>
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat valor={perfil.feedbacks.total} label="Total" cor="text-white" />
            <Stat
              valor={perfil.feedbacks.supera}
              label="Supera"
              cor="text-emerald-400"
            />
            <Stat
              valor={perfil.feedbacks.alinhado}
              label="Alinhado"
              cor="text-blue-400"
            />
            <Stat
              valor={perfil.feedbacks.abaixo}
              label="Ofensor"
              cor="text-red-400"
            />
            <Stat
              valor={perfil.feedbacks.livre}
              label="Livre"
              cor="text-gray-400"
            />
          </div>
          {perfil.feedbacks.consecutivosOfensor > 0 && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
              ⚠️ {perfil.feedbacks.consecutivosOfensor} feedback(s) de Ofensor
              consecutivos do mais recente
            </div>
          )}
        </div>

        {/* HISTÓRICO DPMO */}
        {perfil.dpmo.historicoCompleto.length > 0 && (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📈</span>
              <h3 className="text-white font-bold text-lg">
                Histórico DPMO{' '}
                <span className="text-gray-500 text-sm font-normal">
                  (últimas semanas)
                </span>
              </h3>
            </div>
            <div className="space-y-1.5">
              {perfil.dpmo.historicoCompleto.map((d, i) => {
                const cor =
                  d.dpmo < 2000
                    ? 'bg-emerald-500'
                    : d.dpmo < 5000
                    ? 'bg-yellow-500'
                    : 'bg-red-500';
                const maxDpmo = Math.max(
                  ...perfil.dpmo.historicoCompleto.map((x) => x.dpmo),
                  5000
                );
                const widthPct = Math.min((d.dpmo / maxDpmo) * 100, 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 flex-shrink-0">
                      S{d.semana}/{d.ano}
                    </span>
                    <div className="flex-1 h-6 bg-[#0a0a0a] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cor} rounded-full transition-all`}
                        style={{ width: `${widthPct}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-mono text-white w-16 text-right">
                      {d.dpmo.toLocaleString('pt-BR')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="text-center text-gray-600 text-xs py-4">
          🧠 Análise gerada automaticamente • LIDER 360
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

function Stat({
  valor,
  label,
  sub,
  cor = 'text-white',
}: {
  valor: string | number;
  label: string;
  sub?: string;
  cor?: string;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3 text-center">
      <p className={`text-2xl sm:text-3xl font-black ${cor}`}>{valor}</p>
      <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mt-1">
        {label}
      </p>
      {sub && <p className="text-gray-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function Detail({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm text-white font-bold">{valor}</p>
    </div>
  );
}

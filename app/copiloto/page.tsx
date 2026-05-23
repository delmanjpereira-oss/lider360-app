'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// TIPOS
// ============================================

type TarefaCopiloto = {
  id: number;
  id_tarefa: string;
  id_groot: string;
  nome: string;
  processo: string | null;
  tipo: string;
  motivo: string | null;
  status: string;
  prioridade: string;
  diagnostico: string | null;
  analise_ia: string | null;
  hipotese: string | null;
  gatilho_origem: string;
  feedback_obrigatorio: boolean;
  feedback_texto: string | null;
  contexto_dados: any;
  gerado_por_ia: boolean;
  criado_em: string;
};

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

type HistoricoSimples = {
  id_groot: string;
  data_referencia: string;
  prod_liquida: number;
  status_meta: string;
  impacto_net: number;
};

type MonitorItem = {
  idGroot: string;
  id: number;
  nome: string;
  processo: string;
  ultimoStatus: string;
  ultimaLiquida: number;
  ultimoImpacto: number;
  diasAbaixo: number;
};

// ============================================
// HELPERS
// ============================================

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

const CORES_PRIORIDADE: Record<string, { bg: string; border: string; text: string; bgIntenso: string }> = {
  critica: { bg: 'from-red-500/10 to-rose-500/5', border: 'border-red-500/40', text: 'text-red-300', bgIntenso: 'bg-red-500/20' },
  alta: { bg: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/40', text: 'text-orange-300', bgIntenso: 'bg-orange-500/20' },
  media: { bg: 'from-yellow-500/10 to-amber-500/5', border: 'border-yellow-500/40', text: 'text-yellow-300', bgIntenso: 'bg-yellow-500/20' },
  baixa: { bg: 'from-blue-500/10 to-cyan-500/5', border: 'border-blue-500/40', text: 'text-blue-300', bgIntenso: 'bg-blue-500/20' },
  normal: { bg: 'from-gray-500/10 to-slate-500/5', border: 'border-gray-500/40', text: 'text-gray-300', bgIntenso: 'bg-gray-500/20' },
};

const EMOJI_TIPO: Record<string, string> = {
  'Janela Promocional': '🔥',
  'Janela Prejudicada': '🔴',
  'Apto Perpétuo': '⭐',
  'Feedback Ofensor': '🚨',
  'Reconhecimento Supera': '🌟',
  'Aniversário': '🎂',
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function CopilotoPage() {
  const [tarefas, setTarefas] = useState<TarefaCopiloto[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoSimples[]>([]);
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [ultimaAnalise, setUltimaAnalise] = useState<Date | null>(null);
  const [resumoAnalise, setResumoAnalise] = useState<any>(null);
  const [filtroPrioridade, setFiltroPrioridade] = useState<'todas' | 'critica' | 'alta'>('todas');
  
  // Modal
  const [tarefaAberta, setTarefaAberta] = useState<TarefaCopiloto | null>(null);
  const [textoFeedback, setTextoFeedback] = useState('');
  const [salvandoFeedback, setSalvandoFeedback] = useState(false);
  
  // 🎯 Ref pra controlar análise (evita rodar 2x)
  const jaRodouRef = useRef(false);
  const [, forceUpdate] = useState({});

  // ============================================
  // CARREGAR DADOS (sem chamar IA)
  // ============================================
  
  const carregarDados = useCallback(async () => {
    try {
      const [tarsResp, colabsResp, histResp] = await Promise.all([
        supabase.from('tarefas').select('*').eq('status', 'Pendente').order('criado_em', { ascending: false }),
        supabase.from('colaboradores').select('id, id_groot, nome, processo, status').eq('status', 'Ativo'),
        supabase.from('historico').select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net').order('data_referencia', { ascending: false }),
      ]);
      
      if (tarsResp.data) setTarefas(tarsResp.data as any);
      if (colabsResp.data) setColaboradores(colabsResp.data as any);
      if (histResp.data) setHistorico(histResp.data as any);
    } catch (e) {
      console.error('Erro carregando:', e);
    }
  }, []);

  // ============================================
  // RODAR ANÁLISE IA (automático)
  // ============================================
  
  const rodarAnalise = useCallback(async () => {
    if (analisando) return;
    setAnalisando(true);
    try {
      const resp = await fetch('/api/ia/copiloto', { method: 'POST' });
      const data = await resp.json();
      if (data.ok) {
        setResumoAnalise(data.contexto);
        setUltimaAnalise(new Date());
        await carregarDados();
      }
    } catch (e) {
      console.error('Erro IA:', e);
    } finally {
      setAnalisando(false);
    }
  }, [analisando, carregarDados]);

  // ============================================
  // 🎯 AUTOMAÇÃO 100% — sem botão
  // ============================================
  
  // 1. Roda ao montar
  useEffect(() => {
    (async () => {
      setLoading(true);
      await carregarDados();
      setLoading(false);
      
      if (!jaRodouRef.current) {
        jaRodouRef.current = true;
        await rodarAnalise();
      }
    })();
  }, [carregarDados, rodarAnalise]);

  // 2. Recarrega dados a cada 30s (sem chamar IA)
  useEffect(() => {
    const interval = setInterval(() => {
      carregarDados();
      forceUpdate({}); // pra atualizar o "há X segundos"
    }, 30000);
    return () => clearInterval(interval);
  }, [carregarDados]);

  // 3. Detecta volta de aba ausente (>10min) → re-roda IA
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && ultimaAnalise) {
        const minutos = (Date.now() - ultimaAnalise.getTime()) / 60000;
        if (minutos > 10) {
          console.log('🔄 Aba retornou após 10min, reanalisando...');
          rodarAnalise();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [ultimaAnalise, rodarAnalise]);

  // 4. Atualiza "há X segundos" a cada 10s
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 10000);
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // CÁLCULO DAS 3 COLUNAS (OFENSORES / ALINHADOS / SUPERAS)
  // ============================================
  
  function calcularStreak(idGroot: string): number {
    const dias = historico
      .filter((h) => h.id_groot === idGroot)
      .sort((a, b) => new Date(b.data_referencia).getTime() - new Date(a.data_referencia).getTime());
    let streak = 0;
    for (const dia of dias) {
      if (dia.status_meta === 'Abaixo') streak++;
      else break;
    }
    return streak;
  }

  // Último status de cada colab
  const ultimoStatusPorId: Record<string, HistoricoSimples> = {};
  historico.forEach((h) => {
    if (!ultimoStatusPorId[h.id_groot]) ultimoStatusPorId[h.id_groot] = h;
  });

  const monitor = { ofensores: [] as MonitorItem[], alinhados: [] as MonitorItem[], superas: [] as MonitorItem[] };

  colaboradores.forEach((c) => {
    const ultimo = ultimoStatusPorId[c.id_groot];
    if (!ultimo) return;
    
    const item: MonitorItem = {
      idGroot: c.id_groot,
      id: c.id,
      nome: c.nome,
      processo: c.processo || '-',
      ultimoStatus: ultimo.status_meta,
      ultimaLiquida: ultimo.prod_liquida,
      ultimoImpacto: ultimo.impacto_net,
      diasAbaixo: calcularStreak(c.id_groot),
    };
    
    if (ultimo.status_meta === 'Abaixo') monitor.ofensores.push(item);
    else if (ultimo.status_meta === 'Alinhado') monitor.alinhados.push(item);
    else if (ultimo.status_meta === 'Supera') monitor.superas.push(item);
  });

  monitor.ofensores.sort((a, b) => b.diasAbaixo - a.diasAbaixo);
  monitor.alinhados.sort((a, b) => b.ultimoImpacto - a.ultimoImpacto);
  monitor.superas.sort((a, b) => b.ultimoImpacto - a.ultimoImpacto);

  // Filtragem de tarefas por prioridade
  const ordemPrio: Record<string, number> = { critica: 1, alta: 2, media: 3, baixa: 4, normal: 5 };
  const tarefasOrdenadas = [...tarefas].sort((a, b) => {
    const ap = ordemPrio[a.prioridade] || 9;
    const bp = ordemPrio[b.prioridade] || 9;
    if (ap !== bp) return ap - bp;
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });

  const tarefasFiltradas = filtroPrioridade === 'todas'
    ? tarefasOrdenadas
    : tarefasOrdenadas.filter(t => t.prioridade === filtroPrioridade);

  const statsPrio = {
    critica: tarefas.filter(t => t.prioridade === 'critica').length,
    alta: tarefas.filter(t => t.prioridade === 'alta').length,
  };

  // ============================================
  // FEEDBACK
  // ============================================
  
  function abrirTarefa(t: TarefaCopiloto) {
    setTarefaAberta(t);
    setTextoFeedback(t.feedback_texto || '');
  }
  
  function fecharTarefa() {
    setTarefaAberta(null);
    setTextoFeedback('');
  }
  
  async function concluirTarefa() {
    if (!tarefaAberta) return;
    if (tarefaAberta.feedback_obrigatorio && textoFeedback.trim().length < 10) {
      alert('⚠️ Feedback obrigatório com mín. 10 caracteres');
      return;
    }
    setSalvandoFeedback(true);
    try {
      await supabase.from('tarefas').update({
        status: 'Concluída',
        concluido_em: new Date().toISOString(),
        feedback_texto: textoFeedback.trim(),
        feedback_em: new Date().toISOString(),
      }).eq('id', tarefaAberta.id);
      
      if (textoFeedback.trim()) {
        const feedbackId = 'FB-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        await supabase.from('feedbacks').insert({
          feedback_id: feedbackId,
          id_tarefa: tarefaAberta.id_tarefa,
          id_groot: tarefaAberta.id_groot,
          nome: tarefaAberta.nome,
          processo: tarefaAberta.processo,
          tipo: tarefaAberta.tipo,
          observacao: textoFeedback.trim(),
          responsavel: 'delman.jpereira@mercadolivre.com',
          classificacao: tarefaAberta.prioridade === 'critica' ? 'Abaixo' : 'Alinhado',
        });
      }
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', '✅ Tarefa concluída!');
      }
      fecharTarefa();
      await carregarDados();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvandoFeedback(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER COM INDICADOR DE IA VIVA */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            🤖 Copiloto <span className="text-[#FFD700]">Vivo</span>
          </h1>
          <div className="flex items-center gap-2 text-sm">
            {analisando ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="text-yellow-400">🧠 IA analisando seu time...</span>
              </>
            ) : ultimaAnalise ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-green-400">Análise viva</span>
                <span className="text-gray-500">· sincronizado {tempoRelativo(ultimaAnalise.toISOString())}</span>
              </>
            ) : loading ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400 animate-pulse"></span>
                <span className="text-gray-400">Conectando...</span>
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="text-blue-400">Pronto</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* RESUMO DA ANÁLISE */}
      {resumoAnalise && !loading && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            📊 Resumo da Análise · {resumoAnalise.quarter}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a]">
              <p className="text-2xl font-black text-white">{resumoAnalise.totalAtivos}</p>
              <p className="text-[10px] text-gray-500 uppercase">Ativos</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
              <p className="text-2xl font-black text-red-300">{resumoAnalise.ofensoresCriticos || 0}</p>
              <p className="text-[10px] text-red-400 uppercase">Ofensores Críticos</p>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
              <p className="text-2xl font-black text-orange-300">{resumoAnalise.janelasIminentes || 0}</p>
              <p className="text-[10px] text-orange-400 uppercase">Promoções Iminentes</p>
            </div>
            <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/30">
              <p className="text-2xl font-black text-rose-300">{resumoAnalise.janelasPrejudicadas || 0}</p>
              <p className="text-[10px] text-rose-400 uppercase">Janelas Quebradas</p>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30">
              <p className="text-2xl font-black text-yellow-300">{resumoAnalise.aptosPerpetuos || 0}</p>
              <p className="text-[10px] text-yellow-400 uppercase">Aptos Aguardando</p>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 3 COLUNAS — MONITORAMENTO OPERACIONAL */}
      {!loading && colaboradores.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            📊 Monitoramento Operacional
            <span className="text-xs text-gray-500 font-normal">(último status)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* OFENSORES */}
            <div className="bg-red-500/5 border border-red-500/30 rounded-2xl overflow-hidden">
              <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30 flex items-center justify-between">
                <h3 className="font-black text-red-300">🚨 Ofensores</h3>
                <span className="text-2xl font-black text-red-300">{monitor.ofensores.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {monitor.ofensores.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-6">Nenhum ofensor 🎉</p>
                ) : (
                  monitor.ofensores.map((o) => (
                    <Link
                      key={o.idGroot}
                      href={`/meu-time/${o.id}`}
                      className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg p-3 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-red-300 font-bold text-xs">
                          {iniciais(o.nome)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                          <p className="text-xs text-gray-500">{o.processo} • {o.ultimaLiquida} pç/h</p>
                        </div>
                        {o.diasAbaixo >= 3 && (
                          <span className="text-xs px-2 py-0.5 bg-red-500/30 text-red-300 rounded-full font-bold">
                            {o.diasAbaixo}d
                          </span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* ALINHADOS */}
            <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl overflow-hidden">
              <div className="bg-blue-500/20 px-4 py-3 border-b border-blue-500/30 flex items-center justify-between">
                <h3 className="font-black text-blue-300">✓ Alinhados</h3>
                <span className="text-2xl font-black text-blue-300">{monitor.alinhados.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {monitor.alinhados.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-6">Sem dados ainda</p>
                ) : (
                  monitor.alinhados.map((a) => (
                    <Link
                      key={a.idGroot}
                      href={`/meu-time/${a.id}`}
                      className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-blue-500/30 rounded-lg p-3 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">
                          {iniciais(a.nome)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{a.nome}</p>
                          <p className="text-xs text-gray-500">{a.processo} • {a.ultimaLiquida} pç/h</p>
                        </div>
                        <span className={`text-xs font-mono font-bold ${
                          a.ultimoImpacto > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {a.ultimoImpacto > 0 ? '+' : ''}{a.ultimoImpacto.toFixed(1)}%
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* SUPERAS */}
            <div className="bg-green-500/5 border border-green-500/30 rounded-2xl overflow-hidden">
              <div className="bg-green-500/20 px-4 py-3 border-b border-green-500/30 flex items-center justify-between">
                <h3 className="font-black text-green-300">🌟 Superas</h3>
                <span className="text-2xl font-black text-green-300">{monitor.superas.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                {monitor.superas.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-6">Nenhum supera ainda</p>
                ) : (
                  monitor.superas.map((s) => (
                    <Link
                      key={s.idGroot}
                      href={`/meu-time/${s.id}`}
                      className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-lg p-3 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center text-green-300 font-bold text-xs">
                          {iniciais(s.nome)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{s.nome}</p>
                          <p className="text-xs text-gray-500">{s.processo} • {s.ultimaLiquida} pç/h</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-green-400">
                          +{s.ultimoImpacto.toFixed(1)}%
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAREFAS DA IA */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🧠 Tarefas Inteligentes
            <span className="text-xs text-gray-500 font-normal">(geradas pela IA)</span>
          </h2>
          
          {/* Filtros */}
          {tarefas.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFiltroPrioridade('todas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroPrioridade === 'todas' ? 'bg-[#FFD700] text-black' : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'
                }`}
              >
                Todas ({tarefas.length})
              </button>
              {statsPrio.critica > 0 && (
                <button
                  onClick={() => setFiltroPrioridade('critica')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filtroPrioridade === 'critica' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-300 border border-red-500/30'
                  }`}
                >
                  🚨 Críticas ({statsPrio.critica})
                </button>
              )}
              {statsPrio.alta > 0 && (
                <button
                  onClick={() => setFiltroPrioridade('alta')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filtroPrioridade === 'alta' ? 'bg-orange-500 text-white' : 'bg-orange-500/10 text-orange-300 border border-orange-500/30'
                  }`}
                >
                  🔥 Altas ({statsPrio.alta})
                </button>
              )}
            </div>
          )}
        </div>

        {loading || analisando ? (
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-12 text-center">
            <span className="text-5xl block mb-3 animate-pulse">🧠</span>
            <p className="text-white font-bold">
              {analisando ? 'IA analisando colabs críticos...' : 'Carregando...'}
            </p>
          </div>
        ) : tarefasFiltradas.length === 0 ? (
          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-2 border-dashed border-green-500/30 rounded-2xl p-8 text-center">
            <span className="text-5xl block mb-3">🎉</span>
            <p className="text-white font-bold mb-1">Tudo em ordem!</p>
            <p className="text-xs text-gray-400">A IA não detectou nada crítico no momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tarefasFiltradas.map((t) => {
              const cor = CORES_PRIORIDADE[t.prioridade] || CORES_PRIORIDADE.normal;
              const emoji = EMOJI_TIPO[t.tipo] || '📋';
              return (
                <button
                  key={t.id_tarefa}
                  onClick={() => abrirTarefa(t)}
                  className={`w-full bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl text-left`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${cor.bgIntenso} flex items-center justify-center ${cor.text} font-black text-sm flex-shrink-0`}>
                      {iniciais(t.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cor.bgIntenso} ${cor.text}`}>
                          {emoji} {t.tipo}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${cor.bgIntenso} ${cor.text}`}>
                          {t.prioridade}
                        </span>
                        {t.gerado_por_ia && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300">
                            🤖 IA
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-black text-lg mb-1">{t.nome}</h3>
                      {t.processo && <p className="text-xs text-gray-400 mb-3">{t.processo}</p>}
                      
                      {t.diagnostico && (
                        <div className="bg-[#0a0a0a]/60 rounded-lg p-3 mb-2 border border-[#2a2a2a]">
                          <p className="text-xs text-gray-400 uppercase font-bold mb-1">📊 Diagnóstico</p>
                          <p className="text-sm text-gray-200 leading-relaxed">{t.diagnostico}</p>
                        </div>
                      )}
                      
                      {t.motivo && (
                        <div className="flex items-start gap-2 mt-2">
                          <span className="text-[#FFD700] text-base">→</span>
                          <p className="text-sm text-[#FFD700] font-bold">{t.motivo}</p>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2a2a]">
                        <span className="text-xs text-gray-500">{tempoRelativo(t.criado_em)}</span>
                        <span className="text-xs text-[#FFD700] font-bold">
                          {t.feedback_obrigatorio ? '🔒 Feedback obrigatório →' : 'Ver detalhes →'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE FEEDBACK */}
      {tarefaAberta && (
        <div className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm" onClick={fecharTarefa}>
          <div onClick={(e) => e.stopPropagation()} className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-[#FFD700]/30 rounded-t-3xl md:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-b border-[#2a2a2a] p-5 flex items-start justify-between gap-3 z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso} ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>
                    {tarefaAberta.prioridade}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso} ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>
                    {EMOJI_TIPO[tarefaAberta.tipo] || '📋'} {tarefaAberta.tipo}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white">{tarefaAberta.nome}</h2>
                <p className="text-xs text-gray-500 mt-1">{tarefaAberta.processo} · ID {tarefaAberta.id_groot}</p>
              </div>
              <button onClick={fecharTarefa} className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center">×</button>
            </div>
            
            <div className="p-5 space-y-4">
              {tarefaAberta.diagnostico && (
                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-2">📊 Diagnóstico</p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.diagnostico}</p>
                </div>
              )}
              {tarefaAberta.analise_ia && (
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4">
                  <p className="text-xs text-purple-300 uppercase font-bold mb-2">🧠 Análise Inovadora da IA</p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.analise_ia}</p>
                </div>
              )}
              {tarefaAberta.hipotese && (
                <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-2xl p-4">
                  <p className="text-xs text-yellow-300 uppercase font-bold mb-2">💡 Hipótese</p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.hipotese}</p>
                </div>
              )}
              {tarefaAberta.motivo && (
                <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-2xl p-4">
                  <p className="text-xs text-[#FFD700] uppercase font-bold mb-2">🎯 Ação Sugerida</p>
                  <p className="text-sm text-white font-bold leading-relaxed">{tarefaAberta.motivo}</p>
                </div>
              )}
              
              {(() => {
                const colab = colaboradores.find(c => c.id_groot === tarefaAberta.id_groot);
                if (!colab) return null;
                return (
                  <Link href={`/meu-time/${colab.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-center text-sm text-blue-300 font-bold transition-all">
                    👤 Ver perfil completo de {tarefaAberta.nome} →
                  </Link>
                );
              })()}
              
              <div className="bg-[#0a0a0a] border-2 border-[#FFD700]/40 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[#FFD700] uppercase font-bold flex items-center gap-2">
                    ✍️ Feedback do Líder
                    {tarefaAberta.feedback_obrigatorio && (
                      <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full text-[10px]">OBRIGATÓRIO</span>
                    )}
                  </p>
                  <span className="text-xs text-gray-500">{textoFeedback.length} chars</span>
                </div>
                <textarea
                  value={textoFeedback}
                  onChange={(e) => setTextoFeedback(e.target.value)}
                  placeholder={tarefaAberta.feedback_obrigatorio ? 'Escreva o feedback... (mín. 10 chars)' : 'Anotações (opcional)...'}
                  rows={5}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors resize-none"
                />
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-t border-[#2a2a2a] p-5 flex gap-3">
              <button onClick={fecharTarefa} disabled={salvandoFeedback} className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50">
                Fechar
              </button>
              <button
                onClick={concluirTarefa}
                disabled={salvandoFeedback || (tarefaAberta.feedback_obrigatorio && textoFeedback.trim().length < 10)}
                className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 text-white font-black py-3 rounded-xl shadow-lg shadow-green-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {salvandoFeedback ? '⏳' : '✅ Concluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

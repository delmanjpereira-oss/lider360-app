'use client';

import { useEffect, useState, useCallback } from 'react';
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
  arquivos_vinculados: any[];
  gatilho_origem: string;
  feedback_obrigatorio: boolean;
  feedback_texto: string | null;
  feedback_em: string | null;
  contexto_dados: any;
  gerado_por_ia: boolean;
  criado_em: string;
};

type ColabRef = {
  id: number;
  id_groot: string;
  nome: string;
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
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

const CORES_PRIORIDADE: Record<string, { bg: string; border: string; text: string; bgIntenso: string }> = {
  critica: { 
    bg: 'from-red-500/10 to-rose-500/5', 
    border: 'border-red-500/40', 
    text: 'text-red-300',
    bgIntenso: 'bg-red-500/20',
  },
  alta: { 
    bg: 'from-orange-500/10 to-amber-500/5', 
    border: 'border-orange-500/40', 
    text: 'text-orange-300',
    bgIntenso: 'bg-orange-500/20',
  },
  media: { 
    bg: 'from-yellow-500/10 to-amber-500/5', 
    border: 'border-yellow-500/40', 
    text: 'text-yellow-300',
    bgIntenso: 'bg-yellow-500/20',
  },
  baixa: { 
    bg: 'from-blue-500/10 to-cyan-500/5', 
    border: 'border-blue-500/40', 
    text: 'text-blue-300',
    bgIntenso: 'bg-blue-500/20',
  },
  normal: { 
    bg: 'from-gray-500/10 to-slate-500/5', 
    border: 'border-gray-500/40', 
    text: 'text-gray-300',
    bgIntenso: 'bg-gray-500/20',
  },
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
  const [colabs, setColabs] = useState<ColabRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [rodandoAnalise, setRodandoAnalise] = useState(false);
  const [resumoAnalise, setResumoAnalise] = useState<any>(null);
  const [filtroPrioridade, setFiltroPrioridade] = useState<'todas' | 'critica' | 'alta'>('todas');
  
  // Modal de feedback
  const [tarefaAberta, setTarefaAberta] = useState<TarefaCopiloto | null>(null);
  const [textoFeedback, setTextoFeedback] = useState('');
  const [salvandoFeedback, setSalvandoFeedback] = useState(false);

  // ============================================
  // CARREGAR + RODAR ANÁLISE AUTOMÁTICA
  // ============================================
  
  const carregar = useCallback(async () => {
    try {
      const [{ data: tarsData }, { data: colabsData }] = await Promise.all([
        supabase
          .from('tarefas')
          .select('*')
          .eq('status', 'Pendente')
          .order('prioridade', { ascending: true })
          .order('criado_em', { ascending: false }),
        supabase
          .from('colaboradores')
          .select('id, id_groot, nome'),
      ]);
      
      if (tarsData) setTarefas(tarsData as any);
      if (colabsData) setColabs(colabsData as any);
    } catch (e) {
      console.error('Erro carregando:', e);
    }
  }, []);

  // Roda a análise automática ao abrir a página
  const rodarAnalise = useCallback(async () => {
    setRodandoAnalise(true);
    try {
      const resp = await fetch('/api/ia/copiloto', { method: 'POST' });
      const data = await resp.json();
      
      if (data.ok) {
        setResumoAnalise(data.contexto);
        await carregar();
      } else {
        console.error('Erro IA:', data.error);
      }
    } catch (e) {
      console.error('Erro chamando IA:', e);
    } finally {
      setRodandoAnalise(false);
      setLoading(false);
    }
  }, [carregar]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await carregar();
      // Roda análise automaticamente ao entrar
      await rodarAnalise();
    })();
  }, [carregar, rodarAnalise]);

  // Ordenação por prioridade
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

  // Stats por prioridade
  const statsPrio = {
    critica: tarefas.filter(t => t.prioridade === 'critica').length,
    alta: tarefas.filter(t => t.prioridade === 'alta').length,
    media: tarefas.filter(t => t.prioridade === 'media').length,
    baixa: tarefas.filter(t => t.prioridade === 'baixa').length,
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
  
  async function salvarFeedback() {
    if (!tarefaAberta) return;
    
    if (tarefaAberta.feedback_obrigatorio && textoFeedback.trim().length < 10) {
      alert('Feedback obrigatório com no mínimo 10 caracteres');
      return;
    }
    
    setSalvandoFeedback(true);
    
    try {
      // Salva feedback
      await supabase
        .from('tarefas')
        .update({
          feedback_texto: textoFeedback.trim(),
          feedback_em: new Date().toISOString(),
        })
        .eq('id', tarefaAberta.id);
      
      // Cria feedback no histórico
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
        registrado_em: new Date().toISOString(),
      });
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', '✅ Feedback registrado!');
      }
      
      fecharTarefa();
      await carregar();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvandoFeedback(false);
    }
  }
  
  async function concluirTarefa() {
    if (!tarefaAberta) return;
    
    // Bloqueia se feedback obrigatório não foi preenchido
    if (tarefaAberta.feedback_obrigatorio && (!textoFeedback || textoFeedback.trim().length < 10)) {
      alert('⚠️ Essa tarefa exige feedback obrigatório (mín. 10 caracteres)');
      return;
    }
    
    setSalvandoFeedback(true);
    
    try {
      // Salva feedback se ainda não salvou
      if (textoFeedback.trim() && textoFeedback !== tarefaAberta.feedback_texto) {
        await supabase
          .from('tarefas')
          .update({
            feedback_texto: textoFeedback.trim(),
            feedback_em: new Date().toISOString(),
          })
          .eq('id', tarefaAberta.id);
      }
      
      // Marca como concluída
      await supabase
        .from('tarefas')
        .update({
          status: 'Concluída',
          concluido_em: new Date().toISOString(),
        })
        .eq('id', tarefaAberta.id);
      
      // Cria feedback registrado
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
          registrado_em: new Date().toISOString(),
        });
      }
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', '✅ Tarefa concluída!');
      }
      
      fecharTarefa();
      await carregar();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvandoFeedback(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            🤖 Copiloto <span className="text-[#FFD700]">Vivo</span>
          </h1>
          <p className="text-gray-400 flex items-center gap-2">
            {rodandoAnalise ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                Analisando seu time com IA...
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                Análise em tempo real · {tarefas.length} tarefa(s) ativa(s)
              </>
            )}
          </p>
        </div>

        <button
          onClick={rodarAnalise}
          disabled={rodandoAnalise}
          className="bg-gradient-to-br from-purple-500/20 to-pink-500/10 hover:from-purple-500/40 border border-purple-500/30 text-purple-300 font-bold px-5 py-3 rounded-xl transition-all flex items-center gap-2 hover:-translate-y-0.5 disabled:opacity-50"
        >
          {rodandoAnalise ? (
            <><span className="animate-spin">🧠</span> Analisando...</>
          ) : (
            <>🔄 Reanalisar</>
          )}
        </button>
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

      {/* FILTROS POR PRIORIDADE */}
      {!loading && tarefas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroPrioridade('todas')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filtroPrioridade === 'todas'
                ? 'bg-[#FFD700] text-black'
                : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222] border border-[#2a2a2a]'
            }`}
          >
            Todas ({tarefas.length})
          </button>
          <button
            onClick={() => setFiltroPrioridade('critica')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filtroPrioridade === 'critica'
                ? 'bg-red-500 text-white'
                : 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30'
            }`}
          >
            🚨 Críticas ({statsPrio.critica})
          </button>
          <button
            onClick={() => setFiltroPrioridade('alta')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              filtroPrioridade === 'alta'
                ? 'bg-orange-500 text-white'
                : 'bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 border border-orange-500/30'
            }`}
          >
            🔥 Altas ({statsPrio.alta})
          </button>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4 animate-pulse">🧠</span>
          <p className="text-white font-bold mb-1">Analisando seu time...</p>
          <p className="text-gray-500 text-sm">A IA tá cruzando dados de carreira, performance e padrões.</p>
        </div>
      )}

      {/* VAZIO */}
      {!loading && tarefas.length === 0 && (
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-2 border-dashed border-green-500/30 rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-3">🎉</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Tudo em ordem!
          </h3>
          <p className="text-gray-400 text-sm">
            A IA analisou seu time e não encontrou nada crítico no momento.
          </p>
        </div>
      )}

      {/* LISTA DE TAREFAS */}
      {!loading && tarefasFiltradas.length > 0 && (
        <div className="space-y-3">
          {tarefasFiltradas.map((t) => {
            const colab = colabs.find(c => c.id_groot === t.id_groot);
            const cor = CORES_PRIORIDADE[t.prioridade] || CORES_PRIORIDADE.normal;
            const emoji = EMOJI_TIPO[t.tipo] || '📋';
            
            return (
              <button
                key={t.id_tarefa}
                onClick={() => abrirTarefa(t)}
                className={`w-full bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl text-left`}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-xl ${cor.bgIntenso} flex items-center justify-center ${cor.text} font-black text-sm flex-shrink-0`}>
                    {iniciais(t.nome)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Header da tarefa */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cor.bgIntenso} ${cor.text}`}>
                        {emoji} {t.tipo}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                        t.prioridade === 'critica' ? 'bg-red-500/30 text-red-200' :
                        t.prioridade === 'alta' ? 'bg-orange-500/30 text-orange-200' :
                        'bg-yellow-500/20 text-yellow-200'
                      }`}>
                        {t.prioridade}
                      </span>
                      {t.gerado_por_ia && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300">
                          🤖 IA
                        </span>
                      )}
                    </div>
                    
                    {/* Nome */}
                    <h3 className="text-white font-black text-lg mb-1">{t.nome}</h3>
                    {t.processo && (
                      <p className="text-xs text-gray-400 mb-3">{t.processo} · ID {t.id_groot}</p>
                    )}
                    
                    {/* Diagnóstico (preview) */}
                    {t.diagnostico && (
                      <div className="bg-[#0a0a0a]/60 rounded-lg p-3 mb-2 border border-[#2a2a2a]">
                        <p className="text-xs text-gray-400 uppercase font-bold mb-1">📊 Diagnóstico</p>
                        <p className="text-sm text-gray-200 leading-relaxed">{t.diagnostico}</p>
                      </div>
                    )}
                    
                    {/* Ação sugerida */}
                    {t.motivo && (
                      <div className="flex items-start gap-2 mt-2">
                        <span className="text-[#FFD700] text-base">→</span>
                        <p className="text-sm text-[#FFD700] font-bold">{t.motivo}</p>
                      </div>
                    )}
                    
                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2a2a]">
                      <span className="text-xs text-gray-500">
                        {tempoRelativo(t.criado_em)}
                      </span>
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

      {/* MODAL DE FEEDBACK */}
      {tarefaAberta && (
        <div
          className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm"
          onClick={fecharTarefa}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-[#FFD700]/30 rounded-t-3xl md:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-b border-[#2a2a2a] p-5 flex items-start justify-between gap-3 z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                    CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso
                  } ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>
                    {tarefaAberta.prioridade}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso
                  } ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>
                    {EMOJI_TIPO[tarefaAberta.tipo] || '📋'} {tarefaAberta.tipo}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white">{tarefaAberta.nome}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {tarefaAberta.processo} · ID {tarefaAberta.id_groot}
                </p>
              </div>
              <button
                onClick={fecharTarefa}
                className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center"
              >
                ×
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Diagnóstico */}
              {tarefaAberta.diagnostico && (
                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-2 flex items-center gap-2">
                    📊 Diagnóstico
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.diagnostico}</p>
                </div>
              )}
              
              {/* Análise IA */}
              {tarefaAberta.analise_ia && (
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4">
                  <p className="text-xs text-purple-300 uppercase font-bold mb-2 flex items-center gap-2">
                    🧠 Análise Inovadora da IA
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.analise_ia}</p>
                </div>
              )}
              
              {/* Hipótese */}
              {tarefaAberta.hipotese && (
                <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-2xl p-4">
                  <p className="text-xs text-yellow-300 uppercase font-bold mb-2 flex items-center gap-2">
                    💡 Hipótese
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.hipotese}</p>
                </div>
              )}
              
              {/* Ação sugerida */}
              {tarefaAberta.motivo && (
                <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-2xl p-4">
                  <p className="text-xs text-[#FFD700] uppercase font-bold mb-2 flex items-center gap-2">
                    🎯 Ação Sugerida
                  </p>
                  <p className="text-sm text-white font-bold leading-relaxed">{tarefaAberta.motivo}</p>
                </div>
              )}
              
              {/* Link pro detalhe do colab */}
              {(() => {
                const colab = colabs.find(c => c.id_groot === tarefaAberta.id_groot);
                if (!colab) return null;
                return (
                  <Link
                    href={`/meu-time/${colab.id}`}
                    className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-center text-sm text-blue-300 font-bold transition-all"
                  >
                    👤 Ver perfil completo de {tarefaAberta.nome} →
                  </Link>
                );
              })()}
              
              {/* FEEDBACK OBRIGATÓRIO */}
              <div className="bg-[#0a0a0a] border-2 border-[#FFD700]/40 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[#FFD700] uppercase font-bold flex items-center gap-2">
                    ✍️ Feedback do Líder
                    {tarefaAberta.feedback_obrigatorio && (
                      <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full text-[10px]">
                        OBRIGATÓRIO
                      </span>
                    )}
                  </p>
                  <span className="text-xs text-gray-500">
                    {textoFeedback.length} chars
                  </span>
                </div>
                <textarea
                  value={textoFeedback}
                  onChange={(e) => setTextoFeedback(e.target.value)}
                  placeholder={tarefaAberta.feedback_obrigatorio 
                    ? 'Escreva o feedback que você vai dar ao colab... (mín. 10 chars)'
                    : 'Anotações sobre essa tarefa (opcional)...'}
                  rows={5}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors resize-none"
                />
                {tarefaAberta.feedback_obrigatorio && (
                  <p className="text-xs text-gray-500 mt-2">
                    💡 A IA gera o diagnóstico, mas o feedback humano é só seu — escrito do seu jeito.
                  </p>
                )}
              </div>
            </div>
            
            {/* Footer */}
            <div className="sticky bottom-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-t border-[#2a2a2a] p-5 flex gap-3">
              <button
                onClick={fecharTarefa}
                disabled={salvandoFeedback}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                onClick={salvarFeedback}
                disabled={salvandoFeedback || !textoFeedback.trim()}
                className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 font-bold py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                💾 Salvar
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

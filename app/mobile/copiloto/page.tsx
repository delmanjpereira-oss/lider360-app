'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type Tarefa = {
  id: number;
  id_tarefa: string;
  id_groot: string;
  nome: string;
  processo: string | null;
  tipo: string;
  prioridade: string;
  diagnostico: string | null;
  analise_ia: string | null;
  hipotese: string | null;
  motivo: string | null;
  feedback_obrigatorio: boolean;
  feedback_texto: string | null;
  criado_em: string;
};

const CORES_PRIO: Record<string, { bg: string; text: string; emoji: string }> = {
  critica: { bg: 'bg-red-500/10 border-red-500/40', text: 'text-red-300', emoji: '🚨' },
  alta: { bg: 'bg-orange-500/10 border-orange-500/40', text: 'text-orange-300', emoji: '🔥' },
  media: { bg: 'bg-yellow-500/10 border-yellow-500/40', text: 'text-yellow-300', emoji: '🟡' },
  baixa: { bg: 'bg-blue-500/10 border-blue-500/40', text: 'text-blue-300', emoji: '🔵' },
};

export default function CopilotoMobilePage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [tarefaAberta, setTarefaAberta] = useState<Tarefa | null>(null);
  const [feedback, setFeedback] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .eq('status', 'Pendente')
      .order('criado_em', { ascending: false });
    
    // Ordena por prioridade
    const ordem: Record<string, number> = { critica: 1, alta: 2, media: 3, baixa: 4 };
    const sorted = (data || []).sort((a, b) => (ordem[a.prioridade] || 9) - (ordem[b.prioridade] || 9));
    
    setTarefas(sorted as Tarefa[]);
    setLoading(false);
  }

  async function concluir() {
    if (!tarefaAberta) return;
    if (tarefaAberta.feedback_obrigatorio && feedback.trim().length < 10) {
      alert('Feedback obrigatório (mín. 10 caracteres)');
      return;
    }
    
    setSalvando(true);
    try {
      await supabase.from('tarefas').update({
        status: 'Concluída',
        concluido_em: new Date().toISOString(),
        feedback_texto: feedback.trim(),
        feedback_em: new Date().toISOString(),
      }).eq('id', tarefaAberta.id);
      
      if (feedback.trim()) {
        const feedbackId = 'FB-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        await supabase.from('feedbacks').insert({
          feedback_id: feedbackId,
          id_tarefa: tarefaAberta.id_tarefa,
          id_groot: tarefaAberta.id_groot,
          nome: tarefaAberta.nome,
          processo: tarefaAberta.processo,
          tipo: tarefaAberta.tipo,
          observacao: feedback.trim(),
          responsavel: 'delman.jpereira@mercadolivre.com',
          classificacao: tarefaAberta.prioridade === 'critica' ? 'Abaixo' : 'Alinhado',
        });
      }
      
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      
      setTarefaAberta(null);
      setFeedback('');
      await carregar();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  // Modal de detalhe
  if (tarefaAberta) {
    const cor = CORES_PRIO[tarefaAberta.prioridade] || CORES_PRIO.media;
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setTarefaAberta(null); setFeedback(''); }}
          className="text-gray-400 text-sm font-bold flex items-center gap-1"
        >
          ← Voltar
        </button>

        <div className={`border-2 rounded-2xl p-4 ${cor.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-3xl">{cor.emoji}</span>
            <div>
              <p className={`text-xs font-bold uppercase ${cor.text}`}>{tarefaAberta.prioridade}</p>
              <p className="text-white font-black">{tarefaAberta.nome}</p>
              <p className="text-[10px] text-gray-500">{tarefaAberta.processo} · {tarefaAberta.tipo}</p>
            </div>
          </div>
        </div>

        {tarefaAberta.diagnostico && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
            <p className="text-xs font-bold text-gray-400 uppercase mb-1">📊 Diagnóstico</p>
            <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.diagnostico}</p>
          </div>
        )}

        {tarefaAberta.analise_ia && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
            <p className="text-xs font-bold text-purple-300 uppercase mb-1">🧠 Análise IA</p>
            <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.analise_ia}</p>
          </div>
        )}

        {tarefaAberta.hipotese && (
          <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-3">
            <p className="text-xs font-bold text-yellow-300 uppercase mb-1">💡 Hipótese</p>
            <p className="text-sm text-gray-200 leading-relaxed">{tarefaAberta.hipotese}</p>
          </div>
        )}

        {tarefaAberta.motivo && (
          <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-3">
            <p className="text-xs font-bold text-[#FFD700] uppercase mb-1">🎯 Ação</p>
            <p className="text-sm text-white font-bold">{tarefaAberta.motivo}</p>
          </div>
        )}

        {/* Feedback */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
            ✍️ Seu feedback {tarefaAberta.feedback_obrigatorio && '(obrigatório)'}
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Escreva o feedback..."
            rows={5}
            className="w-full bg-[#1a1a1a] border-2 border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
          />
        </div>

        <button
          onClick={concluir}
          disabled={salvando || (tarefaAberta.feedback_obrigatorio && feedback.trim().length < 10)}
          className="w-full bg-gradient-to-br from-green-500 to-emerald-600 text-white font-black py-4 rounded-xl active:scale-95 transition-all disabled:opacity-30"
        >
          {salvando ? '⏳ Salvando...' : '✅ Concluir Tarefa'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-white">🤖 Copiloto IA</h2>
        <p className="text-xs text-gray-400">
          {tarefas.length} tarefa{tarefas.length !== 1 ? 's' : ''} pendente{tarefas.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-2 animate-pulse">🧠</span>
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      ) : tarefas.length === 0 ? (
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-2 border-dashed border-green-500/30 rounded-2xl p-8 text-center">
          <span className="text-5xl block mb-2">🎉</span>
          <p className="text-white font-bold">Tudo em ordem!</p>
          <p className="text-xs text-gray-400 mt-1">Sem tarefas críticas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tarefas.map((t) => {
            const cor = CORES_PRIO[t.prioridade] || CORES_PRIO.media;
            return (
              <button
                key={t.id_tarefa}
                onClick={() => setTarefaAberta(t)}
                className={`w-full border-2 rounded-xl p-3 active:scale-95 transition-all text-left ${cor.bg}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{cor.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${cor.text}`}>
                        {t.prioridade}
                      </span>
                      <span className="text-[10px] text-gray-400">{t.tipo}</span>
                    </div>
                    <p className="text-white font-bold text-sm">{t.nome}</p>
                    {t.motivo && (
                      <p className="text-xs text-[#FFD700] font-bold mt-1 line-clamp-2">
                        → {t.motivo}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// 🏠 PÁGINA HOME DO MOBILE
// ============================================

type Tarefa = {
  id: number;
  id_tarefa: string;
  nome: string;
  tipo: string;
  prioridade: string;
  motivo: string | null;
  criado_em: string;
};

type Colab = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
};

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function MobileHomePage() {
  const [horaAtual, setHoraAtual] = useState('');
  const [dataAtual, setDataAtual] = useState('');
  const [tarefasCriticas, setTarefasCriticas] = useState<Tarefa[]>([]);
  const [totalColabs, setTotalColabs] = useState(0);
  const [loading, setLoading] = useState(true);

  // Atualiza relógio
  useEffect(() => {
    const atualizar = () => {
      const now = new Date();
      setHoraAtual(now.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }));
      setDataAtual(now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }));
    };
    atualizar();
    const interval = setInterval(atualizar, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      // Tarefas críticas pendentes
      const { data: tars } = await supabase
        .from('tarefas')
        .select('id, id_tarefa, nome, tipo, prioridade, motivo, criado_em')
        .eq('status', 'Pendente')
        .in('prioridade', ['critica', 'alta'])
        .order('criado_em', { ascending: false })
        .limit(3);
      
      // Total de colabs ativos
      const { count } = await supabase
        .from('colaboradores')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Ativo');
      
      setTarefasCriticas(tars as any || []);
      setTotalColabs(count || 0);
    } catch (e) {
      console.error('Erro:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* SAUDAÇÃO */}
      <div className="text-center pt-2">
        <p className="text-gray-400 text-sm capitalize">{dataAtual}</p>
        <h2 className="text-2xl font-black text-white mt-1">
          {getSaudacao()}, Delman 👋
        </h2>
        <p className="text-4xl font-black text-[#FFD700] mt-2 font-mono">
          {horaAtual}
        </p>
      </div>

      {/* CARD DESTAQUE - Tarefas Críticas */}
      {!loading && tarefasCriticas.length > 0 && (
        <Link 
          href="/mobile/copiloto"
          className="block bg-gradient-to-br from-red-500/20 to-rose-600/10 border border-red-500/40 rounded-2xl p-4 hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🚨</span>
            <div>
              <p className="text-red-300 font-black text-sm uppercase tracking-wider">
                Atenção urgente
              </p>
              <p className="text-white font-bold">
                {tarefasCriticas.length} tarefa{tarefasCriticas.length > 1 ? 's' : ''} crítica{tarefasCriticas.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-300">
            Toque pra ver as análises da IA →
          </p>
        </Link>
      )}

      {/* AÇÕES RÁPIDAS - Grid 2x2 */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
          ⚡ Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Feedback */}
          <Link
            href="/mobile/feedback"
            className="bg-gradient-to-br from-[#FFD700]/10 to-yellow-600/5 border border-[#FFD700]/30 rounded-2xl p-4 active:scale-95 transition-all"
          >
            <div className="text-3xl mb-2">✍️</div>
            <p className="text-white font-bold text-sm">Feedback</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Registrar agora</p>
          </Link>
          
          {/* Agenda */}
          <Link
            href="/mobile/agenda"
            className="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border border-blue-500/30 rounded-2xl p-4 active:scale-95 transition-all"
          >
            <div className="text-3xl mb-2">📅</div>
            <p className="text-white font-bold text-sm">Agenda</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Tarefas + alarmes</p>
          </Link>
          
          {/* Copiloto */}
          <Link
            href="/mobile/copiloto"
            className="bg-gradient-to-br from-purple-500/10 to-pink-600/5 border border-purple-500/30 rounded-2xl p-4 active:scale-95 transition-all"
          >
            <div className="text-3xl mb-2">🤖</div>
            <p className="text-white font-bold text-sm">Copiloto IA</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {tarefasCriticas.length > 0 
                ? `${tarefasCriticas.length} pendente${tarefasCriticas.length > 1 ? 's' : ''}` 
                : 'Tarefas inteligentes'}
            </p>
          </Link>
          
          {/* Time */}
          <Link
            href="/mobile/time"
            className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/30 rounded-2xl p-4 active:scale-95 transition-all"
          >
            <div className="text-3xl mb-2">👥</div>
            <p className="text-white font-bold text-sm">Meu Time</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {totalColabs} colab{totalColabs !== 1 ? 's' : ''} ativo{totalColabs !== 1 ? 's' : ''}
            </p>
          </Link>
        </div>
      </div>

      {/* STATUS DO COPILOTO */}
      {!loading && tarefasCriticas.length === 0 && (
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/30 rounded-2xl p-5 text-center">
          <span className="text-4xl block mb-2">✨</span>
          <p className="text-green-300 font-bold mb-1">Tudo em ordem!</p>
          <p className="text-xs text-gray-400">
            Sem tarefas críticas pendentes
          </p>
        </div>
      )}

      {/* PREVIEW DAS CRÍTICAS */}
      {!loading && tarefasCriticas.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
            🎯 Mais críticas
          </h3>
          <div className="space-y-2">
            {tarefasCriticas.map((t) => (
              <Link
                key={t.id_tarefa}
                href="/mobile/copiloto"
                className="block bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 active:bg-[#222] transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className={`text-2xl flex-shrink-0 ${
                    t.prioridade === 'critica' ? 'animate-pulse' : ''
                  }`}>
                    {t.prioridade === 'critica' ? '🚨' : '🔥'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{t.nome}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{t.tipo}</p>
                    {t.motivo && (
                      <p className="text-xs text-[#FFD700] font-bold mt-1 truncate">
                        → {t.motivo}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ATALHO PRA VERSÃO WEB */}
      <Link
        href="/"
        className="block bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-xl p-3 text-center"
      >
        <p className="text-xs text-gray-400">
          💻 Quer a versão completa? <span className="text-[#FFD700] font-bold">Abrir web</span>
        </p>
      </Link>
    </div>
  );
}

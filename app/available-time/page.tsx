'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// LISTA DE MOTIVOS - AGRUPADA POR CATEGORIA
// ============================================
const MOTIVOS_AVAILABLE_TIME = [
  { categoria: 'Acesso', emoji: '🔐', motivos: [
    'ID e/ou crachá duplicado',
    'Verificar biometria, LDAP, crachá',
  ]},
  { categoria: 'Acidente', emoji: '🚨', motivos: [
    'Acidente trabalho',
  ]},
  { categoria: 'Atendimento', emoji: '🎧', motivos: [
    'Atendimento IS',
  ]},
  { categoria: 'Atraso', emoji: '⏰', motivos: [
    'Problemas com o fretado',
  ]},
  { categoria: 'Desligamento', emoji: '🚪', motivos: [
    'Desligamento',
  ]},
  { categoria: 'Disciplina', emoji: '⚠️', motivos: [
    'Entrada/saída antecipada',
    'Horário de almoço excedido/incompleto',
    'Saída sem justificativa',
    'Suspensão',
    'Abandono',
  ]},
  { categoria: 'Escala', emoji: '📅', motivos: [
    'Escala incorreta',
  ]},
  { categoria: 'Evento Externo', emoji: '🎉', motivos: [
    'Premiação',
  ]},
  { categoria: 'Saúde', emoji: '🩺', motivos: [
    'Ambulatório RC',
    'Atestado de horas',
  ]},
  { categoria: 'Sistema', emoji: '💻', motivos: [
    'Problema sistêmico (Queda Sistêmica)',
  ]},
  { categoria: 'Suporte', emoji: '🤝', motivos: [
    'Áreas Suporte - Não deve ser contabilizado',
  ]},
  { categoria: 'Treinamento', emoji: '🎓', motivos: [
    'Treinamento',
    'Onboarding',
  ]},
  { categoria: 'Sinergia', emoji: '♻️', motivos: [
    'Sinergia entre áreas',
    'Falta de atividade',
  ]},
];

const META_HORAS = 7.2; // 7h12

type Pendencia = {
  id: number;
  id_groot: string;
  nome_colab: string | null;
  processo: string | null;
  data_referencia: string;
  tempo_processo: string | null;
  tempo_efetivo: string | null;
  tempo_faltante_min: number | null;
  motivo: string | null;
  categoria: string | null;
  observacao: string | null;
  status: string;
  validado_em: string | null;
  criado_em: string;
};

function tempoParaSegundos(tempo: string | null): number {
  if (!tempo) return 0;
  const partes = String(tempo).split(':').map(Number);
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return partes[0] * 3600 + partes[1] * 60;
  return 0;
}

function segundosParaHM(seg: number): string {
  if (seg < 0) seg = Math.abs(seg);
  if (seg === 0) return '0min';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function formatarDataCurta(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatarDataLonga(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function AvailableTimePage() {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'justificado' | 'todos'>('pendente');
  const [filtroData, setFiltroData] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [pendenciaAberta, setPendenciaAberta] = useState<Pendencia | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from('available_time')
      .select('*')
      .order('data_referencia', { ascending: false })
      .order('criado_em', { ascending: false });
    
    if (error) {
      console.error('Erro:', error);
    } else {
      setPendencias(data as Pendencia[] || []);
    }
    setLoading(false);
  }

  // 🎯 Escaneia o histórico e cria pendências automaticamente
  async function escanearPendencias() {
    setScanLoading(true);
    try {
      const META_SEG = META_HORAS * 3600;
      
      // Busca histórico do mês atual
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const anoAtual = agora.getFullYear();
      const inicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
      
      const { data: historico } = await supabase
        .from('historico')
        .select('id_groot, data_referencia, processo, tempo_processo, tempo_efetivo')
        .gte('data_referencia', inicio)
        .order('data_referencia', { ascending: false });
      
      if (!historico || historico.length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('warning', 'Sem dados de histórico no mês.');
        }
        return;
      }
      
      // Busca nomes dos colabs
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome');
      const nomesPorGroot = new Map<string, string>();
      colabs?.forEach((c: any) => nomesPorGroot.set(c.id_groot, c.nome));
      
      // Identifica casos com T.Efetivo < 7h12
      const novasPendencias: any[] = [];
      
      for (const h of historico) {
        const efeSeg = tempoParaSegundos(h.tempo_efetivo);
        if (efeSeg > 0 && efeSeg < META_SEG) {
          const faltanteSeg = META_SEG - efeSeg;
          const faltanteMin = Math.round(faltanteSeg / 60);
          
          novasPendencias.push({
            id_groot: h.id_groot,
            nome_colab: nomesPorGroot.get(h.id_groot) || h.id_groot,
            processo: h.processo,
            data_referencia: h.data_referencia,
            tempo_processo: h.tempo_processo,
            tempo_efetivo: h.tempo_efetivo,
            tempo_faltante_min: faltanteMin,
            status: 'pendente',
          });
        }
      }
      
      if (novasPendencias.length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', '✅ Nenhuma pendência! Todos com T.Efetivo >= 7h12.');
        }
        return;
      }
      
      // UPSERT (ignora se já existe)
      const { data: inserido, error } = await supabase
        .from('available_time')
        .upsert(novasPendencias, { 
          onConflict: 'id_groot,data_referencia',
          ignoreDuplicates: true 
        })
        .select();
      
      if (error) {
        console.error('Erro upsert:', error);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('error', 'Erro: ' + error.message);
        }
      } else {
        const qtd = inserido?.length || 0;
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', `🔍 ${novasPendencias.length} pendência(s) identificadas (${qtd} novas).`);
        }
        await carregar();
      }
    } catch (e: any) {
      console.error('Erro:', e);
    } finally {
      setScanLoading(false);
    }
  }

  // Filtros aplicados
  const pendenciasFiltradas = pendencias.filter((p) => {
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
    if (filtroData && p.data_referencia !== filtroData) return false;
    if (filtroBusca) {
      const busca = filtroBusca.toLowerCase();
      const nome = (p.nome_colab || '').toLowerCase();
      const groot = (p.id_groot || '').toLowerCase();
      if (!nome.includes(busca) && !groot.includes(busca)) return false;
    }
    return true;
  });

  // Stats
  const stats = {
    total: pendencias.length,
    pendentes: pendencias.filter(p => p.status === 'pendente').length,
    justificadas: pendencias.filter(p => p.status === 'justificado').length,
    rejeitadas: pendencias.filter(p => p.status === 'rejeitado').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          ⏱️ Available <span className="text-[#FFD700]">Time</span>
        </h1>
        <p className="text-gray-400">
          Gestão de justificativas pra dias com T.Efetivo abaixo de 7h12
        </p>
      </div>

      {/* 4 cards de stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">📊</span>
            <span className="text-3xl font-black text-white">{stats.total}</span>
          </div>
          <p className="text-xs text-gray-400 font-bold uppercase">Total registros</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">⏳</span>
            <span className="text-3xl font-black text-yellow-400">{stats.pendentes}</span>
          </div>
          <p className="text-xs text-yellow-300 font-bold uppercase">Pendentes</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">✅</span>
            <span className="text-3xl font-black text-green-400">{stats.justificadas}</span>
          </div>
          <p className="text-xs text-green-300 font-bold uppercase">Justificadas</p>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-rose-600/5 border border-red-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">❌</span>
            <span className="text-3xl font-black text-red-400">{stats.rejeitadas}</span>
          </div>
          <p className="text-xs text-red-300 font-bold uppercase">Rejeitadas</p>
        </div>
      </div>

      {/* Card de ação - escanear */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-5xl">🔍</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-blue-300">Escanear Histórico</h2>
            <p className="text-sm text-gray-400">
              Procura no histórico do mês atual e cria pendências pra cada colab com T.Efetivo &lt; 7h12.
              <br />
              <span className="text-xs text-gray-500">Não cria duplicatas — só novas.</span>
            </p>
          </div>
          <button
            onClick={escanearPendencias}
            disabled={scanLoading}
            className="bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {scanLoading ? (
              <><span className="animate-spin">⏳</span> Escaneando...</>
            ) : (
              <>🔍 Escanear agora</>
            )}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status */}
          <div className="flex gap-2">
            <button
              onClick={() => setFiltroStatus('pendente')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'pendente' 
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}
            >
              ⏳ Pendentes ({stats.pendentes})
            </button>
            <button
              onClick={() => setFiltroStatus('justificado')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'justificado' 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}
            >
              ✅ Justificadas ({stats.justificadas})
            </button>
            <button
              onClick={() => setFiltroStatus('todos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'todos' 
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}
            >
              📋 Todas
            </button>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="🔎 Buscar colab..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700] rounded-lg px-4 py-2 text-white text-sm outline-none transition-all"
            />
          </div>
          
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700] rounded-lg px-3 py-2 text-white text-sm outline-none transition-all"
          />
          
          {filtroData && (
            <button
              onClick={() => setFiltroData('')}
              className="text-gray-400 hover:text-white text-sm"
            >
              ✕ Limpar data
            </button>
          )}
        </div>
      </div>

      {/* Lista de pendências */}
      {loading ? (
        <div className="text-center py-12">
          <span className="text-6xl block mb-4">⏳</span>
          <p className="text-gray-400">Carregando...</p>
        </div>
      ) : pendenciasFiltradas.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">✨</span>
          <p className="text-gray-400 mb-2 font-bold">Nenhuma pendência</p>
          <p className="text-xs text-gray-500">
            {filtroStatus === 'pendente' 
              ? 'Tudo justificado! Ou clica em "Escanear" pra buscar novas.'
              : 'Ajuste os filtros pra ver outros registros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendenciasFiltradas.map((p) => (
            <CardPendencia
              key={p.id}
              pendencia={p}
              onClick={() => setPendenciaAberta(p)}
            />
          ))}
        </div>
      )}

      {/* Modal de justificativa */}
      {pendenciaAberta && (
        <ModalJustificar
          pendencia={pendenciaAberta}
          onClose={() => setPendenciaAberta(null)}
          onSave={async () => {
            await carregar();
            setPendenciaAberta(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// CARD DE PENDÊNCIA
// ============================================
function CardPendencia({ pendencia, onClick }: { pendencia: Pendencia; onClick: () => void }) {
  const cores: Record<string, { border: string; bg: string; emoji: string }> = {
    pendente: { border: 'border-yellow-500/30 hover:border-yellow-500/60', bg: 'from-yellow-500/5 to-amber-600/5', emoji: '⏳' },
    justificado: { border: 'border-green-500/30 hover:border-green-500/60', bg: 'from-green-500/5 to-emerald-600/5', emoji: '✅' },
    rejeitado: { border: 'border-red-500/30 hover:border-red-500/60', bg: 'from-red-500/5 to-rose-600/5', emoji: '❌' },
  };
  const cor = cores[pendencia.status] || cores.pendente;

  const motivoInfo = pendencia.motivo 
    ? MOTIVOS_AVAILABLE_TIME.find(c => c.motivos.includes(pendencia.motivo!))
    : null;

  return (
    <button
      onClick={onClick}
      className={`text-left bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base truncate">{pendencia.nome_colab || pendencia.id_groot}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatarDataLonga(pendencia.data_referencia)}
          </p>
        </div>
        <span className="text-2xl flex-shrink-0">{cor.emoji}</span>
      </div>

      {/* Tempo faltante */}
      <div className="bg-[#0a0a0a]/50 rounded-xl p-3 mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Tempo efetivo</p>
          <p className="text-lg font-bold text-white font-mono">{pendencia.tempo_efetivo || '--:--'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase font-bold">Faltam</p>
          <p className="text-lg font-bold text-orange-400 font-mono">
            {pendencia.tempo_faltante_min ? segundosParaHM(pendencia.tempo_faltante_min * 60) : '-'}
          </p>
        </div>
      </div>

      {/* Motivo (se justificado) */}
      {pendencia.status === 'justificado' && pendencia.motivo && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2 text-xs">
          <p className="text-green-300 font-bold flex items-center gap-1">
            {motivoInfo?.emoji} {pendencia.categoria}
          </p>
          <p className="text-gray-300 mt-1">{pendencia.motivo}</p>
          {pendencia.observacao && (
            <p className="text-gray-500 italic mt-1 text-[10px]">{pendencia.observacao}</p>
          )}
        </div>
      )}

      {/* Status badge */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2a2a]/50">
        {pendencia.processo && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-400">
            {pendencia.processo}
          </span>
        )}
        <span className="text-xs text-gray-500">
          {pendencia.status === 'justificado' && pendencia.validado_em
            ? `Justificada ${tempoRelativo(pendencia.validado_em)}`
            : pendencia.status === 'pendente' ? 'Clique pra justificar →' : 'Rejeitada'}
        </span>
      </div>
    </button>
  );
}

// ============================================
// MODAL DE JUSTIFICATIVA
// ============================================
function ModalJustificar({ 
  pendencia, 
  onClose, 
  onSave 
}: { 
  pendencia: Pendencia; 
  onClose: () => void; 
  onSave: () => void;
}) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>(pendencia.categoria || '');
  const [motivoSelecionado, setMotivoSelecionado] = useState<string>(pendencia.motivo || '');
  const [observacao, setObservacao] = useState(pendencia.observacao || '');
  const [salvando, setSalvando] = useState(false);

  const categoriaAtual = MOTIVOS_AVAILABLE_TIME.find(c => c.categoria === categoriaSelecionada);

  async function justificar() {
    if (!motivoSelecionado) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('warning', 'Selecione um motivo!');
      }
      return;
    }
    
    setSalvando(true);
    
    const { error } = await supabase
      .from('available_time')
      .update({
        motivo: motivoSelecionado,
        categoria: categoriaSelecionada,
        observacao: observacao || null,
        status: 'justificado',
        validado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pendencia.id);
    
    if (error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + error.message);
      }
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', '✅ Justificada!');
      }
      onSave();
    }
    setSalvando(false);
  }

  async function rejeitar() {
    setSalvando(true);
    const { error } = await supabase
      .from('available_time')
      .update({
        status: 'rejeitado',
        validado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pendencia.id);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', 'Rejeitada');
      }
      onSave();
    }
    setSalvando(false);
  }

  async function reabrir() {
    setSalvando(true);
    const { error } = await supabase
      .from('available_time')
      .update({
        status: 'pendente',
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pendencia.id);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('info', 'Reaberta como pendente');
      }
      onSave();
    }
    setSalvando(false);
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl max-w-2xl w-full p-8 shadow-2xl shadow-[#FFD700]/10 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2a2a2a]">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <span className="text-3xl">⏱️</span>
              Justificar Available Time
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {pendencia.nome_colab || pendencia.id_groot} · {formatarDataLonga(pendencia.data_referencia)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl w-10 h-10 rounded-full hover:bg-[#2a2a2a] flex items-center justify-center transition-all"
          >
            ✕
          </button>
        </div>

        {/* Info do dia */}
        <div className="bg-[#0a0a0a] rounded-xl p-4 mb-6 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">T.Processo</p>
            <p className="text-lg font-mono font-bold text-white">{pendencia.tempo_processo || '--:--'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">T.Efetivo</p>
            <p className="text-lg font-mono font-bold text-yellow-400">{pendencia.tempo_efetivo || '--:--'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Faltam</p>
            <p className="text-lg font-mono font-bold text-orange-400">
              {pendencia.tempo_faltante_min ? segundosParaHM(pendencia.tempo_faltante_min * 60) : '-'}
            </p>
          </div>
        </div>

        {/* Status atual */}
        {pendencia.status !== 'pendente' && (
          <div className={`rounded-xl p-3 mb-6 ${
            pendencia.status === 'justificado' 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <p className={`text-sm font-bold ${pendencia.status === 'justificado' ? 'text-green-300' : 'text-red-300'}`}>
              {pendencia.status === 'justificado' ? '✅ Já justificada' : '❌ Rejeitada'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Você pode {pendencia.status === 'justificado' ? 'editar' : 'reverter'} se precisar.
            </p>
          </div>
        )}

        {/* Categoria */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            🏷️ Categoria
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {MOTIVOS_AVAILABLE_TIME.map((cat) => (
              <button
                key={cat.categoria}
                onClick={() => {
                  setCategoriaSelecionada(cat.categoria);
                  setMotivoSelecionado('');
                }}
                className={`p-2 rounded-lg text-xs font-bold transition-all text-left ${
                  categoriaSelecionada === cat.categoria
                    ? 'bg-[#FFD700]/20 border border-[#FFD700]/40 text-[#FFD700]'
                    : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                }`}
              >
                <span className="block">{cat.emoji}</span>
                <span className="text-[10px]">{cat.categoria}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Motivo */}
        {categoriaAtual && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              {categoriaAtual.emoji} Motivo específico
            </label>
            <div className="space-y-2">
              {categoriaAtual.motivos.map((m) => (
                <button
                  key={m}
                  onClick={() => setMotivoSelecionado(m)}
                  className={`w-full text-left p-3 rounded-lg text-sm transition-all ${
                    motivoSelecionado === m
                      ? 'bg-[#FFD700]/10 border border-[#FFD700]/40 text-white'
                      : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-300 hover:border-[#3a3a3a]'
                  }`}
                >
                  {motivoSelecionado === m ? '✓ ' : ''}{m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Observação */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            📝 Observação <span className="text-gray-600 normal-case font-normal">(opcional)</span>
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Detalhes adicionais..."
            rows={3}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none transition-all"
          />
        </div>

        {/* Botões */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          
          {pendencia.status === 'pendente' ? (
            <>
              <button
                onClick={rejeitar}
                disabled={salvando}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
              >
                ❌ Rejeitar
              </button>
              <button
                onClick={justificar}
                disabled={salvando || !motivoSelecionado}
                className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 px-6 rounded-xl shadow-lg shadow-green-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {salvando ? <><span className="animate-spin">⏳</span> Salvando...</> : <>✅ Justificar</>}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={reabrir}
                disabled={salvando}
                className="bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
              >
                🔄 Reabrir
              </button>
              {pendencia.status === 'justificado' && (
                <button
                  onClick={justificar}
                  disabled={salvando || !motivoSelecionado}
                  className="flex-1 bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-black py-3 px-6 rounded-xl shadow-lg shadow-yellow-500/30 disabled:opacity-50 transition-all"
                >
                  💾 Atualizar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

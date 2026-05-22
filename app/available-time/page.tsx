'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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

const META_HORAS = 7.2;

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
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'justificado' | 'descartado' | 'todos'>('pendente');
  const [filtroData, setFiltroData] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [pendenciaAberta, setPendenciaAberta] = useState<Pendencia | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [confirmacaoMassa, setConfirmacaoMassa] = useState<'descartar' | 'justificar' | null>(null);
  const [descartando, setDescartando] = useState(false);

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
    
    if (error) console.error('Erro:', error);
    else setPendencias(data as Pendencia[] || []);
    setLoading(false);
    setSelecionadas(new Set());
  }

  async function escanearPendencias() {
    setScanLoading(true);
    try {
      const META_SEG = META_HORAS * 3600;
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
      
      const { data: colabs } = await supabase.from('colaboradores').select('id_groot, nome');
      const nomesPorGroot = new Map<string, string>();
      colabs?.forEach((c: any) => nomesPorGroot.set(c.id_groot, c.nome));
      
      const novasPendencias: any[] = [];
      for (const h of historico) {
        const efeSeg = tempoParaSegundos(h.tempo_efetivo);
        if (efeSeg > 0 && efeSeg < META_SEG) {
          novasPendencias.push({
            id_groot: h.id_groot,
            nome_colab: nomesPorGroot.get(h.id_groot) || h.id_groot,
            processo: h.processo,
            data_referencia: h.data_referencia,
            tempo_processo: h.tempo_processo,
            tempo_efetivo: h.tempo_efetivo,
            tempo_faltante_min: Math.round((META_SEG - efeSeg) / 60),
            status: 'pendente',
          });
        }
      }
      
      if (novasPendencias.length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', '✅ Nenhuma pendência!');
        }
        return;
      }
      
      const { data: inserido, error } = await supabase
        .from('available_time')
        .upsert(novasPendencias, { onConflict: 'id_groot,data_referencia', ignoreDuplicates: true })
        .select();
      
      if (error) {
        console.error('Erro upsert:', error);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('error', 'Erro: ' + error.message);
        }
      } else {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', `🔍 ${novasPendencias.length} pendência(s) identificadas (${inserido?.length || 0} novas).`);
        }
        await carregar();
      }
    } catch (e: any) {
      console.error('Erro:', e);
    } finally {
      setScanLoading(false);
    }
  }

  // 🗑️ DESCARTE INDIVIDUAL
  async function descartarUma(id: number) {
    const { error } = await supabase
      .from('available_time')
      .update({
        status: 'descartado',
        validado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', 'Pendência descartada');
      }
      await carregar();
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + error.message);
      }
    }
  }

  // 🗑️ DESCARTE EM MASSA
  async function descartarSelecionadas() {
    setDescartando(true);
    const ids = Array.from(selecionadas);
    
    const { error } = await supabase
      .from('available_time')
      .update({
        status: 'descartado',
        validado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .in('id', ids);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🗑️ ${ids.length} pendência(s) descartada(s)`);
      }
      await carregar();
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + error.message);
      }
    }
    setConfirmacaoMassa(null);
    setDescartando(false);
  }

  // 🔄 REABRIR
  async function reabrir(id: number) {
    const { error } = await supabase
      .from('available_time')
      .update({ status: 'pendente', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('info', 'Reaberta');
      }
      await carregar();
    }
  }

  // ☑️ SELEÇÃO
  function toggleSelecao(id: number) {
    const nova = new Set(selecionadas);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    setSelecionadas(nova);
  }

  function toggleSelecionarTodas() {
    if (selecionadas.size === pendenciasFiltradas.length) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(pendenciasFiltradas.map(p => p.id)));
    }
  }

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

  const stats = {
    total: pendencias.length,
    pendentes: pendencias.filter(p => p.status === 'pendente').length,
    justificadas: pendencias.filter(p => p.status === 'justificado').length,
    descartadas: pendencias.filter(p => p.status === 'descartado').length,
  };

  const todasSelecionadas = pendenciasFiltradas.length > 0 && selecionadas.size === pendenciasFiltradas.length;

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

      {/* Stats */}
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
        <div className="bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-3xl">🗑️</span>
            <span className="text-3xl font-black text-gray-400">{stats.descartadas}</span>
          </div>
          <p className="text-xs text-gray-400 font-bold uppercase">Descartadas</p>
        </div>
      </div>

      {/* Escanear */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-5xl">🔍</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-blue-300">Escanear Histórico</h2>
            <p className="text-sm text-gray-400">
              Procura no histórico do mês atual e cria pendências pra cada colab com T.Efetivo &lt; 7h12.
            </p>
          </div>
          <button
            onClick={escanearPendencias}
            disabled={scanLoading}
            className="bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50"
          >
            {scanLoading ? <><span className="animate-spin">⏳</span> Escaneando...</> : <>🔍 Escanear agora</>}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setFiltroStatus('pendente'); setSelecionadas(new Set()); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'pendente' 
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              ⏳ Pendentes ({stats.pendentes})
            </button>
            <button
              onClick={() => { setFiltroStatus('justificado'); setSelecionadas(new Set()); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'justificado' 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              ✅ Justificadas ({stats.justificadas})
            </button>
            <button
              onClick={() => { setFiltroStatus('descartado'); setSelecionadas(new Set()); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'descartado' 
                  ? 'bg-gray-500/30 text-gray-300 border border-gray-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              🗑️ Descartadas ({stats.descartadas})
            </button>
            <button
              onClick={() => { setFiltroStatus('todos'); setSelecionadas(new Set()); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'todos' 
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
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
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-4 py-2 text-white text-sm outline-none"
            />
          </div>
          
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-3 py-2 text-white text-sm outline-none"
          />
          
          {filtroData && (
            <button onClick={() => setFiltroData('')} className="text-gray-400 hover:text-white text-sm">
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* 🎯 BARRA DE AÇÃO EM MASSA - aparece quando tem pendências do filtro atual */}
      {pendenciasFiltradas.length > 0 && filtroStatus === 'pendente' && (
        <div className={`sticky top-4 z-30 bg-gradient-to-br border rounded-2xl p-4 transition-all ${
          selecionadas.size > 0
            ? 'from-purple-500/10 to-pink-500/5 border-purple-500/40 shadow-lg shadow-purple-500/20'
            : 'from-[#1a1a1a] to-[#141414] border-[#2a2a2a]'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleSelecionarTodas}
              className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm transition-all"
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                todasSelecionadas ? 'bg-[#FFD700] border-[#FFD700]' : 'border-gray-500'
              }`}>
                {todasSelecionadas && <span className="text-black font-black text-xs">✓</span>}
              </span>
              <span className="text-white font-bold">
                {todasSelecionadas ? 'Desmarcar todas' : 'Selecionar todas'}
              </span>
              <span className="text-gray-500 text-xs">({pendenciasFiltradas.length})</span>
            </button>
            
            {selecionadas.size > 0 && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-purple-300 font-bold">
                    {selecionadas.size} selecionada{selecionadas.size > 1 ? 's' : ''}
                  </p>
                </div>
                
                <button
                  onClick={() => setSelecionadas(new Set())}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  ✕ Cancelar
                </button>
                
                <button
                  onClick={() => setConfirmacaoMassa('descartar')}
                  className="bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center gap-2"
                >
                  🗑️ Descartar {selecionadas.size}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lista */}
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
              ? 'Tudo limpo! Ou clica em "Escanear" pra buscar novas.'
              : 'Ajuste os filtros pra ver outros registros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendenciasFiltradas.map((p) => (
            <CardPendencia
              key={p.id}
              pendencia={p}
              selecionada={selecionadas.has(p.id)}
              mostrarCheckbox={filtroStatus === 'pendente'}
              onToggleSelecao={() => toggleSelecao(p.id)}
              onClick={() => setPendenciaAberta(p)}
              onDescartar={() => descartarUma(p.id)}
              onReabrir={() => reabrir(p.id)}
            />
          ))}
        </div>
      )}

      {/* Modal de justificar */}
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

      {/* Modal de confirmação em massa */}
      {confirmacaoMassa === 'descartar' && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !descartando && setConfirmacaoMassa(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-red-500/40 rounded-3xl max-w-md w-full p-8 shadow-2xl"
          >
            <div className="text-center mb-6">
              <span className="text-6xl block mb-3">🗑️</span>
              <h2 className="text-2xl font-black text-white mb-2">
                Descartar {selecionadas.size} pendência{selecionadas.size > 1 ? 's' : ''}?
              </h2>
              <p className="text-sm text-gray-400">
                As pendências vão pra aba "Descartadas". Você pode reabrir depois se precisar.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmacaoMassa(null)}
                disabled={descartando}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={descartarSelecionadas}
                disabled={descartando}
                className="flex-1 bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-black py-3 rounded-xl shadow-lg shadow-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {descartando ? <><span className="animate-spin">⏳</span> Descartando...</> : <>🗑️ Sim, descartar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// CARD COM CHECKBOX
// ============================================
function CardPendencia({ 
  pendencia, 
  selecionada, 
  mostrarCheckbox, 
  onToggleSelecao, 
  onClick, 
  onDescartar,
  onReabrir,
}: { 
  pendencia: Pendencia;
  selecionada: boolean;
  mostrarCheckbox: boolean;
  onToggleSelecao: () => void;
  onClick: () => void;
  onDescartar: () => void;
  onReabrir: () => void;
}) {
  const cores: Record<string, { border: string; bg: string; emoji: string }> = {
    pendente: { border: 'border-yellow-500/30 hover:border-yellow-500/60', bg: 'from-yellow-500/5 to-amber-600/5', emoji: '⏳' },
    justificado: { border: 'border-green-500/30 hover:border-green-500/60', bg: 'from-green-500/5 to-emerald-600/5', emoji: '✅' },
    descartado: { border: 'border-gray-500/30 hover:border-gray-500/60', bg: 'from-gray-500/5 to-gray-600/5', emoji: '🗑️' },
    rejeitado: { border: 'border-red-500/30', bg: 'from-red-500/5 to-rose-600/5', emoji: '❌' },
  };
  const cor = cores[pendencia.status] || cores.pendente;

  const motivoInfo = pendencia.motivo 
    ? MOTIVOS_AVAILABLE_TIME.find(c => c.motivos.includes(pendencia.motivo!))
    : null;

  return (
    <div className={`bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg ${selecionada ? 'ring-2 ring-purple-500/60' : ''}`}>
      {/* Header com checkbox */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {mostrarCheckbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelecao();
              }}
              className="flex-shrink-0 mt-1"
            >
              <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                selecionada 
                  ? 'bg-purple-500 border-purple-500' 
                  : 'border-gray-500 hover:border-purple-400'
              }`}>
                {selecionada && <span className="text-white font-black text-sm">✓</span>}
              </span>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base truncate">{pendencia.nome_colab || pendencia.id_groot}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatarDataLonga(pendencia.data_referencia)}
            </p>
          </div>
        </div>
        <span className="text-2xl flex-shrink-0">{cor.emoji}</span>
      </div>

      {/* Tempos */}
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
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-2 text-xs mb-3">
          <p className="text-green-300 font-bold flex items-center gap-1">
            {motivoInfo?.emoji} {pendencia.categoria}
          </p>
          <p className="text-gray-300 mt-1">{pendencia.motivo}</p>
        </div>
      )}

      {/* Footer com ações */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#2a2a2a]/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {pendencia.processo && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-400">
              {pendencia.processo}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          {pendencia.status === 'pendente' && (
            <>
              <button
                onClick={onClick}
                className="text-xs bg-[#FFD700]/20 hover:bg-[#FFD700]/30 text-[#FFD700] font-bold px-3 py-1.5 rounded-lg transition-all"
                title="Justificar"
              >
                ✅ Justificar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Descartar pendência de ${pendencia.nome_colab}?`)) {
                    onDescartar();
                  }
                }}
                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold w-8 h-8 rounded-lg transition-all"
                title="Descartar"
              >
                🗑️
              </button>
            </>
          )}
          
          {pendencia.status === 'justificado' && (
            <button
              onClick={onClick}
              className="text-xs bg-[#0a0a0a] hover:bg-[#1a1a1a] text-gray-300 font-bold px-3 py-1.5 rounded-lg transition-all"
            >
              ✏️ Editar
            </button>
          )}
          
          {pendencia.status === 'descartado' && (
            <button
              onClick={onReabrir}
              className="text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 font-bold px-3 py-1.5 rounded-lg transition-all"
            >
              🔄 Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL DE JUSTIFICATIVA (mesmo de antes)
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto"
      >
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
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl w-10 h-10 rounded-full hover:bg-[#2a2a2a] flex items-center justify-center transition-all">
            ✕
          </button>
        </div>

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

        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            📝 Observação (opcional)
          </label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Detalhes adicionais..."
            rows={3}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={justificar}
            disabled={salvando || !motivoSelecionado}
            className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 px-6 rounded-xl shadow-lg shadow-green-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {salvando ? <><span className="animate-spin">⏳</span> Salvando...</> : <>✅ Justificar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

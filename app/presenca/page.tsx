'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// MOTIVOS PRESENÇA - 6 GRUPOS COM TODAS AS OPÇÕES
// ============================================
const MOTIVOS_PRESENCA = [
  { 
    grupo: 'AB / AF / AP',
    emoji: '🚫',
    cor: 'red',
    motivos: [
      { codigo: 'AB - Abandono', categoria: 'AB', contaAbs: true, contaPresenca: false },
      { codigo: 'AF - Afastado INSS', categoria: 'AF', contaAbs: false, contaPresenca: false },
      { codigo: 'AF - Licença Maternidade', categoria: 'AF', contaAbs: false, contaPresenca: false },
      { codigo: 'AF - Licença Não Remunerada', categoria: 'AF', contaAbs: false, contaPresenca: false },
      { codigo: 'AF - Licença Remunerada', categoria: 'AF', contaAbs: false, contaPresenca: false },
      { codigo: 'AP - Admissão Postergada', categoria: 'AP', contaAbs: false, contaPresenca: false },
    ]
  },
  { 
    grupo: 'BH / CE / DE / DSR / FE',
    emoji: '📅',
    cor: 'blue',
    motivos: [
      { codigo: 'BH - Banco de Horas não planejado', categoria: 'BH', contaAbs: true, contaPresenca: false },
      { codigo: 'BH - Banco de Horas planejado', categoria: 'BH', contaAbs: false, contaPresenca: false },
      { codigo: 'CE - Curso Externo', categoria: 'CE', contaAbs: false, contaPresenca: false },
      { codigo: 'DE - Desligado', categoria: 'DE', contaAbs: false, contaPresenca: false },
      { codigo: 'DSR - Escala', categoria: 'DSR', contaAbs: false, contaPresenca: false },
      { codigo: 'FE - Férias', categoria: 'FE', contaAbs: false, contaPresenca: false },
    ]
  },
  { 
    grupo: 'FJ - Abonos e Justificativas',
    emoji: '📋',
    cor: 'yellow',
    motivos: [
      { codigo: 'FJ - Abono Fretado (atraso)', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Abono Fretado (falta)', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Abono Gestor', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Acompanhamento Filho', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Atestado', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Declaração', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Exame Periódico Externo', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Falecimento 1º grau', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Falecimento 2º grau', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Folga Black', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Casamento', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Doação de Sangue', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Eleitoral', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Mudança', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Paternidade', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Licença Vestibular', categoria: 'FJ', contaAbs: false, contaPresenca: false },
      { codigo: 'FJ - Serviço Militar', categoria: 'FJ', contaAbs: false, contaPresenca: false },
    ]
  },
  { 
    grupo: 'FI / FR / HCD / HE / HTF',
    emoji: '⚠️',
    cor: 'orange',
    motivos: [
      { codigo: 'FI - Suspensão (Dias)', categoria: 'FI', contaAbs: true, contaPresenca: false },
      { codigo: 'FI - Falta Injustificada', categoria: 'FI', contaAbs: true, contaPresenca: false },
      { codigo: 'FR - Feriado', categoria: 'FR', contaAbs: false, contaPresenca: false },
      { codigo: 'HCD - HC Divergente', categoria: 'HCD', contaAbs: false, contaPresenca: false },
      { codigo: 'HE - Presente Hora Extra', categoria: 'HE', contaAbs: false, contaPresenca: true },
      { codigo: 'HTF - HC Transferido para outro CAD', categoria: 'HTF', contaAbs: false, contaPresenca: false },
    ]
  },
  { 
    grupo: 'ON / P / PCO',
    emoji: '✅',
    cor: 'green',
    motivos: [
      { codigo: 'ON - Onboarding / Primeiro Dia', categoria: 'ON', contaAbs: false, contaPresenca: true },
      { codigo: 'P - Presente', categoria: 'P', contaAbs: false, contaPresenca: true },
      { codigo: 'PCO - Protocolo COVID', categoria: 'PCO', contaAbs: false, contaPresenca: false },
    ]
  },
  { 
    grupo: 'SIE / TR / VAZIO',
    emoji: '🎓',
    cor: 'purple',
    motivos: [
      { codigo: 'SIE - Sinergia Externa', categoria: 'SIE', contaAbs: false, contaPresenca: false },
      { codigo: 'TR - Treinamentos Diversos', categoria: 'TR', contaAbs: false, contaPresenca: true },
      { codigo: 'VAZIO - Justificativa não encontrada', categoria: 'VAZIO', contaAbs: true, contaPresenca: false },
    ]
  },
];

function buscarMotivo(codigo: string) {
  for (const g of MOTIVOS_PRESENCA) {
    const m = g.motivos.find(mt => mt.codigo === codigo);
    if (m) return { ...m, grupo: g.grupo, emoji: g.emoji, cor: g.cor };
  }
  return null;
}

type Presenca = {
  id: number;
  id_groot: string;
  nome_colab: string | null;
  processo: string | null;
  data_referencia: string;
  status: string;
  motivo: string | null;
  categoria: string | null;
  observacao: string | null;
  conta_abs: boolean;
  conta_presenca: boolean;
  registrado_por: string | null;
  validado_em: string | null;
  criado_em: string;
};

function formatarDataLonga(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function PresencaPage() {
  const [registros, setRegistros] = useState<Presenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'pendente' | 'presente' | 'justificado' | 'descartado' | 'todos'>('pendente');
  const [filtroData, setFiltroData] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [registroAberto, setRegistroAberto] = useState<Presenca | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [confirmacaoMassa, setConfirmacaoMassa] = useState<'descartar' | null>(null);
  const [processando, setProcessando] = useState(false);

  // 🎯 Última importação CSV do MELI
  const [ultimaImportacao, setUltimaImportacao] = useState<{ data: string; total: number } | null>(null);

  useEffect(() => {
    carregar();
    carregarUltimaImportacao();
  }, []);

  async function carregarUltimaImportacao() {
    const { data } = await supabase
      .from('presenca')
      .select('criado_em, data_referencia')
      .eq('registrado_por', 'csv_meli')
      .order('criado_em', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      const { count } = await supabase
        .from('presenca')
        .select('id', { count: 'exact', head: true })
        .eq('registrado_por', 'csv_meli');
      
      setUltimaImportacao({
        data: data[0].criado_em,
        total: count || 0,
      });
    }
  }

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from('presenca')
      .select('*')
      .order('data_referencia', { ascending: false })
      .order('criado_em', { ascending: false });
    
    if (error) console.error('Erro:', error);
    else setRegistros(data as Presenca[] || []);
    setLoading(false);
    setSelecionados(new Set());
  }

  async function escanearPresencas() {
    setScanLoading(true);
    try {
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo, status')
        .eq('status', 'Ativo');
      
      if (!colabs || colabs.length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('warning', 'Nenhum colab ativo encontrado.');
        }
        return;
      }
      
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const anoAtual = agora.getFullYear();
      const inicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
      
      const { data: historico } = await supabase
        .from('historico')
        .select('id_groot, data_referencia, processo')
        .gte('data_referencia', inicio);
      
      if (!historico || historico.length === 0) {
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('warning', 'Sem CSV do mês ainda.');
        }
        return;
      }
      
      const datasUnicas = Array.from(new Set(historico.map((h: any) => h.data_referencia))).sort();
      
      const presencaPorData = new Map<string, Set<string>>();
      historico.forEach((h: any) => {
        if (!presencaPorData.has(h.data_referencia)) {
          presencaPorData.set(h.data_referencia, new Set());
        }
        presencaPorData.get(h.data_referencia)!.add(h.id_groot);
      });
      
      const novosRegistros: any[] = [];
      
      for (const data of datasUnicas) {
        const presentes = presencaPorData.get(data)!;
        for (const c of colabs) {
          const tahEpresente = presentes.has(c.id_groot);
          novosRegistros.push({
            id_groot: c.id_groot,
            nome_colab: c.nome,
            processo: c.processo,
            data_referencia: data,
            status: tahEpresente ? 'presente' : 'pendente',
            motivo: tahEpresente ? 'P - Presente' : null,
            categoria: tahEpresente ? 'P' : null,
            conta_presenca: tahEpresente,
            conta_abs: !tahEpresente,
            registrado_por: tahEpresente ? 'csv' : 'sistema',
            validado_em: tahEpresente ? new Date().toISOString() : null,
          });
        }
      }
      
      const { data: inserido, error } = await supabase
        .from('presenca')
        .upsert(novosRegistros, { onConflict: 'id_groot,data_referencia', ignoreDuplicates: true })
        .select();
      
      if (error) {
        console.error('Erro upsert:', error);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('error', 'Erro: ' + error.message);
        }
      } else {
        const qtd = inserido?.length || 0;
        const presentes = novosRegistros.filter(r => r.status === 'presente').length;
        const pendentes = novosRegistros.filter(r => r.status === 'pendente').length;
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('success', `🔍 ${qtd} registros novos: ${presentes} presentes, ${pendentes} pendentes.`);
        }
        await carregar();
      }
    } catch (e: any) {
      console.error('Erro:', e);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + e.message);
      }
    } finally {
      setScanLoading(false);
    }
  }

  async function descartarUm(id: number) {
    const { error } = await supabase
      .from('presenca')
      .update({ status: 'descartado', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', 'Descartado');
      }
      await carregar();
    }
  }

  async function descartarSelecionados() {
    setProcessando(true);
    const ids = Array.from(selecionados);
    
    const { error } = await supabase
      .from('presenca')
      .update({ status: 'descartado', atualizado_em: new Date().toISOString() })
      .in('id', ids);
    
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🗑️ ${ids.length} descartado(s)`);
      }
      await carregar();
    }
    setConfirmacaoMassa(null);
    setProcessando(false);
  }

  async function reabrir(id: number) {
    const { error } = await supabase
      .from('presenca')
      .update({ status: 'pendente', atualizado_em: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('info', 'Reaberto');
      }
      await carregar();
    }
  }

  function toggleSelecao(id: number) {
    const nova = new Set(selecionados);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    setSelecionados(nova);
  }

  function toggleSelecionarTodos() {
    if (selecionados.size === registrosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(registrosFiltrados.map(p => p.id)));
    }
  }

  const registrosFiltrados = registros.filter((p) => {
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
    total: registros.length,
    pendentes: registros.filter(p => p.status === 'pendente').length,
    presentes: registros.filter(p => p.status === 'presente').length,
    justificados: registros.filter(p => p.status === 'justificado').length,
    descartados: registros.filter(p => p.status === 'descartado').length,
  };

  const calcAbs = (() => {
    const total = registros.filter(p => p.status !== 'descartado').length;
    const ausencias = registros.filter(p => p.conta_abs && p.status !== 'descartado').length;
    const abs = total > 0 ? (ausencias / total) * 100 : 0;
    return { abs: abs.toFixed(1), ausencias, total };
  })();

  const todosSelecionados = registrosFiltrados.length > 0 && selecionados.size === registrosFiltrados.length;

  return (
    <div className="space-y-6">
      {/* HEADER + Botão Importar do MELI */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            📋 Lista de <span className="text-[#FFD700]">Presença</span>
          </h1>
          <p className="text-gray-400">
            Gestão de presença diária + cálculo de ABS do time
          </p>
        </div>

        {/* 🎯 BOTÃO DE IMPORTAR DO MELI */}
        <Link
          href="/presenca/importar"
          className="bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-purple-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2"
        >
          <span className="text-xl">📥</span>
          <div className="text-left">
            <p className="text-sm">Importar do MELI</p>
            <p className="text-[10px] opacity-80">CSV de presença completo</p>
          </div>
        </Link>
      </div>

      {/* 🎯 BANNER DE ÚLTIMA IMPORTAÇÃO */}
      {ultimaImportacao && (
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-2xl">📅</span>
          <div className="flex-1 min-w-0">
            <p className="text-purple-300 font-bold text-sm">
              Última importação do MELI · {ultimaImportacao.total} registros
            </p>
            <p className="text-xs text-gray-400">
              {new Date(ultimaImportacao.data).toLocaleString('pt-BR', { 
                day: '2-digit', month: '2-digit', year: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
              })}
            </p>
          </div>
          <Link 
            href="/presenca/importar" 
            className="text-purple-300 hover:text-purple-200 text-xs font-bold underline"
          >
            🔄 Importar nova
          </Link>
        </div>
      )}

      {/* Stats - 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📊</span>
            <span className="text-2xl font-black text-white">{stats.total}</span>
          </div>
          <p className="text-xs text-gray-400 font-bold uppercase">Total</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500/10 to-amber-600/5 border border-yellow-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">⏳</span>
            <span className="text-2xl font-black text-yellow-400">{stats.pendentes}</span>
          </div>
          <p className="text-xs text-yellow-300 font-bold uppercase">Pendentes</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">✅</span>
            <span className="text-2xl font-black text-green-400">{stats.presentes}</span>
          </div>
          <p className="text-xs text-green-300 font-bold uppercase">Presentes</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-600/5 border border-blue-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📋</span>
            <span className="text-2xl font-black text-blue-400">{stats.justificados}</span>
          </div>
          <p className="text-xs text-blue-300 font-bold uppercase">Justificados</p>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-rose-600/5 border border-red-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📉</span>
            <span className="text-2xl font-black text-red-400">{calcAbs.abs}%</span>
          </div>
          <p className="text-xs text-red-300 font-bold uppercase">ABS</p>
        </div>
      </div>

      {/* Card ABS detalhado */}
      <div className={`bg-gradient-to-br border rounded-2xl p-6 ${
        Number(calcAbs.abs) < 5 ? 'from-green-500/10 to-emerald-600/5 border-green-500/30' :
        Number(calcAbs.abs) < 10 ? 'from-yellow-500/10 to-amber-600/5 border-yellow-500/30' :
        'from-red-500/10 to-rose-600/5 border-red-500/30'
      }`}>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-5xl">
            {Number(calcAbs.abs) < 5 ? '✅' : Number(calcAbs.abs) < 10 ? '🟡' : '🔴'}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">Absenteísmo do Time</h2>
            <p className="text-3xl font-black text-white mt-1">{calcAbs.abs}%</p>
            <p className="text-xs text-gray-400 mt-1">
              {calcAbs.ausencias} ausências contabilizadas de {calcAbs.total} registros
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 mb-1">Escala</p>
            <div className="text-xs space-y-1">
              <p className="text-green-400">✅ &lt; 5% Excelente</p>
              <p className="text-yellow-400">🟡 5-10% Atenção</p>
              <p className="text-red-400">🔴 &gt; 10% Crítico</p>
            </div>
          </div>
        </div>
      </div>

      {/* Escanear */}
      <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-5xl">🔍</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-blue-300">Sincronizar com Histórico</h2>
            <p className="text-sm text-gray-400">
              Identifica quem está no CSV (marca presente) e quem não está (cria pendência pra justificar).
            </p>
          </div>
          <button
            onClick={escanearPresencas}
            disabled={scanLoading}
            className="bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50"
          >
            {scanLoading ? <><span className="animate-spin">⏳</span> Sincronizando...</> : <>🔍 Sincronizar</>}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setFiltroStatus('pendente'); setSelecionados(new Set()); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'pendente' 
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              ⏳ Pendentes ({stats.pendentes})
            </button>
            <button
              onClick={() => { setFiltroStatus('presente'); setSelecionados(new Set()); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'presente' 
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              ✅ Presentes ({stats.presentes})
            </button>
            <button
              onClick={() => { setFiltroStatus('justificado'); setSelecionados(new Set()); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'justificado' 
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              📋 Justificados ({stats.justificados})
            </button>
            <button
              onClick={() => { setFiltroStatus('descartado'); setSelecionados(new Set()); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'descartado' 
                  ? 'bg-gray-500/30 text-gray-300 border border-gray-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              🗑️ Descartados ({stats.descartados})
            </button>
            <button
              onClick={() => { setFiltroStatus('todos'); setSelecionados(new Set()); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroStatus === 'todos' 
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              📋 Todos
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
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Barra massa */}
      {registrosFiltrados.length > 0 && filtroStatus === 'pendente' && (
        <div className={`sticky top-4 z-30 bg-gradient-to-br border rounded-2xl p-4 transition-all ${
          selecionados.size > 0
            ? 'from-purple-500/10 to-pink-500/5 border-purple-500/40 shadow-lg shadow-purple-500/20'
            : 'from-[#1a1a1a] to-[#141414] border-[#2a2a2a]'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleSelecionarTodos}
              className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm"
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                todosSelecionados ? 'bg-[#FFD700] border-[#FFD700]' : 'border-gray-500'
              }`}>
                {todosSelecionados && <span className="text-black font-black text-xs">✓</span>}
              </span>
              <span className="text-white font-bold">
                {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
              </span>
              <span className="text-gray-500 text-xs">({registrosFiltrados.length})</span>
            </button>
            
            {selecionados.size > 0 && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-purple-300 font-bold">
                    {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSelecionados(new Set())}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  ✕ Cancelar
                </button>
                <button
                  onClick={() => setConfirmacaoMassa('descartar')}
                  className="bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center gap-2"
                >
                  🗑️ Descartar {selecionados.size}
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
      ) : registrosFiltrados.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">✨</span>
          <p className="text-gray-400 mb-2 font-bold">Nenhum registro</p>
          <p className="text-xs text-gray-500 mb-4">
            {filtroStatus === 'pendente' 
              ? 'Tudo justificado! Ou clica em "Sincronizar" pra criar novos.'
              : 'Ajuste os filtros pra ver outros registros.'}
          </p>
          {!ultimaImportacao && filtroStatus === 'pendente' && (
            <Link
              href="/presenca/importar"
              className="inline-block bg-gradient-to-br from-purple-500 to-pink-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-500/30 mt-2"
            >
              📥 Importar primeiro CSV do MELI
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {registrosFiltrados.map((p) => (
            <CardPresenca
              key={p.id}
              registro={p}
              selecionado={selecionados.has(p.id)}
              mostrarCheckbox={filtroStatus === 'pendente'}
              onToggleSelecao={() => toggleSelecao(p.id)}
              onClick={() => setRegistroAberto(p)}
              onDescartar={() => descartarUm(p.id)}
              onReabrir={() => reabrir(p.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {registroAberto && (
        <ModalJustificar
          registro={registroAberto}
          onClose={() => setRegistroAberto(null)}
          onSave={async () => {
            await carregar();
            setRegistroAberto(null);
          }}
        />
      )}

      {/* Confirmação descarte massa */}
      {confirmacaoMassa === 'descartar' && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !processando && setConfirmacaoMassa(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-red-500/40 rounded-3xl max-w-md w-full p-8 shadow-2xl"
          >
            <div className="text-center mb-6">
              <span className="text-6xl block mb-3">🗑️</span>
              <h2 className="text-2xl font-black text-white mb-2">
                Descartar {selecionados.size}?
              </h2>
              <p className="text-sm text-gray-400">
                Vão pra "Descartados". Pode reabrir depois.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmacaoMassa(null)}
                disabled={processando}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={descartarSelecionados}
                disabled={processando}
                className="flex-1 bg-gradient-to-br from-red-500 to-rose-600 text-white font-black py-3 rounded-xl shadow-lg shadow-red-500/30 disabled:opacity-50"
              >
                {processando ? '⏳' : '🗑️ Sim, descartar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// CARD DE PRESENÇA
// ============================================
function CardPresenca({ 
  registro, selecionado, mostrarCheckbox, onToggleSelecao, onClick, onDescartar, onReabrir,
}: { 
  registro: Presenca;
  selecionado: boolean;
  mostrarCheckbox: boolean;
  onToggleSelecao: () => void;
  onClick: () => void;
  onDescartar: () => void;
  onReabrir: () => void;
}) {
  const cores: Record<string, { border: string; bg: string; emoji: string; texto: string; corTexto: string }> = {
    pendente: { border: 'border-yellow-500/30 hover:border-yellow-500/60', bg: 'from-yellow-500/5 to-amber-600/5', emoji: '⏳', texto: 'Pendente', corTexto: 'text-yellow-400' },
    presente: { border: 'border-green-500/30 hover:border-green-500/60', bg: 'from-green-500/5 to-emerald-600/5', emoji: '✅', texto: 'Presente', corTexto: 'text-green-400' },
    justificado: { border: 'border-blue-500/30 hover:border-blue-500/60', bg: 'from-blue-500/5 to-cyan-600/5', emoji: '📋', texto: 'Justificado', corTexto: 'text-blue-400' },
    descartado: { border: 'border-gray-500/30', bg: 'from-gray-500/5 to-gray-600/5', emoji: '🗑️', texto: 'Descartado', corTexto: 'text-gray-400' },
  };
  const cor = cores[registro.status] || cores.pendente;
  
  const motivoInfo = registro.motivo ? buscarMotivo(registro.motivo) : null;

  return (
    <div className={`bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${selecionado ? 'ring-2 ring-purple-500/60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {mostrarCheckbox && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelecao(); }}
              className="flex-shrink-0 mt-1"
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                selecionado ? 'bg-purple-500 border-purple-500' : 'border-gray-500 hover:border-purple-400'
              }`}>
                {selecionado && <span className="text-white font-black text-xs">✓</span>}
              </span>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{registro.nome_colab || registro.id_groot}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatarDataLonga(registro.data_referencia)}</p>
          </div>
        </div>
        <span className="text-2xl flex-shrink-0">{cor.emoji}</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${cor.corTexto} bg-${registro.status === 'pendente' ? 'yellow' : registro.status === 'presente' ? 'green' : registro.status === 'justificado' ? 'blue' : 'gray'}-500/10`}>
          {cor.texto}
        </span>
        {registro.processo && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-400">
            {registro.processo}
          </span>
        )}
        {registro.conta_abs && registro.status !== 'descartado' && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-300">
            ⚠️ Conta ABS
          </span>
        )}
        {registro.registrado_por === 'csv_meli' && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300">
            📥 CSV
          </span>
        )}
      </div>

      {registro.motivo && motivoInfo && (
        <div className="bg-[#0a0a0a]/50 rounded-lg p-2 text-xs mb-3">
          <p className="font-bold flex items-center gap-1">
            {motivoInfo.emoji} <span className="text-white">{motivoInfo.categoria}</span>
          </p>
          <p className="text-gray-400 mt-1 line-clamp-2">{registro.motivo}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[#2a2a2a]/50">
        {registro.status === 'pendente' && (
          <>
            <button
              onClick={onClick}
              className="text-xs bg-[#FFD700]/20 hover:bg-[#FFD700]/30 text-[#FFD700] font-bold px-3 py-1.5 rounded-lg"
            >
              📋 Justificar
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (confirm(`Descartar ${registro.nome_colab}?`)) onDescartar(); }}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold w-8 h-8 rounded-lg"
              title="Descartar"
            >
              🗑️
            </button>
          </>
        )}
        
        {registro.status === 'justificado' && (
          <button onClick={onClick} className="text-xs bg-[#0a0a0a] hover:bg-[#1a1a1a] text-gray-300 font-bold px-3 py-1.5 rounded-lg">
            ✏️ Editar
          </button>
        )}
        
        {registro.status === 'presente' && (
          <button onClick={onClick} className="text-xs bg-[#0a0a0a] hover:bg-[#1a1a1a] text-gray-300 font-bold px-3 py-1.5 rounded-lg">
            ✏️ Ajustar
          </button>
        )}
        
        {registro.status === 'descartado' && (
          <button onClick={onReabrir} className="text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 font-bold px-3 py-1.5 rounded-lg">
            🔄 Reabrir
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// MODAL JUSTIFICAR
// ============================================
function ModalJustificar({ 
  registro, onClose, onSave 
}: { 
  registro: Presenca; 
  onClose: () => void; 
  onSave: () => void;
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<string>('');
  const [motivoSelecionado, setMotivoSelecionado] = useState<string>(registro.motivo || '');
  const [observacao, setObservacao] = useState(registro.observacao || '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (registro.motivo) {
      const info = buscarMotivo(registro.motivo);
      if (info) setGrupoSelecionado(info.grupo);
    }
  }, [registro.motivo]);

  const grupoAtual = MOTIVOS_PRESENCA.find(g => g.grupo === grupoSelecionado);

  async function salvar() {
    if (!motivoSelecionado) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('warning', 'Selecione um motivo!');
      }
      return;
    }
    
    const info = buscarMotivo(motivoSelecionado);
    if (!info) return;
    
    setSalvando(true);
    
    const isPresente = info.contaPresenca;
    const novoStatus = isPresente ? 'presente' : 'justificado';
    
    const { error } = await supabase
      .from('presenca')
      .update({
        motivo: motivoSelecionado,
        categoria: info.categoria,
        observacao: observacao || null,
        status: novoStatus,
        conta_abs: info.contaAbs,
        conta_presenca: info.contaPresenca,
        registrado_por: 'manual',
        validado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', registro.id);
    
    if (error) {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', 'Erro: ' + error.message);
      }
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', '✅ Atualizado!');
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
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-[#FFD700]/30 rounded-3xl max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2a2a2a]">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-3">
              <span className="text-3xl">📋</span>
              Registrar Presença
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {registro.nome_colab || registro.id_groot} · {formatarDataLonga(registro.data_referencia)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl w-10 h-10 rounded-full hover:bg-[#2a2a2a] flex items-center justify-center">
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            🏷️ Grupo
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {MOTIVOS_PRESENCA.map((g) => (
              <button
                key={g.grupo}
                onClick={() => {
                  setGrupoSelecionado(g.grupo);
                  setMotivoSelecionado('');
                }}
                className={`p-3 rounded-lg text-xs font-bold transition-all text-left ${
                  grupoSelecionado === g.grupo
                    ? 'bg-[#FFD700]/20 border border-[#FFD700]/40 text-[#FFD700]'
                    : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                }`}
              >
                <span className="block text-xl mb-1">{g.emoji}</span>
                <span className="text-[10px] leading-tight block">{g.grupo}</span>
              </button>
            ))}
          </div>
        </div>

        {grupoAtual && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              {grupoAtual.emoji} Motivo específico
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
              {grupoAtual.motivos.map((m) => (
                <button
                  key={m.codigo}
                  onClick={() => setMotivoSelecionado(m.codigo)}
                  className={`text-left p-3 rounded-lg text-sm transition-all ${
                    motivoSelecionado === m.codigo
                      ? 'bg-[#FFD700]/10 border border-[#FFD700]/40 text-white'
                      : 'bg-[#0a0a0a] border border-[#2a2a2a] text-gray-300 hover:border-[#3a3a3a]'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    {motivoSelecionado === m.codigo && '✓'} {m.codigo}
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    {m.contaPresenca && (
                      <span className="text-[10px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">
                        ✅ Presente
                      </span>
                    )}
                    {m.contaAbs && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
                        ⚠️ Conta ABS
                      </span>
                    )}
                    {!m.contaAbs && !m.contaPresenca && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">
                        📋 Justificado
                      </span>
                    )}
                  </div>
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
            rows={2}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 px-4 rounded-xl disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !motivoSelecionado}
            className="flex-1 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 px-6 rounded-xl shadow-lg shadow-green-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {salvando ? <><span className="animate-spin">⏳</span> Salvando...</> : <>💾 Salvar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

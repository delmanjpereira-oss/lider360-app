'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// TIPOS
// ============================================

type Presenca = {
  id: number;
  id_groot: string;
  nome_colab: string | null;
  processo: string | null;
  data_referencia: string;
  status: string;
  motivo: string | null;
  categoria: string | null;
  conta_abs: boolean;
  conta_presenca: boolean;
};

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
  data_admissao: string | null;
};

// ============================================
// MAPEAMENTO DE STATUS → COR/EMOJI
// ============================================

function corDoStatus(motivo: string | null, status: string): { cor: string; emoji: string; label: string } {
  if (!motivo) {
    if (status === 'presente') return { cor: 'bg-green-500/80', emoji: '✅', label: 'Presente' };
    if (status === 'falta') return { cor: 'bg-red-500/80', emoji: '🔴', label: 'Falta' };
    if (status === 'justificado') return { cor: 'bg-blue-500/80', emoji: '🩺', label: 'Justificado' };
    if (status === 'descanso') return { cor: 'bg-gray-500/40', emoji: '🟦', label: 'Descanso' };
    return { cor: 'bg-gray-700/40', emoji: '·', label: 'Sem dado' };
  }
  
  const m = motivo.toLowerCase();
  
  if (m.includes('p - presente')) return { cor: 'bg-green-500/80', emoji: '✅', label: 'Presente' };
  if (m.includes('dsr - escala')) return { cor: 'bg-gray-500/40', emoji: '🟦', label: 'Descanso' };
  if (m.includes('fi - falta')) return { cor: 'bg-red-500/80', emoji: '🔴', label: 'Falta Injustif.' };
  if (m.includes('fj - atestado')) return { cor: 'bg-blue-500/80', emoji: '🩺', label: 'Atestado' };
  if (m.includes('fj - falecimento')) return { cor: 'bg-purple-500/60', emoji: '🕊️', label: 'Falecimento' };
  if (m.includes('bh - banco de horas n')) return { cor: 'bg-orange-500/70', emoji: '🟠', label: 'BH não plan.' };
  if (m.includes('bh - banco de horas plan')) return { cor: 'bg-yellow-500/60', emoji: '🟡', label: 'BH planejado' };
  if (m.includes('sie - sinergia')) return { cor: 'bg-purple-500/70', emoji: '🤝', label: 'Sinergia' };
  if (m.includes('fe - férias') || m.includes('fe - ferias')) return { cor: 'bg-cyan-500/60', emoji: '🌴', label: 'Férias' };
  if (m.includes('ce - curso')) return { cor: 'bg-cyan-500/60', emoji: '🎓', label: 'Curso' };
  if (m.includes('tr - treinamento')) return { cor: 'bg-cyan-500/60', emoji: '🎓', label: 'Treinamento' };
  if (m.includes('ab - abandono')) return { cor: 'bg-red-700/80', emoji: '🚫', label: 'Abandono' };
  if (m.includes('af - ')) return { cor: 'bg-gray-500/60', emoji: '🏥', label: 'Afastamento' };
  if (m.includes('de - desligado')) return { cor: 'bg-gray-500/60', emoji: '🚪', label: 'Desligado' };
  if (m.includes('htf')) return { cor: 'bg-gray-500/60', emoji: '🔄', label: 'Transferido' };
  
  return { cor: 'bg-gray-700/40', emoji: '·', label: motivo };
}

// ============================================
// HELPERS DE DATA
// ============================================

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatarDataBR(iso: string | null): string {
  if (!iso) return '-';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function calcularMesesNaEmpresa(dataAdmissao: string | null): number {
  if (!dataAdmissao) return 0;
  const data = new Date(dataAdmissao + 'T12:00:00');
  if (isNaN(data.getTime())) return 0;
  const hoje = new Date();
  const meses = (hoje.getFullYear() - data.getFullYear()) * 12 + (hoje.getMonth() - data.getMonth());
  return Math.max(0, meses);
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PresencaPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Presenca[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState<string>('todos');
  const [filtroMes, setFiltroMes] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filtroABS, setFiltroABS] = useState<'todos' | 'altos'>('todos');
  
  // Modal detalhe colab
  const [colabAberto, setColabAberto] = useState<Colaborador | null>(null);
  
  // Última importação
  const [ultimaImportacao, setUltimaImportacao] = useState<{ data: string; total: number } | null>(null);

  useEffect(() => {
    carregar();
    carregarUltimaImportacao();
  }, []);

  async function carregar() {
    setLoading(true);
    
    const [{ data: colabsData }, { data: presData }] = await Promise.all([
      supabase
        .from('colaboradores')
        .select('id, id_groot, nome, processo, status, data_admissao')
        .eq('status', 'Ativo')
        .order('nome'),
      supabase
        .from('presenca')
        .select('id, id_groot, nome_colab, processo, data_referencia, status, motivo, categoria, conta_abs, conta_presenca')
        .order('data_referencia', { ascending: false })
        .limit(20000),
    ]);
    
    setColaboradores(colabsData as Colaborador[] || []);
    setRegistros(presData as Presenca[] || []);
    setLoading(false);
  }
  
  async function carregarUltimaImportacao() {
    const { data } = await supabase
      .from('presenca')
      .select('criado_em')
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

  // ============================================
  // PROCESSA STATS POR COLAB (mês selecionado)
  // ============================================
  
  type ColabStats = {
    colab: Colaborador;
    presencas: number;
    faltas: number;
    atestados: number;
    bhPlan: number;
    bhNaoPlan: number;
    outrosJustif: number;
    descansos: number;
    pctAbs: number;
    registrosMes: Presenca[];
  };
  
  const colabsComStats = useMemo<ColabStats[]>(() => {
    const [ano, mes] = filtroMes.split('-');
    const inicio = `${ano}-${mes}-01`;
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
    const fim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
    
    return colaboradores.map(c => {
      const regs = registros.filter(r => 
        r.id_groot === c.id_groot &&
        r.data_referencia >= inicio &&
        r.data_referencia <= fim &&
        r.status !== 'descartado'
      );
      
      let presencas = 0, faltas = 0, atestados = 0;
      let bhPlan = 0, bhNaoPlan = 0, outrosJustif = 0, descansos = 0;
      
      regs.forEach(r => {
        const m = (r.motivo || '').toLowerCase();
        const cat = (r.categoria || '').toLowerCase();
        
        if (r.status === 'presente' || cat === 'p') presencas++;
        else if (m.includes('atestado')) atestados++;
        else if (cat === 'fi' || m.includes('falta injust')) faltas++;
        else if (m.includes('banco de horas n')) bhNaoPlan++;
        else if (m.includes('banco de horas plan')) bhPlan++;
        else if (r.status === 'descanso' || m.includes('dsr')) descansos++;
        else if (r.status === 'justificado') outrosJustif++;
      });
      
      const totalContab = presencas + faltas + atestados + bhPlan + bhNaoPlan + outrosJustif;
      const ausencias = faltas + bhNaoPlan;
      const pctAbs = totalContab > 0 ? (ausencias / totalContab) * 100 : 0;
      
      return {
        colab: c,
        presencas, faltas, atestados, bhPlan, bhNaoPlan, outrosJustif, descansos,
        pctAbs: Number(pctAbs.toFixed(1)),
        registrosMes: regs,
      };
    });
  }, [colaboradores, registros, filtroMes]);
  
  // Aplica filtros
  const colabsFiltrados = colabsComStats.filter(cs => {
    if (filtroBusca) {
      const busca = filtroBusca.toLowerCase();
      if (!cs.colab.nome.toLowerCase().includes(busca) && !cs.colab.id_groot.toLowerCase().includes(busca)) {
        return false;
      }
    }
    if (filtroProcesso !== 'todos' && cs.colab.processo !== filtroProcesso) return false;
    if (filtroABS === 'altos' && cs.pctAbs < 10) return false;
    return true;
  });
  
  // Lista de processos únicos
  const processos = Array.from(new Set(colaboradores.map(c => c.processo).filter(Boolean))) as string[];
  
  // Stats gerais
  const statsGerais = {
    total: colabsFiltrados.length,
    abs: colabsFiltrados.length > 0 
      ? (colabsFiltrados.reduce((s, c) => s + c.pctAbs, 0) / colabsFiltrados.length).toFixed(1)
      : '0',
    totalFaltas: colabsFiltrados.reduce((s, c) => s + c.faltas, 0),
    totalAtestados: colabsFiltrados.reduce((s, c) => s + c.atestados, 0),
    altosAbs: colabsFiltrados.filter(c => c.pctAbs > 10).length,
  };
  
  // Lista de meses pra filtro
  const mesesDisponiveis: { value: string; label: string }[] = [];
  const hoje = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MESES_NOMES[d.getMonth()]}/${d.getFullYear()}`;
    mesesDisponiveis.push({ value: v, label });
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            📋 Lista de <span className="text-[#FFD700]">Presença</span>
          </h1>
          <p className="text-gray-400">
            Dashboard automático · Importação CSV do MELI
          </p>
        </div>

        <Link
          href="/presenca/importar"
          className="bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-purple-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2"
        >
          <span className="text-xl">📥</span>
          <div className="text-left">
            <p className="text-sm">Importar do MELI</p>
            <p className="text-[10px] opacity-80">CSV de presença</p>
          </div>
        </Link>
      </div>

      {/* Banner última importação */}
      {ultimaImportacao && (
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-2xl">📅</span>
          <div className="flex-1 min-w-0">
            <p className="text-purple-300 font-bold text-sm">
              Última importação · {ultimaImportacao.total} registros
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

      {/* Sem dados */}
      {!loading && registros.length === 0 && (
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-2 border-dashed border-blue-500/30 rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-3">📥</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Nenhum dado de presença ainda
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Importe o CSV do MELI pra começar a acompanhar
          </p>
          <Link
            href="/presenca/importar"
            className="inline-block bg-gradient-to-br from-purple-500 to-pink-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-500/30"
          >
            📥 Importar primeiro CSV
          </Link>
        </div>
      )}

      {/* Stats gerais */}
      {registros.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <span className="text-2xl block mb-1">👥</span>
            <p className="text-2xl font-black text-white">{statsGerais.total}</p>
            <p className="text-xs text-gray-400">Colabs ativos</p>
          </div>
          <div className={`bg-gradient-to-br border rounded-2xl p-4 ${
            Number(statsGerais.abs) < 5 ? 'from-green-500/10 to-emerald-600/5 border-green-500/30' :
            Number(statsGerais.abs) < 10 ? 'from-yellow-500/10 to-amber-600/5 border-yellow-500/30' :
            'from-red-500/10 to-rose-600/5 border-red-500/30'
          }`}>
            <span className="text-2xl block mb-1">
              {Number(statsGerais.abs) < 5 ? '✅' : Number(statsGerais.abs) < 10 ? '🟡' : '🔴'}
            </span>
            <p className={`text-2xl font-black ${
              Number(statsGerais.abs) < 5 ? 'text-green-400' :
              Number(statsGerais.abs) < 10 ? 'text-yellow-400' :
              'text-red-400'
            }`}>{statsGerais.abs}%</p>
            <p className="text-xs text-gray-400">ABS médio</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">🔴</span>
            <p className="text-2xl font-black text-red-400">{statsGerais.totalFaltas}</p>
            <p className="text-xs text-red-300">Faltas no mês</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">🩺</span>
            <p className="text-2xl font-black text-blue-400">{statsGerais.totalAtestados}</p>
            <p className="text-xs text-blue-300">Atestados</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">⚠️</span>
            <p className="text-2xl font-black text-orange-400">{statsGerais.altosAbs}</p>
            <p className="text-xs text-orange-300">ABS &gt; 10%</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {registros.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mês */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold">📅</span>
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-3 py-2 text-white text-sm outline-none"
              >
                {mesesDisponiveis.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            
            {/* Processo */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold">🏷️</span>
              <select
                value={filtroProcesso}
                onChange={(e) => setFiltroProcesso(e.target.value)}
                className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-3 py-2 text-white text-sm outline-none"
              >
                <option value="todos">Todos processos</option>
                {processos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            
            {/* Filtro ABS alto */}
            <button
              onClick={() => setFiltroABS(filtroABS === 'altos' ? 'todos' : 'altos')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                filtroABS === 'altos'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'bg-[#0a0a0a] text-gray-400 border border-[#2a2a2a]'
              }`}
            >
              ⚠️ Só ABS &gt; 10%
            </button>
            
            {/* Busca */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="🔎 Buscar colab..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded-lg px-4 py-2 text-white text-sm outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <span className="text-6xl block mb-4 animate-pulse">⏳</span>
          <p className="text-gray-400">Carregando...</p>
        </div>
      ) : registros.length === 0 ? null : colabsFiltrados.length === 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">🔍</span>
          <p className="text-gray-400">Nenhum colab com esses filtros</p>
        </div>
      ) : (
        <div className="space-y-3">
          {colabsFiltrados.map(cs => (
            <CardColabDashboard
              key={cs.colab.id_groot}
              stats={cs}
              mes={filtroMes}
              onClick={() => setColabAberto(cs.colab)}
            />
          ))}
        </div>
      )}

      {/* Modal detalhe */}
      {colabAberto && (
        <ModalDetalheColab
          colab={colabAberto}
          registros={registros.filter(r => r.id_groot === colabAberto.id_groot)}
          onClose={() => setColabAberto(null)}
        />
      )}
    </div>
  );
}

// ============================================
// CARD COLAB COM CALENDÁRIO
// ============================================

function CardColabDashboard({ 
  stats, mes, onClick
}: { 
  stats: any;
  mes: string;
  onClick: () => void;
}) {
  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const primeiroDiaSemana = new Date(ano, mesNum - 1, 1).getDay(); // 0=Dom
  
  // Mapa de registros por dia
  const regsPorDia: Record<number, any> = {};
  stats.registrosMes.forEach((r: any) => {
    const dia = Number(r.data_referencia.split('-')[2]);
    regsPorDia[dia] = r;
  });
  
  const corABS = stats.pctAbs > 10 ? 'red' : stats.pctAbs > 5 ? 'yellow' : 'green';
  const mesesEmpresa = calcularMesesNaEmpresa(stats.colab.data_admissao);
  
  return (
    <div 
      className={`bg-gradient-to-br border rounded-2xl p-5 hover:-translate-y-0.5 hover:shadow-xl transition-all cursor-pointer ${
        corABS === 'red' ? 'from-red-500/5 to-rose-500/5 border-red-500/30 hover:border-red-500/50' :
        corABS === 'yellow' ? 'from-yellow-500/5 to-amber-500/5 border-yellow-500/30 hover:border-yellow-500/50' :
        'from-[#1a1a1a] to-[#141414] border-[#2a2a2a] hover:border-[#3a3a3a]'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${
            corABS === 'red' ? 'bg-red-500/30 text-red-200' :
            corABS === 'yellow' ? 'bg-yellow-500/30 text-yellow-200' :
            'bg-cyan-500/30 text-cyan-200'
          }`}>
            {stats.colab.nome.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold truncate">{stats.colab.nome}</p>
            <p className="text-xs text-gray-500">
              {stats.colab.processo} · ID {stats.colab.id_groot}
              {stats.colab.data_admissao && ` · ${mesesEmpresa}m na empresa`}
            </p>
          </div>
        </div>
        
        {/* Stats compactas */}
        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <p className="text-green-400 font-bold">{stats.presencas}</p>
            <p className="text-[10px] text-gray-500">Pres.</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 font-bold">{stats.faltas}</p>
            <p className="text-[10px] text-gray-500">Falt.</p>
          </div>
          <div className="text-center">
            <p className="text-blue-400 font-bold">{stats.atestados}</p>
            <p className="text-[10px] text-gray-500">Atest.</p>
          </div>
          <div className="text-center">
            <p className="text-orange-400 font-bold">{stats.bhNaoPlan}</p>
            <p className="text-[10px] text-gray-500">BH n/p</p>
          </div>
          <div className="text-center">
            <span className={`text-base font-black px-3 py-1 rounded-full ${
              corABS === 'red' ? 'bg-red-500/20 text-red-300' :
              corABS === 'yellow' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-green-500/20 text-green-300'
            }`}>
              {stats.pctAbs}%
            </span>
            <p className="text-[10px] text-gray-500 mt-1">ABS</p>
          </div>
        </div>
      </div>
      
      {/* Calendário */}
      <div className="grid grid-cols-7 gap-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] text-gray-500 text-center font-bold pb-1">
            {d}
          </div>
        ))}
        
        {Array.from({ length: primeiroDiaSemana }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        
        {Array.from({ length: diasNoMes }).map((_, i) => {
          const dia = i + 1;
          const reg = regsPorDia[dia];
          const info = reg ? corDoStatus(reg.motivo, reg.status) : { cor: 'bg-gray-800/40', emoji: '·', label: 'Sem dado' };
          
          return (
            <div
              key={dia}
              title={`${dia}/${mesNum}: ${info.label}`}
              className={`aspect-square rounded ${info.cor} flex items-center justify-center text-[10px] font-bold text-white relative hover:scale-110 transition-transform`}
            >
              {dia}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// MODAL DE DETALHE
// ============================================

function ModalDetalheColab({ 
  colab, registros, onClose 
}: { 
  colab: Colaborador; 
  registros: Presenca[]; 
  onClose: () => void;
}) {
  const ordenados = [...registros].sort((a, b) => b.data_referencia.localeCompare(a.data_referencia));
  
  const stats = {
    total: ordenados.filter(r => r.status !== 'descartado').length,
    presencas: ordenados.filter(r => r.status === 'presente').length,
    faltas: ordenados.filter(r => (r.motivo || '').toLowerCase().includes('fi - falta')).length,
    atestados: ordenados.filter(r => (r.motivo || '').toLowerCase().includes('atestado')).length,
  };
  
  return (
    <div 
      className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-[#FFD700]/30 rounded-t-3xl md:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-b border-[#2a2a2a] p-5 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-white">{colab.nome}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {colab.processo} · ID {colab.id_groot}
              {colab.data_admissao && ` · Admissão: ${formatarDataBR(colab.data_admissao)}`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center">
            ×
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          {/* Stats gerais */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-white">{stats.total}</p>
              <p className="text-[10px] text-gray-500">Total dias</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-green-400">{stats.presencas}</p>
              <p className="text-[10px] text-green-300">Presenças</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-400">{stats.faltas}</p>
              <p className="text-[10px] text-red-300">Faltas</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-blue-400">{stats.atestados}</p>
              <p className="text-[10px] text-blue-300">Atestados</p>
            </div>
          </div>

          {/* Link pro perfil completo */}
          <Link
            href={`/meu-time/${colab.id}`}
            className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-center text-sm text-blue-300 font-bold transition-all"
          >
            👤 Ver perfil completo →
          </Link>
          
          {/* Lista dos últimos dias */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">📅 Últimos 30 dias</p>
            <div className="space-y-1 max-h-96 overflow-y-auto pr-2">
              {ordenados.slice(0, 30).map(r => {
                const info = corDoStatus(r.motivo, r.status);
                return (
                  <div 
                    key={r.id}
                    className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-2 flex items-center gap-3 text-sm"
                  >
                    <div className={`w-2 h-2 rounded-full ${info.cor}`} />
                    <span className="text-gray-400 font-mono text-xs">
                      {formatarDataBR(r.data_referencia)}
                    </span>
                    <span className="flex-1 text-white text-xs">
                      {info.emoji} {info.label}
                    </span>
                    {r.conta_abs && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-bold">
                        ABS
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

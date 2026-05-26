'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// ============================================
// 📋 LISTA DE PRESENÇA - HISTÓRICO BÁSICO
// Sem enfeites, só dados
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
};

function classificarStatus(motivo: string | null): string {
  if (!motivo) return 'outro';
  const m = motivo.toLowerCase();
  if (m.includes('p - presente')) return 'presente';
  if (m.includes('dsr - escala')) return 'descanso';
  if (m.includes('fi - falta')) return 'falta';
  if (m.includes('atestado')) return 'atestado';
  if (m.includes('bh - banco de horas n')) return 'bh_n_plan';
  if (m.includes('bh - banco de horas plan')) return 'bh_plan';
  if (m.includes('sinergia')) return 'sinergia';
  if (m.includes('abandono')) return 'falta';
  return 'outro';
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function PresencaPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Presenca[]>([]);
  const [loading, setLoading] = useState(true);
  
  const hoje = new Date();
  const [filtroMes, setFiltroMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [filtroProcesso, setFiltroProcesso] = useState('todos');
  const [filtroBusca, setFiltroBusca] = useState('');
  
  const [colabAberto, setColabAberto] = useState<Colaborador | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: colabsData }, { data: presData }] = await Promise.all([
      supabase
        .from('colaboradores')
        .select('id, id_groot, nome, processo, status')
        .eq('status', 'Ativo')
        .order('nome'),
      supabase
        .from('presenca')
        .select('*')
        .order('data_referencia', { ascending: false })
        .limit(20000),
    ]);
    setColaboradores(colabsData as Colaborador[] || []);
    setRegistros(presData as Presenca[] || []);
    setLoading(false);
  }
  
  // Stats por colab no mês selecionado
  type Stats = {
    colab: Colaborador;
    presencas: number;
    faltas: number;
    atestados: number;
    bhPlan: number;
    bhNaoPlan: number;
    sinergia: number;
    descansos: number;
    outros: number;
    pctAbs: number;
  };
  
  const statsPorColab = useMemo<Stats[]>(() => {
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
      let bhPlan = 0, bhNaoPlan = 0, sinergia = 0, descansos = 0, outros = 0;
      
      regs.forEach(r => {
        const cat = classificarStatus(r.motivo);
        if (cat === 'presente') presencas++;
        else if (cat === 'falta') faltas++;
        else if (cat === 'atestado') atestados++;
        else if (cat === 'bh_plan') bhPlan++;
        else if (cat === 'bh_n_plan') bhNaoPlan++;
        else if (cat === 'sinergia') sinergia++;
        else if (cat === 'descanso') descansos++;
        else outros++;
      });
      
      const totalContab = presencas + faltas + atestados + bhPlan + bhNaoPlan + sinergia + outros;
      const ausencias = faltas + bhNaoPlan;
      const pctAbs = totalContab > 0 ? Number(((ausencias / totalContab) * 100).toFixed(1)) : 0;
      
      return {
        colab: c, presencas, faltas, atestados, bhPlan, bhNaoPlan, 
        sinergia, descansos, outros, pctAbs,
      };
    });
  }, [colaboradores, registros, filtroMes]);
  
  // Aplica filtros
  const statsFiltrados = statsPorColab.filter(s => {
    if (filtroProcesso !== 'todos' && s.colab.processo !== filtroProcesso) return false;
    if (filtroBusca) {
      const busca = filtroBusca.toLowerCase();
      if (!s.colab.nome.toLowerCase().includes(busca) && !s.colab.id_groot.toLowerCase().includes(busca)) {
        return false;
      }
    }
    return true;
  });
  
  const processos = Array.from(new Set(colaboradores.map(c => c.processo).filter(Boolean))) as string[];
  
  // Stats agregados
  const totalGeral = {
    colabs: statsFiltrados.length,
    presencas: statsFiltrados.reduce((s, c) => s + c.presencas, 0),
    faltas: statsFiltrados.reduce((s, c) => s + c.faltas, 0),
    atestados: statsFiltrados.reduce((s, c) => s + c.atestados, 0),
    absMedio: statsFiltrados.length > 0 
      ? (statsFiltrados.reduce((s, c) => s + c.pctAbs, 0) / statsFiltrados.length).toFixed(1)
      : '0',
  };
  
  // Lista de meses pra filtro
  const mesesDisponiveis: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MESES[d.getMonth()]}/${d.getFullYear()}`;
    mesesDisponiveis.push({ value: v, label });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            📋 Lista de <span className="text-[#FFD700]">Presença</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Histórico do time importado do MELI
          </p>
        </div>
        <Link
          href="/presenca/importar"
          className="bg-[#FFD700] hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-lg transition-all text-sm"
        >
          📥 Importar CSV
        </Link>
      </div>
      
      {/* Sem dados */}
      {!loading && registros.length === 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-12 text-center">
          <p className="text-gray-400 mb-4">Nenhum dado de presença importado</p>
          <Link
            href="/presenca/importar"
            className="inline-block bg-[#FFD700] text-black font-bold px-6 py-2 rounded-lg text-sm"
          >
            Importar primeiro CSV
          </Link>
        </div>
      )}

      {/* Stats em linha simples */}
      {registros.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex items-center gap-6 flex-wrap text-sm">
          <div>
            <span className="text-gray-400">Colabs:</span>{' '}
            <span className="text-white font-bold">{totalGeral.colabs}</span>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <span className="text-gray-400">Presenças:</span>{' '}
            <span className="text-green-400 font-bold">{totalGeral.presencas}</span>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <span className="text-gray-400">Faltas:</span>{' '}
            <span className="text-red-400 font-bold">{totalGeral.faltas}</span>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <span className="text-gray-400">Atestados:</span>{' '}
            <span className="text-blue-400 font-bold">{totalGeral.atestados}</span>
          </div>
          <div className="text-gray-700">·</div>
          <div>
            <span className="text-gray-400">ABS médio:</span>{' '}
            <span className={`font-bold ${
              Number(totalGeral.absMedio) < 5 ? 'text-green-400' :
              Number(totalGeral.absMedio) < 10 ? 'text-yellow-400' :
              'text-red-400'
            }`}>{totalGeral.absMedio}%</span>
          </div>
        </div>
      )}

      {/* Filtros */}
      {registros.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 flex items-center gap-3 flex-wrap">
          <select
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded px-3 py-2 text-white text-sm outline-none"
          >
            {mesesDisponiveis.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          
          <select
            value={filtroProcesso}
            onChange={(e) => setFiltroProcesso(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded px-3 py-2 text-white text-sm outline-none"
          >
            <option value="todos">Todos processos</option>
            {processos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          
          <input
            type="text"
            placeholder="Buscar colaborador..."
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            className="flex-1 min-w-[200px] bg-[#0a0a0a] border border-[#2a2a2a] focus:border-[#FFD700] rounded px-3 py-2 text-white text-sm outline-none"
          />
        </div>
      )}

      {/* Tabela básica */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : registros.length > 0 && statsFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum colaborador com esses filtros</div>
      ) : registros.length > 0 ? (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#0a0a0a]">
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Processo</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Pres</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Falt</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Atest</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">BH n/p</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Sin</th>
                  <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-3 pr-4">ABS %</th>
                </tr>
              </thead>
              <tbody>
                {statsFiltrados.map((s) => (
                  <tr 
                    key={s.colab.id_groot}
                    onClick={() => setColabAberto(s.colab)}
                    className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-white font-medium">{s.colab.nome}</td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{s.colab.processo || '-'}</td>
                    <td className="px-3 py-3 text-right text-green-400 font-mono">{s.presencas}</td>
                    <td className="px-3 py-3 text-right text-red-400 font-mono">{s.faltas || '-'}</td>
                    <td className="px-3 py-3 text-right text-blue-400 font-mono">{s.atestados || '-'}</td>
                    <td className="px-3 py-3 text-right text-orange-400 font-mono">{s.bhNaoPlan || '-'}</td>
                    <td className="px-3 py-3 text-right text-purple-400 font-mono">{s.sinergia || '-'}</td>
                    <td className={`px-3 py-3 pr-4 text-right font-mono font-bold ${
                      s.pctAbs < 5 ? 'text-green-400' :
                      s.pctAbs < 10 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>{s.pctAbs}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Modal detalhe */}
      {colabAberto && (
        <ModalDetalhe
          colab={colabAberto}
          registros={registros.filter(r => r.id_groot === colabAberto.id_groot)}
          mes={filtroMes}
          onClose={() => setColabAberto(null)}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL SIMPLES - lista dos dias do mês
// ============================================

function ModalDetalhe({
  colab, registros, mes, onClose
}: {
  colab: Colaborador;
  registros: Presenca[];
  mes: string;
  onClose: () => void;
}) {
  const [ano, mesNum] = mes.split('-');
  const inicio = `${ano}-${mesNum}-01`;
  const ultimoDia = new Date(Number(ano), Number(mesNum), 0).getDate();
  const fim = `${ano}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`;
  
  const regsMes = registros
    .filter(r => r.data_referencia >= inicio && r.data_referencia <= fim && r.status !== 'descartado')
    .sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));
  
  function formatarData(iso: string): string {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }
  
  return (
    <div 
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg max-w-xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#1a1a1a] border-b border-[#2a2a2a] p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{colab.nome}</h2>
            <p className="text-xs text-gray-500">{colab.processo} · ID {colab.id_groot}</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>
        
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                <th className="py-2 pr-2">Data</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 text-right">ABS</th>
              </tr>
            </thead>
            <tbody>
              {regsMes.map(r => {
                const cat = classificarStatus(r.motivo);
                const corCat = 
                  cat === 'presente' ? 'text-green-400' :
                  cat === 'falta' ? 'text-red-400' :
                  cat === 'atestado' ? 'text-blue-400' :
                  cat === 'bh_n_plan' ? 'text-orange-400' :
                  cat === 'sinergia' ? 'text-purple-400' :
                  'text-gray-400';
                
                return (
                  <tr key={r.id} className="border-b border-[#2a2a2a]">
                    <td className="py-2 pr-2 text-gray-300 font-mono">{formatarData(r.data_referencia)}</td>
                    <td className={`py-2 pr-2 ${corCat}`}>{r.motivo || '-'}</td>
                    <td className="py-2 text-right">
                      {r.conta_abs && <span className="text-red-400 text-xs">ABS</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

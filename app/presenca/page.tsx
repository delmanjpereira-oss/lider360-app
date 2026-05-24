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
// CATEGORIZAÇÃO DE STATUS
// ============================================

type TipoDia = 'presente' | 'falta' | 'atestado' | 'bh_plan' | 'bh_n_plan' | 'sinergia' | 'descanso' | 'outro';

function classificarStatus(motivo: string | null, status: string): TipoDia {
  if (!motivo) {
    if (status === 'presente') return 'presente';
    if (status === 'falta') return 'falta';
    if (status === 'descanso') return 'descanso';
    return 'outro';
  }
  
  const m = motivo.toLowerCase();
  
  if (m.includes('p - presente') || status === 'presente') return 'presente';
  if (m.includes('dsr - escala')) return 'descanso';
  if (m.includes('fi - falta')) return 'falta';
  if (m.includes('atestado')) return 'atestado';
  if (m.includes('bh - banco de horas n')) return 'bh_n_plan';
  if (m.includes('bh - banco de horas plan')) return 'bh_plan';
  if (m.includes('sinergia')) return 'sinergia';
  if (m.includes('falecimento')) return 'outro';
  if (m.includes('férias') || m.includes('ferias')) return 'outro';
  if (m.includes('curso') || m.includes('treinamento')) return 'outro';
  if (m.includes('abandono')) return 'falta';
  if (m.includes('afastamento')) return 'outro';
  
  return 'outro';
}

const CORES_TIPO: Record<TipoDia, { bg: string; border: string; text: string; emoji: string; label: string }> = {
  presente:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-300',  emoji: '✅', label: 'Presente' },
  falta:     { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-300',    emoji: '🔴', label: 'Falta' },
  atestado:  { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-300',   emoji: '🩺', label: 'Atestado' },
  bh_plan:   { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-300', emoji: '🟡', label: 'BH plan.' },
  bh_n_plan: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', emoji: '🟠', label: 'BH não plan.' },
  sinergia:  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', emoji: '🤝', label: 'Sinergia' },
  descanso:  { bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   text: 'text-gray-400',   emoji: '🟦', label: 'Descanso' },
  outro:     { bg: 'bg-gray-700/10',   border: 'border-gray-700/30',   text: 'text-gray-400',   emoji: '·',  label: 'Outro' },
};

// ============================================
// HELPERS
// ============================================

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarDataLonga(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function PresencaPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Presenca[]>([]);
  const [loading, setLoading] = useState(true);
  
  const hoje = new Date();
  const [anoMes, setAnoMes] = useState({
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
  });
  
  // Modal do dia
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  
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
        .select('*')
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
      setUltimaImportacao({ data: data[0].criado_em, total: count || 0 });
    }
  }

  // ============================================
  // AGRUPA REGISTROS POR DIA
  // ============================================
  
  type ResumoDia = {
    data: string;
    presentes: number;
    faltas: number;
    atestados: number;
    bhPlan: number;
    bhNaoPlan: number;
    sinergia: number;
    descansos: number;
    outros: number;
    total: number;
    pctAbs: number;
  };
  
  const resumosPorDia = useMemo<Record<string, ResumoDia>>(() => {
    const inicio = `${anoMes.ano}-${String(anoMes.mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(anoMes.ano, anoMes.mes, 0).getDate();
    const fim = `${anoMes.ano}-${String(anoMes.mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    
    const regsDoMes = registros.filter(r => 
      r.data_referencia >= inicio && 
      r.data_referencia <= fim &&
      r.status !== 'descartado'
    );
    
    const resumo: Record<string, ResumoDia> = {};
    
    regsDoMes.forEach(r => {
      const data = r.data_referencia;
      if (!resumo[data]) {
        resumo[data] = {
          data, presentes: 0, faltas: 0, atestados: 0,
          bhPlan: 0, bhNaoPlan: 0, sinergia: 0, descansos: 0, outros: 0,
          total: 0, pctAbs: 0,
        };
      }
      
      const tipo = classificarStatus(r.motivo, r.status);
      
      if (tipo === 'presente') resumo[data].presentes++;
      else if (tipo === 'falta') resumo[data].faltas++;
      else if (tipo === 'atestado') resumo[data].atestados++;
      else if (tipo === 'bh_plan') resumo[data].bhPlan++;
      else if (tipo === 'bh_n_plan') resumo[data].bhNaoPlan++;
      else if (tipo === 'sinergia') resumo[data].sinergia++;
      else if (tipo === 'descanso') resumo[data].descansos++;
      else resumo[data].outros++;
      
      resumo[data].total++;
    });
    
    // Calcula ABS por dia (faltas + BH não plan / total - descansos)
    Object.keys(resumo).forEach(d => {
      const r = resumo[d];
      const contabilizado = r.presentes + r.faltas + r.atestados + r.bhPlan + r.bhNaoPlan + r.sinergia + r.outros;
      const ausencias = r.faltas + r.bhNaoPlan;
      r.pctAbs = contabilizado > 0 ? Number(((ausencias / contabilizado) * 100).toFixed(1)) : 0;
    });
    
    return resumo;
  }, [registros, anoMes]);
  
  // Stats agregadas do mês
  const statsMes = useMemo(() => {
    const dias = Object.values(resumosPorDia);
    return {
      diasComDados: dias.length,
      totalPresencas: dias.reduce((s, d) => s + d.presentes, 0),
      totalFaltas: dias.reduce((s, d) => s + d.faltas, 0),
      totalAtestados: dias.reduce((s, d) => s + d.atestados, 0),
      totalBHNaoPlan: dias.reduce((s, d) => s + d.bhNaoPlan, 0),
      absMedio: dias.length > 0 
        ? Number((dias.reduce((s, d) => s + d.pctAbs, 0) / dias.length).toFixed(1))
        : 0,
    };
  }, [resumosPorDia]);
  
  // ============================================
  // CONSTRÓI CALENDÁRIO DO MÊS
  // ============================================
  
  const diasNoMes = new Date(anoMes.ano, anoMes.mes, 0).getDate();
  const primeiroDiaSemana = new Date(anoMes.ano, anoMes.mes - 1, 1).getDay();
  
  function navegarMes(delta: number) {
    let novoMes = anoMes.mes + delta;
    let novoAno = anoMes.ano;
    if (novoMes < 1) { novoMes = 12; novoAno--; }
    if (novoMes > 12) { novoMes = 1; novoAno++; }
    setAnoMes({ ano: novoAno, mes: novoMes });
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
            Calendário mensal · Click no dia pra ver detalhes
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
          <Link href="/presenca/importar" className="text-purple-300 hover:text-purple-200 text-xs font-bold underline">
            🔄 Importar nova
          </Link>
        </div>
      )}

      {/* Sem dados */}
      {!loading && registros.length === 0 && (
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-2 border-dashed border-blue-500/30 rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-3">📥</span>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum dado de presença ainda</h3>
          <p className="text-gray-400 text-sm mb-4">Importe o CSV do MELI pra começar</p>
          <Link
            href="/presenca/importar"
            className="inline-block bg-gradient-to-br from-purple-500 to-pink-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-purple-500/30"
          >
            📥 Importar primeiro CSV
          </Link>
        </div>
      )}

      {/* Stats do mês */}
      {registros.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <span className="text-2xl block mb-1">📅</span>
            <p className="text-2xl font-black text-white">{statsMes.diasComDados}</p>
            <p className="text-xs text-gray-400">Dias c/ dados</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">✅</span>
            <p className="text-2xl font-black text-green-400">{statsMes.totalPresencas}</p>
            <p className="text-xs text-green-300">Presenças</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">🔴</span>
            <p className="text-2xl font-black text-red-400">{statsMes.totalFaltas}</p>
            <p className="text-xs text-red-300">Faltas</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
            <span className="text-2xl block mb-1">🩺</span>
            <p className="text-2xl font-black text-blue-400">{statsMes.totalAtestados}</p>
            <p className="text-xs text-blue-300">Atestados</p>
          </div>
          <div className={`border rounded-2xl p-4 ${
            statsMes.absMedio < 5 ? 'bg-green-500/10 border-green-500/30' :
            statsMes.absMedio < 10 ? 'bg-yellow-500/10 border-yellow-500/30' :
            'bg-red-500/10 border-red-500/30'
          }`}>
            <span className="text-2xl block mb-1">
              {statsMes.absMedio < 5 ? '✅' : statsMes.absMedio < 10 ? '🟡' : '🔴'}
            </span>
            <p className={`text-2xl font-black ${
              statsMes.absMedio < 5 ? 'text-green-400' :
              statsMes.absMedio < 10 ? 'text-yellow-400' :
              'text-red-400'
            }`}>{statsMes.absMedio}%</p>
            <p className="text-xs text-gray-400">ABS médio</p>
          </div>
        </div>
      )}

      {/* CALENDÁRIO GIGANTE */}
      {registros.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-3xl p-6">
          {/* Navegação do mês */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navegarMes(-1)}
              className="w-12 h-12 rounded-xl bg-[#0a0a0a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold text-xl transition-all hover:-translate-x-0.5"
            >
              ←
            </button>
            <div className="text-center">
              <h2 className="text-2xl font-black text-white">
                {MESES_NOMES[anoMes.mes - 1]}
              </h2>
              <p className="text-sm text-gray-400 font-bold">{anoMes.ano}</p>
            </div>
            <button
              onClick={() => navegarMes(1)}
              className="w-12 h-12 rounded-xl bg-[#0a0a0a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold text-xl transition-all hover:translate-x-0.5"
            >
              →
            </button>
          </div>

          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-500 py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Grade do calendário */}
          <div className="grid grid-cols-7 gap-2">
            {/* Espaços vazios antes do dia 1 */}
            {Array.from({ length: primeiroDiaSemana }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Dias do mês */}
            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = i + 1;
              const dataISO = `${anoMes.ano}-${String(anoMes.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
              const resumo = resumosPorDia[dataISO];
              const dataObj = new Date(anoMes.ano, anoMes.mes - 1, dia);
              const ehFimDeSemana = dataObj.getDay() === 0 || dataObj.getDay() === 6;
              const ehHoje = dataISO === hoje.toISOString().split('T')[0];
              
              const temAusencias = resumo && (resumo.faltas > 0 || resumo.bhNaoPlan > 0 || resumo.atestados > 0);
              const corBorda = !resumo ? 'border-[#2a2a2a]' 
                             : resumo.pctAbs > 10 ? 'border-red-500/40'
                             : resumo.pctAbs > 5 ? 'border-yellow-500/40'
                             : 'border-green-500/30';
              
              return (
                <button
                  key={dia}
                  onClick={() => resumo && setDiaAberto(dataISO)}
                  disabled={!resumo}
                  className={`group min-h-[110px] p-2 rounded-xl border-2 transition-all text-left ${corBorda} ${
                    ehFimDeSemana ? 'bg-[#0a0a0a]/50' : 'bg-[#0a0a0a]'
                  } ${
                    ehHoje ? 'ring-2 ring-[#FFD700]/60' : ''
                  } ${
                    resumo ? 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer' : 'opacity-40 cursor-default'
                  }`}
                >
                  {/* Número do dia */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-lg font-black ${
                      ehHoje ? 'text-[#FFD700]' : 'text-white'
                    }`}>
                      {dia}
                    </span>
                    {resumo && resumo.pctAbs > 0 && (
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                        resumo.pctAbs > 10 ? 'bg-red-500/20 text-red-300' :
                        resumo.pctAbs > 5 ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {resumo.pctAbs}%
                      </span>
                    )}
                  </div>

                  {/* Ausências/eventos do dia */}
                  {resumo && (
                    <div className="space-y-1">
                      {resumo.faltas > 0 && (
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-red-400 font-bold">🔴 {resumo.faltas}</span>
                          <span className="text-gray-500 text-[9px]">falta{resumo.faltas > 1 ? 's' : ''}</span>
                        </div>
                      )}
                      {resumo.atestados > 0 && (
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-blue-400 font-bold">🩺 {resumo.atestados}</span>
                          <span className="text-gray-500 text-[9px]">atest.</span>
                        </div>
                      )}
                      {resumo.bhNaoPlan > 0 && (
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-orange-400 font-bold">🟠 {resumo.bhNaoPlan}</span>
                          <span className="text-gray-500 text-[9px]">BH n/p</span>
                        </div>
                      )}
                      {!temAusencias && resumo.presentes > 0 && (
                        <div className="text-[10px] text-green-400 font-bold">
                          ✅ {resumo.presentes} pres.
                        </div>
                      )}
                      {resumo.outros > 0 && (
                        <div className="text-[10px] text-gray-400">
                          + {resumo.outros} outros
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Legenda */}
          <div className="mt-6 pt-4 border-t border-[#2a2a2a] flex items-center justify-center gap-4 flex-wrap text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500/40 border border-green-500/60" />
              <span className="text-gray-400">ABS &lt; 5%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500/40 border border-yellow-500/60" />
              <span className="text-gray-400">5-10%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500/60" />
              <span className="text-gray-400">&gt; 10%</span>
            </div>
            <div className="text-gray-500">·</div>
            <span className="text-gray-500">🔴 falta · 🩺 atestado · 🟠 BH n/p</span>
          </div>
        </div>
      )}

      {/* Modal de detalhe do dia */}
      {diaAberto && (
        <ModalDetalheDia
          data={diaAberto}
          registros={registros.filter(r => r.data_referencia === diaAberto && r.status !== 'descartado')}
          colaboradores={colaboradores}
          onClose={() => setDiaAberto(null)}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL DO DIA - LISTA DETALHADA
// ============================================

function ModalDetalheDia({ 
  data, registros, colaboradores, onClose 
}: { 
  data: string; 
  registros: Presenca[]; 
  colaboradores: Colaborador[];
  onClose: () => void;
}) {
  // Agrupa por tipo
  type Grupo = { tipo: TipoDia; items: Presenca[] };
  const grupos: Grupo[] = [
    { tipo: 'falta', items: [] },
    { tipo: 'atestado', items: [] },
    { tipo: 'bh_n_plan', items: [] },
    { tipo: 'bh_plan', items: [] },
    { tipo: 'sinergia', items: [] },
    { tipo: 'outro', items: [] },
    { tipo: 'descanso', items: [] },
    { tipo: 'presente', items: [] },
  ];
  
  registros.forEach(r => {
    const tipo = classificarStatus(r.motivo, r.status);
    const g = grupos.find(g => g.tipo === tipo);
    if (g) g.items.push(r);
  });
  
  function getColab(idGroot: string): Colaborador | null {
    return colaboradores.find(c => c.id_groot === idGroot) || null;
  }

  return (
    <div 
      className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-[#FFD700]/30 rounded-t-3xl md:rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-b border-[#2a2a2a] p-5 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-white capitalize">
              {formatarDataLonga(data)}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {registros.length} registro(s) · {grupos.filter(g => g.items.length > 0).length} categoria(s)
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center">
            ×
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          {grupos.filter(g => g.items.length > 0).map(grupo => {
            const cor = CORES_TIPO[grupo.tipo];
            return (
              <div key={grupo.tipo} className={`${cor.bg} ${cor.border} border rounded-2xl overflow-hidden`}>
                <div className={`px-4 py-3 ${cor.bg} border-b ${cor.border} flex items-center justify-between`}>
                  <h3 className={`font-black ${cor.text} flex items-center gap-2`}>
                    <span className="text-xl">{cor.emoji}</span>
                    {cor.label}
                  </h3>
                  <span className={`text-2xl font-black ${cor.text}`}>{grupo.items.length}</span>
                </div>
                <div className="p-2 space-y-1">
                  {grupo.items.map(r => {
                    const colab = getColab(r.id_groot);
                    return (
                      <div
                        key={r.id}
                        className="bg-[#0a0a0a]/50 rounded-lg p-2.5 flex items-center gap-3 hover:bg-[#0a0a0a] transition-all"
                      >
                        <div className={`w-8 h-8 rounded-lg ${cor.bg} flex items-center justify-center ${cor.text} font-black text-[10px] flex-shrink-0`}>
                          {(r.nome_colab || colab?.nome || r.id_groot).split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">
                            {r.nome_colab || colab?.nome || `ID ${r.id_groot}`}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {r.processo || colab?.processo} · ID {r.id_groot}
                            {r.motivo && ` · ${r.motivo}`}
                          </p>
                        </div>
                        {colab && (
                          <Link
                            href={`/meu-time/${colab.id}`}
                            className="text-xs text-blue-300 hover:text-blue-200 font-bold flex-shrink-0"
                          >
                            ver →
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type Colaborador = {
  id_groot: string;
  nome: string;
};

type LinhaCSV = Record<string, string>;

type Registro = {
  userId: string;
  data: string;
  rep: string;
  teamLeader: string;
  supervisor: string;
  qtdTotes: number;
  ocupacaoPct: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
  idGroot: string | null;
  nomeOficial: string | null;
  vinculado: boolean;
};

type PeriodoInfo = {
  dataInicio: string;
  dataFim: string;
  totalDias: number;
  diasComDados: string[];
  diasFaltando: string[];
  tipo: 'diario' | 'semanal' | 'quinzenal' | 'mensal_parcial' | 'mensal_completo';
  mes: number;
  ano: number;
  trimestre: string;
};

function parseDataBr(s: string): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parsePercent(s: string): number {
  if (!s) return 0;
  const clean = s.replace('%', '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}

function getSemanaIso(dataStr: string): { semana: number; ano: number; mes: number; trimestre: string } {
  const d = new Date(dataStr + 'T12:00:00');
  const mes = d.getMonth() + 1;
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaDaSemana = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  let trimestre = 'Q1';
  if (mes >= 4 && mes <= 6) trimestre = 'Q2';
  else if (mes >= 7 && mes <= 9) trimestre = 'Q3';
  else if (mes >= 10) trimestre = 'Q4';
  return { semana, ano: utc.getUTCFullYear(), mes, trimestre };
}

// 🎯 Analisa o período dos registros
function analisarPeriodo(registros: Registro[]): PeriodoInfo | null {
  if (registros.length === 0) return null;
  
  // Pega todas as datas únicas
  const datasSet = new Set<string>();
  registros.forEach((r) => datasSet.add(r.data));
  const datasOrdenadas = Array.from(datasSet).sort();
  
  if (datasOrdenadas.length === 0) return null;
  
  const dataInicio = datasOrdenadas[0];
  const dataFim = datasOrdenadas[datasOrdenadas.length - 1];
  
  // Calcula range em dias
  const inicioMs = new Date(dataInicio + 'T12:00:00').getTime();
  const fimMs = new Date(dataFim + 'T12:00:00').getTime();
  const totalDiasRange = Math.floor((fimMs - inicioMs) / (1000 * 60 * 60 * 24)) + 1;
  
  // Descobre dias faltando (se algum)
  const diasFaltando: string[] = [];
  const cursor = new Date(inicioMs);
  const fim = new Date(fimMs);
  while (cursor <= fim) {
    const cursorStr = cursor.toISOString().split('T')[0];
    if (!datasSet.has(cursorStr)) {
      diasFaltando.push(cursorStr);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  
  // Determina tipo baseado no total de dias com dados
  const diasComDadosCount = datasOrdenadas.length;
  let tipo: PeriodoInfo['tipo'] = 'diario';
  if (diasComDadosCount === 1) tipo = 'diario';
  else if (diasComDadosCount <= 7) tipo = 'semanal';
  else if (diasComDadosCount <= 15) tipo = 'quinzenal';
  else if (diasComDadosCount < 28) tipo = 'mensal_parcial';
  else tipo = 'mensal_completo';
  
  // Pega mes/ano/trimestre da primeira data
  const info = getSemanaIso(dataInicio);
  
  return {
    dataInicio,
    dataFim,
    totalDias: totalDiasRange,
    diasComDados: datasOrdenadas,
    diasFaltando,
    tipo,
    mes: info.mes,
    ano: info.ano,
    trimestre: info.trimestre,
  };
}

function formatarDataBr(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export default function UploadOcupacaoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregandoCsv, setCarregandoCsv] = useState(false);
  
  // 🆕 Estados de filtro
  const [modoFiltro, setModoFiltro] = useState<'tudo' | 'especifico' | 'range'>('tudo');
  const [dataEspecifica, setDataEspecifica] = useState<string>('');
  const [rangeInicio, setRangeInicio] = useState<string>('');
  const [rangeFim, setRangeFim] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  
  useEffect(() => {
    carregarColaboradores();
  }, []);
  
  async function carregarColaboradores() {
    const { data } = await supabase
      .from('colaboradores')
      .select('id_groot, nome')
      .eq('status', 'Ativo');
    if (data) setColaboradores(data);
  }
  
  function vincular(userId: string): { idGroot: string | null; nomeOficial: string | null } {
    const colab = colaboradores.find((c) => c.id_groot === userId);
    if (colab) return { idGroot: colab.id_groot, nomeOficial: colab.nome };
    return { idGroot: null, nomeOficial: null };
  }
  
  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    
    setNomeArquivo(arq.name);
    setCarregandoCsv(true);
    setErro(null);
    setSucesso(null);
    setModoFiltro('tudo');
    setDataEspecifica('');
    setRangeInicio('');
    setRangeFim('');
    
    Papa.parse<LinhaCSV>(arq, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        const linhas = resultado.data;
        const novos: Registro[] = [];
        
        linhas.forEach((l) => {
          const userId = l['USER_ID']?.trim();
          const dataStr = parseDataBr(l['Data']);
          if (!userId || !dataStr) return;
          
          const rep = l['Rep']?.trim() || '';
          const teamLeader = l['Team Leader']?.trim() || '';
          const supervisor = l['Supervisor']?.trim() || '';
          const qtdTotes = parseInt(l['Qtd Totes']) || 0;
          const ocupacaoPct = parsePercent(l['Ocupação (%)']);
          const { semana, ano, mes, trimestre } = getSemanaIso(dataStr);
          const { idGroot, nomeOficial } = vincular(userId);
          
          novos.push({
            userId,
            data: dataStr,
            rep,
            teamLeader,
            supervisor,
            qtdTotes,
            ocupacaoPct,
            semana,
            ano,
            mes,
            trimestre,
            idGroot,
            nomeOficial,
            vinculado: !!idGroot,
          });
        });
        
        setRegistros(novos);
        setCarregandoCsv(false);
      },
      error: (err) => {
        setCarregandoCsv(false);
        setErro('Erro lendo CSV: ' + err.message);
      },
    });
  }
  
  // 🆕 Analisa período dos registros
  const periodoInfo = analisarPeriodo(registros);
  
  // 🆕 Filtra registros conforme modo escolhido
  const registrosFiltrados = (() => {
    if (modoFiltro === 'tudo') return registros;
    
    if (modoFiltro === 'especifico' && dataEspecifica) {
      return registros.filter((r) => r.data === dataEspecifica);
    }
    
    if (modoFiltro === 'range' && rangeInicio && rangeFim) {
      return registros.filter((r) => r.data >= rangeInicio && r.data <= rangeFim);
    }
    
    return registros;
  })();
  
  async function enviar() {
    if (registrosFiltrados.length === 0) {
      setErro('⚠️ Nenhum registro pra enviar. Ajuste o filtro.');
      return;
    }
    
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    
    try {
      const linhas = registrosFiltrados.map((r) => ({
        user_id: r.userId,
        id_groot: r.idGroot,
        data_referencia: r.data,
        nome_rep: r.rep,
        team_leader: r.teamLeader,
        supervisor: r.supervisor,
        qtd_totes: r.qtdTotes,
        ocupacao_pct: r.ocupacaoPct,
        arquivo_origem: nomeArquivo,
        semana: r.semana,
        ano: r.ano,
        mes: r.mes,
        trimestre: r.trimestre,
        chave_unica: `${r.userId}|${r.data}`,
      }));
      
      const batchSize = 200;
      let totalEnviado = 0;
      
      for (let i = 0; i < linhas.length; i += batchSize) {
        const batch = linhas.slice(i, i + batchSize);
        const { error } = await supabase
          .from('ocupacao_p2m')
          .upsert(batch, { onConflict: 'chave_unica' });
        
        if (error) {
          setErro('Erro salvando: ' + error.message);
          if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast('error', 'Erro: ' + error.message);
          }
          setEnviando(false);
          return;
        }
        totalEnviado += batch.length;
      }
      
      setSucesso(`✅ ${totalEnviado} registros enviados com sucesso!`);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ ${totalEnviado} registros enviados!`);
      }
      
      setTimeout(() => {
        setRegistros([]);
        setNomeArquivo('');
        setModoFiltro('tudo');
        setSucesso(null);
      }, 3000);
    } catch (e: any) {
      setErro('Erro: ' + e.message);
    } finally {
      setEnviando(false);
    }
  }
  
  const vinculados = registrosFiltrados.filter((r) => r.vinculado).length;
  const naoVinculados = registrosFiltrados.filter((r) => !r.vinculado).length;
  
  return (
    <div className="space-y-6">
      <Link href="/meu-time" className="text-gray-400 hover:text-white inline-flex items-center gap-2">
        ← Voltar para MEU TIME
      </Link>
      
      <div>
        <h1 className="text-4xl font-black mb-2">
          🎯 Upload <span className="text-[#FFD700]">Ocupação P2M</span>
        </h1>
        <p className="text-gray-400">Suba o CSV "Totefullness — Visão Gestão P2M"</p>
      </div>
      
      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-bold">{sucesso}</p>
        </div>
      )}
      
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">❌</span>
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}
      
      {/* SELEÇÃO DE ARQUIVO */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#FFD700]/30 rounded-2xl p-8">
        <div className="text-center">
          <span className="text-6xl block mb-3">📊</span>
          <h3 className="text-xl font-bold text-white mb-2">CSV de Ocupação P2M</h3>
          <p className="text-gray-400 text-sm mb-4">
            Formato: USER_ID, Data, Supervisor, Team Leader, Rep, Qtd Totes, Ocupação (%)
          </p>
          <label className="inline-block bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 cursor-pointer transition-colors">
            📂 Escolher arquivo
            <input type="file" accept=".csv" onChange={onArquivoChange} className="hidden" />
          </label>
          {nomeArquivo && <p className="mt-3 text-sm text-gray-300">📄 {nomeArquivo}</p>}
        </div>
      </div>
      
      {carregandoCsv && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-2">⏳</span>
          <p className="text-gray-400">Lendo CSV...</p>
        </div>
      )}
      
      {/* 🆕 CARD DE PERÍODO DETECTADO */}
      {periodoInfo && !carregandoCsv && (
        <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-2 border-purple-500/40 rounded-2xl p-5">
          <h3 className="text-purple-300 font-black text-lg mb-3 flex items-center gap-2">
            📆 Período detectado
          </h3>
          <div className="bg-[#0a0a0a] rounded-xl p-4 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Período</p>
              <p className="text-lg font-mono font-bold text-purple-300">
                {formatarDataBr(periodoInfo.dataInicio)}
              </p>
              <p className="text-xs text-gray-400">
                até {formatarDataBr(periodoInfo.dataFim)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Tipo</p>
              <p className="text-lg font-mono font-bold text-purple-300">
                {periodoInfo.tipo === 'diario' && '📅 Diário'}
                {periodoInfo.tipo === 'semanal' && '📆 Semanal'}
                {periodoInfo.tipo === 'quinzenal' && '🗓️ Quinzenal'}
                {periodoInfo.tipo === 'mensal_parcial' && '🟡 Parcial'}
                {periodoInfo.tipo === 'mensal_completo' && '✅ Mensal'}
              </p>
              <p className="text-xs text-gray-400">
                {periodoInfo.diasComDados.length} {periodoInfo.diasComDados.length === 1 ? 'dia' : 'dias'} com dados
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Trimestre</p>
              <p className="text-lg font-mono font-bold text-purple-300">
                {periodoInfo.trimestre}
              </p>
              <p className="text-xs text-gray-400">
                {periodoInfo.ano}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-bold">Registros</p>
              <p className="text-lg font-mono font-bold text-purple-300">
                {registros.length}
              </p>
              <p className="text-xs text-gray-400">
                total no CSV
              </p>
            </div>
          </div>
          
          {periodoInfo.diasFaltando.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm">
              <p className="text-yellow-300 font-bold mb-1">
                ⚠️ {periodoInfo.diasFaltando.length} dia(s) sem dados no range:
              </p>
              <p className="text-yellow-200/80 text-xs">
                {periodoInfo.diasFaltando.slice(0, 8).map((d) => formatarDataBr(d)).join(', ')}
                {periodoInfo.diasFaltando.length > 8 && ` e mais ${periodoInfo.diasFaltando.length - 8}...`}
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* 🆕 FILTROS OPCIONAIS */}
      {periodoInfo && !carregandoCsv && periodoInfo.diasComDados.length > 1 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-[#FFD700]">🎯 Filtrar antes de salvar (opcional)</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setModoFiltro('tudo')}
              className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                modoFiltro === 'tudo'
                  ? 'bg-green-500/20 border-green-400 text-green-300'
                  : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-green-500/50'
              }`}
            >
              ✅ Salvar TUDO
              <p className="text-xs font-normal opacity-80 mt-1">
                {registros.length} registros
              </p>
            </button>
            
            <button
              onClick={() => setModoFiltro('especifico')}
              className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                modoFiltro === 'especifico'
                  ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                  : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-blue-500/50'
              }`}
            >
              📅 Data específica
              <p className="text-xs font-normal opacity-80 mt-1">Selecionar 1 dia</p>
            </button>
            
            <button
              onClick={() => setModoFiltro('range')}
              className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                modoFiltro === 'range'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                  : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-purple-500/50'
              }`}
            >
              🗓️ Range personalizado
              <p className="text-xs font-normal opacity-80 mt-1">De X até Y</p>
            </button>
          </div>
          
          {modoFiltro === 'especifico' && (
            <div className="bg-[#0a0a0a] border border-blue-500/30 rounded-lg p-3">
              <label className="block text-xs font-bold text-blue-300 mb-2">
                Escolha o dia:
              </label>
              <select
                value={dataEspecifica}
                onChange={(e) => setDataEspecifica(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
              >
                <option value="">— Selecione uma data —</option>
                {periodoInfo.diasComDados.map((d) => {
                  const qtdRegs = registros.filter((r) => r.data === d).length;
                  return (
                    <option key={d} value={d}>
                      {formatarDataBr(d)} ({qtdRegs} registros)
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          
          {modoFiltro === 'range' && (
            <div className="bg-[#0a0a0a] border border-purple-500/30 rounded-lg p-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-purple-300 mb-2">De:</label>
                <input
                  type="date"
                  value={rangeInicio}
                  min={periodoInfo.dataInicio}
                  max={periodoInfo.dataFim}
                  onChange={(e) => setRangeInicio(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-purple-300 mb-2">Até:</label>
                <input
                  type="date"
                  value={rangeFim}
                  min={periodoInfo.dataInicio}
                  max={periodoInfo.dataFim}
                  onChange={(e) => setRangeFim(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
          )}
          
          {modoFiltro !== 'tudo' && registrosFiltrados.length !== registros.length && (
            <div className="text-xs text-gray-400 flex items-center gap-2">
              🔍 Filtro ativo:
              <strong className="text-white">{registrosFiltrados.length}</strong> de <strong>{registros.length}</strong> registros
            </div>
          )}
        </div>
      )}
      
      {/* STATS + PREVIEW */}
      {registros.length > 0 && !carregandoCsv && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <p className="text-3xl font-black text-white">{registrosFiltrados.length}</p>
              <p className="text-xs text-gray-400">
                {modoFiltro === 'tudo' ? 'Total registros' : 'Registros filtrados'}
              </p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <p className="text-3xl font-black text-green-400">{vinculados}</p>
              <p className="text-xs text-green-400">✅ Vinculados</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
              <p className="text-3xl font-black text-red-400">{naoVinculados}</p>
              <p className="text-xs text-red-400">❌ Não vinculados</p>
            </div>
          </div>
          
          {naoVinculados > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
              ⚠️ <strong>{naoVinculados} registros não foram vinculados.</strong> O <code>USER_ID</code> do CSV precisa estar cadastrado como <code>id_groot</code> em MEU TIME.
            </div>
          )}
          
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="bg-[#0a0a0a] px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#FFD700]">
                📋 Preview ({registrosFiltrados.length} {registrosFiltrados.length === 1 ? 'linha' : 'linhas'})
              </h3>
              {modoFiltro !== 'tudo' && (
                <span className="text-xs text-purple-300">🎯 Filtro ativo</span>
              )}
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0a0a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-2 px-3">USER_ID</th>
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Rep (sistema)</th>
                    <th className="py-2 px-3">Vinculação</th>
                    <th className="py-2 px-3 text-right">Totes</th>
                    <th className="py-2 px-3 text-right">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                      <td className="py-2 px-3 text-white font-mono text-xs">{r.userId}</td>
                      <td className="py-2 px-3 text-gray-300 text-xs">{formatarDataBr(r.data)}</td>
                      <td className="py-2 px-3 text-gray-300 text-xs">{r.rep}</td>
                      <td className="py-2 px-3 text-xs">
                        {r.vinculado ? (
                          <span className="text-green-400">✅ {r.nomeOficial}</span>
                        ) : (
                          <span className="text-red-400">❌ não cadastrado</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-mono">{r.qtdTotes}</td>
                      <td className={`py-2 px-3 text-right font-mono font-bold ${r.ocupacaoPct >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {r.ocupacaoPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {registrosFiltrados.length > 50 && (
                <div className="text-center py-2 text-xs text-gray-500">
                  + {registrosFiltrados.length - 50} linhas...
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={enviar}
            disabled={enviando || registrosFiltrados.length === 0}
            className="w-full bg-gradient-to-r from-[#FFD700] to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black font-bold py-4 rounded-2xl transition-colors disabled:opacity-50 text-lg"
          >
            {enviando 
              ? '⏳ Enviando...' 
              : `✅ Enviar ${registrosFiltrados.length} ${registrosFiltrados.length === 1 ? 'registro' : 'registros'}`}
          </button>
        </>
      )}
    </div>
  );
}

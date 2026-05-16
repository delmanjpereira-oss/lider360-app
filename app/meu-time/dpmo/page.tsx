'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { supabase } from '../../../lib/supabase';

type ColaboradorMap = {
  id_groot: string;
  nome: string;
  processo: string | null;
};

type LinhaCSV = Record<string, string>;

type EventoProcessado = {
  chaveUnica: string;
  checkinDateTime: string;
  checkinData: string;
  checkinUser: string;
  representante: string;
  idGroot: string | null;
  inboundShipment: string;
  sku: string;
  qtdCheckin: number;
  qtdPick: number;
  qtdIma: number;
  qtdDif: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
};

// Parseia "13 de mai. de 2026, 13:59:38" pra Date
function parseDataCsv(str: string): Date | null {
  if (!str) return null;
  const meses: Record<string, number> = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
  };
  // "13 de mai. de 2026, 13:59:38"
  const m = str.match(/(\d+)\s+de\s+(\w+)\.?\s+de\s+(\d+),?\s*(\d+):(\d+):(\d+)?/);
  if (!m) return null;
  const dia = parseInt(m[1]);
  const mesAbrev = m[2].toLowerCase().substring(0, 3);
  const mes = meses[mesAbrev];
  const ano = parseInt(m[3]);
  const hora = parseInt(m[4] || '0');
  const min = parseInt(m[5] || '0');
  const seg = parseInt(m[6] || '0');
  if (mes === undefined) return null;
  return new Date(ano, mes, dia, hora, min, seg);
}

// Calcula semana ISO (segunda-feira como início)
function getSemanaIso(data: Date): { semana: number; ano: number } {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaDaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((d.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  return { semana, ano: d.getUTCFullYear() };
}

function getTrimestre(mes: number): string {
  if (mes >= 1 && mes <= 3) return 'Q1';
  if (mes >= 4 && mes <= 6) return 'Q2';
  if (mes >= 7 && mes <= 9) return 'Q3';
  return 'Q4';
}

function parseInt0(v: string): number {
  if (!v) return 0;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = parseInt(s);
  return isNaN(n) ? 0 : n;
}

function normalizarNome(nome: string): string {
  return String(nome || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

export default function DpmoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaCSV[]>([]);
  const [processado, setProcessado] = useState<EventoProcessado[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorMap[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [registrosNoBanco, setRegistrosNoBanco] = useState<number>(0);
  const [novosCount, setNovosCount] = useState(0);
  const [duplicadosCount, setDuplicadosCount] = useState(0);

  useEffect(() => {
    async function carregar() {
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo');
      if (colabs) setColaboradores(colabs as ColaboradorMap[]);

      const { count } = await supabase
        .from('dpmo_eventos')
        .select('*', { count: 'exact', head: true });
      if (count !== null) setRegistrosNoBanco(count);
    }
    carregar();
  }, []);

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    console.log('📂 CSV DPMO selecionado:', f.name);

    setArquivo(f);
    setErro(null);
    setSucesso(null);
    setProcessado([]);
    setLinhas([]);
    setNovosCount(0);
    setDuplicadosCount(0);
    setCarregando(true);

    Papa.parse<LinhaCSV>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCarregando(false);
        console.log('📊 CSV lido:', result.data.length, 'linhas');
        if (result.errors.length > 0) {
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        setLinhas(result.data);
      },
      error: (err) => {
        setCarregando(false);
        setErro('Erro: ' + err.message);
      },
    });
  }

  function processar() {
    if (!linhas.length) return;
    setErro(null);
    setSucesso(null);

    // Mapa nome → id_groot
    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colaboradores.forEach((c) => {
      mapaCadastro[normalizarNome(c.nome)] = c;
    });

    const eventos: EventoProcessado[] = [];

    linhas.forEach((linha, idx) => {
      const dataHora = linha['CHECKIN_DATE_TIME'] || '';
      const user = linha['CHECKIN_USER'] || '';
      const representante = linha['REPRESENTANTE'] || '';
      const is = linha['IS'] || '';
      const sku = linha['SKU'] || '';

      const data = parseDataCsv(dataHora);
      if (!data || !representante || !is || !sku) {
        if (idx < 3) console.warn(`Linha ${idx + 1} inválida:`, linha);
        return;
      }

      const checkin = parseInt0(linha['CHECKIN'] || '0');
      const pick = parseInt0(linha['PICK'] || '0');
      const ima = parseInt0(linha['IMA'] || '0');
      const dif = parseInt0(linha['DIF.'] || linha['DIF'] || '0');

      const { semana, ano } = getSemanaIso(data);
      const mes = data.getMonth() + 1;
      const trimestre = getTrimestre(mes);

      // Chave única: data_hora + user + IS + SKU
      const chaveUnica = `${data.toISOString()}_${user}_${is}_${sku}`;

      const cadastro = mapaCadastro[normalizarNome(representante)];
      const idGroot = cadastro?.id_groot || null;

      const dataIso = data.toISOString();
      const dataApenas = data.toISOString().split('T')[0];

      eventos.push({
        chaveUnica,
        checkinDateTime: dataIso,
        checkinData: dataApenas,
        checkinUser: user,
        representante,
        idGroot,
        inboundShipment: is,
        sku,
        qtdCheckin: checkin,
        qtdPick: pick,
        qtdIma: ima,
        qtdDif: dif,
        semana,
        ano,
        mes,
        trimestre,
      });
    });

    console.log('✅ Eventos processados:', eventos.length);
    setProcessado(eventos);

    if (eventos.length === 0) {
      setErro(
        '⚠️ Nenhum evento válido no CSV. Verifique se tem as colunas: CHECKIN_DATE_TIME, REPRESENTANTE, IS, SKU, IMA, DIF.'
      );
    }
  }

  async function confirmarEnvio() {
    if (!processado.length || !arquivo) return;
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      // 1. Pega TODAS as chaves únicas que já estão no banco
      const chavesNovas = processado.map((e) => e.chaveUnica);

      // Como pode ser uma lista muito grande, fazemos em lotes
      const chavesExistentes = new Set<string>();
      const tamanhoLote = 1000;

      for (let i = 0; i < chavesNovas.length; i += tamanhoLote) {
        const lote = chavesNovas.slice(i, i + tamanhoLote);
        const { data } = await supabase
          .from('dpmo_eventos')
          .select('chave_unica')
          .in('chave_unica', lote);
        if (data) {
          data.forEach((d) => chavesExistentes.add(d.chave_unica));
        }
      }

      console.log(`🔍 ${chavesExistentes.size} chaves já existem no banco`);

      // 2. Filtra só os NOVOS
      const novos = processado.filter((e) => !chavesExistentes.has(e.chaveUnica));
      const duplicados = processado.length - novos.length;

      console.log(`📤 Vai inserir ${novos.length} novos | ignorar ${duplicados} duplicados`);

      if (novos.length === 0) {
        setSucesso(
          `ℹ️ Nenhum evento novo no CSV. Os ${duplicados} eventos já estavam no banco.`
        );
        setNovosCount(0);
        setDuplicadosCount(duplicados);
        return;
      }

      // 3. Insere em lotes de 500
      const linhasInsert = novos.map((e) => ({
        chave_unica: e.chaveUnica,
        checkin_date_time: e.checkinDateTime,
        checkin_data: e.checkinData,
        checkin_user: e.checkinUser,
        representante: e.representante,
        id_groot: e.idGroot,
        inbound_shipment: e.inboundShipment,
        sku: e.sku,
        qtd_checkin: e.qtdCheckin,
        qtd_pick: e.qtdPick,
        qtd_ima: e.qtdIma,
        qtd_dif: e.qtdDif,
        semana: e.semana,
        ano: e.ano,
        mes: e.mes,
        trimestre: e.trimestre,
        arquivo_origem: arquivo.name,
      }));

      const loteInsert = 500;
      for (let i = 0; i < linhasInsert.length; i += loteInsert) {
        const lote = linhasInsert.slice(i, i + loteInsert);
        const { error } = await supabase.from('dpmo_eventos').insert(lote);
        if (error) throw new Error(error.message);
      }

      // Atualiza contagem total
      const { count } = await supabase
        .from('dpmo_eventos')
        .select('*', { count: 'exact', head: true });
      if (count !== null) setRegistrosNoBanco(count);

      setNovosCount(novos.length);
      setDuplicadosCount(duplicados);
      setSucesso(
        `✅ ${novos.length} novos eventos salvos! ${duplicados} duplicados foram ignorados (já estavam no banco).`
      );

      setTimeout(() => {
        setArquivo(null);
        setLinhas([]);
        setProcessado([]);
        const input = document.getElementById('input-dpmo') as HTMLInputElement;
        if (input) input.value = '';
      }, 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      console.error('❌ Erro:', e);
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  // Calcula DPMO agregado por semana (preview tipo Looker)
  const dpmoPorSemana = (() => {
    if (processado.length === 0) return {};
    const agg: Record<string, { defeitos: number; ima: number }> = {};
    processado.forEach((e) => {
      const k = `${e.ano}-S${e.semana}`;
      if (!agg[k]) agg[k] = { defeitos: 0, ima: 0 };
      agg[k].defeitos += e.qtdDif;
      agg[k].ima += e.qtdIma;
    });
    const result: Record<string, number> = {};
    Object.entries(agg).forEach(([k, v]) => {
      result[k] = v.ima > 0 ? Math.round((v.defeitos / v.ima) * 1_000_000) : 0;
    });
    return result;
  })();

  // Calcula DPMO por colaborador (preview)
  const dpmoPorColaborador = (() => {
    if (processado.length === 0) return [];
    const agg: Record<string, { defeitos: number; ima: number; eventos: number; vinculado: boolean }> = {};
    processado.forEach((e) => {
      if (!agg[e.representante]) {
        agg[e.representante] = {
          defeitos: 0,
          ima: 0,
          eventos: 0,
          vinculado: !!e.idGroot,
        };
      }
      agg[e.representante].defeitos += e.qtdDif;
      agg[e.representante].ima += e.qtdIma;
      agg[e.representante].eventos++;
    });
    return Object.entries(agg)
      .map(([nome, v]) => ({
        nome,
        eventos: v.eventos,
        defeitos: v.defeitos,
        ima: v.ima,
        dpmo: v.ima > 0 ? Math.round((v.defeitos / v.ima) * 1_000_000) : 0,
        vinculado: v.vinculado,
      }))
      .sort((a, b) => b.dpmo - a.dpmo);
  })();

  const totalVinculados = dpmoPorColaborador.filter((c) => c.vinculado).length;
  const totalAguardando = dpmoPorColaborador.length - totalVinculados;

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📊 Upload <span className="text-purple-400">DPMO</span>
        </h1>
        <p className="text-gray-400">
          Inventário detalhado de qualidade — CSV do CONTROL TOWER
        </p>
      </div>

      {/* Status do banco */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-3">
        <span className="text-2xl">💾</span>
        <div>
          <p className="text-purple-200 text-sm">
            <strong className="text-white text-lg">
              {registrosNoBanco.toLocaleString('pt-BR')}
            </strong>{' '}
            eventos no banco
          </p>
          <p className="text-xs text-purple-300">
            Cada upload acrescenta novos eventos sem duplicar
          </p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
          <p className="text-green-400 font-bold">{sucesso}</p>
        </div>
      )}

      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}

      {/* Como funciona */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">💡 Como funciona:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li>Exporta o CSV do <strong>CONTROL TOWER → INVENTÁRIO DPMO</strong></li>
          <li>O app calcula automaticamente: <code>DPMO = (Σ DIF / Σ IMA) × 1.000.000</code></li>
          <li>
            Pode subir CSVs com datas sobrepostas — o app{' '}
            <strong>ignora eventos já cadastrados</strong> (não duplica)
          </li>
          <li>
            Vincula automaticamente ao cadastro pelo nome. Se o colaborador
            ainda não tá cadastrado, o evento fica salvo aguardando.
          </li>
        </ul>
      </div>

      {/* Upload */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#FFD700]">1️⃣ Selecionar arquivo</h2>

        <input
          id="input-dpmo"
          type="file"
          accept=".csv"
          onChange={onArquivoChange}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white file:bg-purple-500 file:text-white file:font-bold file:border-0 file:px-4 file:py-1 file:rounded file:mr-3"
        />

        {carregando && (
          <p className="text-gray-400 text-sm">⏳ Lendo arquivo...</p>
        )}

        {arquivo && !carregando && linhas.length > 0 && (
          <div className="bg-[#0a0a0a] rounded-lg p-3 text-sm space-y-1">
            <p className="text-green-400">
              ✅ Arquivo: <strong>{arquivo.name}</strong>
            </p>
            <p className="text-gray-400">📊 {linhas.length} linhas detectadas</p>
          </div>
        )}
      </div>

      {/* Botão Processar */}
      {linhas.length > 0 && processado.length === 0 && (
        <button
          onClick={processar}
          className="w-full bg-purple-500 text-white font-bold py-4 rounded-lg hover:bg-purple-400 transition-colors text-lg"
        >
          📊 Processar e calcular DPMO
        </button>
      )}

      {/* PREVIEW */}
      {processado.length > 0 && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">📊</span>
                <span className="text-2xl font-black text-white">
                  {processado.length.toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="text-xs text-gray-400">Eventos no CSV</p>
            </div>
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">👥</span>
                <span className="text-2xl font-black text-cyan-400">
                  {dpmoPorColaborador.length}
                </span>
              </div>
              <p className="text-xs text-gray-400">Colaboradores únicos</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">✅</span>
                <span className="text-2xl font-black text-green-400">
                  {totalVinculados}
                </span>
              </div>
              <p className="text-xs text-green-300">Vinculados</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">⏳</span>
                <span className="text-2xl font-black text-blue-400">
                  {totalAguardando}
                </span>
              </div>
              <p className="text-xs text-blue-300">Aguardando cadastro</p>
            </div>
          </div>

          {/* DPMO por semana */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-purple-400 mb-4">
              📅 DPMO Médio por Semana (preview)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(dpmoPorSemana)
                .sort()
                .map(([sem, dpmo]) => (
                  <div
                    key={sem}
                    className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3"
                  >
                    <p className="text-xs text-gray-400">{sem}</p>
                    <p
                      className={`text-2xl font-black font-mono ${
                        dpmo > 1567 ? 'text-red-400' : 'text-green-400'
                      }`}
                    >
                      {dpmo.toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {dpmo > 1567 ? '⚠️ acima da meta' : '✓ na meta'}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {/* Tabela de colaboradores */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
            <h3 className="text-lg font-bold text-purple-400 mb-4">
              👥 DPMO por Colaborador (preview do CSV)
            </h3>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#1a1a1a]">
                  <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Representante</th>
                    <th className="py-2 pr-2 text-right">Eventos</th>
                    <th className="py-2 pr-2 text-right">Defeitos</th>
                    <th className="py-2 pr-2 text-right">Qtd IMA</th>
                    <th className="py-2 pr-2 text-right">DPMO</th>
                  </tr>
                </thead>
                <tbody>
                  {dpmoPorColaborador.slice(0, 30).map((c) => (
                    <tr
                      key={c.nome}
                      className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]"
                    >
                      <td className="py-2 pr-2">
                        {c.vinculado ? (
                          <span title="Vinculado" className="text-green-400">✅</span>
                        ) : (
                          <span title="Aguardando cadastro" className="text-blue-400">⏳</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-white text-xs">{c.nome}</td>
                      <td className="py-2 pr-2 text-right text-gray-400 font-mono">
                        {c.eventos}
                      </td>
                      <td className="py-2 pr-2 text-right text-gray-300 font-mono">
                        {c.defeitos}
                      </td>
                      <td className="py-2 pr-2 text-right text-gray-300 font-mono">
                        {c.ima.toLocaleString('pt-BR')}
                      </td>
                      <td
                        className={`py-2 pr-2 text-right font-mono font-bold ${
                          c.dpmo > 1567 ? 'text-red-400' : 'text-green-400'
                        }`}
                      >
                        {c.dpmo.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dpmoPorColaborador.length > 30 && (
                <p className="text-gray-500 text-xs mt-2 text-center">
                  ... e mais {dpmoPorColaborador.length - 30} colaboradores
                </p>
              )}
            </div>
          </div>

          <button
            onClick={confirmarEnvio}
            disabled={salvando}
            className="w-full bg-green-500 text-white font-bold py-4 rounded-lg hover:bg-green-400 transition-colors text-lg disabled:opacity-50"
          >
            {salvando
              ? '💾 Salvando (pode demorar uns segundos)...'
              : `✅ Confirmar envio (${processado.length} eventos)`}
          </button>
        </>
      )}
    </div>
  );
}

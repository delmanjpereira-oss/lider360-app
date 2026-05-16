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

type FormatoCSV = 'detalhado' | 'agregado' | 'desconhecido';

type EventoDetalhado = {
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

type LinhaAgregada = {
  chaveUnica: string;
  representante: string;
  idGroot: string | null;
  processo: string;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
  dpmo: number;
};

// ━━━━━━━ HELPERS ━━━━━━━

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizarNome(nome: string): string {
  // Remove acentos, converte pra maiúscula, tira espaços extras
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function parseDataCsv(str: string): Date | null {
  if (!str) return null;
  const meses: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  const m = str.match(/(\d+)\s+de\s+(\w+)\.?\s+de\s+(\d+),?\s*(\d+):(\d+):(\d+)?/);
  if (!m) return null;
  const dia = parseInt(m[1]);
  const mesAbrev = m[2].toLowerCase().substring(0, 3);
  const mes = meses[mesAbrev];
  const ano = parseInt(m[3]);
  if (mes === undefined) return null;
  return new Date(ano, mes, dia, parseInt(m[4] || '0'), parseInt(m[5] || '0'), parseInt(m[6] || '0'));
}

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

// Estima data aproximada de uma semana ISO (pra calcular mês/trimestre)
function dataAproximadaSemana(ano: number, semana: number): Date {
  const inicio = new Date(ano, 0, 1);
  const diaSemana = inicio.getDay();
  const offset = diaSemana <= 4 ? 1 - diaSemana : 8 - diaSemana;
  inicio.setDate(inicio.getDate() + offset);
  inicio.setDate(inicio.getDate() + (semana - 1) * 7);
  return inicio;
}

// Detecta o formato do CSV pelas colunas
function detectarFormato(headers: string[]): FormatoCSV {
  const headersNorm = headers.map(norm);

  // CSV DETALHADO tem: CHECKIN_DATE_TIME, REPRESENTANTE, IS, SKU, IMA, DIF
  if (
    headersNorm.includes('checkindatetime') ||
    (headersNorm.includes('representante') && headersNorm.includes('is') && headersNorm.includes('sku'))
  ) {
    return 'detalhado';
  }

  // CSV AGREGADO tem: CK_NOME_COMPLETO, WEEK | CK, DPMO | CK
  // Procura por alguma combinação de "nome" + "week" + "dpmo"
  const temNome = headersNorm.some((h) => h.includes('nome') || h.includes('completo'));
  const temWeek = headersNorm.some((h) => h.includes('week') || h.includes('semana'));
  const temDpmo = headersNorm.some((h) => h.includes('dpmo'));
  if (temNome && temWeek && temDpmo) {
    return 'agregado';
  }

  return 'desconhecido';
}

// Parse genérico: pega valor de uma coluna por aliases
function pegarValor(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const aliasN = norm(alias);
    const k = keys.find((kk) => norm(kk) === aliasN || norm(kk).includes(aliasN));
    if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export default function DpmoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<LinhaCSV[]>([]);
  const [formato, setFormato] = useState<FormatoCSV>('desconhecido');
  const [headers, setHeaders] = useState<string[]>([]);

  const [eventosDetalhados, setEventosDetalhados] = useState<EventoDetalhado[]>([]);
  const [linhasAgregadas, setLinhasAgregadas] = useState<LinhaAgregada[]>([]);

  const [colaboradores, setColaboradores] = useState<ColaboradorMap[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [regDetalhados, setRegDetalhados] = useState(0);
  const [regAgregados, setRegAgregados] = useState(0);

  useEffect(() => {
    async function carregar() {
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id_groot, nome, processo');
      if (colabs) setColaboradores(colabs as ColaboradorMap[]);

      const { count: c1 } = await supabase
        .from('dpmo_eventos')
        .select('*', { count: 'exact', head: true });
      if (c1 !== null) setRegDetalhados(c1);

      const { count: c2 } = await supabase
        .from('dpmo_agregado')
        .select('*', { count: 'exact', head: true });
      if (c2 !== null) setRegAgregados(c2);
    }
    carregar();
  }, []);

  function onArquivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setArquivo(f);
    setErro(null);
    setSucesso(null);
    setEventosDetalhados([]);
    setLinhasAgregadas([]);
    setLinhas([]);
    setCarregando(true);

    Papa.parse<LinhaCSV>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setCarregando(false);
        if (result.errors.length > 0) {
          setErro('Erro ao ler CSV: ' + result.errors[0].message);
          return;
        }
        const heads = result.meta.fields || [];
        const fmt = detectarFormato(heads);
        setHeaders(heads);
        setFormato(fmt);
        setLinhas(result.data);

        console.log('📋 Headers detectados:', heads);
        console.log('🔍 Formato:', fmt);
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

    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colaboradores.forEach((c) => {
      mapaCadastro[normalizarNome(c.nome)] = c;
    });

    if (formato === 'detalhado') {
      processarDetalhado(mapaCadastro);
    } else if (formato === 'agregado') {
      processarAgregado(mapaCadastro);
    } else {
      setErro(
        '❌ Formato de CSV não reconhecido. Colunas encontradas: ' +
          headers.join(', ')
      );
    }
  }

  function processarDetalhado(mapaCadastro: Record<string, ColaboradorMap>) {
    const eventos: EventoDetalhado[] = [];

    linhas.forEach((linha, idx) => {
      const dataHora = pegarValor(linha, ['CHECKIN_DATE_TIME', 'data']);
      const user = pegarValor(linha, ['CHECKIN_USER', 'user']);
      const representante = pegarValor(linha, ['REPRESENTANTE', 'nome']);
      const is = pegarValor(linha, ['IS', 'inbound']);
      const sku = pegarValor(linha, ['SKU']);

      const data = parseDataCsv(dataHora);
      if (!data || !representante || !is || !sku) {
        if (idx < 3) console.warn(`Linha ${idx + 1} inválida:`, linha);
        return;
      }

      const checkin = parseInt0(pegarValor(linha, ['CHECKIN']));
      const pick = parseInt0(pegarValor(linha, ['PICK']));
      const ima = parseInt0(pegarValor(linha, ['IMA']));
      const dif = parseInt0(pegarValor(linha, ['DIF.', 'DIF']));

      const { semana, ano } = getSemanaIso(data);
      const mes = data.getMonth() + 1;
      const trimestre = getTrimestre(mes);

      const chaveUnica = `${data.toISOString()}_${user}_${is}_${sku}`;
      const cadastro = mapaCadastro[normalizarNome(representante)];
      const idGroot = cadastro?.id_groot || null;

      eventos.push({
        chaveUnica,
        checkinDateTime: data.toISOString(),
        checkinData: data.toISOString().split('T')[0],
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

    if (eventos.length === 0) {
      setErro('Nenhum evento válido detectado.');
    } else {
      setEventosDetalhados(eventos);
    }
  }

  function processarAgregado(mapaCadastro: Record<string, ColaboradorMap>) {
    const itens: LinhaAgregada[] = [];

    linhas.forEach((linha, idx) => {
      const nome = pegarValor(linha, ['CK_NOME_COMPLETO', 'NOME_COMPLETO', 'nome']);

      // Tenta achar a coluna de semana
      const semanaStr = pegarValor(linha, ['WEEK | CK', 'WEEK_CK', 'WEEK', 'SEMANA']);

      // Tenta achar a coluna de DPMO (pode ser "DPMO | CK", "DPMO_CK", "DPMO CK")
      const dpmoStr = pegarValor(linha, [
        'DPMO | CK',
        'DPMO_CK',
        'DPMO CK',
        'DPMO',
        'DMPO P2M',
        'DPMO P2M',
      ]);

      if (!nome || !semanaStr || !dpmoStr) {
        if (idx < 3) console.warn(`Linha ${idx + 1} sem dados completos:`, linha);
        return;
      }

      // Extrai número da semana de "Semana 20" ou "20"
      const matchSem = semanaStr.match(/(\d+)/);
      if (!matchSem) return;
      const semana = parseInt(matchSem[1]);

      // Parseia DPMO (pode vir "5.241" como BR ou "5241")
      const dpmoLimpo = dpmoStr.replace(/\./g, '').replace(',', '.');
      const dpmo = parseInt(dpmoLimpo);
      if (isNaN(dpmo) || dpmo < 0) return;

      // Determina processo pelo header (CK, P2M, TP, SH, OV)
      let processo = 'CK'; // default
      const headerProcesso = headers.find((h) => norm(h).includes('dpmo'));
      if (headerProcesso) {
        const h = norm(headerProcesso);
        if (h.includes('p2m')) processo = 'P2M';
        else if (h.includes('tp')) processo = 'TP';
        else if (h.includes('sh')) processo = 'SH';
        else if (h.includes('ov')) processo = 'OV';
        else processo = 'CK';
      }

      // Pra esse CSV, usa o ano atual (assumimos que é o ano vigente)
      const ano = new Date().getFullYear();
      const dataAprox = dataAproximadaSemana(ano, semana);
      const mes = dataAprox.getMonth() + 1;
      const trimestre = getTrimestre(mes);

      const cadastro = mapaCadastro[normalizarNome(nome)];
      const idGroot = cadastro?.id_groot || null;

      const chaveUnica = `${normalizarNome(nome)}_${processo}_${ano}_S${semana}`;

      itens.push({
        chaveUnica,
        representante: nome.trim(),
        idGroot,
        processo,
        semana,
        ano,
        mes,
        trimestre,
        dpmo,
      });
    });

    if (itens.length === 0) {
      setErro('Nenhuma linha válida detectada. Verifique se o CSV tem nome, semana e DPMO.');
    } else {
      setLinhasAgregadas(itens);
    }
  }

  async function confirmarEnvio() {
    if (!arquivo) return;
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      if (formato === 'detalhado') {
        await salvarDetalhados();
      } else if (formato === 'agregado') {
        await salvarAgregados();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarDetalhados() {
    if (!arquivo) return;
    const chavesNovas = eventosDetalhados.map((e) => e.chaveUnica);
    const chavesExistentes = new Set<string>();

    for (let i = 0; i < chavesNovas.length; i += 1000) {
      const lote = chavesNovas.slice(i, i + 1000);
      const { data } = await supabase
        .from('dpmo_eventos')
        .select('chave_unica')
        .in('chave_unica', lote);
      if (data) data.forEach((d) => chavesExistentes.add(d.chave_unica));
    }

    const novos = eventosDetalhados.filter((e) => !chavesExistentes.has(e.chaveUnica));
    const duplicados = eventosDetalhados.length - novos.length;

    if (novos.length === 0) {
      setSucesso(`ℹ️ Nada novo: os ${duplicados} eventos já estavam no banco.`);
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('info', 'Tudo já estava no banco');
      }
      return;
    }

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
      arquivo_origem: arquivo!.name,
    }));

    for (let i = 0; i < linhasInsert.length; i += 500) {
      const lote = linhasInsert.slice(i, i + 500);
      const { error } = await supabase.from('dpmo_eventos').insert(lote);
      if (error) throw new Error(error.message);
    }

    const { count } = await supabase
      .from('dpmo_eventos')
      .select('*', { count: 'exact', head: true });
    if (count !== null) setRegDetalhados(count);

    setSucesso(`✅ ${novos.length} eventos detalhados salvos! ${duplicados} duplicados ignorados.`);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('success', `${novos.length} eventos salvos!`);
    }
    resetar();
  }

  async function salvarAgregados() {
    if (!arquivo) return;

    // UPSERT em lotes (atualiza se existe, insere se não)
    const linhasInsert = linhasAgregadas.map((e) => ({
      chave_unica: e.chaveUnica,
      representante: e.representante,
      id_groot: e.idGroot,
      processo: e.processo,
      semana: e.semana,
      ano: e.ano,
      mes: e.mes,
      trimestre: e.trimestre,
      dpmo: e.dpmo,
      arquivo_origem: arquivo!.name,
      atualizado_em: new Date().toISOString(),
    }));

    for (let i = 0; i < linhasInsert.length; i += 500) {
      const lote = linhasInsert.slice(i, i + 500);
      const { error } = await supabase.from('dpmo_agregado').upsert(lote, {
        onConflict: 'chave_unica',
      });
      if (error) throw new Error(error.message);
    }

    const { count } = await supabase
      .from('dpmo_agregado')
      .select('*', { count: 'exact', head: true });
    if (count !== null) setRegAgregados(count);

    setSucesso(`✅ ${linhasAgregadas.length} linhas salvas (atualizadas se já existiam)!`);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('success', `${linhasAgregadas.length} linhas salvas!`);
    }
    resetar();
  }

  function resetar() {
    setTimeout(() => {
      setArquivo(null);
      setLinhas([]);
      setEventosDetalhados([]);
      setLinhasAgregadas([]);
      setHeaders([]);
      setFormato('desconhecido');
      const input = document.getElementById('input-dpmo') as HTMLInputElement;
      if (input) input.value = '';
    }, 3000);
  }

  // Estatísticas pra preview
  const totalLinhas =
    formato === 'detalhado' ? eventosDetalhados.length : linhasAgregadas.length;

  const totalVinculados = (() => {
    if (formato === 'detalhado') {
      const nomes = new Set(eventosDetalhados.filter((e) => e.idGroot).map((e) => e.representante));
      return nomes.size;
    } else {
      return linhasAgregadas.filter((l) => l.idGroot).length;
    }
  })();

  const totalAguardando = (() => {
    if (formato === 'detalhado') {
      const nomes = new Set(eventosDetalhados.filter((e) => !e.idGroot).map((e) => e.representante));
      return nomes.size;
    } else {
      return linhasAgregadas.filter((l) => !l.idGroot).length;
    }
  })();

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
          Aceita CSV detalhado (INVENTÁRIO) ou agregado (TABELA DINÂMICA)
        </p>
      </div>

      {/* Status do banco */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <p className="text-purple-200 text-sm">
              <strong className="text-white text-lg">
                {regDetalhados.toLocaleString('pt-BR')}
              </strong>{' '}
              eventos detalhados
            </p>
            <p className="text-xs text-purple-300">Tabela dpmo_eventos</p>
          </div>
        </div>
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/30 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <p className="text-cyan-200 text-sm">
              <strong className="text-white text-lg">
                {regAgregados.toLocaleString('pt-BR')}
              </strong>{' '}
              linhas agregadas
            </p>
            <p className="text-xs text-cyan-300">Tabela dpmo_agregado</p>
          </div>
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
          {headers.length > 0 && (
            <p className="text-red-400/70 text-xs mt-2 font-mono">
              Colunas detectadas: {headers.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Instruções */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
        <p className="font-bold mb-2">💡 Como funciona:</p>
        <ul className="space-y-1 list-disc pl-5 text-xs">
          <li>
            <strong className="text-purple-300">CSV DETALHADO</strong> (INVENTÁRIO DPMO): tem
            colunas CHECKIN_DATE_TIME, IS, SKU, IMA, DIF — vê SKUs com problema
          </li>
          <li>
            <strong className="text-cyan-300">CSV AGREGADO</strong> (TABELA DINÂMICA): tem colunas
            NOME, WEEK | CK, DPMO | CK — DPMO já calculado pelo Looker
          </li>
          <li>O app <strong>detecta automaticamente</strong> qual formato você subiu</li>
        </ul>
      </div>

      {/* Upload */}
      <div
        className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6"
        style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
      >
        <h2 className="text-lg font-bold text-[#FFD700] mb-4 flex items-center gap-2">
          <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">1</span>
          Selecionar arquivo
        </h2>

        <input
          id="input-dpmo"
          type="file"
          accept=".csv"
          onChange={onArquivoChange}
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white file:bg-purple-500 file:text-white file:font-bold file:border-0 file:px-4 file:py-1 file:rounded file:mr-3"
        />

        {carregando && <p className="text-gray-400 text-sm mt-3">⏳ Lendo arquivo...</p>}

        {arquivo && !carregando && linhas.length > 0 && (
          <div className="bg-[#0a0a0a] rounded-lg p-3 text-sm space-y-2 mt-3">
            <p className="text-green-400">
              ✅ <strong>{arquivo.name}</strong> ({linhas.length} linhas)
            </p>

            {/* Badge do formato detectado */}
            {formato === 'detalhado' && (
              <div className="flex items-center gap-2">
                <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                  📦 DETALHADO
                </span>
                <span className="text-gray-400 text-xs">
                  Cada linha = 1 evento de checkin
                </span>
              </div>
            )}
            {formato === 'agregado' && (
              <div className="flex items-center gap-2">
                <span className="bg-cyan-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                  📋 AGREGADO
                </span>
                <span className="text-gray-400 text-xs">
                  DPMO já calculado por semana
                </span>
              </div>
            )}
            {formato === 'desconhecido' && (
              <div className="flex items-center gap-2">
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                  ⚠️ NÃO RECONHECIDO
                </span>
                <span className="text-red-300 text-xs">Verifique as colunas</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botão Processar */}
      {linhas.length > 0 && totalLinhas === 0 && formato !== 'desconhecido' && (
        <button
          onClick={processar}
          className="w-full bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold py-4 rounded-xl hover:from-purple-400 hover:to-purple-500 transition-all text-lg shadow-lg shadow-purple-500/30"
        >
          📊 Processar CSV
        </button>
      )}

      {/* PREVIEW */}
      {totalLinhas > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">📊</span>
                <span className="text-2xl font-black text-white">
                  {totalLinhas.toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="text-xs text-gray-400">Linhas no CSV</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">✅</span>
                <span className="text-2xl font-black text-green-400">{totalVinculados}</span>
              </div>
              <p className="text-xs text-green-300">Vinculados</p>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">⏳</span>
                <span className="text-2xl font-black text-blue-400">{totalAguardando}</span>
              </div>
              <p className="text-xs text-blue-300">Aguardando</p>
            </div>
          </div>

          {/* Tabela preview AGREGADO */}
          {formato === 'agregado' && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">
                👥 DPMO por Colaborador
              </h3>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#1a1a1a]">
                    <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Representante</th>
                      <th className="py-2 pr-2">Processo</th>
                      <th className="py-2 pr-2 text-right">Semana</th>
                      <th className="py-2 pr-2 text-right">DPMO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasAgregadas
                      .sort((a, b) => b.dpmo - a.dpmo)
                      .slice(0, 50)
                      .map((l, i) => (
                        <tr
                          key={`${l.chaveUnica}-${i}`}
                          className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]"
                        >
                          <td className="py-2 pr-2">
                            {l.idGroot ? (
                              <span className="text-green-400" title="Vinculado">
                                ✅
                              </span>
                            ) : (
                              <span className="text-blue-400" title="Aguardando">
                                ⏳
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-white text-xs">{l.representante}</td>
                          <td className="py-2 pr-2">
                            <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold">
                              {l.processo}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right text-gray-300 font-mono">
                            S{l.semana}
                          </td>
                          <td
                            className={`py-2 pr-2 text-right font-mono font-bold ${
                              l.dpmo > 1567 ? 'text-red-400' : 'text-green-400'
                            }`}
                          >
                            {l.dpmo.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {linhasAgregadas.length > 50 && (
                  <p className="text-gray-500 text-xs mt-2 text-center">
                    ... e mais {linhasAgregadas.length - 50} linhas
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tabela preview DETALHADO */}
          {formato === 'detalhado' && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-purple-400 mb-4">
                📦 Eventos detalhados (primeiros 30)
              </h3>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#1a1a1a]">
                    <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2">Representante</th>
                      <th className="py-2 pr-2">SKU</th>
                      <th className="py-2 pr-2 text-right">IMA</th>
                      <th className="py-2 pr-2 text-right">DIF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosDetalhados.slice(0, 30).map((e, i) => (
                      <tr
                        key={`${e.chaveUnica}-${i}`}
                        className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]"
                      >
                        <td className="py-2 pr-2">
                          {e.idGroot ? (
                            <span className="text-green-400">✅</span>
                          ) : (
                            <span className="text-blue-400">⏳</span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-gray-300 text-xs font-mono">
                          {e.checkinData}
                        </td>
                        <td className="py-2 pr-2 text-white text-xs">{e.representante}</td>
                        <td className="py-2 pr-2 text-gray-400 text-xs font-mono">{e.sku}</td>
                        <td className="py-2 pr-2 text-right text-gray-300 font-mono">
                          {e.qtdIma}
                        </td>
                        <td className="py-2 pr-2 text-right text-red-400 font-mono font-bold">
                          {e.qtdDif}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {eventosDetalhados.length > 30 && (
                  <p className="text-gray-500 text-xs mt-2 text-center">
                    ... e mais {eventosDetalhados.length - 30} eventos
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={confirmarEnvio}
            disabled={salvando}
            className="w-full bg-gradient-to-br from-green-500 to-green-600 text-white font-bold py-4 rounded-xl hover:from-green-400 hover:to-green-500 transition-all text-lg shadow-lg shadow-green-500/30 disabled:opacity-50"
          >
            {salvando
              ? '💾 Salvando...'
              : `✅ Confirmar envio (${totalLinhas} ${
                  formato === 'detalhado' ? 'eventos' : 'linhas'
                })`}
          </button>
        </>
      )}
    </div>
  );
}

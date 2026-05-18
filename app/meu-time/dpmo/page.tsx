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

// 🎯 Gera várias variações do nome pra tentar matchear
function gerarVariacoesNome(nome: string): string[] {
  const limpo = normalizarNome(nome);
  if (!limpo) return [];

  const partes = limpo.split(' ').filter((p) => p.length > 1); // ignora "DA", "DE", "DO"
  const variacoes = new Set<string>();

  // 1. Nome completo
  variacoes.add(limpo);

  // 2. Sem palavras curtas (DA, DE, DO, DOS, DAS)
  const semConectivos = limpo
    .split(' ')
    .filter((p) => !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p))
    .join(' ');
  variacoes.add(semConectivos);

  // 3. Só primeiro + último nome
  if (partes.length >= 2) {
    variacoes.add(`${partes[0]} ${partes[partes.length - 1]}`);
  }

  // 4. Invertido (último primeiro)
  if (partes.length >= 2) {
    variacoes.add(`${partes[partes.length - 1]} ${partes[0]}`);
  }

  // 5. Só primeiros 3
  if (partes.length >= 3) {
    variacoes.add(`${partes[0]} ${partes[1]} ${partes[2]}`);
  }

  // 6. Só os 2 primeiros
  if (partes.length >= 2) {
    variacoes.add(`${partes[0]} ${partes[1]}`);
  }

  return Array.from(variacoes);
}

// 🎯 Calcula similaridade entre dois nomes (0 a 1)
function similaridadeNome(a: string, b: string): number {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const partesA = new Set(na.split(' ').filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p)));
  const partesB = new Set(nb.split(' ').filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p)));

  if (partesA.size === 0 || partesB.size === 0) return 0;

  // Conta quantas palavras coincidem
  let comuns = 0;
  partesA.forEach((p) => {
    if (partesB.has(p)) comuns++;
  });

  const total = Math.max(partesA.size, partesB.size);
  return comuns / total;
}

// 🎯 Busca melhor match no mapa de cadastro (similaridade >= 0.5)
function buscarMelhorMatch(
  nomeCSV: string,
  mapaCadastro: Record<string, { id_groot: string; nome: string; processo: string }>,
  threshold: number = 0.5
): { id_groot: string; nome: string; processo: string } | null {
  let melhorMatch = null;
  let melhorScore = 0;

  // Filtra só chaves de nome (ignora __ID__)
  const chavesNome = Object.keys(mapaCadastro).filter((k) => !k.startsWith('__ID__'));

  for (const chave of chavesNome) {
    const colab = mapaCadastro[chave];
    const score = similaridadeNome(nomeCSV, colab.nome);
    if (score > melhorScore && score >= threshold) {
      melhorScore = score;
      melhorMatch = colab;
    }
  }

  return melhorMatch;
}

function parseDataCsv(str: string): Date | null {
  if (!str) return null;
  const s = String(str).trim();

  // Formato 1: "17 de mai. de 2026, 14:30:00" (Looker pt-BR)
  const meses: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  const m1 = s.match(/(\d+)\s+de\s+(\w+)\.?\s+de\s+(\d+),?\s*(\d+):(\d+):(\d+)?/);
  if (m1) {
    const dia = parseInt(m1[1]);
    const mesAbrev = m1[2].toLowerCase().substring(0, 3);
    const mes = meses[mesAbrev];
    if (mes !== undefined) {
      const ano = parseInt(m1[3]);
      return new Date(ano, mes, dia, parseInt(m1[4] || '0'), parseInt(m1[5] || '0'), parseInt(m1[6] || '0'));
    }
  }

  // Formato 2: "2026-05-17 14:30:00" ou "2026-05-17T14:30:00" (ISO)
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):?(\d{0,2})/);
  if (m2) {
    return new Date(
      parseInt(m2[1]),
      parseInt(m2[2]) - 1,
      parseInt(m2[3]),
      parseInt(m2[4]),
      parseInt(m2[5]),
      parseInt(m2[6] || '0')
    );
  }

  // Formato 3: "17/05/2026 14:30:00" ou "17/05/2026, 14:30" (BR)
  const m3 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{1,2}):?(\d{0,2})/);
  if (m3) {
    return new Date(
      parseInt(m3[3]),
      parseInt(m3[2]) - 1,
      parseInt(m3[1]),
      parseInt(m3[4]),
      parseInt(m3[5]),
      parseInt(m3[6] || '0')
    );
  }

  // Formato 4: "17/05/2026" (só data, sem hora)
  const m4 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m4) {
    return new Date(parseInt(m4[3]), parseInt(m4[2]) - 1, parseInt(m4[1]));
  }

  // Formato 5: "2026-05-17" (ISO date)
  const m5 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m5) {
    return new Date(parseInt(m5[1]), parseInt(m5[2]) - 1, parseInt(m5[3]));
  }

  // Última tentativa: Date.parse
  const tentativa = new Date(s);
  if (!isNaN(tentativa.getTime())) {
    return tentativa;
  }

  return null;
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
  const [processoSelecionado, setProcessoSelecionado] = useState<'CK' | 'P2M' | null>(null);

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

    // 🎯 Filtra colaboradores SÓ do processo selecionado
    const processoAlvo = processoSelecionado === 'CK' ? 'Checkin' : 'P2M';
    const colabsDoProcesso = colaboradores.filter((c) => c.processo === processoAlvo);

    const mapaCadastro: Record<string, ColaboradorMap> = {};
    colabsDoProcesso.forEach((c) => {
      // Indexa por TODAS as variações de nome
      const variacoes = gerarVariacoesNome(c.nome);
      variacoes.forEach((v) => {
        if (!mapaCadastro[v]) mapaCadastro[v] = c;
      });
      // Indexa também por ID_GROOT (chave universal MELI)
      if (c.id_groot) {
        mapaCadastro[`__ID__${String(c.id_groot).trim()}`] = c;
      }
    });

    console.log('🗺️ Mapa de cadastro criado:', {
      totalColabs: colabsDoProcesso.length,
      totalChaves: Object.keys(mapaCadastro).length,
      exemplos: Object.keys(mapaCadastro).filter((k) => !k.startsWith('__ID__')).slice(0, 10),
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
    let totalLinhas = 0;
    let semData = 0;
    let semRepresentante = 0;
    let semIS = 0;
    let semSKU = 0;

    // Log da primeira linha pra debug
    if (linhas.length > 0) {
      console.log('📋 Primeira linha do CSV:', linhas[0]);
      console.log('📋 Headers detectados:', Object.keys(linhas[0]));
    }

    linhas.forEach((linha, idx) => {
      totalLinhas++;
      const dataHora = pegarValor(linha, ['CHECKIN_DATE_TIME', 'PICK_DATE_TIME', 'data']);
      const user = pegarValor(linha, ['CHECKIN_USER', 'PICK_USER', 'user']);
      const representante = pegarValor(linha, ['REPRESENTANTE', 'nome']);
      const is = pegarValor(linha, ['IS', 'inbound']);
      const sku = pegarValor(linha, ['SKU']);
      
      // 🎯 ID GROOT - busca em várias possíveis colunas
      const idGrootCsv = pegarValor(linha, [
        'id_groot',
        'ID_GROOT',
        'Id_Groot',
        'id groot',
        'ID GROOT',
        'Id Groot',
        'groot',
        'GROOT',
        'id',
        'ID',
      ]);

      const data = parseDataCsv(dataHora);
      
      // Logs detalhados de erros
      if (idx < 3) {
        console.log(`🔍 Linha ${idx + 1}:`, {
          dataHoraOriginal: dataHora,
          dataParseada: data,
          user,
          idGrootCsv,
          representante,
          is,
          sku,
        });
      }

      if (!data) semData++;
      if (!representante) semRepresentante++;
      if (!is) semIS++;
      if (!sku) semSKU++;

      if (!data || !representante || !is || !sku) {
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
      
      // 🎯 Sistema robusto de vinculação por nome
      // 1ª tentativa: ID se tiver no CSV
      const idGrootLimpo = String(idGrootCsv || '').replace(/\D/g, '').trim();
      const userLimpo = String(user || '').replace(/\D/g, '').trim();
      
      let cadastro = null;
      let metodoVinculacao = '';
      
      // Tenta por ID se for número
      if (idGrootLimpo && idGrootLimpo.length >= 5) {
        cadastro = mapaCadastro[`__ID__${idGrootLimpo}`];
        if (cadastro) metodoVinculacao = 'ID_GROOT';
      }
      if (!cadastro && userLimpo && userLimpo.length >= 5) {
        cadastro = mapaCadastro[`__ID__${userLimpo}`];
        if (cadastro) metodoVinculacao = 'USER';
      }
      
      // 2ª tentativa: nome com TODAS as variações
      if (!cadastro && representante) {
        const variacoes = gerarVariacoesNome(representante);
        for (const v of variacoes) {
          if (mapaCadastro[v]) {
            cadastro = mapaCadastro[v];
            metodoVinculacao = 'NOME_VARIACAO';
            break;
          }
        }
      }
      
      // 3ª tentativa: matching por SIMILARIDADE (fuzzy)
      if (!cadastro && representante) {
        cadastro = buscarMelhorMatch(representante, mapaCadastro, 0.6);
        if (cadastro) metodoVinculacao = 'FUZZY';
      }

      // Debug do método de vinculação
      if (idx < 5 && cadastro) {
        console.log(`✅ Linha ${idx + 1} vinculou via ${metodoVinculacao}:`, {
          csv: representante,
          cadastro: cadastro.nome,
          id_groot: cadastro.id_groot,
        });
      }
      if (idx < 5 && !cadastro && representante) {
        console.warn(`❌ Linha ${idx + 1} NÃO vinculou:`, {
          representante,
          user,
          idGrootCsv,
        });
      }

      const idGroot = cadastro?.id_groot || idGrootLimpo || null;

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

    // Log final do resumo + estatística de vinculação
    const vinculados = eventos.filter((e) => e.idGroot).length;
    const naoVinculados = eventos.length - vinculados;
    
    console.log('📊 Resumo do processamento DPMO:', {
      totalLinhas,
      eventosValidos: eventos.length,
      vinculadosAoColab: vinculados,
      naoVinculados,
      semData,
      semRepresentante,
      semIS,
      semSKU,
    });

    // Lista os representantes que NÃO foram vinculados (pra debug)
    if (naoVinculados > 0) {
      const nomesUnicos = new Set<string>();
      eventos.filter((e) => !e.idGroot).forEach((e) => {
        nomesUnicos.add(`${e.representante} (USER: ${e.checkinUser})`);
      });
      const nomesNaoVinculados = Array.from(nomesUnicos);
      console.warn('⚠️ Representantes NÃO vinculados ao cadastro:', nomesNaoVinculados);
    }

    if (eventos.length === 0) {
      const motivos = [];
      if (semData > 0) motivos.push(`${semData} linhas sem data válida`);
      if (semRepresentante > 0) motivos.push(`${semRepresentante} sem representante`);
      if (semIS > 0) motivos.push(`${semIS} sem IS`);
      if (semSKU > 0) motivos.push(`${semSKU} sem SKU`);
      
      const detalhes = motivos.length > 0 ? `\n\n📋 Motivos: ${motivos.join(', ')}` : '';
      setErro(`Nenhum evento válido detectado de ${totalLinhas} linhas.${detalhes}\n\n🔍 Abra o F12 (Console) pra ver os detalhes de cada linha.`);
    } else {
      setEventosDetalhados(eventos);
    }
  }

  function processarAgregado(mapaCadastro: Record<string, ColaboradorMap>) {
    const itens: LinhaAgregada[] = [];

    linhas.forEach((linha, idx) => {
      const nome = pegarValor(linha, [
        'CK_NOME_COMPLETO',
        'P2M_NOME_COMPLETO',
        'TP_NOME_COMPLETO',
        'SH_NOME_COMPLETO',
        'OV_NOME_COMPLETO',
        'NOME_COMPLETO',
        'nome',
      ]);

      // 🎯 ID GROOT - busca em várias possíveis colunas
      const idGrootCsv = pegarValor(linha, [
        'id_groot',
        'ID_GROOT',
        'Id_Groot',
        'id groot',
        'ID GROOT',
        'Id Groot',
        'groot',
        'GROOT',
        'id',
        'ID',
        'CK_USER',
        'P2M_USER',
        'TP_USER',
        'SH_USER',
        'OV_USER',
        'CHECKIN_USER',
        'PICK_USER',
        'USER',
        'user_id',
        'USER_ID',
      ]);

      // Tenta achar a coluna de semana
      const semanaStr = pegarValor(linha, [
        'WEEK | CK',
        'WEEK | P2M',
        'WEEK | TP',
        'WEEK | SH',
        'WEEK | OV',
        'WEEK_CK',
        'WEEK_P2M',
        'WEEK',
        'SEMANA',
      ]);

      // Tenta achar a coluna de DPMO (pode ser "DPMO | CK", "DPMO | P2M", etc)
      const dpmoStr = pegarValor(linha, [
        'DPMO | CK',
        'DPMO | P2M',
        'DPMO | TP',
        'DPMO | SH',
        'DPMO | OV',
        'DPMO_CK',
        'DPMO_P2M',
        'DPMO CK',
        'DPMO P2M',
        'DPMO',
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

      const idGrootLimpoAg = String(idGrootCsv || '').replace(/\D/g, '').trim();
      
      let cadastro = null;
      
      // 1ª: por ID se tiver
      if (idGrootLimpoAg && idGrootLimpoAg.length >= 5) {
        cadastro = mapaCadastro[`__ID__${idGrootLimpoAg}`];
      }
      
      // 2ª: nome com variações
      if (!cadastro && nome) {
        const variacoes = gerarVariacoesNome(nome);
        for (const v of variacoes) {
          if (mapaCadastro[v]) {
            cadastro = mapaCadastro[v];
            break;
          }
        }
      }
      
      // 3ª: fuzzy match
      if (!cadastro && nome) {
        cadastro = buscarMelhorMatch(nome, mapaCadastro, 0.6);
      }
      
      const idGroot = cadastro?.id_groot || idGrootLimpoAg || null;

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
      processo: processoSelecionado, // 🎯 Salva o processo escolhido
      arquivo_origem: arquivo!.name,
    }));

    for (let i = 0; i < linhasInsert.length; i += 500) {
      const lote = linhasInsert.slice(i, i + 500);
      // 🎯 Usa upsert pra evitar erro de duplicate key
      const { error } = await supabase.from('dpmo_eventos').upsert(lote, {
        onConflict: 'chave_unica',
        ignoreDuplicates: false, // atualiza se já existe
      });
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
      processo: processoSelecionado, // 🎯 Sobrescreve com o processo escolhido pelo líder
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

      {/* Seletor de PROCESSO antes de processar */}
      {linhas.length > 0 && totalLinhas === 0 && formato !== 'desconhecido' && (
        <>
          <div className="bg-yellow-500/5 border-2 border-yellow-500/30 rounded-2xl p-5">
            <h3 className="text-base font-bold text-yellow-400 mb-3 flex items-center gap-2">
              ⚠️ 1º — ESCOLHA O PROCESSO DESSE CSV
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Defina pra qual processo são esses dados. Os IMAs serão vinculados <strong>somente</strong> aos colaboradores desse processo.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setProcessoSelecionado('CK')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                  processoSelecionado === 'CK'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-lg shadow-cyan-500/20'
                    : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-cyan-500/50 hover:text-cyan-400'
                }`}
              >
                📦 CHECKIN
                {processoSelecionado === 'CK' && <span className="block text-xs mt-1">✓ Selecionado</span>}
              </button>
              <button
                onClick={() => setProcessoSelecionado('P2M')}
                className={`px-4 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                  processoSelecionado === 'P2M'
                    ? 'bg-orange-500/20 border-orange-400 text-orange-300 shadow-lg shadow-orange-500/20'
                    : 'bg-[#0a0a0a] border-[#2a2a2a] text-gray-400 hover:border-orange-500/50 hover:text-orange-400'
                }`}
              >
                🚚 P2M
                {processoSelecionado === 'P2M' && <span className="block text-xs mt-1">✓ Selecionado</span>}
              </button>
            </div>
          </div>

          <button
            onClick={processar}
            disabled={!processoSelecionado}
            className="w-full bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold py-4 rounded-xl hover:from-purple-400 hover:to-purple-500 transition-all text-lg shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!processoSelecionado ? '⚠️ Selecione o processo primeiro' : '📊 2º — Processar CSV'}
          </button>
        </>
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
            disabled={salvando || !processoSelecionado}
            className="w-full bg-gradient-to-br from-green-500 to-green-600 text-white font-bold py-4 rounded-xl hover:from-green-400 hover:to-green-500 transition-all text-lg shadow-lg shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando
              ? '💾 Salvando...'
              : !processoSelecionado
              ? '⚠️ Selecione o processo primeiro'
              : `✅ 3º — Confirmar envio (${totalLinhas} ${
                  formato === 'detalhado' ? 'eventos' : 'linhas'
                }) — ${processoSelecionado}`}
          </button>
        </>
      )}
    </div>
  );
}

import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const SPREADSHEET_ID = '1cozKZ8smTyEoRjLMIQG76G8Famg5-5aoYm42PxWrfqY';
const SHEET_NAME = 'Visão Geral';

// Colunas fixas (1-indexed)
const COL = {
  GERENTE: 0,
  SUPERVISOR: 1,
  DATA_ENTRADA: 2,
  DATA_DESLIG: 3,
  CPF: 4,
  NOME: 5,
  TURNO: 6,
  PROCESSO: 7,
  AREA: 8,
  TEAM_LEADER: 9,
  ID_GROOT: 13, // coluna 14 = index 13
};

const DATAS_START_COL = 55; // 1-indexed

function colNumToLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseSheetDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (!s) return null;

  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  // dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    if (!isNaN(d.getTime())) return d;
  }
  // Serial number (Google Sheets date)
  const n = Number(s);
  if (!isNaN(n) && n > 40000) {
    // Google Sheets serial: days since Dec 30, 1899
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function toYYYYMMDD(d: Date): string {
  const tz = d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [dd, mm, yyyy] = tz.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function getInicioSemana(hoje: Date): Date {
  const d = new Date(hoje);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=dom, 1=seg
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function getCacheKey() {
  return 'presenca_cache';
}

// Cache em memória (válido entre restarts frios — melhor que nada)
let memCache: { data: PresencaResponse; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

type Pendencia = {
  linha: number;        // linha na planilha (1-indexed, contando cabeçalho)
  coluna: number;       // coluna na planilha (1-indexed)
  data: string;         // dd/MM/yyyy
  dataISO: string;      // yyyy-MM-dd
  isHoje: boolean;
  nome: string;
  idGroot: string;
  cpf: string;
  teamLeader: string;
  processo: string;
  turno: string;
};

type PresencaResponse = {
  pendencias: Pendencia[];
  stats: { pendentesHoje: number; totalPendentes: number };
  filtros: { teamLeaders: string[]; datas: string[]; processos: string[] };
  hoje: string;
  atualizadoEm: string;
};

async function buscarPresenca(): Promise<PresencaResponse> {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || 'null');
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Lê cabeçalho da linha 1 (colunas de datas: BC em diante)
  const startColLetter = colNumToLetter(DATAS_START_COL);
  const endColLetter = colNumToLetter(DATAS_START_COL + 100); // ~100 dias de histórico

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!${startColLetter}1:${endColLetter}1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const headerRow: unknown[] = headerRes.data.values?.[0] ?? [];

  // 2. Identifica colunas da semana atual (segunda → hoje)
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  const inicioSemana = getInicioSemana(new Date());

  type ColInfo = { colOffset: number; colAbs: number; data: Date; dataBR: string; dataISO: string; isHoje: boolean };
  const colsValidas: ColInfo[] = [];

  for (let i = 0; i < headerRow.length; i++) {
    const d = parseSheetDate(headerRow[i]);
    if (!d) continue;
    d.setHours(12, 0, 0, 0);
    if (d > hoje) continue;
    if (d < inicioSemana) continue;
    const hojeMidnight = new Date(hoje);
    hojeMidnight.setHours(0, 0, 0, 0);
    colsValidas.push({
      colOffset: i,
      colAbs: DATAS_START_COL + i,   // 1-indexed absoluto
      data: d,
      dataBR: formatBR(d),
      dataISO: toYYYYMMDD(d),
      isHoje: d >= hojeMidnight,
    });
  }

  if (colsValidas.length === 0) {
    return {
      pendencias: [],
      stats: { pendentesHoje: 0, totalPendentes: 0 },
      filtros: { teamLeaders: [], datas: [], processos: [] },
      hoje: formatBR(new Date()),
      atualizadoEm: new Date().toISOString(),
    };
  }

  // 3. Lê colunas fixas (A até N = col 1-14)
  const fixosRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A2:N`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const fixosRows: string[][] = (fixosRes.data.values ?? []) as string[][];

  // 4. Lê APENAS as colunas de data relevantes
  const minColAbs = Math.min(...colsValidas.map(c => c.colAbs));
  const maxColAbs = Math.max(...colsValidas.map(c => c.colAbs));
  const datasRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!${colNumToLetter(minColAbs)}2:${colNumToLetter(maxColAbs)}`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const datasRows: string[][] = (datasRes.data.values ?? []) as string[][];

  // 5. Monta pendências
  const pendencias: Pendencia[] = [];

  for (let r = 0; r < fixosRows.length; r++) {
    const row = fixosRows[r];
    const nome = String(row[COL.NOME] ?? '').trim();
    if (!nome) continue;

    const dataDeslig = String(row[COL.DATA_DESLIG] ?? '').trim();
    if (dataDeslig) continue; // desligado

    const idGroot = String(row[COL.ID_GROOT] ?? '').trim();
    const cpf = String(row[COL.CPF] ?? '').trim();
    const teamLeader = String(row[COL.TEAM_LEADER] ?? '').trim();
    const processo = String(row[COL.PROCESSO] ?? '').trim();
    const turno = String(row[COL.TURNO] ?? '').trim();
    const dataEntradaStr = String(row[COL.DATA_ENTRADA] ?? '').trim();
    const dataEntrada = parseSheetDate(dataEntradaStr);

    const datasRow: string[] = datasRows[r] ?? [];

    for (const col of colsValidas) {
      // Pula se DATA_ENTRADA > data da coluna
      if (dataEntrada && dataEntrada > col.data) continue;

      const offsetLocal = col.colAbs - minColAbs;
      const celula = String(datasRow[offsetLocal] ?? '').trim();

      if (!celula) {
        pendencias.push({
          linha: r + 2, // +2 porque: +1 header, +1 0-indexed
          coluna: col.colAbs,
          data: col.dataBR,
          dataISO: col.dataISO,
          isHoje: col.isHoje,
          nome,
          idGroot,
          cpf: cpf ? `${cpf.slice(0, 3)}.***` : '',
          teamLeader,
          processo,
          turno,
        });
      }
    }
  }

  // Ordena: hoje primeiro, depois por data desc, depois nome
  pendencias.sort((a, b) => {
    if (a.isHoje !== b.isHoje) return a.isHoje ? -1 : 1;
    if (a.dataISO !== b.dataISO) return b.dataISO.localeCompare(a.dataISO);
    return a.nome.localeCompare(b.nome);
  });

  const tls = Array.from(new Set(pendencias.map(p => p.teamLeader).filter(Boolean))).sort();
  const datas = Array.from(new Set(pendencias.map(p => p.data))).sort((a, b) => {
    const [da, ma, ya] = a.split('/');
    const [db, mb, yb] = b.split('/');
    return `${ya}${ma}${da}` < `${yb}${mb}${db}` ? 1 : -1;
  });
  const processos = Array.from(new Set(pendencias.map(p => p.processo).filter(Boolean))).sort();

  return {
    pendencias,
    stats: {
      pendentesHoje: pendencias.filter(p => p.isHoje).length,
      totalPendentes: pendencias.length,
    },
    filtros: { teamLeaders: tls, datas, processos },
    hoje: formatBR(new Date()),
    atualizadoEm: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const forcar = searchParams.get('forcar') === '1';

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_SERVICE_ACCOUNT_KEY não configurada. Adicione nas variáveis de ambiente.' },
      { status: 503 }
    );
  }

  if (!forcar && memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return NextResponse.json({ ...memCache.data, fromCache: true });
  }

  try {
    const data = await buscarPresenca();
    memCache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[presenca/GET]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

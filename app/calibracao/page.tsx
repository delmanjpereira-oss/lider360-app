'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};

type HistoricoLinha = {
  id_groot: string;
  data_referencia: string;
  processo: string;
  prod_liquida: number;
  utilizacao: string | null;
  unidades: number;
};

type DpmoEvento = {
  id_groot: string | null;
  representante: string;
  checkin_data: string;
  qtd_dif: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
  processo: string;  // 'CK' ou 'P2M'
};

type DpmoAgregado = {
  id_groot: string | null;
  representante: string;
  processo: string;
  semana: number;
  ano: number;
  trimestre: string;
  dpmo: number;
};

type OcupacaoP2MTipo = {
  id_groot: string | null;
  user_id: string;
  data_referencia: string;
  nome_rep: string;
  qtd_totes: number;
  ocupacao_pct: number;
  mes: number;
  ano: number;
  trimestre: string;
};

type FeedbackTrim = {
  id_groot: string;
  classificacao: string;
  data_referencia: string | null;
  registrado_em: string;
};

type LinhaCalib = {
  id: number;
  idGroot: string;
  nome: string;
  processo: string;
  medMes: Record<number, { liq: number; ocup: number }>;
  liqTrim: number;
  ocupTrim: number;
  ima: number;
  imaDefeitos: number;
  imaUnidades: number;
  imaDiasAuditados: number;
  imaOrigem: 'auto' | 'manual' | 'vazio' | 'aguardando';
  que: string;
  como: string;
  comoOrigem: 'auto' | 'manual';
  aptidao: string;
};

const NOMES_MESES: Record<number, string> = {
  1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
  7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez',
};

const MESES_POR_TRIM: Record<string, number[]> = {
  Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12],
};

function normalizarNome(nome: string): string {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function getTrimestreDeData(dataStr: string): { quarter: string; ano: number; mes: number } {
  const data = new Date(dataStr + 'T12:00:00');
  const mes = data.getMonth() + 1;
  const ano = data.getFullYear();
  let q = 'Q1';
  if (mes >= 4 && mes <= 6) q = 'Q2';
  else if (mes >= 7 && mes <= 9) q = 'Q3';
  else if (mes >= 10) q = 'Q4';
  return { quarter: q, ano, mes };
}

function corNota(nota: string): string {
  if (nota === 'Supera') return 'bg-green-500/20 text-green-400';
  if (nota === 'Alinhado') return 'bg-blue-500/20 text-blue-400';
  if (nota === 'Abaixo') return 'bg-red-500/20 text-red-400';
  return 'bg-gray-500/20 text-gray-400';
}

function corAptidao(apt: string): string {
  if (apt === 'APTO') return 'bg-green-500 text-white';
  if (apt === 'EM OBSERVAÇÃO') return 'bg-yellow-500 text-black';
  if (apt === 'NÃO APTO') return 'bg-red-500 text-white';
  return 'bg-gray-500 text-white';
}

export default function CalibracaoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);
  const [dpmoEventos, setDpmoEventos] = useState<DpmoEvento[]>([]);
  const [dpmoAgregado, setDpmoAgregado] = useState<DpmoAgregado[]>([]);
  const [ocupacaoP2M, setOcupacaoP2M] = useState<OcupacaoP2MTipo[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackTrim[]>([]);
  const [metaIma, setMetaIma] = useState({ checkin: 1567, p2m: 1567 });
  const [metaOcup, setMetaOcup] = useState({ checkin: 75, p2m: 80 });
  const [metaLiq, setMetaLiq] = useState({ checkin: 296, p2m: 329 });
  const [loading, setLoading] = useState(true);
  const [trimestreSelecionado, setTrimestreSelecionado] = useState<string>('');

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [colabResp, histResp, dpmoResp, dpmoAggResp, ocupResp, fbResp, confResp] = await Promise.all([
        supabase.from('colaboradores').select('*').eq('status', 'Ativo'),
        supabase.from('historico').select('id_groot, data_referencia, processo, prod_liquida, utilizacao, unidades'),
        supabase.from('dpmo_eventos').select('id_groot, representante, checkin_data, qtd_dif, semana, ano, mes, trimestre, processo'),
        supabase.from('dpmo_agregado').select('id_groot, representante, processo, semana, ano, trimestre, dpmo'),
        supabase.from('ocupacao_p2m').select('id_groot, user_id, data_referencia, nome_rep, qtd_totes, ocupacao_pct, mes, ano, trimestre'),
        supabase.from('feedbacks').select('id_groot, classificacao, data_referencia, registrado_em'),
        supabase.from('config').select('chave, valor'),
      ]);

      if (colabResp.data) setColaboradores(colabResp.data);
      if (histResp.data) setHistorico(histResp.data);
      if (dpmoResp.data) setDpmoEventos(dpmoResp.data as DpmoEvento[]);
      if (dpmoAggResp.data) setDpmoAgregado(dpmoAggResp.data as DpmoAgregado[]);
      if (ocupResp.data) setOcupacaoP2M(ocupResp.data as OcupacaoP2MTipo[]);
      if (fbResp.data) setFeedbacks(fbResp.data as FeedbackTrim[]);
      if (confResp.data) {
        const map: Record<string, number> = {};
        confResp.data.forEach((c: { chave: string; valor: string }) => {
          map[c.chave] = Number(c.valor);
        });
        setMetaIma({ checkin: map.meta_ima_checkin || 1567, p2m: map.meta_ima_p2m || 1567 });
        setMetaOcup({ checkin: map.meta_ocupacao_checkin || 75, p2m: map.meta_ocupacao_p2m || 80 });
        setMetaLiq({ checkin: map.meta_checkin_base || 296, p2m: map.meta_p2m_base || 329 });
      }
    } finally {
      setLoading(false);
    }
  }

  const trimestresDisponiveis = useMemo(() => {
    const set = new Set<string>();
    historico.forEach((h) => {
      const { quarter, ano } = getTrimestreDeData(h.data_referencia);
      set.add(`${ano}-${quarter}`);
    });
    dpmoEventos.forEach((d) => {
      set.add(`${d.ano}-${d.trimestre}`);
    });
    return Array.from(set).sort().reverse();
  }, [historico, dpmoEventos]);

  useEffect(() => {
    if (!trimestreSelecionado && trimestresDisponiveis.length > 0) {
      setTrimestreSelecionado(trimestresDisponiveis[0]);
    }
  }, [trimestresDisponiveis, trimestreSelecionado]);

  const [anoSel = '', quarterSel = ''] = trimestreSelecionado.split('-');
  const anoNum = parseInt(anoSel) || new Date().getFullYear();
  const mesesPossiveis = MESES_POR_TRIM[quarterSel] || [];

  const mesesComDados = useMemo(() => {
    if (!quarterSel) return [];
    const set = new Set<number>();
    historico.forEach((h) => {
      const { ano, mes, quarter } = getTrimestreDeData(h.data_referencia);
      if (ano === anoNum && quarter === quarterSel) set.add(mes);
    });
    return mesesPossiveis.filter((m) => set.has(m)).sort();
  }, [historico, anoNum, quarterSel, mesesPossiveis]);

  const linhasCalibracao: LinhaCalib[] = useMemo(() => {
    if (!quarterSel) return [];

    return colaboradores.map((c) => {
      const histColab = historico.filter((h) => {
        if (h.id_groot !== c.id_groot) return false;
        const { quarter, ano } = getTrimestreDeData(h.data_referencia);
        return ano === anoNum && quarter === quarterSel;
      });

      const mediasPorMes: Record<number, { liq: number[]; ocup: number[] }> = {};
      histColab.forEach((h) => {
        const { mes } = getTrimestreDeData(h.data_referencia);
        if (!mediasPorMes[mes]) mediasPorMes[mes] = { liq: [], ocup: [] };
        if (h.prod_liquida > 0) mediasPorMes[mes].liq.push(h.prod_liquida);
        // ⚠️ Utilização do CSV de produtividade NÃO é usada como ocupação
        // Ocupação real virá de tabelas específicas (ocupacao_p2m, ocupacao_checkin futuro)
      });

      // 🎯 Pra P2M, ocupação vem da tabela ocupacao_p2m (CSV Totefullness)
      if (c.processo === 'P2M') {
        const ocupColab = ocupacaoP2M.filter((o) => {
          if (o.ano !== anoNum || o.trimestre !== quarterSel) return false;
          return o.id_groot === c.id_groot;
        });
        ocupColab.forEach((o) => {
          if (!mediasPorMes[o.mes]) mediasPorMes[o.mes] = { liq: [], ocup: [] };
          if (o.ocupacao_pct > 0) mediasPorMes[o.mes].ocup.push(o.ocupacao_pct);
        });
      }

      // 🚧 Pra Checkin, ocupação vem da tabela ocupacao_checkin (FUTURA — ainda não criada)
      // Por enquanto, Checkin NÃO TEM ocupação na calibração
      // Quando criar a tabela e o CSV específico, adicionar lógica aqui similar à do P2M

      const mediaMes = (mes: number, tipo: 'liq' | 'ocup') => {
        const arr = mediasPorMes[mes]?.[tipo] || [];
        if (arr.length === 0) return 0;
        return arr.reduce((s, v) => s + v, 0) / arr.length;
      };

      const medMes: Record<number, { liq: number; ocup: number }> = {};
      mesesPossiveis.forEach((m) => {
        medMes[m] = {
          liq: Math.round(mediaMes(m, 'liq')),
          ocup: Math.round(mediaMes(m, 'ocup')),
        };
      });

      const liqsValidas = mesesPossiveis.map((m) => medMes[m].liq).filter((v) => v > 0);
      const ocupsValidas = mesesPossiveis.map((m) => medMes[m].ocup).filter((v) => v > 0);
      const liqTrim = liqsValidas.length > 0 ? Math.round(liqsValidas.reduce((s, v) => s + v, 0) / liqsValidas.length) : 0;
      const ocupTrim = ocupsValidas.length > 0 ? Math.round(ocupsValidas.reduce((s, v) => s + v, 0) / ocupsValidas.length) : 0;

      // 🎯 CÁLCULO IMA INTELIGENTE — Só usa UNIDADES dos dias auditados
      const quarterKey = `${anoNum}-${quarterSel}`;

      let ima = 0;
      let imaDefeitos = 0;
      let imaUnidades = 0;
      let imaDiasAuditados = 0;
      let imaOrigem: 'auto' | 'vazio' | 'aguardando' = 'vazio';

      if (c.processo === 'Checkin' || c.processo === 'P2M') {
        const nomeNorm = normalizarNome(c.nome);
        const procDpmo = c.processo === 'Checkin' ? 'CK' : 'P2M';

        // 1. Pega eventos do trimestre desse colaborador (filtra POR PROCESSO PRINCIPAL)
        const eventosTrim = dpmoEventos.filter((d) => {
          if (d.ano !== anoNum || d.trimestre !== quarterSel) return false;
          if (d.processo !== procDpmo) return false; // 🎯 Só dados do processo principal
          if (d.id_groot === c.id_groot) return true;
          if (!d.id_groot && normalizarNome(d.representante) === nomeNorm) return true;
          return false;
        });

        // 2. Acha a DATA MÁXIMA do inventário GERAL (de todos colaboradores)
        //    Looker usa essa data como limite — não pega produtividade depois dela
        let dataMaximaInventario = '';
        dpmoEventos.forEach((d) => {
          if (d.checkin_data > dataMaximaInventario) {
            dataMaximaInventario = d.checkin_data;
          }
        });

        // 3. Lista SEMANAS que têm inventário desse colaborador
        const semanasComInventario = new Set<string>(
          eventosTrim.map((e) => `${e.ano}-${e.semana}`)
        );

        // 4. Soma unidades das SEMANAS com inventário, MAS só dias ≤ data máxima geral
        const unidadesAuditadas = histColab
          .filter((h) => h.processo === c.processo)
          .filter((h) => {
            // Ignora dias depois da última auditoria
            if (dataMaximaInventario && h.data_referencia > dataMaximaInventario) return false;
            // Calcula semana ISO da data
            const d = new Date(h.data_referencia + 'T12:00:00');
            const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const diaDaSemana = utc.getUTCDay() || 7;
            utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
            const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
            const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
            return semanasComInventario.has(`${utc.getUTCFullYear()}-${semana}`);
          })
          .reduce((s, h) => s + (h.unidades || 0), 0);

        const totalDef = eventosTrim.reduce((s, d) => s + (d.qtd_dif || 0), 0);
        const datasAuditadas = new Set<string>(eventosTrim.map((e) => e.checkin_data));

        // Calcula só se tem os 2 dados
        if (unidadesAuditadas > 0 && eventosTrim.length > 0) {
          imaDefeitos = totalDef;
          imaUnidades = unidadesAuditadas;
          imaDiasAuditados = datasAuditadas.size;
          ima = Math.round((totalDef / unidadesAuditadas) * 1_000_000);
          imaOrigem = 'auto';
        } else if (histColab.length > 0 && eventosTrim.length === 0) {
          imaOrigem = 'aguardando';
        } else if (eventosTrim.length > 0 && unidadesAuditadas === 0) {
          imaOrigem = 'aguardando';
        }
      }

      // QUE
      let que = 'Sem dados';
      if (c.processo === 'Checkin' || c.processo === 'P2M') {
        const metaL = c.processo === 'Checkin' ? metaLiq.checkin : metaLiq.p2m;
        const metaO = c.processo === 'Checkin' ? metaOcup.checkin : metaOcup.p2m;
        const metaI = c.processo === 'Checkin' ? metaIma.checkin : metaIma.p2m;

        let pontos = 0;
        if (liqTrim >= metaL) pontos++;
        if (ocupTrim >= metaO) pontos++;
        if (ima > 0 && ima <= metaI) pontos++;

        if (liqTrim === 0 && ocupTrim === 0 && ima === 0) que = 'Sem dados';
        else if (pontos === 3) que = 'Supera';
        else if (pontos >= 1) que = 'Alinhado';
        else que = 'Abaixo';
      } else if (c.processo === 'Sorting') {
        if (liqTrim === 0) que = 'Sem dados';
        else que = 'Alinhado';
      }

      let como = 'Sem feedbacks';
      const comoOrigem: 'auto' = 'auto';

      const fbsTrim = feedbacks.filter((f) => {
        if (f.id_groot !== c.id_groot) return false;
        const dataRef = f.data_referencia || f.registrado_em;
        const data = new Date(dataRef);
        const mes = data.getMonth() + 1;
        const ano = data.getFullYear();
        return ano === anoNum && mesesPossiveis.includes(mes);
      });

      if (fbsTrim.length > 0) {
        const supera = fbsTrim.filter((f) => f.classificacao === 'Supera').length;
        const alinhado = fbsTrim.filter((f) => f.classificacao === 'Alinhado').length;
        const abaixo = fbsTrim.filter((f) => f.classificacao === 'Abaixo').length;
        if (abaixo > supera + alinhado) como = 'Abaixo';
        else if (supera >= alinhado && supera >= abaixo) como = 'Supera';
        else como = 'Alinhado';
      }

      let aptidao = 'Sem dados';
      if (que !== 'Sem dados') {
        if (que === 'Abaixo' || como === 'Abaixo') aptidao = 'NÃO APTO';
        else if (que === 'Supera' && (como === 'Supera' || como === 'Alinhado')) aptidao = 'APTO';
        else aptidao = 'EM OBSERVAÇÃO';
      }

      return {
        id: c.id,
        idGroot: c.id_groot,
        nome: c.nome,
        processo: c.processo || 'Sem processo',
        medMes,
        liqTrim,
        ocupTrim,
        ima,
        imaDefeitos,
        imaUnidades,
        imaDiasAuditados,
        imaOrigem,
        que,
        como,
        comoOrigem,
        aptidao,
      };
    });
  }, [colaboradores, historico, dpmoEventos, dpmoAgregado, ocupacaoP2M, feedbacks, anoNum, quarterSel, mesesPossiveis, metaIma, metaLiq, metaOcup]);

  const porProcesso = {
    Checkin: linhasCalibracao.filter((l) => l.processo === 'Checkin').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    P2M: linhasCalibracao.filter((l) => l.processo === 'P2M').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    Sorting: linhasCalibracao.filter((l) => l.processo === 'Sorting').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };

  const totalAptos = linhasCalibracao.filter((l) => l.aptidao === 'APTO').length;
  const totalObs = linhasCalibracao.filter((l) => l.aptidao === 'EM OBSERVAÇÃO').length;
  const totalNaoAptos = linhasCalibracao.filter((l) => l.aptidao === 'NÃO APTO').length;
  const totalAguardando = linhasCalibracao.filter((l) => l.imaOrigem === 'aguardando').length;

  // 🎯 EXPORTAR CSV (planilha) — versão completa pra líder
  function exportarCSV(processo: 'Checkin' | 'P2M' | 'Sorting') {
    const linhas = porProcesso[processo];
    if (linhas.length === 0) return;

    const incluiOcup = processo !== 'Checkin'; // Checkin não tem ocupação ainda

    const headers: string[] = ['ID', 'Nome', 'Processo'];
    mesesComDados.forEach((m) => {
      headers.push(`${NOMES_MESES[m]}_Liq`);
      if (incluiOcup) headers.push(`${NOMES_MESES[m]}_Ocup`);
    });
    headers.push('Trim_Liq');
    if (incluiOcup) headers.push('Trim_Ocup');
    headers.push('IMA', 'QUE', 'COMO', 'APTIDAO');

    const rows = linhas.map((l) => {
      const row: (string | number)[] = [l.idGroot, l.nome, l.processo];
      mesesComDados.forEach((m) => {
        row.push(l.medMes[m]?.liq || '-');
        if (incluiOcup) row.push(l.medMes[m]?.ocup ? `${l.medMes[m].ocup}%` : '-');
      });
      row.push(l.liqTrim || '-');
      if (incluiOcup) row.push(l.ocupTrim ? `${l.ocupTrim}%` : '-');
      row.push(l.imaOrigem === 'aguardando' ? 'aguardando' : (l.ima || '-'));
      row.push(l.que);
      row.push(l.como);
      row.push(l.aptidao);
      return row;
    });

    // BOM pra abrir certo no Excel
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows]
      .map((r) => r.map((v) => {
        const s = String(v);
        return s.includes(';') || s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';'))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Calibracao_${processo}_${trimestreSelecionado}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    window.showToast('success', `📥 ${processo} exportado!`);
  }

  // 🎯 GERAR PRINT PÚBLICO — só ID + indicadores, SEM nome, QUE e COMO
  async function gerarPrintPublico(processo: 'Checkin' | 'P2M' | 'Sorting') {
    const linhas = porProcesso[processo];
    if (linhas.length === 0) return;

    const procEmoji = processo === 'Checkin' ? '📦' : processo === 'P2M' ? '🚚' : '📋';

    // 🎯 Acha a DATA MÁXIMA dos dados
    let dataMax = '';
    historico.forEach((h) => {
      if (h.data_referencia > dataMax) dataMax = h.data_referencia;
    });
    const dataMaxFormatada = dataMax ? new Date(dataMax + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

    const anoAtual = new Date().getFullYear();
    const mesesTrim = mesesComDados;

    // 🎯 FILTRO: só inclui colaboradores que TEM PELO MENOS 1 DADO no trimestre
    //    (líquida > 0 OU IMA > 0 OU ocupação > 0)
    const linhasComDados = linhas.filter((l) => {
      const temLiq = l.liqTrim > 0;
      const temIma = l.ima > 0;
      const temOcup = l.ocupTrim > 0;
      return temLiq || temIma || temOcup;
    });

    if (linhasComDados.length === 0) {
      window.showToast('error', `Nenhum colaborador de ${processo} tem dados no trimestre`);
      return;
    }

    // 🎯 Ordena por LÍQUIDA do trimestre, do maior pro menor
    const linhasOrdenadas = [...linhasComDados].sort((a, b) => (b.liqTrim || 0) - (a.liqTrim || 0));

    // Definição de colunas de qualidade
    const temIma = processo === 'Checkin' || processo === 'P2M';
    const temOcup = processo === 'P2M';
    const colsQualidade = (temIma ? 1 : 0) + (temOcup ? 1 : 0);

    // 🎨 Cores SIMPLES: VERDE (na meta) + VERMELHO (abaixo)
    function corStatus(valor: number, meta: number, inverso: boolean = false): string {
      if (valor === 0) return '#6b7280';
      if (inverso) return valor <= meta ? '#10b981' : '#ef4444';
      return valor >= meta ? '#10b981' : '#ef4444';
    }

    // Largura dinâmica baseada em quantos meses + colunas
    const numColsTotal = 1 + mesesTrim.length + colsQualidade + 1; // ID + meses + qualidade + trim
    const widthBase = Math.max(600, numColsTotal * 110);

    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed; top: -9999px; left: -9999px;
      width: ${widthBase}px; padding: 24px; background: #0a0a0a; color: white;
      font-family: -apple-system, system-ui, sans-serif;
    `;

    div.innerHTML = `
      <!-- HEADER -->
      <div style="text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #FFD700;">
        <h1 style="color: #FFD700; font-size: 22px; font-weight: 900; margin: 0; letter-spacing: 1px;">
          ${procEmoji} CALIBRAÇÃO ${processo.toUpperCase()} — TRIMESTRE ${quarterSel}
        </h1>
        <p style="color: #aaa; font-size: 12px; margin: 6px 0 0 0;">
          📅 Dados puxados até ${dataMaxFormatada} · ${linhasOrdenadas.length} colaboradores
        </p>
      </div>

      <!-- TABELA -->
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <!-- Linha 1: SEÇÕES PRINCIPAIS (mesma altura pra todas) -->
          <tr style="height: 50px;">
            <th style="padding: 14px 18px; text-align: center; background: #2a2a2a; color: #FFD700; font-size: 14px; font-weight: 900; border: 2px solid #FFD700; min-width: 160px;">
              ID COLABORADOR
            </th>
            <th colspan="${mesesTrim.length}" style="padding: 14px 12px; text-align: center; background: #d4a017; color: #000; font-weight: 900; font-size: 13px; border: 2px solid #FFD700;">
              📈 PRODUTIVIDADE
            </th>
            ${colsQualidade > 0 ? `
              <th colspan="${colsQualidade}" style="padding: 14px 12px; text-align: center; background: #7c3aed; color: #fff; font-weight: 900; font-size: 13px; border: 2px solid #a855f7;">
                🎯 QUALIDADE
              </th>
            ` : ''}
            <th style="padding: 14px 18px; text-align: center; background: #047857; color: #ffffff; font-weight: 900; font-size: 14px; border: 2px solid #10b981; min-width: 160px;">
              🏆 TRIMESTRE
            </th>
          </tr>
          <!-- Linha 2: SUB-CABEÇALHOS -->
          <tr style="background: #1a1a1a;">
            <th style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #2a2a2a; color: #888; font-size: 10px; font-weight: bold;">
              &nbsp;
            </th>
            ${mesesTrim.map((m) => `
              <th style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #2a2a2a; color: #FFD700; font-size: 10px; font-weight: bold;">${NOMES_MESES[m]}</th>
            `).join('')}
            ${temIma ? `
              <th style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #2a2a2a; color: #c084fc; font-size: 10px; font-weight: bold;">IMA</th>
            ` : ''}
            ${temOcup ? `
              <th style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #2a2a2a; color: #c084fc; font-size: 10px; font-weight: bold;">Ocupação</th>
            ` : ''}
            <th style="padding: 8px 6px; text-align: center; border-bottom: 1px solid #2a2a2a; color: #888; font-size: 10px; font-weight: bold;">
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          ${linhasOrdenadas.map((l, idx) => {
            const isPar = idx % 2 === 0;
            const bg = isPar ? '#141414' : '#0f0f0f';

            // Líquida do TRIMESTRE
            const liqTrim = l.liqTrim || 0;
            const metaL = processo === 'Checkin' ? metaLiq.checkin : metaLiq.p2m;
            const corTrim = corStatus(liqTrim, metaL);

            // Células dos meses (sem dados = 0)
            const mesesCells = mesesTrim.map((m) => {
              const liqMes = l.medMes[m]?.liq || 0;
              const corMes = corStatus(liqMes, metaL);
              return `
                <td style="padding: 10px 6px; text-align: center; color: ${corMes}; font-family: monospace; font-weight: bold; font-size: 13px;">
                  ${liqMes}
                </td>
              `;
            }).join('');

            // IMA — Sem dados = 0 (verde, sem erro é bom!)
            let imaHtml = '';
            if (temIma) {
              const ima = l.ima || 0;
              const metaI = processo === 'Checkin' ? metaIma.checkin : metaIma.p2m;
              let corIma = '#10b981', imaTxt = '0';
              if (ima > 0) {
                corIma = corStatus(ima, metaI, true);
                imaTxt = ima.toLocaleString('pt-BR');
              }
              imaHtml = `<td style="padding: 10px 8px; text-align: center; color: ${corIma}; font-family: monospace; font-weight: bold; font-size: 13px;">${imaTxt}</td>`;
            }

            // OCUPAÇÃO (só P2M) — Sem dados = "0%"
            let ocupHtml = '';
            if (temOcup) {
              const ocup = l.ocupTrim || 0;
              const metaO = metaOcup.p2m;
              let corOcup = '#ef4444', ocupTxt = '0%';
              if (ocup > 0) {
                corOcup = corStatus(ocup, metaO);
                ocupTxt = `${ocup}%`;
              }
              ocupHtml = `<td style="padding: 10px 8px; text-align: center; color: ${corOcup}; font-family: monospace; font-weight: bold; font-size: 13px;">${ocupTxt}</td>`;
            }

            return `
              <tr style="background: ${bg}; border-bottom: 1px solid #2a2a2a;">
                <td style="padding: 10px 8px; color: white; font-weight: bold; font-family: monospace; font-size: 13px; text-align: center;">${l.idGroot}</td>
                ${mesesCells}
                ${imaHtml}
                ${ocupHtml}
                <td style="padding: 10px 8px; text-align: center; background: rgba(16, 185, 129, 0.08); color: ${corTrim}; font-family: monospace; font-weight: 900; font-size: 14px;">${liqTrim}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <!-- LEGENDA -->
      <div style="margin-top: 14px; padding: 10px 16px; background: #1a1a1a; border-radius: 8px; display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; font-size: 11px; font-weight: bold;">
        <span style="color: #10b981;">🟢 NA META</span>
        <span style="color: #ef4444;">🔴 ABAIXO</span>
      </div>

      <!-- RODAPÉ -->
      <div style="margin-top: 8px; padding: 6px; font-size: 9px; color: #666; text-align: center;">
        📊 LIDER 360 · Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    `;

    document.body.appendChild(div);

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(div, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = `Calibracao_${processo}_${quarterSel}_${anoAtual}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      window.showToast('success', `📸 Print ${processo} gerado!`);
    } catch (e) {
      console.error(e);
      window.showToast('error', 'Erro ao gerar print');
    } finally {
      document.body.removeChild(div);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Calculando calibração...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">🎯 Calibração <span className="text-[#FFD700]">Trimestral</span></h1>
        <p className="text-gray-400">IMA = (Σ Defeitos / Σ Unidades das semanas auditadas) × 1M · Bate 100% Looker</p>
      </div>

      {trimestresDisponiveis.length === 0 ? (
        <div className="bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum dado ainda</h3>
          <p className="text-gray-400 mb-4">Faça upload de CSV de produtividade ou DPMO pra começar</p>
        </div>
      ) : (
        <>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-bold text-gray-300">Trimestre:</label>
              <select value={trimestreSelecionado} onChange={(e) => setTrimestreSelecionado(e.target.value)} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white font-bold focus:border-[#FFD700] focus:outline-none">
                {trimestresDisponiveis.map((t) => {
                  const [a, q] = t.split('-');
                  const meses = MESES_POR_TRIM[q].map((m) => NOMES_MESES[m]).join('/');
                  return <option key={t} value={t}>{a} • {q} ({meses})</option>;
                })}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-green-400">{totalAptos}</div>
                <div className="text-xs text-gray-500">Aptos</div>
              </div>
              <div className="w-px h-10 bg-[#2a2a2a]"></div>
              <div className="text-center">
                <div className="text-2xl font-black text-yellow-400">{totalObs}</div>
                <div className="text-xs text-gray-500">Observação</div>
              </div>
              <div className="w-px h-10 bg-[#2a2a2a]"></div>
              <div className="text-center">
                <div className="text-2xl font-black text-red-400">{totalNaoAptos}</div>
                <div className="text-xs text-gray-500">Não Aptos</div>
              </div>
              {totalAguardando > 0 && (
                <>
                  <div className="w-px h-10 bg-[#2a2a2a]"></div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-blue-400">{totalAguardando}</div>
                    <div className="text-xs text-gray-500">Aguardando IMA</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {totalAguardando > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm">
              <p className="text-blue-300">
                ⏳ <strong>{totalAguardando} colaboradores</strong> aguardando dados de DPMO. Sobe o CSV INVENTÁRIO DPMO em MEU TIME pra completar.
              </p>
            </div>
          )}

          {(['Checkin', 'P2M', 'Sorting'] as const).map((proc) => {
            const linhas = porProcesso[proc];
            if (linhas.length === 0) return null;

            return (
              <div key={proc} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
                <div className="bg-[#0a0a0a] px-6 py-3 border-b border-[#2a2a2a] flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-lg font-bold text-[#FFD700]">
                    {proc === 'Checkin' ? '📦' : proc === 'P2M' ? '🚚' : '📋'} {proc}{' '}
                    <span className="text-sm font-normal text-gray-400">({linhas.length} colaboradores)</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => exportarCSV(proc)}
                      title="Baixar planilha Excel (completa)"
                      className="bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-green-500/30 transition-all flex items-center gap-1.5"
                    >
                      📥 Excel
                    </button>
                    <button
                      onClick={() => gerarPrintPublico(proc)}
                      title="Gerar print público (sem nome/QUE/COMO)"
                      className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-500/30 transition-all flex items-center gap-1.5"
                    >
                      📸 Print público
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400">
                        <th className="py-3 px-3" rowSpan={2}>Colab.</th>
                        {mesesComDados.map((m) => (
                          <th key={m} colSpan={proc === 'Checkin' ? 1 : 2} className="py-3 px-2 text-center border-l border-[#2a2a2a]">{NOMES_MESES[m]}</th>
                        ))}
                        <th colSpan={proc === 'Checkin' ? 1 : 2} className="py-3 px-2 text-center bg-[#0a0a0a] border-l border-[#2a2a2a]">Trim.</th>
                        <th className="py-3 px-3 text-center" rowSpan={2}>IMA</th>
                        <th className="py-3 px-2 text-center" rowSpan={2}>QUE</th>
                        <th className="py-3 px-2 text-center" rowSpan={2}>COMO</th>
                        <th className="py-3 px-2 text-center" rowSpan={2}>APTIDÃO</th>
                      </tr>
                      <tr className="border-b border-[#2a2a2a] text-xs text-gray-500">
                        {mesesComDados.map((m) => (
                          <>
                            <th key={`${m}-l`} className="py-1 text-center border-l border-[#2a2a2a]">Líq</th>
                            {proc !== 'Checkin' && <th key={`${m}-o`} className="py-1 text-center">Oc%</th>}
                          </>
                        ))}
                        <th className="py-1 text-center bg-[#0a0a0a] border-l border-[#2a2a2a]">Líq</th>
                        {proc !== 'Checkin' && <th className="py-1 text-center bg-[#0a0a0a]">Oc%</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.idGroot} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                          <td className="py-2 px-3">
                            <div className="text-white text-xs font-bold truncate max-w-[140px]">{l.nome}</div>
                            <div className="text-xs text-gray-500 font-mono">{l.idGroot}</div>
                          </td>
                          {mesesComDados.map((m) => (
                            <>
                              <td key={`${l.idGroot}-${m}-l`} className="py-2 px-2 text-center text-gray-300 font-mono text-xs border-l border-[#2a2a2a]">{l.medMes[m]?.liq || '-'}</td>
                              {proc !== 'Checkin' && (
                                <td key={`${l.idGroot}-${m}-o`} className="py-2 px-2 text-center text-gray-300 font-mono text-xs">{l.medMes[m]?.ocup ? l.medMes[m].ocup + '%' : '-'}</td>
                              )}
                            </>
                          ))}
                          <td className="py-2 px-2 text-center bg-[#0a0a0a] text-white font-bold font-mono border-l border-[#2a2a2a]">{l.liqTrim || '-'}</td>
                          {proc !== 'Checkin' && (
                            <td className="py-2 px-2 text-center bg-[#0a0a0a] text-white font-bold font-mono">{l.ocupTrim ? l.ocupTrim + '%' : '-'}</td>
                          )}

                          <td className="py-2 px-3 text-center">
                            <div className="px-1 py-0.5">
                              {l.imaOrigem === 'aguardando' ? (
                                <div className="text-blue-400 font-bold text-xs">⏳</div>
                              ) : (
                                <div className="text-white font-bold font-mono text-xs">{l.ima || '-'}</div>
                              )}
                              {l.imaOrigem === 'auto' && (
                                <div className="text-[8px] text-green-400" title={`${l.imaDefeitos} defeitos / ${l.imaUnidades.toLocaleString('pt-BR')} unidades`}>
                                  auto
                                </div>
                              )}
                              {l.imaOrigem === 'aguardando' && (
                                <div className="text-[8px] text-blue-400">aguarda</div>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${corNota(l.que)}`}>{l.que}</span>
                          </td>

                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${corNota(l.como)}`}>{l.como}</span>
                          </td>

                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs px-2 py-1 rounded font-bold ${corAptidao(l.aptidao)}`}>{l.aptidao}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm text-blue-300">
            <p className="font-bold mb-2">💡 Cálculo igual Looker:</p>
            <ul className="space-y-1 list-disc pl-5 text-xs">
              <li><strong>IMA</strong> = Σ Defeitos ÷ Σ Unidades das semanas auditadas <strong>até a última data com inventário</strong></li>
              <li>Ignora dias de produtividade <strong>depois</strong> da última auditoria (mesmo se tem no banco)</li>
              <li>Ex: produtividade até 16/05 + inventário até 15/05 → usa unidades só até 15/05</li>
              <li><strong>QUE</strong> = Líquida + Ocupação + IMA (3 pontos: Supera / 1-2: Alinhado / 0: Abaixo)</li>
              <li><strong>COMO</strong> = derivado dos feedbacks. Pode SOBRESCREVER clicando</li>
              <li><strong>APTIDÃO</strong>: QUE=Supera + COMO≥Alinhado → APTO | Algum Abaixo → NÃO APTO | Resto → EM OBSERVAÇÃO</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import ApolloBadge from '../components/ApolloBadge';
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
  processo: string;
};
type DpmoAgregado = {
  id_groot: string | null;
  representante: string;
  processo: string;
  semana: number;
  ano: number;
  mes?: number;
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
type PresencaTipo = {
  id_groot: string;
  data_referencia: string;
  motivo: string | null;
  categoria: string | null;
  conta_abs: boolean;
  conta_presenca: boolean;
  status: string;
};
type AbsManualTipo = {
  id_groot: string;
  mes: number;
  ano: number;
  abs_pct: number;
};
type LinhaCalib = {
  id: number;
  idGroot: string;
  nome: string;
  processo: string;
  medMes: Record<number, { liq: number; ocup: number; ima: number; abs: number | null }>;
  liqTrim: number;
  ocupTrim: number;
  absTrim: number | null;
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
const NOMES_MESES_FULL: Record<number, string> = {
  1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
  7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO',
};
const MESES_POR_TRIM: Record<string, number[]> = {
  Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12],
};
function normalizarProcesso(p: string | null | undefined): string {
  if (!p) return '';
  const norm = String(p).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (norm === 'CK' || norm === 'CHECKIN' || norm === 'CHECK') return 'CHECKIN';
  if (norm === 'P2M') return 'P2M';
  if (norm === 'SORTING' || norm === 'SORT') return 'SORTING';
  return norm;
}
function processosIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizarProcesso(a) === normalizarProcesso(b);
}
function normalizarNome(nome: string): string {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}
function nomesIguais(a: string, b: string): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const limpar = (s: string) => s.split(' ').filter((p) => p.length > 1 && !['DA', 'DE', 'DO', 'DOS', 'DAS', 'E'].includes(p));
  const partesA = limpar(na);
  const partesB = limpar(nb);
  if (partesA.length === 0 || partesB.length === 0) return false;
  let comuns = 0;
  partesA.forEach((p) => { if (partesB.includes(p)) comuns++; });
  const minTamanho = Math.min(partesA.length, partesB.length);
  return (comuns / minTamanho) >= 0.6;
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
async function carregarLogoBase64(): Promise<string> {
  try {
    const res = await fetch('/logos/pngwing.com.png');
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Não conseguiu carregar logo:', e);
    return '';
  }
}
export default function CalibracaoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);
  const [produtividadeMensal, setProdutividadeMensal] = useState<any[]>([]);
  const [imaManual, setImaManual] = useState<any[]>([]);
  const [dpmoEventos, setDpmoEventos] = useState<DpmoEvento[]>([]);
  const [dpmoAgregado, setDpmoAgregado] = useState<DpmoAgregado[]>([]);
  const [ocupacaoP2M, setOcupacaoP2M] = useState<OcupacaoP2MTipo[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackTrim[]>([]);
  const [presencaData, setPresencaData] = useState<PresencaTipo[]>([]);
  const [absManual, setAbsManual] = useState<AbsManualTipo[]>([]);
  const [metaIma, setMetaIma] = useState({ checkin: 1567, p2m: 1567 });
  const [metaOcup, setMetaOcup] = useState({ checkin: 75, p2m: 80 });
  const [metaLiq, setMetaLiq] = useState({ checkin: 296, p2m: 329 });
  const [loading, setLoading] = useState(true);
  const [trimestreSelecionado, setTrimestreSelecionado] = useState<string>('');
  useEffect(() => {
    carregar();
  }, []);
  async function fetchAll(query: any, tableName: string): Promise<any[]> {
    const todos: any[] = [];
    const PAGE_SIZE = 1000;
    let pagina = 0;
    while (true) {
      const from = pagina * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await query.range(from, to);
      if (error) {
        console.error(`❌ Erro paginando ${tableName} pag ${pagina}:`, error);
        return todos;
      }
      if (!data || data.length === 0) break;
      todos.push(...data);
      if (data.length < PAGE_SIZE) break;
      pagina++;
      if (pagina > 50) {
        console.warn(`⚠️ ${tableName} parou em 50 páginas`);
        break;
      }
    }
    console.log(`📦 ${tableName}: ${todos.length} registros baixados em ${pagina + 1} página(s)`);
    return todos;
  }
  async function carregar() {
    setLoading(true);
    try {
      const [
        colabData,
        histData,
        prodMensalData,
        dpmoData,
        dpmoAggData,
        ocupData,
        fbData,
        imaManualData,
        presData,
        absManualData,
        confResp,
      ] = await Promise.all([
        fetchAll(supabase.from('colaboradores').select('*').eq('status', 'Ativo'), 'colaboradores'),
        fetchAll(supabase.from('historico').select('id_groot, data_referencia, processo, prod_liquida, utilizacao, unidades'), 'historico'),
        fetchAll(supabase.from('produtividade_mensal').select('id_groot, nome, mes, ano, trimestre, processo, prod_liquida_media, unidades_total, dias_trabalhados'), 'produtividade_mensal'),
        fetchAll(supabase.from('dpmo_eventos').select('id_groot, representante, checkin_data, qtd_dif, semana, ano, mes, trimestre, processo'), 'dpmo_eventos'),
        fetchAll(supabase.from('dpmo_agregado').select('id_groot, representante, processo, semana, mes, ano, trimestre, dpmo'), 'dpmo_agregado'),
        fetchAll(supabase.from('ocupacao_p2m').select('id_groot, user_id, data_referencia, nome_rep, qtd_totes, ocupacao_pct, mes, ano, trimestre'), 'ocupacao_p2m'),
        fetchAll(supabase.from('feedbacks').select('id_groot, classificacao, data_referencia, registrado_em'), 'feedbacks'),
        fetchAll(supabase.from('ima_manual').select('id_groot, mes, ano, trimestre, processo, ima'), 'ima_manual'),
        fetchAll(supabase.from('presenca').select('id_groot, data_referencia, motivo, categoria, conta_abs, conta_presenca, status'), 'presenca'),
        fetchAll(supabase.from('abs_manual').select('id_groot, mes, ano, abs_pct'), 'abs_manual'),
        supabase.from('config').select('chave, valor'),
      ]);
      console.log('🔍 ===== DEBUG CALIBRAÇÃO =====');
      console.log('👥 Colaboradores:', colabData.length);
      console.log('📅 Histórico diário:', histData.length);
      console.log('📆 Produtividade MENSAL:', prodMensalData.length);
      console.log('🔥 DPMO eventos TOTAL:', dpmoData.length);
      console.log('🔥 DPMO agregado TOTAL:', dpmoAggData.length);
      console.log('📷 IMA Manual TOTAL:', imaManualData.length);
      console.log('🗓️ Presença TOTAL:', presData.length);
      console.log('✏️ ABS Manual TOTAL:', absManualData.length);
      setColaboradores(colabData);
      setHistorico(histData);
      setProdutividadeMensal(prodMensalData);
      setImaManual(imaManualData);
      setDpmoEventos(dpmoData as DpmoEvento[]);
      setDpmoAgregado(dpmoAggData as DpmoAgregado[]);
      setOcupacaoP2M(ocupData as OcupacaoP2MTipo[]);
      setFeedbacks(fbData as FeedbackTrim[]);
      setPresencaData(presData as PresencaTipo[]);
      setAbsManual(absManualData as AbsManualTipo[]);
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
  // ✏️ Salva o ABS Operacional digitado à mão pra um colaborador/mês
  async function salvarAbsManual(idGroot: string, mes: number, valorRaw: string) {
    const limpo = valorRaw.replace('%', '').replace(',', '.').trim();
    if (limpo === '') {
      await supabase.from('abs_manual').delete().match({ id_groot: idGroot, mes, ano: anoNum });
      setAbsManual((prev) => prev.filter((x) => !(x.id_groot === idGroot && x.mes === mes && x.ano === anoNum)));
      (window as any).showToast?.('success', '✅ ABS removido (voltou ao cálculo automático)');
      return;
    }
    const valor = Number(limpo);
    if (isNaN(valor) || valor < 0 || valor > 100) return;
    const arredondado = Number(valor.toFixed(2));
    const { error } = await supabase
      .from('abs_manual')
      .upsert(
        { id_groot: idGroot, mes, ano: anoNum, trimestre: quarterSel, abs_pct: arredondado },
        { onConflict: 'id_groot,mes,ano' }
      );
    if (error) {
      console.error('Erro ao salvar ABS manual:', error);
      (window as any).showToast?.('error', '❌ Erro ao salvar ABS: ' + error.message);
      return;
    }
    setAbsManual((prev) => {
      const semEsse = prev.filter((x) => !(x.id_groot === idGroot && x.mes === mes && x.ano === anoNum));
      return [...semEsse, { id_groot: idGroot, mes, ano: anoNum, abs_pct: arredondado }];
    });
    // ⚠️ o salvamento é assíncrono — espera esse toast aparecer antes de
    // clicar em "Gerar Print", senão o print pode sair com o valor antigo
    (window as any).showToast?.('success', `✅ ABS salvo: ${arredondado}% · pode gerar o print`);
  }
  // ✏️ NOVO: Salva o IMA digitado à mão pra um colaborador/mês (mesmo padrão do ABS).
  // Grava na tabela ima_manual, que JÁ é lida e priorizada no cálculo — só faltava
  // uma forma de editar direto na tela em vez de precisar do upload de print/CSV.
  async function salvarImaManual(idGroot: string, mes: number, valorRaw: string, processo: string) {
    const limpo = valorRaw.replace(/\./g, '').replace(',', '.').trim();
    if (limpo === '') {
      await supabase.from('ima_manual').delete().match({ id_groot: idGroot, mes, ano: anoNum, processo });
      setImaManual((prev) => prev.filter((x) => !(String(x.id_groot) === idGroot && Number(x.mes) === mes && Number(x.ano) === anoNum && processosIguais(x.processo, processo))));
      (window as any).showToast?.('success', '✅ IMA removido (voltou ao cálculo automático)');
      return;
    }
    const valor = Number(limpo);
    if (isNaN(valor) || valor < 0) return;
    const arredondado = Math.round(valor);
    const { error } = await supabase
      .from('ima_manual')
      .upsert(
        { id_groot: idGroot, mes, ano: anoNum, trimestre: quarterSel, processo, ima: arredondado },
        { onConflict: 'id_groot,mes,ano,processo' }
      );
    if (error) {
      console.error('Erro ao salvar IMA manual:', error);
      (window as any).showToast?.('error', '❌ Erro ao salvar IMA: ' + error.message);
      return;
    }
    setImaManual((prev) => {
      const semEsse = prev.filter((x) => !(String(x.id_groot) === idGroot && Number(x.mes) === mes && Number(x.ano) === anoNum && processosIguais(x.processo, processo)));
      return [...semEsse, { id_groot: idGroot, mes, ano: anoNum, trimestre: quarterSel, processo, ima: arredondado }];
    });
    // ⚠️ o salvamento é assíncrono — espera esse toast aparecer antes de
    // clicar em "Gerar Print", senão o print pode sair com o valor antigo
    (window as any).showToast?.('success', `✅ IMA salvo: ${arredondado} · pode gerar o print`);
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
    dpmoAgregado.forEach((d) => {
      if (d.trimestre && d.ano) {
        set.add(`${d.ano}-${d.trimestre}`);
      }
    });
    produtividadeMensal.forEach((p) => {
      if (p.trimestre && p.ano) {
        set.add(`${p.ano}-${p.trimestre}`);
      }
    });
    imaManual.forEach((m) => {
      if (m.trimestre && m.ano) {
        set.add(`${m.ano}-${m.trimestre}`);
      }
    });
    const lista = Array.from(set).sort().reverse();
    return lista;
  }, [historico, dpmoEventos, dpmoAgregado, produtividadeMensal, imaManual]);
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
    produtividadeMensal.forEach((p) => {
      const pAno = Number(p.ano);
      const pTrim = String(p.trimestre || '').trim().toUpperCase();
      const trimSel = String(quarterSel || '').toUpperCase();
      if (pAno === anoNum && pTrim === trimSel && p.mes) {
        set.add(Number(p.mes));
      }
    });
    dpmoEventos.forEach((d) => {
      const dAno = Number(d.ano);
      const dTrim = String(d.trimestre || '').trim().toUpperCase();
      const trimSel = String(quarterSel || '').toUpperCase();
      if (dAno === anoNum && dTrim === trimSel && d.mes) {
        set.add(Number(d.mes));
      }
    });
    dpmoAgregado.forEach((d) => {
      const dAny = d as any;
      const dAno = Number(d.ano);
      const dTrim = String(d.trimestre || '').trim().toUpperCase();
      const trimSel = String(quarterSel || '').toUpperCase();
      if (dAno !== anoNum || dTrim !== trimSel) return;
      if (dAny.mes && Number(dAny.mes) > 0) {
        set.add(Number(dAny.mes));
        return;
      }
      if (d.semana) {
        const semana = Number(d.semana);
        const dataRef = new Date(dAno, 0, 4 + (semana - 1) * 7);
        const mesDaSemana = dataRef.getMonth() + 1;
        if (mesDaSemana >= 1 && mesDaSemana <= 12) {
          set.add(mesDaSemana);
        }
      }
    });
    ocupacaoP2M.forEach((o) => {
      const oAno = Number(o.ano);
      const oTrim = String(o.trimestre || '').trim().toUpperCase();
      const trimSel = String(quarterSel || '').toUpperCase();
      if (oAno === anoNum && oTrim === trimSel && o.mes) {
        set.add(Number(o.mes));
      }
    });
    imaManual.forEach((m) => {
      const mAno = Number(m.ano);
      const mTrim = String(m.trimestre || '').trim().toUpperCase();
      const trimSel = String(quarterSel || '').toUpperCase();
      if (mAno === anoNum && mTrim === trimSel && m.mes) {
        set.add(Number(m.mes));
      }
    });
    const meses = mesesPossiveis.filter((m) => set.has(m)).sort();
    return meses;
  }, [historico, produtividadeMensal, dpmoEventos, dpmoAgregado, ocupacaoP2M, imaManual, anoNum, quarterSel, mesesPossiveis]);
  const linhasCalibracao: LinhaCalib[] = useMemo(() => {
    if (!quarterSel) return [];
    return colaboradores.map((c) => {
      const histColab = historico.filter((h) => {
        if (h.id_groot !== c.id_groot) return false;
        const { quarter, ano } = getTrimestreDeData(h.data_referencia);
        return ano === anoNum && quarter === quarterSel;
      });
      const mediasPorMes: Record<number, { unidades: number; horas: number; ocup: number[] }> = {};
      histColab.forEach((h) => {
        const { mes } = getTrimestreDeData(h.data_referencia);
        if (!mediasPorMes[mes]) mediasPorMes[mes] = { unidades: 0, horas: 0, ocup: [] };
        const und = Number(h.unidades) || 0;
        const liqDia = Number(h.prod_liquida) || 0;
        if (und > 0 && liqDia > 0) {
          mediasPorMes[mes].unidades += und;
          mediasPorMes[mes].horas += und / liqDia;
        }
      });
      const prodMensalColab = produtividadeMensal.filter((p) => {
        const pIdGroot = String(p.id_groot || '').trim();
        const cIdGroot = String(c.id_groot || '').trim();
        const pAno = Number(p.ano);
        const pTrim = String(p.trimestre || '').trim().toUpperCase();
        const pProc = String(p.processo || '').trim();
        const cProc = String(c.processo || '').trim();
        const trimSelUpper = String(quarterSel || '').toUpperCase();
        if (pIdGroot !== cIdGroot) return false;
        if (pAno !== anoNum) return false;
        if (pTrim !== trimSelUpper) return false;
        if (pProc !== cProc) return false;
        return true;
      });
      prodMensalColab.forEach((p) => {
        const pMes = Number(p.mes);
        if (!mediasPorMes[pMes]) mediasPorMes[pMes] = { unidades: 0, horas: 0, ocup: [] };
        const liqValue = Number(p.prod_liquida_media) || 0;
        const undValue = Number(p.unidades_total) || 0;
        if (undValue > 0 && liqValue > 0) {
          mediasPorMes[pMes].unidades += undValue;
          mediasPorMes[pMes].horas += undValue / liqValue;
        }
      });
      if (c.processo === 'P2M') {
        const ocupColab = ocupacaoP2M.filter((o) => {
          if (o.ano !== anoNum || o.trimestre !== quarterSel) return false;
          return o.id_groot === c.id_groot;
        });
        ocupColab.forEach((o) => {
          if (!mediasPorMes[o.mes]) mediasPorMes[o.mes] = { unidades: 0, horas: 0, ocup: [] };
          if (o.ocupacao_pct > 0) mediasPorMes[o.mes].ocup.push(o.ocupacao_pct);
        });
      }
      const liqDoMes = (mes: number): number => {
        const m = mediasPorMes[mes];
        if (!m || m.horas <= 0) return 0;
        return m.unidades / m.horas;
      };
      const ocupDoMes = (mes: number): number => {
        const arr = mediasPorMes[mes]?.ocup || [];
        if (arr.length === 0) return 0;
        return arr.reduce((s, v) => s + v, 0) / arr.length;
      };
      const presColab = presencaData.filter((p) => p.id_groot === c.id_groot && p.status !== 'descartado');
      const absPorMes: Record<number, { faltas: number; base: number }> = {};
      mesesPossiveis.forEach((m) => { absPorMes[m] = { faltas: 0, base: 0 }; });
      presColab.forEach((p) => {
        const d = new Date(p.data_referencia + 'T12:00:00');
        if (d.getFullYear() !== anoNum) return;
        const mes = d.getMonth() + 1;
        if (!absPorMes[mes]) return;
        if (p.conta_presenca === true || p.conta_abs === true) {
          absPorMes[mes].base += 1;
        }
        if (p.conta_abs === true && p.categoria === 'falta') {
          absPorMes[mes].faltas += 1;
        }
      });
      const absMesCalc = (mes: number): number | null => {
        const a = absPorMes[mes];
        if (!a || a.base === 0) return null;
        return Number(((a.faltas / a.base) * 100).toFixed(1));
      };
      const absManualDe = (mes: number): number | null => {
        const rec = absManual.find((x) => x.id_groot === c.id_groot && x.mes === mes && x.ano === anoNum);
        return rec ? Number(rec.abs_pct) : null;
      };
      const absMes = (mes: number): number | null => {
        const man = absManualDe(mes);
        if (man !== null && man !== undefined) return man;
        return absMesCalc(mes);
      };
      const medMes: Record<number, { liq: number; ocup: number; ima: number; abs: number | null }> = {};
      mesesPossiveis.forEach((m) => {
        medMes[m] = {
          liq: Math.round(liqDoMes(m)),
          ocup: Math.round(ocupDoMes(m)),
          ima: 0,
          abs: absMes(m),
        };
      });
      const totUnidadesTrim = mesesPossiveis.reduce((s, m) => s + (mediasPorMes[m]?.unidades || 0), 0);
      const totHorasTrim = mesesPossiveis.reduce((s, m) => s + (mediasPorMes[m]?.horas || 0), 0);
      const liqTrim = totHorasTrim > 0 ? Math.round(totUnidadesTrim / totHorasTrim) : 0;
      const ocupsValidas = mesesPossiveis.map((m) => medMes[m].ocup).filter((v) => v > 0);
      const ocupTrim = ocupsValidas.length > 0 ? Math.round(ocupsValidas.reduce((s, v) => s + v, 0) / ocupsValidas.length) : 0;
      const temAlgumManual = mesesPossiveis.some((m) => absManualDe(m) !== null);
      let absTrim: number | null;
      if (temAlgumManual) {
        const absMensais = mesesPossiveis.map((m) => absMes(m)).filter((v): v is number => v !== null);
        absTrim = absMensais.length > 0
          ? Number((absMensais.reduce((s, v) => s + v, 0) / absMensais.length).toFixed(1))
          : null;
      } else {
        const totFaltas = mesesPossiveis.reduce((s, m) => s + (absPorMes[m]?.faltas || 0), 0);
        const totBase = mesesPossiveis.reduce((s, m) => s + (absPorMes[m]?.base || 0), 0);
        absTrim = totBase > 0 ? Number(((totFaltas / totBase) * 100).toFixed(1)) : null;
      }
      let ima = 0;
      let imaDefeitos = 0;
      let imaUnidades = 0;
      let imaDiasAuditados = 0;
      let imaOrigem: 'auto' | 'vazio' | 'aguardando' = 'vazio';
      if (c.processo === 'Checkin' || c.processo === 'P2M') {
        const procDpmo = c.processo === 'Checkin' ? 'CK' : 'P2M';
        const eventosTrim = dpmoEventos.filter((d) => {
          if (d.ano !== anoNum || d.trimestre !== quarterSel) return false;
          if (d.processo !== procDpmo) return false;
          if (d.id_groot) {
            return String(d.id_groot).trim() === String(c.id_groot).trim();
          }
          if (nomesIguais(d.representante, c.nome)) return true;
          return false;
        });
        let dataMaximaInventario = '';
        dpmoEventos.forEach((d) => {
          if (d.checkin_data > dataMaximaInventario) {
            dataMaximaInventario = d.checkin_data;
          }
        });
        const semanasComInventario = new Set<string>(
          eventosTrim.map((e) => `${e.ano}-${e.semana}`)
        );
        const unidadesAuditadasDiarias = histColab
          .filter((h) => h.processo === c.processo)
          .filter((h) => {
            if (dataMaximaInventario && h.data_referencia > dataMaximaInventario) return false;
            const d = new Date(h.data_referencia + 'T12:00:00');
            const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const diaDaSemana = utc.getUTCDay() || 7;
            utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
            const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
            const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
            return semanasComInventario.has(`${utc.getUTCFullYear()}-${semana}`);
          })
          .reduce((s, h) => s + (h.unidades || 0), 0);
        const unidadesAuditadasMensal = produtividadeMensal
          .filter((p) => {
            if (Number(p.ano) !== anoNum) return false;
            const pTrim = String(p.trimestre || '').trim().toUpperCase();
            if (pTrim !== quarterSel) return false;
            if (!processosIguais(p.processo, c.processo)) return false;
            if (p.id_groot && c.id_groot && String(p.id_groot).trim() === String(c.id_groot).trim()) {
              return true;
            }
            if (p.nome && nomesIguais(p.nome, c.nome)) {
              return true;
            }
            return false;
          })
          .reduce((s, p) => s + (Number(p.unidades_total) || 0), 0);
        const unidadesAuditadas = unidadesAuditadasDiarias + unidadesAuditadasMensal;
        const totalDef = eventosTrim.reduce((s, d) => s + (d.qtd_dif || 0), 0);
        const datasAuditadas = new Set<string>(eventosTrim.map((e) => e.checkin_data));
        if (unidadesAuditadas > 0 && eventosTrim.length > 0) {
          imaDefeitos = totalDef;
          imaUnidades = unidadesAuditadas;
          imaDiasAuditados = datasAuditadas.size;
          ima = Math.round((totalDef / unidadesAuditadas) * 1_000_000);
          imaOrigem = 'auto';
        }
        mesesPossiveis.forEach((mes) => {
          const eventosMes = eventosTrim.filter((e) => Number(e.mes) === Number(mes));
          if (eventosMes.length === 0) {
            const agrColab = dpmoAgregado.filter((d) => {
              const idBate = d.id_groot && c.id_groot && String(d.id_groot).trim() === String(c.id_groot).trim();
              const nomeBate = d.representante && nomesIguais(d.representante, c.nome);
              if (!idBate && !nomeBate) return false;
              if (!processosIguais(d.processo, c.processo)) return false;
              if (Number(d.ano) !== anoNum) return false;
              if (!d.semana) return false;
              const dAny = d as any;
              if (dAny.mes && Number(dAny.mes) > 0) {
                return Number(dAny.mes) === mes;
              }
              const dataRef = new Date(anoNum, 0, 4 + (Number(d.semana) - 1) * 7);
              return dataRef.getMonth() + 1 === mes;
            });
            if (agrColab.length > 0) {
              const somaDpmo = agrColab.reduce((s, d) => s + (Number(d.dpmo) || 0), 0);
              medMes[mes].ima = Math.round(somaDpmo / agrColab.length);
            } else {
              medMes[mes].ima = 0;
            }
            return;
          }
          const defMes = eventosMes.reduce((s, e) => s + (e.qtd_dif || 0), 0);
          const semanasMes = new Set<string>(eventosMes.map((e) => `${e.ano}-${e.semana}`));
          const unidadesDiarias = histColab
            .filter((h) => h.processo === c.processo)
            .filter((h) => {
              if (dataMaximaInventario && h.data_referencia > dataMaximaInventario) return false;
              const dataDia = new Date(h.data_referencia + 'T12:00:00');
              if (dataDia.getMonth() + 1 !== mes) return false;
              const utc = new Date(Date.UTC(dataDia.getFullYear(), dataDia.getMonth(), dataDia.getDate()));
              const dow = utc.getUTCDay() || 7;
              utc.setUTCDate(utc.getUTCDate() + 4 - dow);
              const inicio = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
              const sem = Math.ceil((((utc.getTime() - inicio.getTime()) / 86400000) + 1) / 7);
              return semanasMes.has(`${utc.getUTCFullYear()}-${sem}`);
            })
            .reduce((s, h) => s + (h.unidades || 0), 0);
          let unidadesMensal = 0;
          if (unidadesDiarias === 0) {
            const prodMensalMes = produtividadeMensal.filter((p) => {
              if (Number(p.mes) !== mes) return false;
              if (Number(p.ano) !== anoNum) return false;
              if (!processosIguais(p.processo, c.processo)) return false;
              if (p.id_groot && c.id_groot && String(p.id_groot).trim() === String(c.id_groot).trim()) {
                return true;
              }
              if (p.nome && nomesIguais(p.nome, c.nome)) {
                return true;
              }
              return false;
            });
            unidadesMensal = prodMensalMes.reduce((s, p) => s + (Number(p.unidades_total) || 0), 0);
          }
          const unidadesMes = unidadesDiarias + unidadesMensal;
          if (unidadesMes > 0) {
            medMes[mes].ima = Math.round((defMes / unidadesMes) * 1_000_000);
          }
        });
        mesesPossiveis.forEach((mes) => {
          const manual = imaManual.find((m: any) =>
            String(m.id_groot) === String(c.id_groot) &&
            Number(m.mes) === Number(mes) &&
            Number(m.ano) === anoNum &&
            processosIguais(m.processo, c.processo)
          );
          if (manual && Number(manual.ima) > 0) {
            medMes[mes].ima = Number(manual.ima);
          }
        });
        const imasValidos = mesesPossiveis.map((m) => medMes[m].ima).filter((v) => v > 0);
        if (imasValidos.length > 0) {
          ima = Math.round(imasValidos.reduce((s, v) => s + v, 0) / imasValidos.length);
          imaOrigem = 'auto';
        }
      }
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
      if (absTrim !== null && absTrim > 5) {
        como = 'Abaixo';
      } else if (absTrim !== null && absTrim <= 5 && como === 'Sem feedbacks') {
        como = 'Alinhado';
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
        absTrim,
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
  }, [colaboradores, historico, produtividadeMensal, imaManual, dpmoEventos, dpmoAgregado, ocupacaoP2M, feedbacks, presencaData, absManual, anoNum, quarterSel, mesesPossiveis, metaIma, metaLiq, metaOcup]);
  const porProcesso = {
    Checkin: linhasCalibracao.filter((l) => l.processo === 'Checkin').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    P2M: linhasCalibracao.filter((l) => l.processo === 'P2M').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    Sorting: linhasCalibracao.filter((l) => l.processo === 'Sorting').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
  const totalAptos = linhasCalibracao.filter((l) => l.aptidao === 'APTO').length;
  const totalObs = linhasCalibracao.filter((l) => l.aptidao === 'EM OBSERVAÇÃO').length;
  const totalNaoAptos = linhasCalibracao.filter((l) => l.aptidao === 'NÃO APTO').length;
  const totalAguardando = linhasCalibracao.filter((l) => l.imaOrigem === 'aguardando').length;
  function exportarCSV(processo: 'Checkin' | 'P2M' | 'Sorting') {
    const linhas = porProcesso[processo];
    if (linhas.length === 0) return;
    const incluiOcup = processo !== 'Checkin';
    const headers: string[] = ['ID', 'Nome', 'Processo'];
    mesesComDados.forEach((m) => {
      headers.push(`${NOMES_MESES[m]}_Liq`);
      headers.push(`${NOMES_MESES[m]}_IMA`);
      if (incluiOcup) headers.push(`${NOMES_MESES[m]}_Ocup`);
      headers.push(`${NOMES_MESES[m]}_ABS`);
    });
    headers.push('Trim_Liq');
    headers.push('Trim_IMA');
    if (incluiOcup) headers.push('Trim_Ocup');
    headers.push('Trim_ABS');
    headers.push('QUE', 'COMO', 'APTIDAO');
    const rows = linhas.map((l) => {
      const row: (string | number)[] = [l.idGroot, l.nome, l.processo];
      mesesComDados.forEach((m) => {
        row.push(l.medMes[m]?.liq || '-');
        row.push(l.imaOrigem === 'aguardando' ? 'aguardando' : (l.medMes[m]?.ima || '0'));
        if (incluiOcup) row.push(l.medMes[m]?.ocup ? `${l.medMes[m].ocup}%` : '-');
        row.push(l.medMes[m]?.abs === null || l.medMes[m]?.abs === undefined ? '-' : `${l.medMes[m]!.abs}%`);
      });
      row.push(l.liqTrim || '-');
      row.push(l.imaOrigem === 'aguardando' ? 'aguardando' : (l.ima || '0'));
      if (incluiOcup) row.push(l.ocupTrim ? `${l.ocupTrim}%` : '-');
      row.push(l.absTrim === null ? '-' : `${l.absTrim}%`);
      row.push(l.que);
      row.push(l.como);
      row.push(l.aptidao);
      return row;
    });
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
    (window as any).showToast?.('success', `📥 ${processo} exportado!`);
  }
  async function gerarPrintPublico(processo: 'Checkin' | 'P2M' | 'Sorting') {
    const linhas = porProcesso[processo];
    if (linhas.length === 0) return;
    const procEmoji = processo === 'Checkin' ? '📦' : processo === 'P2M' ? '🚚' : '📋';
    let dataMax = '';
    historico.forEach((h) => {
      if (h.data_referencia > dataMax) dataMax = h.data_referencia;
    });
    const dataMaxFormatada = dataMax ? new Date(dataMax + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    const anoAtual = new Date().getFullYear();
    const linhasComDados = linhas.filter((l) => {
      const temLiq = l.liqTrim > 0;
      const temImaVal = l.ima > 0;
      const temOcupVal = l.ocupTrim > 0;
      return temLiq || temImaVal || temOcupVal;
    });
    if (linhasComDados.length === 0) {
      (window as any).showToast?.('error', `Nenhum colaborador de ${processo} tem dados no trimestre`);
      return;
    }
    const linhasOrdenadas = [...linhasComDados].sort((a, b) => (b.liqTrim || 0) - (a.liqTrim || 0));
    const temIma = processo === 'Checkin' || processo === 'P2M';
    const temOcup = processo === 'P2M';
    const PRECISA_SPLIT = linhasOrdenadas.length > 35;
    const metade = Math.ceil(linhasOrdenadas.length / 2);
    const parte1 = PRECISA_SPLIT ? linhasOrdenadas.slice(0, metade) : linhasOrdenadas;
    const parte2 = PRECISA_SPLIT ? linhasOrdenadas.slice(metade) : [];
    const logoBase64 = await carregarLogoBase64();
    const MELI = {
      amarelo: '#FFE600',
      amareloEscuro: '#FFD100',
      azul: '#2D3277',
    };
    const CORES = {
      fundoBase: '#0f0f0f',
      fundoCard: '#1a1a1a',
      fundoLinha1: '#141414',
      fundoLinha2: '#1a1a1a',
      fundoHeader: '#242424',
      amareloMeli: '#FFD700',
      amareloSuave: 'rgba(255, 215, 0, 0.14)',
      amareloBorda: 'rgba(255, 215, 0, 0.5)',
      verde: '#0f7a43',
      verdeBg: '#d6f5e3',
      vermelho: '#b02525',
      vermelhoBg: '#fbdcdc',
      cinza: '#8a94a6',
      cinzaBg: '#e8ecf4',
      idBg: '#eef1f8',
      idTexto: '#2D3277',
      bordaClara: '#c5cee0',
      textoBranco: '#ffffff',
      textoClaro: '#e5e5e5',
      textoMedio: '#a3a3a3',
      textoEscuro: '#737373',
      bordaSutil: '#2f2f2f',
      bordaMedia: '#3a3a3a',
    };
    function corFundoStatus(valor: number, meta: number, inverso: boolean = false): string {
      if (valor === 0) return CORES.cinzaBg;
      if (inverso) return valor <= meta ? CORES.verdeBg : CORES.vermelhoBg;
      return valor >= meta ? CORES.verdeBg : CORES.vermelhoBg;
    }
    function corTextoStatus(valor: number, meta: number, inverso: boolean = false): string {
      if (valor === 0) return CORES.cinza;
      if (inverso) return valor <= meta ? CORES.verde : CORES.vermelho;
      return valor >= meta ? CORES.verde : CORES.vermelho;
    }
    function gerarTabelaHtml(linhasParte: typeof linhasOrdenadas, tituloLinha: string): string {
      const metaL = processo === 'Checkin' ? metaLiq.checkin : metaLiq.p2m;
      const metaI = processo === 'Checkin' ? metaIma.checkin : metaIma.p2m;
      const metaO = metaOcup.p2m;
      const subColsPorMes = (temIma ? 1 : 0) + 1 + (temOcup ? 1 : 0) + 1;
      const headerMeses = mesesComDados.map((m) => `
        <th colspan="${subColsPorMes}" style="padding: 14px 8px; text-align: center; background: ${CORES.amareloSuave}; color: ${CORES.amareloMeli}; font-weight: 700; font-size: 14px; border: 1px solid ${CORES.amareloBorda}; letter-spacing: 1.5px;">
          ${NOMES_MESES_FULL[m]}
        </th>
      `).join('');
      const subHeaders = mesesComDados.map(() => `
        <th style="padding: 9px 4px; text-align: center; background: ${CORES.fundoHeader}; color: ${CORES.textoClaro}; font-size: 11px; font-weight: 700; border-left: 1px solid ${CORES.amareloBorda}; border-bottom: 1px solid ${CORES.bordaSutil}; letter-spacing: 1px;">LÍQ</th>
        ${temIma ? `<th style="padding: 9px 4px; text-align: center; background: ${CORES.fundoHeader}; color: ${CORES.textoClaro}; font-size: 11px; font-weight: 700; border-bottom: 1px solid ${CORES.bordaSutil}; letter-spacing: 1px;">IMA</th>` : ''}
        ${temOcup ? `<th style="padding: 9px 4px; text-align: center; background: ${CORES.fundoHeader}; color: ${CORES.textoClaro}; font-size: 11px; font-weight: 700; border-bottom: 1px solid ${CORES.bordaSutil}; letter-spacing: 1px;">OCUP</th>` : ''}
        <th style="padding: 9px 4px; text-align: center; background: ${CORES.fundoHeader}; color: ${CORES.textoClaro}; font-size: 11px; font-weight: 700; border-bottom: 1px solid ${CORES.bordaSutil}; letter-spacing: 1px;">ABS</th>
      `).join('');
      const tbody = linhasParte.map((l) => {
        const mesesCells = mesesComDados.map((m) => {
          const liqMes = l.medMes[m]?.liq || 0;
          const imaMes = l.medMes[m]?.ima || 0;
          const ocupMes = l.medMes[m]?.ocup || 0;
          const absMesVal = l.medMes[m]?.abs;
          const bgLiq = corFundoStatus(liqMes, metaL);
          const txtLiq = corTextoStatus(liqMes, metaL);
          const bgIma = imaMes > 0 ? corFundoStatus(imaMes, metaI, true) : CORES.cinzaBg;
          const txtIma = imaMes > 0 ? corTextoStatus(imaMes, metaI, true) : CORES.cinza;
          const bgOcup = ocupMes > 0 ? corFundoStatus(ocupMes, metaO) : CORES.cinzaBg;
          const txtOcup = ocupMes > 0 ? corTextoStatus(ocupMes, metaO) : CORES.cinza;
          const temAbs = absMesVal !== null && absMesVal !== undefined;
          const bgAbs = !temAbs ? CORES.cinzaBg : (absMesVal as number) <= 5 ? CORES.verdeBg : CORES.vermelhoBg;
          const txtAbs = !temAbs ? CORES.cinza : (absMesVal as number) <= 5 ? CORES.verde : CORES.vermelho;
          return `
            <td style="padding: 12px 6px; text-align: center; background: ${bgLiq}; color: ${txtLiq}; font-family: monospace; font-weight: 800; font-size: 14px; border-left: 1px solid ${CORES.bordaClara};">${liqMes || '—'}</td>
            ${temIma ? `<td style="padding: 12px 6px; text-align: center; background: ${bgIma}; color: ${txtIma}; font-family: monospace; font-weight: 800; font-size: 13px; border-left: 1px solid ${CORES.bordaClara};">${imaMes > 0 ? imaMes.toLocaleString('pt-BR') : '—'}</td>` : ''}
            ${temOcup ? `<td style="padding: 12px 6px; text-align: center; background: ${bgOcup}; color: ${txtOcup}; font-family: monospace; font-weight: 800; font-size: 13px; border-left: 1px solid ${CORES.bordaClara};">${ocupMes > 0 ? ocupMes + '%' : '—'}</td>` : ''}
            <td style="padding: 12px 6px; text-align: center; background: ${bgAbs}; color: ${txtAbs}; font-family: monospace; font-weight: 800; font-size: 13px; border-left: 1px solid ${CORES.bordaClara};">${temAbs ? absMesVal + '%' : '—'}</td>
          `;
        }).join('');
        return `
          <tr style="border-bottom: 1px solid ${CORES.bordaClara};">
            <td style="padding: 12px; color: ${CORES.idTexto}; font-weight: 800; font-family: monospace; font-size: 14px; text-align: center; background: ${CORES.idBg}; border-right: 1px solid ${CORES.amareloBorda};">${l.idGroot}</td>
            ${mesesCells}
          </tr>
        `;
      }).join('');
      return `
        ${tituloLinha ? `
          <p style="text-align: center; color: ${CORES.amareloMeli}; font-size: 11px; font-weight: 700; margin: 12px 0 8px 0; letter-spacing: 2px; padding: 6px 16px; display: inline-block; border: 1px solid ${CORES.amareloBorda}; border-radius: 4px;">${tituloLinha}</p>
        ` : ''}
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid ${CORES.bordaSutil}; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="height: 50px;">
              <th rowspan="2" style="padding: 14px 12px; text-align: center; background: ${CORES.amareloSuave}; color: ${CORES.amareloMeli}; font-size: 14px; font-weight: 700; border: 1px solid ${CORES.amareloBorda}; min-width: 100px; letter-spacing: 2px;">ID</th>
              ${headerMeses}
            </tr>
            <tr style="height: 30px;">
              ${subHeaders}
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>
      `;
    }
    const subColsPorMes = (temIma ? 1 : 0) + 1 + (temOcup ? 1 : 0) + 1;
    const numColsTotal = 1 + (mesesComDados.length * subColsPorMes);
    const widthBase = Math.max(700, numColsTotal * 90);
    const widthTotal = PRECISA_SPLIT ? widthBase * 2 + 40 : widthBase;
    const div = document.createElement('div');
    div.style.cssText = `position: fixed; top: -9999px; left: -9999px; width: ${widthTotal}px; padding: 40px; background: ${CORES.fundoBase}; color: ${CORES.textoBranco}; font-family: -apple-system, system-ui, sans-serif;`;
    div.innerHTML = `
      <div style="border-radius: 14px; overflow: hidden; border: 1px solid ${MELI.amarelo}55; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; gap: 16px; background: linear-gradient(90deg, ${MELI.amarelo} 0%, ${MELI.amareloEscuro} 100%);">
          <div style="display: flex; align-items: center; gap: 18px;">
            <div style="width: 62px; height: 62px; background: #ffffff; padding: 7px; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;">
              ${logoBase64 ? `<img src="${logoBase64}" alt="MELI" style="width: 100%; height: 100%; object-fit: contain;" />` : `<div style="color: ${MELI.azul}; font-weight: 900; font-size: 14px;">MELI</div>`}
            </div>
            <div>
              <div style="font-weight: 900; letter-spacing: 0.04em; color: ${MELI.azul}; font-size: 26px; line-height: 1.1;">
                ${procEmoji} CALIBRAÇÃO ${processo.toUpperCase()}
              </div>
              <div style="font-weight: bold; color: #1a1a2e; font-size: 14px; opacity: 0.8; letter-spacing: 0.15em; margin-top: 2px;">
                ${quarterSel} · ${anoAtual}
              </div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px; padding: 9px 22px; background: ${MELI.azul}; box-shadow: 0 3px 10px rgba(45,50,119,0.4);">
            <span style="font-weight: 900; letter-spacing: 0.15em; color: ${MELI.amarelo}; font-size: 22px; line-height: 1;">TIME DEL</span>
            <span style="font-weight: bold; letter-spacing: 0.05em; color: #ffffff; font-size: 10px; opacity: 0.8; margin-top: 3px;">T1 · PRODUÇÃO</span>
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; padding: 0 4px;">
        <p style="color: ${CORES.textoMedio}; font-size: 12px; margin: 0; letter-spacing: 1px;">
          📅 Dados até <span style="color: ${CORES.textoClaro}; font-weight: 700;">${dataMaxFormatada}</span>
        </p>
        <p style="color: ${CORES.textoMedio}; font-size: 12px; margin: 0; letter-spacing: 1px;">
          <span style="color: ${CORES.amareloMeli}; font-weight: 700;">${linhasOrdenadas.length}</span> colaboradores${PRECISA_SPLIT ? ' · Dividido em 2 partes' : ''}
        </p>
      </div>
      
      ${PRECISA_SPLIT ? `
        <div style="display: flex; gap: 24px; align-items: flex-start;">
          <div style="flex: 1;">
            ${gerarTabelaHtml(parte1, `PARTE 1 · ${parte1.length} COLABS`)}
          </div>
          <div style="flex: 1;">
            ${gerarTabelaHtml(parte2, `PARTE 2 · ${parte2.length} COLABS`)}
          </div>
        </div>
      ` : `
        ${gerarTabelaHtml(linhasOrdenadas, '')}
      `}
      
            <!-- LEGENDA -->
      <div style="margin-top: 24px; padding: 16px 24px; background: ${CORES.fundoCard}; border-radius: 8px; border: 1px solid ${CORES.bordaSutil}; display: flex; gap: 40px; justify-content: center; flex-wrap: wrap; font-size: 12px; font-weight: 700; letter-spacing: 1px;">
        <span style="color: #6ee7a0; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: ${CORES.verdeBg}; border-radius: 3px;"></span>
          NA META
        </span>
        <span style="color: #fb8a8a; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: ${CORES.vermelhoBg}; border-radius: 3px;"></span>
          ABAIXO
        </span>
        <span style="color: ${CORES.textoMedio}; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 14px; height: 14px; background: ${CORES.cinzaBg}; border-radius: 3px;"></span>
          SEM DADOS
        </span>
      </div>
      
      <!-- FOOTER com logo -->
      <div style="margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        ${logoBase64 ? `<div style="width: 16px; height: 16px; background: #fff; padding: 2px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><img src="${logoBase64}" alt="ML" style="width: 100%; height: 100%; object-fit: contain;" /></div>` : ''}
        <span style="font-size: 10px; color: ${CORES.textoEscuro}; letter-spacing: 2px; font-weight: 700;">
          LIDER 360 · TIME DEL · GERADO EM ${new Date().toLocaleDateString('pt-BR')} · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    `;
    document.body.appendChild(div);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(div, {
        backgroundColor: CORES.fundoBase,
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      const link = document.createElement('a');
      link.download = `Calibracao_TimeDEL_${processo}_${quarterSel}_${anoAtual}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      (window as any).showToast?.('success', `📸 Print ${processo} gerado! ${PRECISA_SPLIT ? '(2 partes)' : ''}`);
    } catch (e) {
      console.error(e);
      (window as any).showToast?.('error', 'Erro ao gerar print');
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
        <Link href="/meu-time" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Voltar ao Meu Time
        </Link>
        <h1 className="text-3xl md:text-4xl font-black mt-2">
          Calibração <span className="text-[#FFD700]">Trimestral</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">Análise de desempenho · QUE + COMO + Aptidão</p>
      </div>
      <ApolloBadge
        mood="info"
        message="IMA do Print OCR puxado em tempo real"
        detail="Print OCR (prioridade) + CSV Looker + edição manual · Bate 100% com Looker"
      />
      {trimestresDisponiveis.length === 0 ? (
        <div className="bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">Nenhum dado ainda</h3>
          <p className="text-gray-400 mb-4">Faça upload de CSV de produtividade ou print de DPMO pra começar</p>
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
                ⏳ <strong>{totalAguardando} colaboradores</strong> aguardando dados de DPMO. Sobe o print/CSV em MEU TIME ou clica na célula IMA pra digitar direto.
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
                      title="Gerar print público (com logo MELI)"
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
                          <th key={m} colSpan={proc === 'Checkin' ? 3 : 4} className="py-3 px-2 text-center border-l border-[#2a2a2a]">{NOMES_MESES[m]}</th>
                        ))}
                        <th className="py-3 px-2 text-center border-l border-[#2a2a2a]" rowSpan={2}>QUE</th>
                        <th className="py-3 px-2 text-center" rowSpan={2}>COMO</th>
                        <th className="py-3 px-2 text-center" rowSpan={2}>APTIDÃO</th>
                      </tr>
                      <tr className="border-b border-[#2a2a2a] text-xs text-gray-500">
                        {mesesComDados.map((m) => (
                          <>
                            <th key={`${m}-l`} className="py-1 text-center border-l border-[#2a2a2a]">Líq</th>
                            <th key={`${m}-i`} className="py-1 text-center text-purple-400">IMA</th>
                            {proc !== 'Checkin' && <th key={`${m}-o`} className="py-1 text-center text-emerald-400">Oc%</th>}
                            <th key={`${m}-a`} className="py-1 text-center text-amber-400">ABS</th>
                          </>
                        ))}
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
                              <td key={`${l.idGroot}-${m}-l`} className="py-2 px-2 text-center text-gray-300 font-mono text-xs border-l border-[#2a2a2a]">
                                {l.medMes[m]?.liq || '-'}
                              </td>
                              <td key={`${l.idGroot}-${m}-i`} className="py-2 px-2 text-center">
                                <span
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    const txt = e.currentTarget.textContent || '';
                                    salvarImaManual(l.idGroot, m, txt, l.processo);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
                                  }}
                                  title="Clique pra editar o IMA. Vazio = volta pro cálculo automático (DPMO)."
                                  className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded font-mono text-xs font-bold cursor-text outline-none border border-dashed border-transparent hover:border-[#FFD700]/40 focus:border-[#FFD700] focus:bg-[#FFD700]/5 ${
                                    l.imaOrigem === 'aguardando' && !l.medMes[m]?.ima ? 'text-blue-400' : 'text-purple-300'
                                  }`}
                                >
                                  {l.imaOrigem === 'aguardando' && !l.medMes[m]?.ima ? '⏳' : (l.medMes[m]?.ima || '')}
                                </span>
                              </td>
                              {proc !== 'Checkin' && (
                                <td key={`${l.idGroot}-${m}-o`} className="py-2 px-2 text-center text-emerald-300 font-mono text-xs font-bold">
                                  {l.medMes[m]?.ocup ? l.medMes[m].ocup + '%' : '-'}
                                </td>
                              )}
                              <td key={`${l.idGroot}-${m}-a`} className="py-2 px-2 text-center">
                                <span
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    const txt = e.currentTarget.textContent || '';
                                    salvarAbsManual(l.idGroot, m, txt);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
                                  }}
                                  title="Clique pra editar o ABS. Vazio = volta pro cálculo automático."
                                  className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded font-mono text-xs font-bold cursor-text outline-none border border-dashed border-transparent hover:border-[#FFD700]/40 focus:border-[#FFD700] focus:bg-[#FFD700]/5 ${
                                    l.medMes[m]?.abs === null || l.medMes[m]?.abs === undefined ? 'text-gray-600' :
                                    (l.medMes[m]!.abs as number) < 5 ? 'text-green-400' :
                                    (l.medMes[m]!.abs as number) < 10 ? 'text-amber-400' :
                                    'text-red-400'
                                  }`}
                                >
                                  {l.medMes[m]?.abs === null || l.medMes[m]?.abs === undefined ? '' : l.medMes[m]!.abs + '%'}
                                </span>
                              </td>
                            </>
                          ))}
                          <td className="py-2 px-2 text-center border-l border-[#2a2a2a]">
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
            <p className="font-bold mb-2">💡 Cálculo:</p>
            <ul className="space-y-1 list-disc pl-5 text-xs">
              <li><strong>IMA</strong> = vem do PRINT OCR (Total Geral do colaborador), CSV Looker, ou digitado manualmente clicando na célula</li>
              <li>IMA Manual (print ou digitado na tela) tem PRIORIDADE sobre cálculo automático</li>
              <li><strong>QUE</strong> = Líquida + Ocupação + IMA (3 pontos: Supera / 1-2: Alinhado / 0: Abaixo)</li>
              <li><strong>COMO</strong> = derivado dos feedbacks + ABS</li>
              <li><strong>APTIDÃO</strong>: QUE=Supera + COMO≥Alinhado → APTO | Algum Abaixo → NÃO APTO | Resto → EM OBSERVAÇÃO</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

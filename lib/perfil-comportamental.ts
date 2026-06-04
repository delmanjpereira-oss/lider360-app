/**
 * ====================================================
 * PERFIL COMPORTAMENTAL
 * Análise inteligente baseada em heurísticas
 * 100% local (sem API externa de IA)
 *
 * Fontes:
 *  - colaboradores
 *  - historico (últimos 30 dias)
 *  - feedbacks
 *  - dpmo_agregado (últimas 5 semanas)
 *
 * Em breve: presença, carreira
 * ====================================================
 */

import { supabase } from './supabase';

// ============================================
// TIPOS
// ============================================

export type Padrao =
  | 'estavel-alto'
  | 'alto-com-oscilacao'
  | 'evoluindo'
  | 'em-queda'
  | 'medio'
  | 'compensacao'
  | 'baixo-consistente';

export type Tendencia = 'crescente' | 'estavel' | 'decrescente';
export type Consistencia = 'consistente' | 'inconsistente' | 'muito-inconsistente';
export type NivelDpmo = 'bom' | 'medio' | 'ruim';
export type TendenciaDpmo = 'melhorando' | 'estavel' | 'piorando';
export type NivelSinal = 'alto' | 'medio' | 'baixo';

export interface SinalAtencao {
  nivel: NivelSinal;
  icone: string;
  texto: string;
}

export interface PontoForte {
  icone: string;
  texto: string;
}

export interface Tag {
  texto: string;
  cor: 'verde' | 'azul' | 'amarelo' | 'laranja' | 'vermelho' | 'cinza';
}

export interface PerfilComportamental {
  cadastro: {
    idGroot: string;
    nome: string;
    processo: string;
    status: string;
  };
  resumo: string;
  padraoDominante: Padrao;
  performance: {
    totalDias: number;
    diasBateram: number;
    diasSupera: number;
    taxaBatida: number;
    mediaLiquida: number;
    metaBase: number;
    metaSupera: number;
    liquidaMax: number;
    liquidaMin: number;
    variacao: number;
    dataMaiorPico: string;
    consistencia: Consistencia;
    tendencia: Tendencia;
  };
  feedbacks: {
    total: number;
    supera: number;
    alinhado: number;
    abaixo: number;
    livre: number;
    consecutivosOfensor: number;
    semAcaoLongo: boolean;
    ultimaData: string | null;
  };
  dpmo: {
    atual: number;
    nivel: NivelDpmo;
    tendencia: TendenciaDpmo;
    historicoCompleto: Array<{ semana: number; ano: number; dpmo: number }>;
  };
  sinaisAtencao: SinalAtencao[];
  pontosFortes: PontoForte[];
  sugestoes: string[];
  tags: Tag[];
  geradoEm: string;
}

// ============================================
// CONSTANTES (do CSV de regras)
// ============================================

const METAS = {
  checkin: { base: 296, supera: 310 },
  p2m: { base: 329, supera: 350 },
};

const LIMITES = {
  variacao_inconsistente: 30,
  variacao_muito_inconsistente: 50,
  tendencia_sensibilidade: 8,
  taxa_top: 80,
  taxa_consistente: 70,
  taxa_medio: 50,
  dpmo_bom: 2000,
  dpmo_ruim: 5000,
  ofensor_consecutivo: 3,
  dias_sem_feedback: 45,
};

const JANELA_PERFORMANCE_DIAS = 30;
const JANELA_DPMO_SEMANAS = 5;

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export async function getPerfilComportamental(
  idGroot: string
): Promise<PerfilComportamental | null> {
  // 1. CADASTRO
  const { data: cadastro } = await supabase
    .from('colaboradores')
    .select('id_groot, nome, processo, status')
    .eq('id_groot', idGroot)
    .maybeSingle();

  if (!cadastro) return null;

  // 2. HISTÓRICO (últimos 30 dias)
  const hoje = new Date();
  const limite30 = new Date(hoje);
  limite30.setDate(limite30.getDate() - JANELA_PERFORMANCE_DIAS);
  const limite30Str = limite30.toISOString().split('T')[0];

  const { data: historicoRaw } = await supabase
    .from('historico')
    .select('id_groot, data_referencia, prod_liquida, status_meta, processo')
    .eq('id_groot', idGroot)
    .gte('data_referencia', limite30Str)
    .order('data_referencia', { ascending: true });

  const historico = historicoRaw || [];

  // 3. FEEDBACKS
  const { data: feedbacksRaw } = await supabase
    .from('feedbacks')
    .select('id_groot, tipo, classificacao, created_at, observacao')
    .eq('id_groot', idGroot)
    .order('created_at', { ascending: false });

  const feedbacks = feedbacksRaw || [];

  // 4. DPMO (últimas 5 semanas)
  const { data: dpmoRaw } = await supabase
    .from('dpmo_agregado')
    .select('id_groot, semana, ano, dpmo')
    .eq('id_groot', idGroot)
    .order('ano', { ascending: false })
    .order('semana', { ascending: false })
    .limit(JANELA_DPMO_SEMANAS);

  const dpmoData = dpmoRaw || [];

  // 5. APLICA HEURÍSTICAS
  const performance = analisarPerformance(historico, cadastro.processo);
  const analiseFeedbacks = analisarFeedbacks(feedbacks);
  const dpmo = analisarDpmo(dpmoData);
  const padraoDominante = detectarPadrao(performance);

  const sinaisAtencao = gerarSinaisAtencao({
    padraoDominante,
    performance,
    analiseFeedbacks,
    dpmo,
  });

  const pontosFortes = gerarPontosFortes({
    padraoDominante,
    performance,
    dpmo,
  });

  const sugestoes = gerarSugestoes({
    padraoDominante,
    analiseFeedbacks,
  });

  const tags = gerarTags({ padraoDominante, performance });

  const resumo = gerarResumo({
    nome: cadastro.nome,
    processo: cadastro.processo,
    padraoDominante,
  });

  return {
    cadastro: {
      idGroot: cadastro.id_groot,
      nome: cadastro.nome,
      processo: cadastro.processo || '—',
      status: cadastro.status || 'Ativo',
    },
    resumo,
    padraoDominante,
    performance,
    feedbacks: analiseFeedbacks,
    dpmo,
    sinaisAtencao,
    pontosFortes,
    sugestoes,
    tags,
    geradoEm: hoje.toLocaleString('pt-BR'),
  };
}

// ============================================
// ANÁLISE DE PERFORMANCE
// ============================================

function analisarPerformance(historico: any[], processo: string) {
  const procNorm = (processo || '').toLowerCase();
  const meta = procNorm.includes('p2m')
    ? METAS.p2m
    : METAS.checkin;

  if (historico.length === 0) {
    return {
      totalDias: 0,
      diasBateram: 0,
      diasSupera: 0,
      taxaBatida: 0,
      mediaLiquida: 0,
      metaBase: meta.base,
      metaSupera: meta.supera,
      liquidaMax: 0,
      liquidaMin: 0,
      variacao: 0,
      dataMaiorPico: '',
      consistencia: 'consistente' as Consistencia,
      tendencia: 'estavel' as Tendencia,
    };
  }

  const liquidas = historico
    .map((h) => Number(h.prod_liquida) || 0)
    .filter((v) => v > 0);

  const totalDias = historico.length;
  const diasBateram = historico.filter(
    (h) => Number(h.prod_liquida) >= meta.base
  ).length;
  const diasSupera = historico.filter(
    (h) => Number(h.prod_liquida) >= meta.supera
  ).length;
  const taxaBatida =
    totalDias > 0 ? Math.round((diasBateram / totalDias) * 100) : 0;

  const mediaLiquida =
    liquidas.length > 0
      ? Math.round(liquidas.reduce((a, b) => a + b, 0) / liquidas.length)
      : 0;
  const liquidaMax = liquidas.length > 0 ? Math.max(...liquidas) : 0;
  const liquidaMin = liquidas.length > 0 ? Math.min(...liquidas) : 0;
  const variacao =
    mediaLiquida > 0
      ? Math.round(((liquidaMax - liquidaMin) / mediaLiquida) * 100)
      : 0;

  // CONSISTÊNCIA
  let consistencia: Consistencia = 'consistente';
  if (variacao > LIMITES.variacao_muito_inconsistente)
    consistencia = 'muito-inconsistente';
  else if (variacao > LIMITES.variacao_inconsistente)
    consistencia = 'inconsistente';

  // TENDÊNCIA (regressão linear simples — compara 1ª metade vs 2ª)
  let tendencia: Tendencia = 'estavel';
  if (liquidas.length >= 7) {
    const meio = Math.floor(liquidas.length / 2);
    const m1 = liquidas.slice(0, meio).reduce((a, b) => a + b, 0) / meio;
    const m2 =
      liquidas.slice(meio).reduce((a, b) => a + b, 0) /
      (liquidas.length - meio);
    if (m1 > 0) {
      const dif = ((m2 - m1) / m1) * 100;
      if (dif > LIMITES.tendencia_sensibilidade) tendencia = 'crescente';
      else if (dif < -LIMITES.tendencia_sensibilidade) tendencia = 'decrescente';
    }
  }

  // DATA DO MAIOR PICO
  const diaMax = historico.find((h) => Number(h.prod_liquida) === liquidaMax);
  const dataMaiorPico = diaMax?.data_referencia ? formatarData(diaMax.data_referencia) : '';

  return {
    totalDias,
    diasBateram,
    diasSupera,
    taxaBatida,
    mediaLiquida,
    metaBase: meta.base,
    metaSupera: meta.supera,
    liquidaMax,
    liquidaMin,
    variacao,
    dataMaiorPico,
    consistencia,
    tendencia,
  };
}

// ============================================
// ANÁLISE DE FEEDBACKS
// ============================================

function analisarFeedbacks(feedbacks: any[]) {
  if (feedbacks.length === 0) {
    return {
      total: 0,
      supera: 0,
      alinhado: 0,
      abaixo: 0,
      livre: 0,
      consecutivosOfensor: 0,
      semAcaoLongo: true,
      ultimaData: null,
    };
  }

  const tiposOfensor = ['abaixo', 'ofensor', 'abaixo-da-meta', 'abaixo da meta'];

  const total = feedbacks.length;
  const supera = feedbacks.filter(
    (f) => (f.tipo || '').toLowerCase() === 'supera'
  ).length;
  const alinhado = feedbacks.filter(
    (f) => (f.tipo || '').toLowerCase() === 'alinhado'
  ).length;
  const abaixo = feedbacks.filter((f) =>
    tiposOfensor.includes((f.tipo || '').toLowerCase())
  ).length;
  const livre = feedbacks.filter(
    (f) => (f.tipo || '').toLowerCase() === 'livre'
  ).length;

  // Consecutivos ofensor (do mais recente pra trás)
  let consecutivosOfensor = 0;
  for (const fb of feedbacks) {
    if (tiposOfensor.includes((fb.tipo || '').toLowerCase())) {
      consecutivosOfensor++;
    } else {
      break;
    }
  }

  const ultimaData = feedbacks[0]?.created_at || null;
  let semAcaoLongo = false;
  if (ultimaData) {
    const diffDias =
      (Date.now() - new Date(ultimaData).getTime()) / (1000 * 60 * 60 * 24);
    semAcaoLongo = diffDias > LIMITES.dias_sem_feedback;
  }

  return {
    total,
    supera,
    alinhado,
    abaixo,
    livre,
    consecutivosOfensor,
    semAcaoLongo,
    ultimaData,
  };
}

// ============================================
// ANÁLISE DE DPMO
// ============================================

function analisarDpmo(dpmoData: any[]) {
  if (dpmoData.length === 0) {
    return {
      atual: 0,
      nivel: 'bom' as NivelDpmo,
      tendencia: 'estavel' as TendenciaDpmo,
      historicoCompleto: [],
    };
  }

  const atual = Number(dpmoData[0].dpmo) || 0;

  let nivel: NivelDpmo = 'bom';
  if (atual >= LIMITES.dpmo_ruim) nivel = 'ruim';
  else if (atual >= LIMITES.dpmo_bom) nivel = 'medio';

  let tendencia: TendenciaDpmo = 'estavel';
  if (dpmoData.length >= 2) {
    const anterior = Number(dpmoData[1].dpmo) || 0;
    if (anterior > 0) {
      const variacaoPct = ((atual - anterior) / anterior) * 100;
      if (variacaoPct < -10) tendencia = 'melhorando';
      else if (variacaoPct > 10) tendencia = 'piorando';
    }
  }

  return {
    atual,
    nivel,
    tendencia,
    historicoCompleto: dpmoData.map((d) => ({
      semana: d.semana,
      ano: d.ano,
      dpmo: Number(d.dpmo) || 0,
    })),
  };
}

// ============================================
// DETECTOR DE PADRÃO DOMINANTE (7 tipos)
// ============================================

function detectarPadrao(performance: any): Padrao {
  const { taxaBatida, consistencia, tendencia, variacao } = performance;

  if (taxaBatida >= LIMITES.taxa_top && consistencia === 'consistente')
    return 'estavel-alto';
  if (taxaBatida >= LIMITES.taxa_top) return 'alto-com-oscilacao';
  if (taxaBatida >= LIMITES.taxa_medio && tendencia === 'crescente')
    return 'evoluindo';
  if (taxaBatida >= LIMITES.taxa_medio && tendencia === 'decrescente')
    return 'em-queda';
  if (taxaBatida >= LIMITES.taxa_medio) return 'medio';
  if (variacao > 40) return 'compensacao';
  return 'baixo-consistente';
}

// ============================================
// SINAIS DE ATENÇÃO (Red Flags)
// ============================================

function gerarSinaisAtencao({
  padraoDominante,
  performance,
  analiseFeedbacks,
  dpmo,
}: any): SinalAtencao[] {
  const sinais: SinalAtencao[] = [];

  // ALTO: Ofensor recorrente
  if (analiseFeedbacks.consecutivosOfensor >= LIMITES.ofensor_consecutivo) {
    sinais.push({
      nivel: 'alto',
      icone: '⚠️',
      texto: `${analiseFeedbacks.consecutivosOfensor} feedbacks de Ofensor sem mudança — considere plano de melhoria formal`,
    });
  }

  // MÉDIO: Padrão de compensação
  if (padraoDominante === 'compensacao') {
    sinais.push({
      nivel: 'medio',
      icone: '📊',
      texto: `Padrão de compensação: picos altos mascarando dias ruins (variação ${performance.variacao}%)`,
    });
  }

  // MÉDIO: Performance em queda
  if (
    performance.tendencia === 'decrescente' &&
    padraoDominante !== 'baixo-consistente'
  ) {
    sinais.push({
      nivel: 'medio',
      icone: '📉',
      texto: 'Performance em queda nos últimos 7 dias vs últimos 30',
    });
  }

  // MÉDIO: DPMO ruim + alta produção (rápida mas erra)
  if (dpmo.nivel === 'ruim' && performance.diasSupera >= 3) {
    sinais.push({
      nivel: 'medio',
      icone: '⚖️',
      texto: `Alta produção mas DPMO ${dpmo.atual} — rápida mas com muitos erros`,
    });
  } else if (dpmo.nivel === 'ruim') {
    // MÉDIO: DPMO ruim isolado
    sinais.push({
      nivel: 'medio',
      icone: '🎯',
      texto: `DPMO ${dpmo.atual} acima de 5.000 — qualidade abaixo do esperado`,
    });
  }

  // BAIXO: DPMO piorando
  if (dpmo.tendencia === 'piorando' && dpmo.nivel !== 'ruim') {
    sinais.push({
      nivel: 'baixo',
      icone: '📈',
      texto: 'DPMO subindo vs semana anterior — começar a observar',
    });
  }

  // BAIXO: Sem feedback recente
  if (analiseFeedbacks.semAcaoLongo && analiseFeedbacks.total > 0) {
    sinais.push({
      nivel: 'baixo',
      icone: '⏱️',
      texto: 'Sem feedback há mais de 45 dias — agendar 1:1',
    });
  }

  return sinais;
}

// ============================================
// PONTOS FORTES (Green Flags)
// ============================================

function gerarPontosFortes({
  padraoDominante,
  performance,
  dpmo,
}: any): PontoForte[] {
  const pontos: PontoForte[] = [];

  if (padraoDominante === 'estavel-alto') {
    pontos.push({
      icone: '💎',
      texto: 'Performance consistentemente acima da meta',
    });
  }

  if (
    performance.tendencia === 'crescente' &&
    padraoDominante !== 'estavel-alto'
  ) {
    pontos.push({
      icone: '📈',
      texto: 'Em evolução — performance crescendo nos últimos 30 dias',
    });
  }

  if (
    performance.liquidaMax > performance.metaSupera * 1.2 &&
    performance.liquidaMax > 0
  ) {
    pontos.push({
      icone: '🏆',
      texto: `Já bateu picos excepcionais (${performance.liquidaMax} und/h${
        performance.dataMaiorPico ? ' em ' + performance.dataMaiorPico : ''
      })`,
    });
  }

  if (performance.diasSupera >= 5) {
    pontos.push({
      icone: '🚀',
      texto: `${performance.diasSupera} dias de Supera nos últimos 30 — capacidade técnica acima da média`,
    });
  }

  if (dpmo.nivel === 'bom' && dpmo.atual > 0) {
    pontos.push({
      icone: '🎯',
      texto: `DPMO excelente (${dpmo.atual}) — qualidade de bipagem acima da média`,
    });
  }

  if (dpmo.tendencia === 'melhorando') {
    pontos.push({
      icone: '📉',
      texto: 'DPMO melhorando (caiu da semana anterior) — está cuidando mais da qualidade',
    });
  }

  return pontos;
}

// ============================================
// SUGESTÕES DE AÇÃO
// ============================================

function gerarSugestoes({ padraoDominante, analiseFeedbacks }: any): string[] {
  const sugestoes: string[] = [];

  if (analiseFeedbacks.consecutivosOfensor >= 3) {
    sugestoes.push('Plano de melhoria estruturado (PIP) com metas semanais');
  }

  if (padraoDominante === 'compensacao') {
    sugestoes.push(
      'Foco em consistência. Capacidade técnica existe, falta regularidade'
    );
  }

  if (padraoDominante === 'em-queda') {
    sugestoes.push(
      'Conversa exploratória — entender o que mudou antes de cobrança'
    );
  }

  if (padraoDominante === 'evoluindo') {
    sugestoes.push(
      'Reforçar comportamento positivo. Bom momento pra reconhecimento'
    );
  }

  if (padraoDominante === 'baixo-consistente') {
    sugestoes.push('Avaliar treinamento e/ou plano de melhoria estruturado');
  }

  if (padraoDominante === 'estavel-alto') {
    sugestoes.push('Considerar promoção, projeto desafiador ou multiplicador');
  }

  if (analiseFeedbacks.semAcaoLongo && analiseFeedbacks.total > 0) {
    sugestoes.push('Agendar 1:1 de acompanhamento — sem feedback há +45 dias');
  }

  if (sugestoes.length === 0) {
    sugestoes.push('Manter acompanhamento padrão. Sem ações urgentes.');
  }

  return sugestoes;
}

// ============================================
// TAGS VISUAIS
// ============================================

function gerarTags({ padraoDominante, performance }: any): Tag[] {
  const tags: Tag[] = [];

  if (padraoDominante === 'estavel-alto')
    tags.push({ texto: 'Top performer', cor: 'verde' });
  if (padraoDominante === 'evoluindo')
    tags.push({ texto: 'Em ascensão', cor: 'azul' });
  if (padraoDominante === 'em-queda')
    tags.push({ texto: 'Em queda', cor: 'laranja' });
  if (padraoDominante === 'compensacao')
    tags.push({ texto: 'Inconsistente', cor: 'amarelo' });
  if (padraoDominante === 'baixo-consistente')
    tags.push({ texto: 'Baixo persistente', cor: 'vermelho' });

  if (
    performance.consistencia === 'consistente' &&
    performance.taxaBatida >= 70
  ) {
    tags.push({ texto: 'Confiável', cor: 'verde' });
  }

  return tags;
}

// ============================================
// RESUMO EXECUTIVO (texto auto-gerado)
// ============================================

function gerarResumo({ nome, processo, padraoDominante }: any): string {
  let resumo = `${nome} (${processo || '—'}) `;

  if (padraoDominante === 'estavel-alto') {
    resumo += 'apresenta performance excelente e consistente. Top performer do time.';
  } else if (padraoDominante === 'alto-com-oscilacao') {
    resumo += 'bate meta com frequência mas oscila em consistência.';
  } else if (padraoDominante === 'evoluindo') {
    resumo += 'está em momento de evolução. Boa direção, vale acompanhar de perto.';
  } else if (padraoDominante === 'em-queda') {
    resumo += 'apresenta queda recente. Importante entender o que mudou.';
  } else if (padraoDominante === 'compensacao') {
    resumo += 'tem capacidade técnica visível em picos, mas peca em consistência.';
  } else if (padraoDominante === 'baixo-consistente') {
    resumo += 'apresenta performance abaixo da meta de forma persistente. Precisa de plano estruturado.';
  } else {
    resumo += 'apresenta performance dentro da média, com oscilações naturais.';
  }

  return resumo;
}

// ============================================
// HELPERS
// ============================================

function formatarData(data: string): string {
  try {
    const datePart = String(data).split('T')[0];
    const [ano, mes, dia] = datePart.split('-');
    if (!ano || !mes || !dia) return data;
    return `${dia}/${mes}/${ano}`;
  } catch {
    return String(data);
  }
}

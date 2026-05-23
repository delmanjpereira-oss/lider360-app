/**
 * ====================================================
 * COLETOR DE CONTEXTO DO COPILOTO VIVO
 * lib/copiloto/coletor-contexto.ts
 * 
 * Junta dados de TODOS os colabs ativos do time:
 * - Carreira (Janela Promocional + Quarter)
 * - Performance (últimos 30d)
 * - Streak negativo (limite DINÂMICO do config)
 * - Ofensores críticos
 * - Quem tá pra promover
 * 
 * Retorna payload estruturado pra IA gerar tarefas inteligentes
 * ====================================================
 */

import { supabase } from '../supabase';
import { analisarCarreira, calcularStreakNegativo, type AnaliseCarreira } from './analisador-carreira';

// ============================================
// TIPOS
// ============================================

export type ColabContexto = {
  id: number;
  id_groot: string;
  nome: string;
  cargo: string | null;
  carreira: string | null;
  processo: string | null;
  status: string;
  data_admissao: string | null;
  data_entrada_carreira: string | null;
  aniversario: string | null;
  
  // Análises
  analiseCarreira: AnaliseCarreira;
  streakNegativo: number;
  ultimoStatus: string | null;
  ultimaLiquida: number | null;
  ultimoImpacto: number | null;
  diasComDados: number;
  
  // Performance recente
  liquidaMedia30d: number;
  diasSuperaMes: number;
  diasAlinhadoMes: number;
  diasAbaixoMes: number;
  taxaSucesso: number; // % dias supera+alinhado
  
  // Sinais
  isOfensorCritico: boolean; // streak ≥ limite_dinamico
  isJanelaCritica: boolean;  // mês 3 da janela ou prejudicada
  isAptoMuitoTempo: boolean; // perpétuo ≥ 3 meses
  isAniversarioHoje: boolean;
  
  // Tarefas existentes
  temTarefaPendente: boolean;
  tipoTarefaPendente?: string;
};

export type ContextoTime = {
  totalColabs: number;
  colabsAtivos: number;
  
  // Listas relevantes (ordenadas por urgência)
  ofensoresCriticos: ColabContexto[]; // streak ≥ limite
  janelaPromocaoIminente: ColabContexto[]; // mês 3 da janela
  janelaPrejudicada: ColabContexto[];
  aptosPerpetuosAvalidos: ColabContexto[]; // ≥ 3m esperando
  aniversariantesHoje: ColabContexto[];
  
  // Todos
  todosColabsAtivos: ColabContexto[];
  
  // Stats
  totalOfensores: number;
  totalSuperas: number;
  totalAlinhados: number;
  
  // 🎯 Metas DINÂMICAS (do Supabase)
  metas: MetasDinamicas;
  
  // Meta info
  ultimoUpload: string | null;
  uploadAtrasado: boolean;
  hoje: string;
  quarter: string;
};

export type MetasDinamicas = {
  meta_checkin_base: number;
  meta_checkin_alinhado_max: number;
  meta_p2m_base: number;
  meta_p2m_alinhado_max: number;
  meta_ocupacao_checkin: number;
  meta_ocupacao_p2m: number;
  meta_ima_checkin: number;
  meta_ima_p2m: number;
  streak_negativo: number;
  janela_performance_dias: number;
  janela_presenca_dias: number;
  presenca_red_flag_pct: number;
};

const METAS_FALLBACK: MetasDinamicas = {
  meta_checkin_base: 296,
  meta_checkin_alinhado_max: 310,
  meta_p2m_base: 329,
  meta_p2m_alinhado_max: 350,
  meta_ocupacao_checkin: 75,
  meta_ocupacao_p2m: 80,
  meta_ima_checkin: 1567,
  meta_ima_p2m: 1567,
  streak_negativo: 5,
  janela_performance_dias: 30,
  janela_presenca_dias: 60,
  presenca_red_flag_pct: 70,
};

// ============================================
// HELPERS
// ============================================

function isAniversarioHoje(aniversario: string | null): boolean {
  if (!aniversario) return false;
  const hoje = new Date();
  const data = new Date(aniversario + 'T12:00:00');
  return hoje.getMonth() === data.getMonth() && hoje.getDate() === data.getDate();
}

function getQuarter(data: Date): string {
  const mes = data.getMonth() + 1;
  if (mes <= 3) return 'Q1';
  if (mes <= 6) return 'Q2';
  if (mes <= 9) return 'Q3';
  return 'Q4';
}

function isUploadAtrasado(ultimoUpload: string | null): boolean {
  if (!ultimoUpload) return true;
  const hoje = new Date().toISOString().split('T')[0];
  return ultimoUpload < hoje;
}

// ============================================
// 🎯 CARREGA METAS DINÂMICAS DO CONFIG
// ============================================

export async function carregarMetasDinamicas(): Promise<MetasDinamicas> {
  try {
    const { data, error } = await supabase
      .from('config')
      .select('chave, valor');
    
    if (error) {
      console.warn('⚠️ Erro carregando config, usando fallback:', error);
      return METAS_FALLBACK;
    }
    
    const metas = { ...METAS_FALLBACK };
    (data || []).forEach((c: any) => {
      if (c.chave in metas) {
        const valor = Number(c.valor);
        if (!isNaN(valor)) {
          (metas as any)[c.chave] = valor;
        }
      }
    });
    
    return metas;
  } catch (e) {
    console.warn('⚠️ Erro carregando metas:', e);
    return METAS_FALLBACK;
  }
}

// ============================================
// FUNÇÃO PRINCIPAL — COLETA CONTEXTO DO TIME
// ============================================

export async function coletarContextoTime(): Promise<ContextoTime> {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().split('T')[0];
  
  // 🎯 1. Carrega metas dinâmicas
  const metas = await carregarMetasDinamicas();
  
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - metas.janela_performance_dias);
  const trintaDiasStr = trintaDiasAtras.toISOString().split('T')[0];

  // 2. Busca todos os colabs ATIVOS
  const { data: colabs } = await supabase
    .from('colaboradores')
    .select('id, id_groot, nome, cargo, carreira, processo, status, data_admissao, data_entrada_carreira, aniversario')
    .eq('status', 'Ativo')
    .order('nome');

  // 3. Busca histórico dos últimos 90 dias (pra análise de carreira)
  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);
  const noventaDiasStr = noventaDiasAtras.toISOString().split('T')[0];

  const { data: historico } = await supabase
    .from('historico')
    .select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net')
    .gte('data_referencia', noventaDiasStr)
    .order('data_referencia', { ascending: false });

  // 4. Busca tarefas pendentes
  const { data: tarefasPendentes } = await supabase
    .from('tarefas')
    .select('id_groot, tipo, gatilho_origem')
    .eq('status', 'Pendente');

  // 5. Busca último upload
  const { data: ultimoUploadData } = await supabase
    .from('uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1);

  const ultimoUpload = ultimoUploadData?.[0]?.data_referencia || null;
  const uploadAtrasado = isUploadAtrasado(ultimoUpload);

  // 6. Processa cada colab — análise completa
  const colabsContexto: ColabContexto[] = (colabs || []).map((c: any) => {
    const histColab = (historico || []).filter((h: any) => h.id_groot === c.id_groot);
    
    // Análise de carreira
    const analiseCarreira = analisarCarreira(
      c.carreira,
      c.data_admissao,
      c.data_entrada_carreira,
      histColab.map((h: any) => ({
        data_referencia: h.data_referencia,
        status_meta: h.status_meta,
      }))
    );
    
    // Streak negativo
    const streakNegativo = calcularStreakNegativo(histColab);
    
    // Último registro
    const ultimo = histColab[0];
    
    // Performance recente (janela dinâmica do config)
    const histRecente = histColab.filter((h: any) => h.data_referencia >= trintaDiasStr);
    const diasComDados30d = histRecente.length;
    const somaLiquida = histRecente.reduce((s: number, h: any) => s + (Number(h.prod_liquida) || 0), 0);
    const liquidaMedia30d = diasComDados30d > 0 ? somaLiquida / diasComDados30d : 0;
    
    const diasSuperaMes = histRecente.filter((h: any) => h.status_meta === 'Supera').length;
    const diasAlinhadoMes = histRecente.filter((h: any) => h.status_meta === 'Alinhado').length;
    const diasAbaixoMes = histRecente.filter((h: any) => h.status_meta === 'Abaixo').length;
    const taxaSucesso = diasComDados30d > 0 
      ? ((diasSuperaMes + diasAlinhadoMes) / diasComDados30d) * 100 
      : 0;
    
    // 🎯 Sinais (usando metas dinâmicas)
    const isOfensorCritico = streakNegativo >= metas.streak_negativo;
    const isJanelaCritica = 
      analiseCarreira.status === 'JANELA_PREJUDICADA' ||
      (analiseCarreira.status === 'JANELA_ATIVA' && analiseCarreira.mesNaJanela === 3);
    const isAptoMuitoTempo = 
      analiseCarreira.status === 'APTO_PERPETUO' && 
      (analiseCarreira.mesesPerpetuo || 0) >= 3;
    
    // Tarefa pendente?
    const tarefaPendente = (tarefasPendentes || []).find((t: any) => t.id_groot === c.id_groot);
    
    return {
      id: c.id,
      id_groot: c.id_groot,
      nome: c.nome,
      cargo: c.cargo,
      carreira: c.carreira,
      processo: c.processo,
      status: c.status,
      data_admissao: c.data_admissao,
      data_entrada_carreira: c.data_entrada_carreira,
      aniversario: c.aniversario,
      
      analiseCarreira,
      streakNegativo,
      ultimoStatus: ultimo?.status_meta || null,
      ultimaLiquida: ultimo?.prod_liquida || null,
      ultimoImpacto: ultimo?.impacto_net || null,
      diasComDados: histColab.length,
      
      liquidaMedia30d: Math.round(liquidaMedia30d),
      diasSuperaMes,
      diasAlinhadoMes,
      diasAbaixoMes,
      taxaSucesso: Number(taxaSucesso.toFixed(1)),
      
      isOfensorCritico,
      isJanelaCritica,
      isAptoMuitoTempo,
      isAniversarioHoje: isAniversarioHoje(c.aniversario),
      
      temTarefaPendente: !!tarefaPendente,
      tipoTarefaPendente: tarefaPendente?.tipo,
    };
  });

  // 7. Separa em listas relevantes
  const ofensoresCriticos = colabsContexto
    .filter(c => c.isOfensorCritico)
    .sort((a, b) => b.streakNegativo - a.streakNegativo);
  
  const janelaPromocaoIminente = colabsContexto.filter(c => 
    c.analiseCarreira.status === 'JANELA_ATIVA' && c.analiseCarreira.mesNaJanela === 3
  );
  
  const janelaPrejudicada = colabsContexto.filter(c => 
    c.analiseCarreira.status === 'JANELA_PREJUDICADA'
  );
  
  const aptosPerpetuosAvalidos = colabsContexto
    .filter(c => 
      c.analiseCarreira.status === 'APTO_PERPETUO' && (c.analiseCarreira.mesesPerpetuo || 0) >= 3
    )
    .sort((a, b) => 
      (b.analiseCarreira.mesesPerpetuo || 0) - (a.analiseCarreira.mesesPerpetuo || 0)
    );
  
  const aniversariantesHoje = colabsContexto.filter(c => c.isAniversarioHoje);

  // Stats gerais
  const totalOfensores = colabsContexto.filter(c => c.ultimoStatus === 'Abaixo').length;
  const totalSuperas = colabsContexto.filter(c => c.ultimoStatus === 'Supera').length;
  const totalAlinhados = colabsContexto.filter(c => c.ultimoStatus === 'Alinhado').length;

  return {
    totalColabs: (colabs || []).length,
    colabsAtivos: colabsContexto.length,
    
    ofensoresCriticos,
    janelaPromocaoIminente,
    janelaPrejudicada,
    aptosPerpetuosAvalidos,
    aniversariantesHoje,
    
    todosColabsAtivos: colabsContexto,
    
    totalOfensores,
    totalSuperas,
    totalAlinhados,
    
    metas,
    
    ultimoUpload,
    uploadAtrasado,
    hoje: hojeStr,
    quarter: getQuarter(hoje),
  };
}

// ============================================
// PRIORIZA: quem PRECISA de análise IA agora
// (pra economizar tokens, IA roda só nos críticos)
// ============================================

export function priorizarParaAnaliseIA(contexto: ContextoTime): ColabContexto[] {
  const prioritarios: ColabContexto[] = [];
  const idsJaIncluidos = new Set<string>();
  
  function adicionar(colab: ColabContexto) {
    if (!idsJaIncluidos.has(colab.id_groot)) {
      prioritarios.push(colab);
      idsJaIncluidos.add(colab.id_groot);
    }
  }
  
  // 1. Janela Promocional ATIVA (mês 3 = PROMOVER AGORA)
  contexto.janelaPromocaoIminente.forEach(adicionar);
  
  // 2. Janela Prejudicada (alta urgência)
  contexto.janelaPrejudicada.forEach(adicionar);
  
  // 3. Aptos Perpétuos esperando muito (≥ 3 meses)
  contexto.aptosPerpetuosAvalidos.forEach(adicionar);
  
  // 4. Ofensores Críticos (streak ≥ limite dinâmico)
  contexto.ofensoresCriticos.forEach(adicionar);
  
  // Limite — máximo 15 análises por vez (controla tokens da IA)
  return prioritarios.slice(0, 15);
}

// ============================================
// MONTA RESUMO TEXTUAL DO CONTEXTO PRA IA
// ============================================

export function montarResumoTime(contexto: ContextoTime): string {
  const linhas: string[] = [];
  
  linhas.push(`📊 CONTEXTO DO TIME (${contexto.hoje} - ${contexto.quarter})`);
  linhas.push(`Total: ${contexto.colabsAtivos} colabs ativos`);
  linhas.push(`Performance: ${contexto.totalSuperas} Superas | ${contexto.totalAlinhados} Alinhados | ${contexto.totalOfensores} Ofensores`);
  linhas.push(`Streak alerta configurado: ${contexto.metas.streak_negativo} dias`);
  linhas.push('');
  
  if (contexto.uploadAtrasado) {
    linhas.push(`⚠️ Upload atrasado! Último: ${contexto.ultimoUpload || 'nunca'}`);
  }
  
  if (contexto.ofensoresCriticos.length > 0) {
    linhas.push(`🚨 ${contexto.ofensoresCriticos.length} OFENSORES CRÍTICOS (streak ≥ ${contexto.metas.streak_negativo} dias)`);
  }
  
  if (contexto.janelaPromocaoIminente.length > 0) {
    linhas.push(`🔥 ${contexto.janelaPromocaoIminente.length} PROMOÇÕES IMINENTES (mês 3 da janela)`);
  }
  
  if (contexto.janelaPrejudicada.length > 0) {
    linhas.push(`🔴 ${contexto.janelaPrejudicada.length} JANELAS PREJUDICADAS`);
  }
  
  if (contexto.aptosPerpetuosAvalidos.length > 0) {
    linhas.push(`⭐ ${contexto.aptosPerpetuosAvalidos.length} APTOS PERPÉTUOS aguardando (≥3m)`);
  }
  
  if (contexto.aniversariantesHoje.length > 0) {
    linhas.push(`🎂 ${contexto.aniversariantesHoje.length} aniversariantes hoje`);
  }
  
  return linhas.join('\n');
}

/**
 * ====================================================
 * COLETOR DE CONTEXTO DO COPILOTO VIVO
 * lib/copiloto/coletor-contexto.ts
 * 
 * Novidades v2:
 * - Busca dados de PRESENÇA do Q atual (atestados, faltas, BH, SIE)
 * - Respeita LIMITE de tarefas pendentes (config)
 * - Filtra colabs que JÁ têm tarefa pendente
 * - Calcula vagas disponíveis pra IA gerar
 * ====================================================
 */

import { supabase } from '../supabase';
import { analisarCarreira, calcularStreakNegativo, type AnaliseCarreira } from './analisador-carreira';

// ============================================
// TIPOS
// ============================================

export type PresencaQuarter = {
  totalDias: number;
  presencas: number;
  atestados: number;          // FJ - Atestado
  faltasInjustificadas: number; // FI
  bhPlanejado: number;
  bhNaoPlanejado: number;
  sinergiaExterna: number;
  outrasJustificadas: number;
  abandono: number;
  pctAbs: number;
};

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
  
  // Performance recente (janela dinâmica)
  liquidaMedia30d: number;
  diasSuperaMes: number;
  diasAlinhadoMes: number;
  diasAbaixoMes: number;
  taxaSucesso: number;
  
  // 🆕 PRESENÇA DO Q ATUAL
  presencaQuarter: PresencaQuarter;
  
  // Sinais
  isOfensorCritico: boolean;
  isJanelaCritica: boolean;
  isAptoMuitoTempo: boolean;
  isAniversarioHoje: boolean;
  
  // Tarefas existentes
  temTarefaPendente: boolean;
  tipoTarefaPendente?: string;
};

export type ContextoTime = {
  totalColabs: number;
  colabsAtivos: number;
  
  // Listas relevantes
  ofensoresCriticos: ColabContexto[];
  janelaPromocaoIminente: ColabContexto[];
  janelaPrejudicada: ColabContexto[];
  aptosPerpetuosAvalidos: ColabContexto[];
  aniversariantesHoje: ColabContexto[];
  
  todosColabsAtivos: ColabContexto[];
  
  // Stats
  totalOfensores: number;
  totalSuperas: number;
  totalAlinhados: number;
  
  // Metas dinâmicas
  metas: MetasDinamicas;
  
  // 🆕 Estado do COPILOTO
  tarefasPendentesAtual: number;     // quantas tem agora
  vagasDisponiveis: number;          // limite - pendentes
  limiteAtingido: boolean;           // true se vagas=0
  idsComTarefaPendente: string[];    // pra excluir do recálculo
  
  ultimoUpload: string | null;
  uploadAtrasado: boolean;
  hoje: string;
  quarter: string;
  inicioQuarter: string;
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
  limite_tarefas_pendentes: number;   // 🆕
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
  limite_tarefas_pendentes: 10,
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

function getInicioQuarter(data: Date): string {
  const ano = data.getFullYear();
  const mes = data.getMonth() + 1;
  let mesInicio = 1;
  if (mes >= 4 && mes <= 6) mesInicio = 4;
  else if (mes >= 7 && mes <= 9) mesInicio = 7;
  else if (mes >= 10) mesInicio = 10;
  return `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
}

function isUploadAtrasado(ultimoUpload: string | null): boolean {
  if (!ultimoUpload) return true;
  const hoje = new Date().toISOString().split('T')[0];
  return ultimoUpload < hoje;
}

// ============================================
// CARREGA METAS DO CONFIG
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
// 🎯 PROCESSA PRESENÇA DE 1 COLAB NO Q
// ============================================

function processarPresencaColab(
  presencaData: any[],
  idGroot: string,
  inicioQuarter: string,
): PresencaQuarter {
  const registros = presencaData.filter(p => 
    p.id_groot === idGroot && 
    p.data_referencia >= inicioQuarter &&
    p.status !== 'descartado'
  );
  
  let presencas = 0;
  let atestados = 0;
  let faltasInjustificadas = 0;
  let bhPlanejado = 0;
  let bhNaoPlanejado = 0;
  let sinergiaExterna = 0;
  let outrasJustificadas = 0;
  let abandono = 0;
  
  registros.forEach(r => {
    const motivo = (r.motivo || '').toLowerCase();
    const categoria = (r.categoria || '').toUpperCase();
    
    if (r.status === 'presente' || categoria === 'P' || categoria === 'HE' || categoria === 'ON') {
      presencas++;
    } else if (motivo.includes('atestado')) {
      atestados++;
    } else if (categoria === 'FI' || motivo.includes('falta injustificada')) {
      faltasInjustificadas++;
    } else if (motivo.includes('banco de horas planejado') || motivo.includes('banco de horas plan')) {
      bhPlanejado++;
    } else if (motivo.includes('banco de horas não plan') || motivo.includes('banco de horas n')) {
      bhNaoPlanejado++;
    } else if (motivo.includes('sinergia') || categoria === 'SIE') {
      sinergiaExterna++;
    } else if (categoria === 'AB' || motivo.includes('abandono')) {
      abandono++;
    } else if (r.status === 'justificado') {
      outrasJustificadas++;
    }
  });
  
  const totalContabilizado = presencas + atestados + faltasInjustificadas + bhPlanejado + bhNaoPlanejado + outrasJustificadas + abandono;
  const totalAusencias = faltasInjustificadas + bhNaoPlanejado + abandono;
  const pctAbs = totalContabilizado > 0 ? (totalAusencias / totalContabilizado) * 100 : 0;
  
  return {
    totalDias: registros.length,
    presencas,
    atestados,
    faltasInjustificadas,
    bhPlanejado,
    bhNaoPlanejado,
    sinergiaExterna,
    outrasJustificadas,
    abandono,
    pctAbs: Number(pctAbs.toFixed(1)),
  };
}

// ============================================
// FUNÇÃO PRINCIPAL — COLETA CONTEXTO DO TIME
// ============================================

export async function coletarContextoTime(): Promise<ContextoTime> {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().split('T')[0];
  const inicioQuarter = getInicioQuarter(hoje);
  
  // 1. Metas dinâmicas
  const metas = await carregarMetasDinamicas();
  
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - metas.janela_performance_dias);
  const trintaDiasStr = trintaDiasAtras.toISOString().split('T')[0];

  // 2. Colabs ATIVOS
  const { data: colabs } = await supabase
    .from('colaboradores')
    .select('id, id_groot, nome, cargo, carreira, processo, status, data_admissao, data_entrada_carreira, aniversario')
    .eq('status', 'Ativo')
    .order('nome');

  // 3. Histórico 90 dias
  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);
  const noventaDiasStr = noventaDiasAtras.toISOString().split('T')[0];

  const { data: historico } = await supabase
    .from('historico')
    .select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net')
    .gte('data_referencia', noventaDiasStr)
    .order('data_referencia', { ascending: false });

  // 4. 🆕 PRESENÇA do Q atual (todos colabs)
  const { data: presencaQ } = await supabase
    .from('presenca')
    .select('id_groot, data_referencia, status, motivo, categoria, conta_abs, conta_presenca')
    .gte('data_referencia', inicioQuarter)
    .neq('status', 'descartado');

  // 5. Tarefas pendentes (incluindo gerada_por_ia=false)
  const { data: tarefasPendentes } = await supabase
    .from('tarefas')
    .select('id_groot, tipo, gatilho_origem')
    .eq('status', 'Pendente');

  const idsComTarefaPendente = (tarefasPendentes || []).map((t: any) => String(t.id_groot));
  const idsPendentesSet = new Set(idsComTarefaPendente);
  
  // 6. CALCULA VAGAS
  const tarefasPendentesAtual = (tarefasPendentes || []).length;
  const vagasDisponiveis = Math.max(0, metas.limite_tarefas_pendentes - tarefasPendentesAtual);
  const limiteAtingido = vagasDisponiveis === 0;

  // 7. Último upload
  const { data: ultimoUploadData } = await supabase
    .from('uploads')
    .select('data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1);

  const ultimoUpload = ultimoUploadData?.[0]?.data_referencia || null;
  const uploadAtrasado = isUploadAtrasado(ultimoUpload);

  // 8. Processa CADA colab
  const colabsContexto: ColabContexto[] = (colabs || []).map((c: any) => {
    const histColab = (historico || []).filter((h: any) => h.id_groot === c.id_groot);
    
    const analiseCarreira = analisarCarreira(
      c.carreira,
      c.data_admissao,
      c.data_entrada_carreira,
      histColab.map((h: any) => ({
        data_referencia: h.data_referencia,
        status_meta: h.status_meta,
      }))
    );
    
    const streakNegativo = calcularStreakNegativo(histColab);
    const ultimo = histColab[0];
    
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
    
    // 🆕 PRESENÇA DO Q
    const presencaQuarter = processarPresencaColab(
      presencaQ || [],
      c.id_groot,
      inicioQuarter
    );
    
    const isOfensorCritico = streakNegativo >= metas.streak_negativo;
    const isJanelaCritica = 
      analiseCarreira.status === 'JANELA_PREJUDICADA' ||
      (analiseCarreira.status === 'JANELA_ATIVA' && analiseCarreira.mesNaJanela === 3);
    const isAptoMuitoTempo = 
      analiseCarreira.status === 'APTO_PERPETUO' && 
      (analiseCarreira.mesesPerpetuo || 0) >= 3;
    
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
      
      presencaQuarter,
      
      isOfensorCritico,
      isJanelaCritica,
      isAptoMuitoTempo,
      isAniversarioHoje: isAniversarioHoje(c.aniversario),
      
      temTarefaPendente: !!tarefaPendente,
      tipoTarefaPendente: tarefaPendente?.tipo,
    };
  });

  // 9. Listas priorizadas
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
    
    // 🆕 ESTADO DO COPILOTO
    tarefasPendentesAtual,
    vagasDisponiveis,
    limiteAtingido,
    idsComTarefaPendente,
    
    ultimoUpload,
    uploadAtrasado,
    hoje: hojeStr,
    quarter: getQuarter(hoje),
    inicioQuarter,
  };
}

// ============================================
// 🎯 PRIORIZA: respeita limite + anti-duplicata
// ============================================

export function priorizarParaAnaliseIA(contexto: ContextoTime): ColabContexto[] {
  // Se limite atingido, retorna VAZIO
  if (contexto.limiteAtingido) {
    console.log(`⚠️ Limite atingido: ${contexto.tarefasPendentesAtual}/${contexto.metas.limite_tarefas_pendentes}`);
    return [];
  }
  
  const idsPendentesSet = new Set(contexto.idsComTarefaPendente);
  const prioritarios: ColabContexto[] = [];
  const idsJaIncluidos = new Set<string>();
  
  function adicionar(colab: ColabContexto) {
    // PULA se já tem tarefa pendente
    if (idsPendentesSet.has(colab.id_groot)) {
      return;
    }
    // PULA se já incluiu no batch atual
    if (idsJaIncluidos.has(colab.id_groot)) {
      return;
    }
    prioritarios.push(colab);
    idsJaIncluidos.add(colab.id_groot);
  }
  
  // Ordem de urgência:
  // 1. Janela Promocional Iminente (mês 3)
  contexto.janelaPromocaoIminente.forEach(adicionar);
  
  // 2. Janela Prejudicada
  contexto.janelaPrejudicada.forEach(adicionar);
  
  // 3. Aptos Perpétuos esperando ≥ 3m
  contexto.aptosPerpetuosAvalidos.forEach(adicionar);
  
  // 4. Ofensores Críticos
  contexto.ofensoresCriticos.forEach(adicionar);
  
  // 5. Aniversariantes
  contexto.aniversariantesHoje.forEach(adicionar);
  
  // 🎯 Limita pelas vagas disponíveis
  return prioritarios.slice(0, contexto.vagasDisponiveis);
}

// ============================================
// MONTA RESUMO TEXTUAL DO CONTEXTO PRA IA
// ============================================

export function montarResumoTime(contexto: ContextoTime): string {
  const linhas: string[] = [];
  
  linhas.push(`📊 CONTEXTO DO TIME (${contexto.hoje} - ${contexto.quarter})`);
  linhas.push(`Total: ${contexto.colabsAtivos} colabs ativos`);
  linhas.push(`Performance: ${contexto.totalSuperas} Superas | ${contexto.totalAlinhados} Alinhados | ${contexto.totalOfensores} Ofensores`);
  linhas.push(`Tarefas: ${contexto.tarefasPendentesAtual}/${contexto.metas.limite_tarefas_pendentes} (${contexto.vagasDisponiveis} vaga(s))`);
  linhas.push('');
  
  if (contexto.limiteAtingido) {
    linhas.push(`🛑 LIMITE ATINGIDO - sem gerar novas tarefas`);
  }
  
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
  
  return linhas.join('\n');
}

// ============================================
// 🧠 COLETOR INTELIGENTE + APRENDIZADO
// ============================================
// Agora a IA APRENDE com suas ações passadas:
// - O que funcionou (sucesso)
// - O que não funcionou (falha)
// - Padrões do seu time específico
// ============================================
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
function calcularMesesEntreDatas(dataInicio: string | null): number {
  if (!dataInicio) return 0;
  try {
    const inicio = new Date(dataInicio + 'T12:00:00');
    if (isNaN(inicio.getTime())) return 0;
    const hoje = new Date();
    return (hoje.getFullYear() - inicio.getFullYear()) * 12 + 
           (hoje.getMonth() - inicio.getMonth());
  } catch (e) {
    return 0;
  }
}
function analisarTendencia(valores: number[]): {
  tendencia: 'subindo' | 'estavel' | 'caindo' | 'sem_dados';
  variacao_pct: number;
  forca: 'forte' | 'moderada' | 'leve';
} {
  if (valores.length < 3) return { tendencia: 'sem_dados', variacao_pct: 0, forca: 'leve' };
  
  const metade = Math.floor(valores.length / 2);
  const inicial = valores.slice(0, metade);
  const final = valores.slice(metade);
  
  const mediaInicial = inicial.reduce((s, v) => s + v, 0) / inicial.length;
  const mediaFinal = final.reduce((s, v) => s + v, 0) / final.length;
  
  if (mediaInicial === 0) return { tendencia: 'sem_dados', variacao_pct: 0, forca: 'leve' };
  
  const variacao = ((mediaFinal - mediaInicial) / mediaInicial) * 100;
  
  let forca: 'forte' | 'moderada' | 'leve' = 'leve';
  if (Math.abs(variacao) > 10) forca = 'forte';
  else if (Math.abs(variacao) > 5) forca = 'moderada';
  
  let tendencia: 'subindo' | 'estavel' | 'caindo';
  if (variacao > 2) tendencia = 'subindo';
  else if (variacao < -2) tendencia = 'caindo';
  else tendencia = 'estavel';
  
  return { tendencia, variacao_pct: Number(variacao.toFixed(1)), forca };
}
function detectarPadroes(historicoColab: any[]): {
  cai_segunda: boolean;
  cai_sexta: boolean;
  consistente: boolean;
  volatil: boolean;
  variancia: number;
} {
  if (historicoColab.length < 5) {
    return { cai_segunda: false, cai_sexta: false, consistente: false, volatil: false, variancia: 0 };
  }
  
  const liquidas = historicoColab.map(h => Number(h.liquida) || 0).filter(v => v > 0);
  
  const media = liquidas.reduce((s, v) => s + v, 0) / liquidas.length;
  const variancia = liquidas.reduce((s, v) => s + Math.pow(v - media, 2), 0) / liquidas.length;
  const desvioPadrao = Math.sqrt(variancia);
  const coefVariacao = media > 0 ? (desvioPadrao / media) * 100 : 0;
  
  const consistente = coefVariacao < 8;
  const volatil = coefVariacao > 15;
  
  const porDia: Record<number, number[]> = {};
  historicoColab.forEach(h => {
    const data = new Date(h.data_referencia + 'T12:00:00');
    const dia = data.getDay();
    if (!porDia[dia]) porDia[dia] = [];
    if (Number(h.liquida) > 0) porDia[dia].push(Number(h.liquida));
  });
  
  const mediaSegunda = porDia[1]?.length > 0 ? porDia[1].reduce((s, v) => s + v, 0) / porDia[1].length : media;
  const mediaSexta = porDia[5]?.length > 0 ? porDia[5].reduce((s, v) => s + v, 0) / porDia[5].length : media;
  
  const cai_segunda = mediaSegunda < media * 0.92;
  const cai_sexta = mediaSexta < media * 0.92;
  
  return { cai_segunda, cai_sexta, consistente, volatil, variancia: Number(coefVariacao.toFixed(1)) };
}
// ============================================
// 🧠 ANALISA APRENDIZADO DAS TAREFAS PASSADAS
// ============================================
function analisarAprendizado(tarefasPassadas: any[]): {
  totalTarefas: number;
  sucessos: number;
  falhas: number;
  neutros: number;
  taxaSucesso: number;
  estrategiasEficazes: string[];
  estrategiasIneficazes: string[];
  historicoDetalhado: any[];
} {
  if (!tarefasPassadas || tarefasPassadas.length === 0) {
    return {
      totalTarefas: 0,
      sucessos: 0,
      falhas: 0,
      neutros: 0,
      taxaSucesso: 0,
      estrategiasEficazes: [],
      estrategiasIneficazes: [],
      historicoDetalhado: [],
    };
  }
  
  // Conta por classificação
  const sucessos = tarefasPassadas.filter(t => 
    t.classificacao_aprendizado === 'sucesso_confirmado' || 
    (t.classificacao_aprendizado === 'abordagem_funcionou' && !t.performance_depois_30d)
  ).length;
  
  const falhas = tarefasPassadas.filter(t =>
    t.classificacao_aprendizado === 'falha_confirmada' ||
    (t.classificacao_aprendizado === 'abordagem_falhou' && !t.performance_depois_30d)
  ).length;
  
  const neutros = tarefasPassadas.filter(t =>
    t.classificacao_aprendizado === 'efeito_neutro'
  ).length;
  
  const totalAvaliadas = sucessos + falhas + neutros;
  const taxaSucesso = totalAvaliadas > 0 ? (sucessos / totalAvaliadas) * 100 : 0;
  
  // Identifica estratégias eficazes (tipos que tiveram sucesso)
  const tiposComSucesso: Record<string, number> = {};
  const tiposComFalha: Record<string, number> = {};
  
  tarefasPassadas.forEach(t => {
    if (!t.tipo) return;
    if (t.classificacao_aprendizado === 'sucesso_confirmado' || t.classificacao_aprendizado === 'abordagem_funcionou') {
      tiposComSucesso[t.tipo] = (tiposComSucesso[t.tipo] || 0) + 1;
    }
    if (t.classificacao_aprendizado === 'falha_confirmada' || t.classificacao_aprendizado === 'abordagem_falhou') {
      tiposComFalha[t.tipo] = (tiposComFalha[t.tipo] || 0) + 1;
    }
  });
  
  const estrategiasEficazes = Object.entries(tiposComSucesso)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tipo, count]) => `${tipo} (${count} sucessos)`);
  
  const estrategiasIneficazes = Object.entries(tiposComFalha)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tipo, count]) => `${tipo} (${count} falhas)`);
  
  // Histórico detalhado (últimas 10 tarefas finalizadas)
  const historicoDetalhado = tarefasPassadas
    .filter(t => t.finalizada_em)
    .sort((a, b) => new Date(b.finalizada_em).getTime() - new Date(a.finalizada_em).getTime())
    .slice(0, 10)
    .map(t => ({
      nome: t.nome,
      tipo: t.tipo,
      acao_tomada: t.acao_tomada,
      resultado: t.classificacao_aprendizado,
      variacao_30d: t.performance_depois_30d?.variacao_pct || null,
      observacao: t.observacao_tl,
      diasAtras: Math.floor((Date.now() - new Date(t.finalizada_em).getTime()) / (1000 * 60 * 60 * 24)),
    }));
  
  return {
    totalTarefas: tarefasPassadas.length,
    sucessos,
    falhas,
    neutros,
    taxaSucesso: Number(taxaSucesso.toFixed(1)),
    estrategiasEficazes,
    estrategiasIneficazes,
    historicoDetalhado,
  };
}
// ============================================
// FUNÇÃO PRINCIPAL
// ============================================
export async function coletarContextoCompleto(): Promise<{
  colabs: any[];
  metas: Record<string, number>;
  metaDiariaIA: number;
  tarefasGeradasHoje: number;
  podeGerar: boolean;
  vagasHoje: number;
  saudeTime: any;
  dataAtual: any;
  aprendizado: any;
}> {
  const { data: configData } = await supabase.from('config').select('chave, valor');
  
  const metas: Record<string, number> = {};
  (configData || []).forEach((c: any) => {
    metas[c.chave] = Number(c.valor) || 0;
  });
  
  const metaDiariaIA = metas['limite_tarefas_pendentes'] || 2;
  
  const hoje = new Date().toISOString().split('T')[0];
  
  const { count: tarefasHoje } = await supabase
    .from('tarefas')
    .select('id', { count: 'exact', head: true })
    .eq('gerado_por_ia', true)
    .gte('criado_em', hoje + 'T00:00:00')
    .lte('criado_em', hoje + 'T23:59:59');
  
  const vagasHoje = Math.max(0, metaDiariaIA - (tarefasHoje || 0));
  const podeGerar = vagasHoje > 0;
  
  const dataAtualObj = new Date();
  const diaAtual = dataAtualObj.getDate();
  const mesAtual = dataAtualObj.getMonth() + 1;
  const anoAtual = dataAtualObj.getFullYear();
  const ultimoDiaMes = new Date(anoAtual, mesAtual, 0).getDate();
  const fimQuarter = mesAtual % 3 === 0;
  
  let contextoTemporal: 'inicio_mes' | 'meio_mes' | 'fechamento';
  if (diaAtual <= 7) contextoTemporal = 'inicio_mes';
  else if (diaAtual <= 22) contextoTemporal = 'meio_mes';
  else contextoTemporal = 'fechamento';
  
  const dataAtual = {
    dia: diaAtual,
    mes: mesAtual,
    ano: anoAtual,
    diasRestantesMes: ultimoDiaMes - diaAtual,
    contextoTemporal,
    fimQuarter,
    diaSemana: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][dataAtualObj.getDay()],
  };
  
  // 🧠 BUSCA APRENDIZADO - tarefas finalizadas nos últimos 90 dias
  const dias90atras = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { data: tarefasFinalizadasData } = await supabase
    .from('tarefas')
    .select('*')
    .eq('gerado_por_ia', true)
    .eq('status', 'Finalizada')
    .gte('finalizada_em', dias90atras)
    .not('classificacao_aprendizado', 'is', null);
  
  const aprendizado = analisarAprendizado(tarefasFinalizadasData || []);
  
  if (!podeGerar) {
    return { 
      colabs: [], 
      metas, 
      metaDiariaIA,
      tarefasGeradasHoje: tarefasHoje || 0,
      podeGerar: false,
      vagasHoje: 0,
      saudeTime: null,
      dataAtual,
      aprendizado,
    };
  }
  
  const { data: colabsData } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('status', 'Ativo');
  
  if (!colabsData) return { 
    colabs: [], metas, metaDiariaIA, 
    tarefasGeradasHoje: tarefasHoje || 0,
    podeGerar: false, vagasHoje: 0, saudeTime: null, dataAtual, aprendizado,
  };
  
  const idsGroot = colabsData.map(c => c.id_groot);
  
  const trimestreAtual = Math.ceil(mesAtual / 3);
  const inicioQuarter = `${anoAtual}-${String((trimestreAtual - 1) * 3 + 1).padStart(2, '0')}-01`;
  
  const dias14atras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dias30atras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [
    { data: historicoData },
    { data: produtividadeMensalData },
    { data: presencaData },
    { data: imaData },
    { data: calibracoesData },
    { data: tarefasPendentesData },
    { data: tarefasRecentesData },
    { data: feedbacksRecentesData },
    { data: feedbacksHistData },
    { data: tarefasPorColabFinalizadas },
  ] = await Promise.all([
    supabase.from('historico').select('*').in('id_groot', idsGroot).gte('data_referencia', dias90atras),
    supabase.from('produtividade_mensal').select('*').in('id_groot', idsGroot).order('ano', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('presenca').select('*').in('id_groot', idsGroot).gte('data_referencia', dias90atras).neq('status', 'descartado'),
    supabase.from('ima_manual').select('*').in('id_groot', idsGroot).order('data_avaliacao', { ascending: false }),
    supabase.from('calibracoes').select('*').in('id_groot', idsGroot).order('criado_em', { ascending: false }),
    supabase.from('tarefas').select('id_groot').eq('status', 'Pendente'),
    supabase.from('tarefas').select('id_groot, criado_em, status, tipo, diagnostico').gte('criado_em', dias14atras),
    supabase.from('feedbacks').select('id_groot, tipo, classificacao, observacao, registrado_em').gte('registrado_em', dias30atras).order('registrado_em', { ascending: false }),
    supabase.from('feedbacks').select('id_groot, tipo, classificacao, observacao, registrado_em').gte('registrado_em', dias90atras),
    // 🧠 Tarefas finalizadas POR COLAB (aprendizado individual)
    supabase.from('tarefas')
      .select('id_groot, tipo, classificacao_aprendizado, acao_tomada, observacao_tl, performance_depois_30d, finalizada_em')
      .in('id_groot', idsGroot)
      .eq('status', 'Finalizada')
      .not('classificacao_aprendizado', 'is', null)
      .gte('finalizada_em', dias90atras),
  ]);
  
  // Mapeia tudo
  const mapaHistorico: Record<string, any[]> = {};
  (historicoData || []).forEach((h: any) => {
    if (!mapaHistorico[h.id_groot]) mapaHistorico[h.id_groot] = [];
    mapaHistorico[h.id_groot].push(h);
  });
  
  const mapaProdMensal: Record<string, any[]> = {};
  (produtividadeMensalData || []).forEach((p: any) => {
    if (!mapaProdMensal[p.id_groot]) mapaProdMensal[p.id_groot] = [];
    mapaProdMensal[p.id_groot].push(p);
  });
  
  const mapaPresenca: Record<string, any[]> = {};
  (presencaData || []).forEach((p: any) => {
    if (!mapaPresenca[p.id_groot]) mapaPresenca[p.id_groot] = [];
    mapaPresenca[p.id_groot].push(p);
  });
  
  const mapaCalibracoes: Record<string, any[]> = {};
  (calibracoesData || []).forEach((c: any) => {
    if (!mapaCalibracoes[c.id_groot]) mapaCalibracoes[c.id_groot] = [];
    mapaCalibracoes[c.id_groot].push(c);
  });
  
  const mapaTarefasPendentes: Record<string, number> = {};
  (tarefasPendentesData || []).forEach((t: any) => {
    mapaTarefasPendentes[t.id_groot] = (mapaTarefasPendentes[t.id_groot] || 0) + 1;
  });
  
  const mapaTarefasRecentes: Record<string, any[]> = {};
  (tarefasRecentesData || []).forEach((t: any) => {
    if (!mapaTarefasRecentes[t.id_groot]) mapaTarefasRecentes[t.id_groot] = [];
    mapaTarefasRecentes[t.id_groot].push(t);
  });
  
  const mapaFeedbacksRecentes: Record<string, any[]> = {};
  (feedbacksRecentesData || []).forEach((f: any) => {
    if (!mapaFeedbacksRecentes[f.id_groot]) mapaFeedbacksRecentes[f.id_groot] = [];
    mapaFeedbacksRecentes[f.id_groot].push(f);
  });
  
  const mapaFeedbacksHist: Record<string, any[]> = {};
  (feedbacksHistData || []).forEach((f: any) => {
    if (!mapaFeedbacksHist[f.id_groot]) mapaFeedbacksHist[f.id_groot] = [];
    mapaFeedbacksHist[f.id_groot].push(f);
  });
  
  // 🧠 APRENDIZADO POR COLAB
  const mapaAprendizadoColab: Record<string, any[]> = {};
  (tarefasPorColabFinalizadas || []).forEach((t: any) => {
    if (!mapaAprendizadoColab[t.id_groot]) mapaAprendizadoColab[t.id_groot] = [];
    mapaAprendizadoColab[t.id_groot].push(t);
  });
  
  // Constrói contexto pra CADA colab
  const colabs = colabsData.map((c: any) => {
    const historicoColab = mapaHistorico[c.id_groot] || [];
    const mensaisColab = mapaProdMensal[c.id_groot] || [];
    const presencas = mapaPresenca[c.id_groot] || [];
    const feedbacksRec = mapaFeedbacksRecentes[c.id_groot] || [];
    const feedbacksHist = mapaFeedbacksHist[c.id_groot] || [];
    const tarefasRec = mapaTarefasRecentes[c.id_groot] || [];
    const calibracoes = mapaCalibracoes[c.id_groot] || [];
    const aprendizadoColab = mapaAprendizadoColab[c.id_groot] || [];
    
    const historico7d = historicoColab.filter(h => 
      h.data_referencia >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const historico30d = historicoColab.filter(h => 
      h.data_referencia >= dias30atras
    );
    
    const liquidas7d = historico7d.map(h => Number(h.liquida) || 0).filter(v => v > 0);
    const liquidas30d = historico30d.map(h => Number(h.liquida) || 0).filter(v => v > 0);
    
    const media7d = liquidas7d.length > 0 ? liquidas7d.reduce((s, v) => s + v, 0) / liquidas7d.length : 0;
    const media30d = liquidas30d.length > 0 ? liquidas30d.reduce((s, v) => s + v, 0) / liquidas30d.length : 0;
    
    const tendencia7d = analisarTendencia(liquidas7d);
    const tendencia30d = analisarTendencia(liquidas30d);
    const padroes = detectarPadroes(historico30d);
    
    const mensalAtual = mensaisColab.find(p => p.mes === mesAtual && p.ano === anoAtual);
    const historicoMensal = mensaisColab.slice(0, 3);
    
    const presencaStats = {
      presencas: 0, atestados: 0, faltasInjustificadas: 0,
      bhPlanejado: 0, bhNaoPlanejado: 0, sinergiaExterna: 0,
      abandono: 0, pctAbs: 0,
      tendenciaAtestados: 'estavel' as 'subindo' | 'estavel' | 'caindo',
    };
    
    presencas.forEach((p: any) => {
      const m = (p.motivo || '').toLowerCase();
      if (m.includes('p - presente') || p.status === 'presente') presencaStats.presencas++;
      else if (m.includes('atestado')) presencaStats.atestados++;
      else if (m.includes('fi - falta')) presencaStats.faltasInjustificadas++;
      else if (m.includes('bh - banco de horas n')) presencaStats.bhNaoPlanejado++;
      else if (m.includes('bh - banco de horas plan')) presencaStats.bhPlanejado++;
      else if (m.includes('sinergia')) presencaStats.sinergiaExterna++;
      else if (m.includes('abandono')) presencaStats.abandono++;
    });
    
    const totalContab = presencaStats.presencas + presencaStats.faltasInjustificadas + 
                       presencaStats.bhNaoPlanejado + presencaStats.atestados;
    presencaStats.pctAbs = totalContab > 0 
      ? Number((((presencaStats.faltasInjustificadas + presencaStats.bhNaoPlanejado) / totalContab) * 100).toFixed(1))
      : 0;
    
    const atestados30d = presencas.filter(p => 
      p.data_referencia >= dias30atras && (p.motivo || '').toLowerCase().includes('atestado')
    ).length;
    const atestados60to30d = presencas.filter(p => {
      const dias60atras = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return p.data_referencia >= dias60atras && p.data_referencia < dias30atras && 
             (p.motivo || '').toLowerCase().includes('atestado');
    }).length;
    
    if (atestados30d > atestados60to30d * 1.5 && atestados30d >= 2) {
      presencaStats.tendenciaAtestados = 'subindo';
    } else if (atestados30d < atestados60to30d * 0.5) {
      presencaStats.tendenciaAtestados = 'caindo';
    }
    
    const mesesNaEmpresa = calcularMesesEntreDatas(c.data_admissao);
    const mesesNaCarreira = calcularMesesEntreDatas(c.data_entrada_carreira);
    
    // Acompanhamento de feedback
    const ultimoFeedback = feedbacksRec[0] || null;
    let acompanhamento = null;
    
    if (ultimoFeedback) {
      const diasDesdeFeedback = Math.floor(
        (Date.now() - new Date(ultimoFeedback.registrado_em).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const dataFeedback = new Date(ultimoFeedback.registrado_em).toISOString().split('T')[0];
      const antesFeedback = historicoColab
        .filter(h => h.data_referencia < dataFeedback)
        .slice(-7)
        .map(h => Number(h.liquida) || 0).filter(v => v > 0);
      const depoisFeedback = historicoColab
        .filter(h => h.data_referencia >= dataFeedback)
        .map(h => Number(h.liquida) || 0).filter(v => v > 0);
      
      const mediaAntes = antesFeedback.length > 0 ? antesFeedback.reduce((s, v) => s + v, 0) / antesFeedback.length : 0;
      const mediaDepois = depoisFeedback.length > 0 ? depoisFeedback.reduce((s, v) => s + v, 0) / depoisFeedback.length : 0;
      
      let evolucao: 'melhorou' | 'igual' | 'piorou' | 'sem_dados' = 'sem_dados';
      if (mediaAntes > 0 && mediaDepois > 0) {
        const variacao = ((mediaDepois - mediaAntes) / mediaAntes) * 100;
        if (variacao > 3) evolucao = 'melhorou';
        else if (variacao < -3) evolucao = 'piorou';
        else evolucao = 'igual';
      }
      
      acompanhamento = {
        diasDesdeFeedback, tipoFeedback: ultimoFeedback.tipo,
        classificacao: ultimoFeedback.classificacao,
        observacao: ultimoFeedback.observacao?.slice(0, 200),
        mediaAntes: Math.round(mediaAntes), mediaDepois: Math.round(mediaDepois),
        evolucao,
      };
    }
    
    const temTarefaPendente = (mapaTarefasPendentes[c.id_groot] || 0) > 0;
    const tarefasRecentesPessoa = tarefasRec.length;
    const podeSerSugerido = !temTarefaPendente && tarefasRecentesPessoa === 0;
    
    const feedbacksUltimos90d = feedbacksHist.length;
    const feedbacksConstrutivos = feedbacksHist.filter(f => f.tipo === 'Construtivo').length;
    const feedbacksReconhecimento = feedbacksHist.filter(f => f.tipo === 'Reconhecimento').length;
    
    const recebeMuitoFeedback = feedbacksUltimos90d >= 5;
    const nuncaReceberFeedback = feedbacksUltimos90d === 0;
    const desbalanceadoConstrutivo = feedbacksConstrutivos >= 3 && feedbacksReconhecimento === 0;
    
    const calibracoesPassadas = calibracoes.slice(0, 3).map(c => ({
      classificacao: c.classificacao, data: c.criado_em,
    }));
    
    const sinaisBurnout = {
      atestadosSubindo: presencaStats.tendenciaAtestados === 'subindo',
      performanceCaindo: tendencia30d.tendencia === 'caindo' && tendencia30d.forca !== 'leve',
      absAlto: presencaStats.pctAbs > 10,
      pontuacao: 0,
    };
    sinaisBurnout.pontuacao = 
      (sinaisBurnout.atestadosSubindo ? 1 : 0) +
      (sinaisBurnout.performanceCaindo ? 1 : 0) +
      (sinaisBurnout.absAlto ? 1 : 0);
    
    const consistenteSilencioso = padroes.consistente && feedbacksReconhecimento === 0 && media30d > 0;
    
    let evolucaoSilenciosa = false;
    if (historicoMensal.length >= 2) {
      const mensalRecente = Number(historicoMensal[0].prod_liquida_media) || 0;
      const mensalAnterior = Number(historicoMensal[1].prod_liquida_media) || 0;
      if (mensalRecente > 0 && mensalAnterior > 0) {
        const variacao = ((mensalRecente - mensalAnterior) / mensalAnterior) * 100;
        evolucaoSilenciosa = variacao > 5 && variacao < 15;
      }
    }
    
    let fonteDados: 'diario' | 'mensal' | 'nenhum' = 'nenhum';
    if (liquidas30d.length > 0) fonteDados = 'diario';
    else if (mensalAtual) fonteDados = 'mensal';
    
    // 🧠 HISTÓRICO DE APRENDIZADO INDIVIDUAL
    const aprendizadoIndividual = aprendizadoColab.map(t => ({
      tipo: t.tipo,
      acao: t.acao_tomada,
      resultado: t.classificacao_aprendizado,
      variacao: t.performance_depois_30d?.variacao_pct || null,
      observacao: t.observacao_tl?.slice(0, 150),
      diasAtras: t.finalizada_em ? Math.floor((Date.now() - new Date(t.finalizada_em).getTime()) / (1000 * 60 * 60 * 24)) : null,
    }));
    
    return {
      id: c.id,
      id_groot: c.id_groot,
      nome: c.nome,
      processo: c.processo,
      cargo: c.cargo,
      carreira: c.carreira,
      proxima_carreira: c.proxima_carreira,
      data_admissao: c.data_admissao,
      data_entrada_carreira: c.data_entrada_carreira,
      
      performance: {
        curto_prazo_7d: { dias: liquidas7d.length, media: Math.round(media7d), tendencia: tendencia7d },
        medio_prazo_30d: { dias: liquidas30d.length, media: Math.round(media30d), tendencia: tendencia30d },
        mensal_atual: mensalAtual ? {
          mes: mensalAtual.mes, ano: mensalAtual.ano,
          liquida: Number(mensalAtual.prod_liquida_media),
          unidades: Number(mensalAtual.unidades_total),
          dias: Number(mensalAtual.dias_trabalhados),
        } : null,
        historico_mensal: historicoMensal.map(h => ({
          mes: h.mes, ano: h.ano, liquida: Number(h.prod_liquida_media),
        })),
        fonteDados,
      },
      
      padroes,
      presenca: presencaStats,
      
      carreira_info: {
        mesesNaEmpresa, mesesNaCarreira,
        podePromover: mesesNaCarreira >= 6 && !!c.proxima_carreira,
        nuncaCalibrouComoApto: !calibracoesPassadas.some(c => c.classificacao === 'APTO'),
      },
      
      acompanhamento,
      
      memoria: {
        feedbacksUltimos90d, feedbacksConstrutivos, feedbacksReconhecimento,
        calibracoesPassadas,
        ultimoFeedback: ultimoFeedback ? {
          tipo: ultimoFeedback.tipo, dataISO: ultimoFeedback.registrado_em,
          diasAtras: Math.floor((Date.now() - new Date(ultimoFeedback.registrado_em).getTime()) / (1000 * 60 * 60 * 24)),
        } : null,
      },
      
      // 🧠 APRENDIZADO INDIVIDUAL
      aprendizadoColab: aprendizadoIndividual,
      
      vieses: { recebeMuitoFeedback, nuncaReceberFeedback, desbalanceadoConstrutivo },
      burnout: sinaisBurnout,
      reconhecimentoInvisivel: { consistenteSilencioso, evolucaoSilenciosa },
      
      tarefasPendentes: mapaTarefasPendentes[c.id_groot] || 0,
      podeSerSugerido,
      tarefasRecentes14d: tarefasRecentesPessoa,
    };
  });
  
  const saudeTime = {
    total: colabs.length,
    performance: {
      acimaMetaP2M: colabs.filter(c => c.processo === 'P2M' && c.performance.medio_prazo_30d.media >= (metas['meta_liquida_p2m'] || 280)).length,
      acimaMetaCheckin: colabs.filter(c => c.processo === 'Checkin' && c.performance.medio_prazo_30d.media >= (metas['meta_liquida_checkin'] || 100)).length,
      caindoTodos: colabs.filter(c => c.performance.medio_prazo_30d.tendencia.tendencia === 'caindo').length,
      subindo: colabs.filter(c => c.performance.medio_prazo_30d.tendencia.tendencia === 'subindo').length,
    },
    alertas: {
      muitasQuedasJuntas: colabs.filter(c => c.performance.medio_prazo_30d.tendencia.tendencia === 'caindo').length >= 5,
      atestadosEmAlta: colabs.filter(c => c.presenca.tendenciaAtestados === 'subindo').length >= 3,
      burnoutColetivo: colabs.filter(c => c.burnout.pontuacao >= 2).length >= 3,
    },
    distribuicaoFeedback: {
      semFeedback90d: colabs.filter(c => c.memoria.feedbacksUltimos90d === 0).length,
      poucoConstrutivos: colabs.filter(c => c.memoria.feedbacksConstrutivos === 0 && c.performance.medio_prazo_30d.media > 0).length,
      poucoReconhecimentos: colabs.filter(c => c.memoria.feedbacksReconhecimento === 0).length,
    },
    oportunidades: {
      prontosPromocao: colabs.filter(c => c.carreira_info.podePromover).length,
      consistentesSilenciosos: colabs.filter(c => c.reconhecimentoInvisivel.consistenteSilencioso).length,
      evolucoesInvisiveis: colabs.filter(c => c.reconhecimentoInvisivel.evolucaoSilenciosa).length,
    },
  };
  
  return { 
    colabs, metas, metaDiariaIA,
    tarefasGeradasHoje: tarefasHoje || 0,
    podeGerar, vagasHoje, saudeTime, dataAtual,
    aprendizado,
  };
}

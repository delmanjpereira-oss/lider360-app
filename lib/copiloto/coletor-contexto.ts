// ============================================
// 🧠 COLETOR DE CONTEXTO INTELIGENTE
// ============================================
// 12 IDEIAS INCORPORADAS:
// 1. Acompanhamento de feedback
// 2. Saúde do time (sistêmico)
// 3. Ciclos 30/60/90
// 4. Coaching com perguntas
// 5. Reconhecimento estratégico
// 6. Anti-vieses
// 7. Memória histórica
// 8. Quebra-gelo
// 9. Radar de burnout
// 10. Mentora de escalada
// 11. Detetive de padrões
// 12. Defensora (humanidade)
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// HELPERS
// ============================================

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
  
  // Análise por dia da semana
  const porDia: Record<number, number[]> = {};
  historicoColab.forEach(h => {
    const data = new Date(h.data_referencia + 'T12:00:00');
    const dia = data.getDay(); // 0=domingo, 1=segunda, 5=sexta
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
}> {
  // 1️⃣ Config
  const { data: configData } = await supabase.from('config').select('chave, valor');
  
  const metas: Record<string, number> = {};
  (configData || []).forEach((c: any) => {
    metas[c.chave] = Number(c.valor) || 0;
  });
  
  // 🆕 META DIÁRIA da IA (lê da config existente)
  const metaDiariaIA = metas['limite_tarefas_pendentes'] || 2;
  
  // 2️⃣ Verifica tarefas geradas HOJE
  const hoje = new Date().toISOString().split('T')[0];
  
  const { count: tarefasHoje } = await supabase
    .from('tarefas')
    .select('id', { count: 'exact', head: true })
    .eq('gerado_por_ia', true)
    .gte('criado_em', hoje + 'T00:00:00')
    .lte('criado_em', hoje + 'T23:59:59');
  
  const vagasHoje = Math.max(0, metaDiariaIA - (tarefasHoje || 0));
  const podeGerar = vagasHoje > 0;
  
  // 3️⃣ Data e contexto temporal
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
    };
  }
  
  // 4️⃣ Pega TODOS os dados
  const { data: colabsData } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('status', 'Ativo');
  
  if (!colabsData) return { 
    colabs: [], metas, metaDiariaIA, 
    tarefasGeradasHoje: tarefasHoje || 0,
    podeGerar: false, vagasHoje: 0, saudeTime: null, dataAtual,
  };
  
  const idsGroot = colabsData.map(c => c.id_groot);
  
  // Período do quarter atual
  const trimestreAtual = Math.ceil(mesAtual / 3);
  const inicioQuarter = `${anoAtual}-${String((trimestreAtual - 1) * 3 + 1).padStart(2, '0')}-01`;
  
  // Datas relativas
  const dias14atras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dias30atras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dias90atras = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
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
  ] = await Promise.all([
    // Histórico diário (3 meses pra ter visão longa)
    supabase
      .from('historico')
      .select('*')
      .in('id_groot', idsGroot)
      .gte('data_referencia', dias90atras),
    
    // Produtividade mensal
    supabase
      .from('produtividade_mensal')
      .select('*')
      .in('id_groot', idsGroot)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false }),
    
    // Presença (90 dias pra ver padrões)
    supabase
      .from('presenca')
      .select('*')
      .in('id_groot', idsGroot)
      .gte('data_referencia', dias90atras)
      .neq('status', 'descartado'),
    
    // IMA
    supabase
      .from('ima_manual')
      .select('*')
      .in('id_groot', idsGroot)
      .order('data_avaliacao', { ascending: false }),
    
    // Calibrações
    supabase
      .from('calibracoes')
      .select('*')
      .in('id_groot', idsGroot)
      .order('criado_em', { ascending: false }),
    
    // Tarefas pendentes
    supabase
      .from('tarefas')
      .select('id_groot')
      .eq('status', 'Pendente'),
    
    // 🆕 Tarefas recentes (anti-duplicação 14 dias)
    supabase
      .from('tarefas')
      .select('id_groot, criado_em, status, tipo, diagnostico')
      .gte('criado_em', dias14atras),
    
    // 🆕 Feedbacks recentes (acompanhamento)
    supabase
      .from('feedbacks')
      .select('id_groot, tipo, classificacao, observacao, registrado_em')
      .gte('registrado_em', dias30atras)
      .order('registrado_em', { ascending: false }),
    
    // 🆕 Feedbacks histórico (memória)
    supabase
      .from('feedbacks')
      .select('id_groot, tipo, classificacao, observacao, registrado_em')
      .gte('registrado_em', dias90atras),
  ]);
  
  // 5️⃣ Mapeia tudo por id_groot
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
  
  const mapaIma: Record<string, any[]> = {};
  (imaData || []).forEach((i: any) => {
    if (!mapaIma[i.id_groot]) mapaIma[i.id_groot] = [];
    mapaIma[i.id_groot].push(i);
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
  
  // 🆕 Tarefas recentes (anti-duplicação)
  const mapaTarefasRecentes: Record<string, any[]> = {};
  (tarefasRecentesData || []).forEach((t: any) => {
    if (!mapaTarefasRecentes[t.id_groot]) mapaTarefasRecentes[t.id_groot] = [];
    mapaTarefasRecentes[t.id_groot].push(t);
  });
  
  // 🆕 Feedbacks recentes (acompanhamento)
  const mapaFeedbacksRecentes: Record<string, any[]> = {};
  (feedbacksRecentesData || []).forEach((f: any) => {
    if (!mapaFeedbacksRecentes[f.id_groot]) mapaFeedbacksRecentes[f.id_groot] = [];
    mapaFeedbacksRecentes[f.id_groot].push(f);
  });
  
  // 🆕 Feedbacks histórico (memória)
  const mapaFeedbacksHist: Record<string, any[]> = {};
  (feedbacksHistData || []).forEach((f: any) => {
    if (!mapaFeedbacksHist[f.id_groot]) mapaFeedbacksHist[f.id_groot] = [];
    mapaFeedbacksHist[f.id_groot].push(f);
  });
  
  // 6️⃣ Constrói contexto pra CADA colab
  const colabs = colabsData.map((c: any) => {
    const historicoColab = mapaHistorico[c.id_groot] || [];
    const mensaisColab = mapaProdMensal[c.id_groot] || [];
    const presencas = mapaPresenca[c.id_groot] || [];
    const feedbacksRec = mapaFeedbacksRecentes[c.id_groot] || [];
    const feedbacksHist = mapaFeedbacksHist[c.id_groot] || [];
    const tarefasRec = mapaTarefasRecentes[c.id_groot] || [];
    const calibracoes = mapaCalibracoes[c.id_groot] || [];
    
    // 📅 PERFORMANCE - múltiplos prazos
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
    
    // 📈 TENDÊNCIA múltipla
    const tendencia7d = analisarTendencia(liquidas7d);
    const tendencia30d = analisarTendencia(liquidas30d);
    
    // 🔍 PADRÕES detectados
    const padroes = detectarPadroes(historico30d);
    
    // 📊 MENSAL atual
    const mensalAtual = mensaisColab.find(p => p.mes === mesAtual && p.ano === anoAtual);
    const historicoMensal = mensaisColab.slice(0, 3); // últimos 3 meses
    
    // 🩺 PRESENÇA (90 dias pra ver padrões)
    const presencaStats = {
      presencas: 0,
      atestados: 0,
      faltasInjustificadas: 0,
      bhPlanejado: 0,
      bhNaoPlanejado: 0,
      sinergiaExterna: 0,
      abandono: 0,
      pctAbs: 0,
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
    
    // 🆕 Detecta tendência de atestados (radar burnout)
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
    
    // 🎯 CARREIRA
    const mesesNaEmpresa = calcularMesesEntreDatas(c.data_admissao);
    const mesesNaCarreira = calcularMesesEntreDatas(c.data_entrada_carreira);
    
    // 🆕 ACOMPANHAMENTO DE FEEDBACK
    const ultimoFeedback = feedbacksRec[0] || null;
    let acompanhamento = null;
    
    if (ultimoFeedback) {
      const diasDesdeFeedback = Math.floor(
        (Date.now() - new Date(ultimoFeedback.registrado_em).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Compara performance ANTES x DEPOIS do feedback
      const dataFeedback = new Date(ultimoFeedback.registrado_em).toISOString().split('T')[0];
      const antesFeedback = historicoColab
        .filter(h => h.data_referencia < dataFeedback)
        .slice(-7)
        .map(h => Number(h.liquida) || 0)
        .filter(v => v > 0);
      const depoisFeedback = historicoColab
        .filter(h => h.data_referencia >= dataFeedback)
        .map(h => Number(h.liquida) || 0)
        .filter(v => v > 0);
      
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
        diasDesdeFeedback,
        tipoFeedback: ultimoFeedback.tipo,
        classificacao: ultimoFeedback.classificacao,
        observacao: ultimoFeedback.observacao?.slice(0, 200),
        mediaAntes: Math.round(mediaAntes),
        mediaDepois: Math.round(mediaDepois),
        evolucao,
      };
    }
    
    // 🆕 ANTI-DUPLICAÇÃO (14 dias)
    const temTarefaPendente = (mapaTarefasPendentes[c.id_groot] || 0) > 0;
    const tarefasRecentesPessoa = tarefasRec.length;
    const podeSerSugerido = !temTarefaPendente && tarefasRecentesPessoa === 0;
    
    // 🆕 ANTI-VIESES (frequência de feedback)
    const feedbacksUltimos90d = feedbacksHist.length;
    const feedbacksConstrutivos = feedbacksHist.filter(f => f.tipo === 'Construtivo').length;
    const feedbacksReconhecimento = feedbacksHist.filter(f => f.tipo === 'Reconhecimento').length;
    
    const recebeMuitoFeedback = feedbacksUltimos90d >= 5;
    const nuncaReceberFeedback = feedbacksUltimos90d === 0;
    const desbalanceadoConstrutivo = feedbacksConstrutivos >= 3 && feedbacksReconhecimento === 0;
    
    // 🆕 MEMÓRIA HISTÓRICA
    const calibracoesPassadas = calibracoes.slice(0, 3).map(c => ({
      classificacao: c.classificacao,
      data: c.criado_em,
    }));
    
    // 🆕 RADAR DE BURNOUT
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
    
    // 🆕 CONSISTÊNCIA SILENCIOSA (mérito invisível)
    const consistenteSilencioso = padroes.consistente && feedbacksReconhecimento === 0 && media30d > 0;
    
    // 🆕 EVOLUÇÃO INVISÍVEL (subiu mas devagar)
    let evolucaoSilenciosa = false;
    if (historicoMensal.length >= 2) {
      const mensalRecente = Number(historicoMensal[0].prod_liquida_media) || 0;
      const mensalAnterior = Number(historicoMensal[1].prod_liquida_media) || 0;
      if (mensalRecente > 0 && mensalAnterior > 0) {
        const variacao = ((mensalRecente - mensalAnterior) / mensalAnterior) * 100;
        evolucaoSilenciosa = variacao > 5 && variacao < 15;
      }
    }
    
    // 🎯 Determina fonte de dados
    let fonteDados: 'diario' | 'mensal' | 'nenhum' = 'nenhum';
    if (liquidas30d.length > 0) fonteDados = 'diario';
    else if (mensalAtual) fonteDados = 'mensal';
    
    return {
      // Básico
      id: c.id,
      id_groot: c.id_groot,
      nome: c.nome,
      processo: c.processo,
      cargo: c.cargo,
      carreira: c.carreira,
      proxima_carreira: c.proxima_carreira,
      data_admissao: c.data_admissao,
      data_entrada_carreira: c.data_entrada_carreira,
      
      // 📅 Performance multi-prazo
      performance: {
        curto_prazo_7d: { 
          dias: liquidas7d.length, 
          media: Math.round(media7d), 
          tendencia: tendencia7d 
        },
        medio_prazo_30d: { 
          dias: liquidas30d.length, 
          media: Math.round(media30d), 
          tendencia: tendencia30d 
        },
        mensal_atual: mensalAtual ? {
          mes: mensalAtual.mes,
          ano: mensalAtual.ano,
          liquida: Number(mensalAtual.prod_liquida_media),
          unidades: Number(mensalAtual.unidades_total),
          dias: Number(mensalAtual.dias_trabalhados),
        } : null,
        historico_mensal: historicoMensal.map(h => ({
          mes: h.mes,
          ano: h.ano,
          liquida: Number(h.prod_liquida_media),
        })),
        fonteDados,
      },
      
      // 🔍 Padrões
      padroes,
      
      // 🩺 Presença
      presenca: presencaStats,
      
      // 🎯 Carreira
      carreira_info: {
        mesesNaEmpresa,
        mesesNaCarreira,
        podePromover: mesesNaCarreira >= 6 && !!c.proxima_carreira,
        nuncaCalibrouComoApto: !calibracoesPassadas.some(c => c.classificacao === 'APTO'),
      },
      
      // 🆕 Acompanhamento de feedback
      acompanhamento,
      
      // 🆕 Memória histórica
      memoria: {
        feedbacksUltimos90d,
        feedbacksConstrutivos,
        feedbacksReconhecimento,
        calibracoesPassadas,
        ultimoFeedback: ultimoFeedback ? {
          tipo: ultimoFeedback.tipo,
          dataISO: ultimoFeedback.registrado_em,
          diasAtras: ultimoFeedback ? Math.floor(
            (Date.now() - new Date(ultimoFeedback.registrado_em).getTime()) / (1000 * 60 * 60 * 24)
          ) : null,
        } : null,
      },
      
      // 🆕 Anti-vieses
      vieses: {
        recebeMuitoFeedback,
        nuncaReceberFeedback,
        desbalanceadoConstrutivo,
      },
      
      // 🆕 Radar de burnout
      burnout: sinaisBurnout,
      
      // 🆕 Reconhecimento invisível
      reconhecimentoInvisivel: {
        consistenteSilencioso,
        evolucaoSilenciosa,
      },
      
      // 🚧 Sistema
      tarefasPendentes: mapaTarefasPendentes[c.id_groot] || 0,
      podeSerSugerido,
      tarefasRecentes14d: tarefasRecentesPessoa,
    };
  });
  
  // ============================================
  // 🆕 SAÚDE SISTÊMICA DO TIME
  // ============================================
  const saudeTime = {
    total: colabs.length,
    
    // Performance geral
    performance: {
      acimaMetaP2M: colabs.filter(c => 
        c.processo === 'P2M' && c.performance.medio_prazo_30d.media >= (metas['meta_liquida_p2m'] || 280)
      ).length,
      acimaMetaCheckin: colabs.filter(c => 
        c.processo === 'Checkin' && c.performance.medio_prazo_30d.media >= (metas['meta_liquida_checkin'] || 100)
      ).length,
      caindoTodos: colabs.filter(c => 
        c.performance.medio_prazo_30d.tendencia.tendencia === 'caindo'
      ).length,
      subindo: colabs.filter(c => 
        c.performance.medio_prazo_30d.tendencia.tendencia === 'subindo'
      ).length,
    },
    
    // 🆕 Alertas sistêmicos
    alertas: {
      muitasQuedasJuntas: colabs.filter(c => 
        c.performance.medio_prazo_30d.tendencia.tendencia === 'caindo'
      ).length >= 5,
      
      atestadosEmAlta: colabs.filter(c => 
        c.presenca.tendenciaAtestados === 'subindo'
      ).length >= 3,
      
      burnoutColetivo: colabs.filter(c => 
        c.burnout.pontuacao >= 2
      ).length >= 3,
    },
    
    // 🆕 Memória do TL (anti-vieses agregados)
    distribuicaoFeedback: {
      semFeedback90d: colabs.filter(c => c.memoria.feedbacksUltimos90d === 0).length,
      poucoConstrutivos: colabs.filter(c => 
        c.memoria.feedbacksConstrutivos === 0 && c.performance.medio_prazo_30d.media > 0
      ).length,
      poucoReconhecimentos: colabs.filter(c => 
        c.memoria.feedbacksReconhecimento === 0
      ).length,
    },
    
    // 🆕 Oportunidades
    oportunidades: {
      prontosPromocao: colabs.filter(c => 
        c.carreira_info.podePromover
      ).length,
      consistentesSilenciosos: colabs.filter(c => 
        c.reconhecimentoInvisivel.consistenteSilencioso
      ).length,
      evolucoesInvisiveis: colabs.filter(c => 
        c.reconhecimentoInvisivel.evolucaoSilenciosa
      ).length,
    },
  };
  
  return { 
    colabs, 
    metas, 
    metaDiariaIA,
    tarefasGeradasHoje: tarefasHoje || 0,
    podeGerar,
    vagasHoje,
    saudeTime,
    dataAtual,
  };
}

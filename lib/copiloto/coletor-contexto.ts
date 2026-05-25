// ============================================
// 🧠 COLETOR DE CONTEXTO - lê MENSAL + diário + presença
// ============================================
// Estratégia:
// 1. SEMPRE busca produtividade_mensal (fonte principal)
// 2. Se não tiver mensal, cai no historico (diário)
// 3. Cruza com presença, IMA, calibrações
// ============================================

import { createClient } from '@supabase/supabase-js';
import { analisarCarreira } from './analisador-carreira';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// TIPOS
// ============================================

export type ContextoColab = {
  // Dados básicos
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  cargo: string | null;
  carreira: string | null;
  data_admissao: string | null;
  data_entrada_carreira: string | null;
  proxima_carreira: string | null;
  
  // 📊 PERFORMANCE MENSAL (do CSV mensal)
  mensalAtual: {
    prod_liquida: number;
    unidades_total: number;
    dias_trabalhados: number;
    mes: number;
    ano: number;
  } | null;
  
  // 📊 HISTÓRICO MENSAL (últimos 3 meses)
  historicoMensal: Array<{
    mes: number;
    ano: number;
    prod_liquida: number;
    dias_trabalhados: number;
  }>;
  
  // 📅 PERFORMANCE DIÁRIA (fallback se não tiver mensal)
  diarioRecente: {
    liquida_media: number;
    supera_media: number;
    dias_com_dado: number;
  } | null;
  
  // 🩺 PRESENÇA
  presencaQuarter: {
    presencas: number;
    atestados: number;
    faltasInjustificadas: number;
    bhPlanejado: number;
    bhNaoPlanejado: number;
    sinergiaExterna: number;
    outrasJustificadas: number;
    abandono: number;
    pctAbs: number;
  };
  
  // 🎯 CARREIRA
  analiseCarreira: {
    mesesNaEmpresa: number;
    mesesNaCarreira: number;
    podeProximaCarreira: boolean;
    proximaCarreiraNivel: string | null;
  };
  
  // 📋 IMA / Calibrações
  imaUltimo: string | null;
  calibracaoUltima: string | null;
  
  // 🚧 Tarefas pendentes
  tarefasPendentes: number;
  vagasNoLimite: number;
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export async function coletarContextoCompleto(): Promise<{
  colabs: ContextoColab[];
  metas: Record<string, number>;
  limiteAtingido: boolean;
}> {
  // 1️⃣ Pega config (limite de tarefas, metas)
  const { data: configData } = await supabase
    .from('config')
    .select('chave, valor');
  
  const metas: Record<string, number> = {};
  (configData || []).forEach((c: any) => {
    metas[c.chave] = Number(c.valor) || 0;
  });
  
  const limiteTarefas = metas['limite_tarefas_pendentes'] || 10;
  
  // 2️⃣ Conta tarefas pendentes
  const { count: totalPendentes } = await supabase
    .from('tarefas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Pendente');
  
  const vagasGlobais = Math.max(0, limiteTarefas - (totalPendentes || 0));
  
  if (vagasGlobais === 0) {
    return { colabs: [], metas, limiteAtingido: true };
  }
  
  // 3️⃣ Pega TODOS os colabs ativos
  const { data: colabsData } = await supabase
    .from('colaboradores')
    .select('*')
    .eq('status', 'Ativo');
  
  if (!colabsData) return { colabs: [], metas, limiteAtingido: false };
  
  // 4️⃣ Pega TODOS os dados em paralelo (1 query por tabela, não por colab)
  const idsGroot = colabsData.map(c => c.id_groot);
  
  // Período do mês atual
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  
  // Período do quarter atual
  const trimestreAtual = Math.ceil(mesAtual / 3);
  const inicioQuarter = `${anoAtual}-${String((trimestreAtual - 1) * 3 + 1).padStart(2, '0')}-01`;
  
  const [
    { data: produtividadeMensalData },
    { data: historicoData },
    { data: presencaData },
    { data: imaData },
    { data: calibracoesData },
    { data: tarefasPendentesData },
  ] = await Promise.all([
    // 📊 PRODUTIVIDADE MENSAL - foco do fix!
    supabase
      .from('produtividade_mensal')
      .select('*')
      .in('id_groot', idsGroot)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false }),
    
    // 📅 Histórico diário (fallback)
    supabase
      .from('historico')
      .select('*')
      .in('id_groot', idsGroot)
      .gte('data_referencia', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    
    // 🩺 Presença do quarter
    supabase
      .from('presenca')
      .select('*')
      .in('id_groot', idsGroot)
      .gte('data_referencia', inicioQuarter)
      .neq('status', 'descartado'),
    
    // 📋 IMA
    supabase
      .from('ima_manual')
      .select('*')
      .in('id_groot', idsGroot)
      .order('data_avaliacao', { ascending: false }),
    
    // 📋 Calibrações
    supabase
      .from('calibracoes')
      .select('*')
      .in('id_groot', idsGroot)
      .order('criado_em', { ascending: false }),
    
    // 🚧 Tarefas pendentes (por colab)
    supabase
      .from('tarefas')
      .select('id_groot')
      .eq('status', 'Pendente'),
  ]);
  
  // 5️⃣ Mapeia tudo por id_groot
  const mapaProdMensal: Record<string, any[]> = {};
  (produtividadeMensalData || []).forEach((p: any) => {
    if (!mapaProdMensal[p.id_groot]) mapaProdMensal[p.id_groot] = [];
    mapaProdMensal[p.id_groot].push(p);
  });
  
  const mapaHistorico: Record<string, any[]> = {};
  (historicoData || []).forEach((h: any) => {
    if (!mapaHistorico[h.id_groot]) mapaHistorico[h.id_groot] = [];
    mapaHistorico[h.id_groot].push(h);
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
  
  // 6️⃣ Constrói contexto pra CADA colab
  const colabs: ContextoColab[] = colabsData.map((c: any) => {
    // Produtividade mensal
    const mensaisDoColab = mapaProdMensal[c.id_groot] || [];
    const mensalAtual = mensaisDoColab.find(p => p.mes === mesAtual && p.ano === anoAtual) || null;
    const historicoMensal = mensaisDoColab.slice(0, 3).map(p => ({
      mes: p.mes,
      ano: p.ano,
      prod_liquida: Number(p.prod_liquida_media) || 0,
      dias_trabalhados: Number(p.dias_trabalhados) || 0,
    }));
    
    // Histórico diário (fallback)
    const historicoColab = mapaHistorico[c.id_groot] || [];
    let diarioRecente = null;
    if (historicoColab.length > 0) {
      const liquidas = historicoColab.map(h => Number(h.liquida) || 0).filter(v => v > 0);
      const superas = historicoColab.map(h => Number(h.supera) || 0).filter(v => v > 0);
      
      diarioRecente = {
        liquida_media: liquidas.length > 0 ? liquidas.reduce((a, b) => a + b, 0) / liquidas.length : 0,
        supera_media: superas.length > 0 ? superas.reduce((a, b) => a + b, 0) / superas.length : 0,
        dias_com_dado: historicoColab.length,
      };
    }
    
    // Presença
    const presencas = mapaPresenca[c.id_groot] || [];
    const presencaStats = {
      presencas: 0,
      atestados: 0,
      faltasInjustificadas: 0,
      bhPlanejado: 0,
      bhNaoPlanejado: 0,
      sinergiaExterna: 0,
      outrasJustificadas: 0,
      abandono: 0,
      pctAbs: 0,
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
      else if (p.categoria === 'justificado') presencaStats.outrasJustificadas++;
    });
    
    const totalContab = presencaStats.presencas + presencaStats.faltasInjustificadas + 
                       presencaStats.bhNaoPlanejado + presencaStats.atestados;
    presencaStats.pctAbs = totalContab > 0 
      ? Number((((presencaStats.faltasInjustificadas + presencaStats.bhNaoPlanejado) / totalContab) * 100).toFixed(1))
      : 0;
    
    // Carreira
    const analise = analisarCarreira(c);
    
    // IMA e Calibração mais recentes
    const imas = mapaIma[c.id_groot] || [];
    const calibracoes = mapaCalibracoes[c.id_groot] || [];
    
    return {
      id: c.id,
      id_groot: c.id_groot,
      nome: c.nome,
      processo: c.processo,
      cargo: c.cargo,
      carreira: c.carreira,
      data_admissao: c.data_admissao,
      data_entrada_carreira: c.data_entrada_carreira,
      proxima_carreira: c.proxima_carreira,
      
      mensalAtual: mensalAtual ? {
        prod_liquida: Number(mensalAtual.prod_liquida_media) || 0,
        unidades_total: Number(mensalAtual.unidades_total) || 0,
        dias_trabalhados: Number(mensalAtual.dias_trabalhados) || 0,
        mes: mensalAtual.mes,
        ano: mensalAtual.ano,
      } : null,
      
      historicoMensal,
      diarioRecente,
      presencaQuarter: presencaStats,
      analiseCarreira: analise,
      
      imaUltimo: imas[0]?.classificacao || null,
      calibracaoUltima: calibracoes[0]?.classificacao || null,
      
      tarefasPendentes: mapaTarefasPendentes[c.id_groot] || 0,
      vagasNoLimite: vagasGlobais,
    };
  });
  
  return { colabs, metas, limiteAtingido: false };
}

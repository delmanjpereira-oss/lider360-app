/**
 * ====================================================
 * ANALISADOR DE CARREIRA - COPILOTO VIVO
 * lib/copiloto/analisador-carreira.ts
 * 
 * Calcula:
 * - Tempo na carreira atual
 * - Status (Maturação/Janela Ativa/Prejudicada/Apto Perpétuo)
 * - Quarter check (todos os meses do trimestre batidos?)
 * - Alertas e prioridades
 * ====================================================
 */

// ============================================
// TIPOS
// ============================================

export type StatusCarreira = 
  | 'MATURACAO'
  | 'JANELA_ATIVA' 
  | 'JANELA_PREJUDICADA'
  | 'APTO_PERPETUO'
  | 'TOPO_CARREIRA'
  | 'SEM_DADOS';

export type AnaliseCarreira = {
  cargo: string;
  proximoCargo: string | null;
  dataEntrada: Date;
  mesesNaCarreira: number;
  status: StatusCarreira;
  emoji: string;
  cor: string;
  titulo: string;
  descricao: string;
  podePromover: boolean;
  prioridade: 'critica' | 'alta' | 'media' | 'baixa' | 'normal';
  alerta: string | null;
  mesNaJanela?: number; // 1, 2 ou 3
  mesesAteJanela?: number;
  mesesPerpetuo?: number;
  quarterInfo?: {
    quarter: string;
    mesesBatidos: number;
    mesesTotal: number;
    quebrouNoMes?: string;
    detalhe: string;
  };
};

// ============================================
// CONFIG
// ============================================

const SEQUENCIA_CARREIRA = ['REP 1', 'REP 2', 'MULTIPLICADOR'];
const MESES_POR_NIVEL = 9; // 6 maturação + 3 janela
const MESES_MATURACAO = 6;
const MESES_JANELA = 3;

// ============================================
// HELPERS DE DATA
// ============================================

function diferencaMeses(inicio: Date, fim: Date): number {
  return (
    (fim.getFullYear() - inicio.getFullYear()) * 12 +
    (fim.getMonth() - inicio.getMonth())
  );
}

function getQuarter(data: Date): string {
  const mes = data.getMonth() + 1;
  if (mes <= 3) return 'Q1';
  if (mes <= 6) return 'Q2';
  if (mes <= 9) return 'Q3';
  return 'Q4';
}

function getMesesDoQuarter(quarter: string, ano: number): { mes: number; ano: number; nome: string }[] {
  const inicios: Record<string, number> = { Q1: 1, Q2: 4, Q3: 7, Q4: 10 };
  const inicio = inicios[quarter];
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return [
    { mes: inicio, ano, nome: nomes[inicio - 1] },
    { mes: inicio + 1, ano, nome: nomes[inicio] },
    { mes: inicio + 2, ano, nome: nomes[inicio + 1] },
  ];
}

// ============================================
// CÁLCULO DA DATA DE ENTRADA NA CARREIRA ATUAL
// (Estimada automaticamente se não tiver manual)
// ============================================

export function calcularDataEntradaCarreira(
  dataAdmissao: string | null,
  carreiraAtual: string | null,
  dataEntradaManual: string | null
): Date | null {
  // Prioriza manual se tiver
  if (dataEntradaManual) {
    return new Date(dataEntradaManual);
  }

  if (!dataAdmissao || !carreiraAtual) return null;

  const admissao = new Date(dataAdmissao);
  const niveis = SEQUENCIA_CARREIRA.indexOf(carreiraAtual);
  
  if (niveis < 0) return admissao; // REP 1 ou desconhecido
  
  // Cada promoção = 9 meses
  const mesesEstimados = niveis * MESES_POR_NIVEL;
  const dataEntrada = new Date(admissao);
  dataEntrada.setMonth(dataEntrada.getMonth() + mesesEstimados);
  
  return dataEntrada;
}

// ============================================
// ANALISA QUARTER: bateu metas nos meses?
// historicoDoColab: array de { data_referencia, status_meta }
// ============================================

function analisarQuarter(
  historico: Array<{ data_referencia: string; status_meta: string }>,
  quarter: string,
  ano: number
): { 
  mesesBatidos: number;
  mesesTotal: number;
  quebrouNoMes?: string;
  todosBateram: boolean;
  detalhe: string;
} {
  const mesesQuarter = getMesesDoQuarter(quarter, ano);
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  
  let mesesBatidos = 0;
  let mesesAvaliados = 0;
  let quebrouNoMes: string | undefined;
  const detalhes: string[] = [];
  
  for (const m of mesesQuarter) {
    // Não avalia mês futuro
    if (ano === anoAtual && m.mes > mesAtual) {
      detalhes.push(`${m.nome}: ?`);
      continue;
    }
    
    mesesAvaliados++;
    
    // Pega registros desse mês
    const regsDoMes = historico.filter((h) => {
      const d = new Date(h.data_referencia + 'T12:00:00');
      return d.getMonth() + 1 === m.mes && d.getFullYear() === m.ano;
    });
    
    if (regsDoMes.length === 0) {
      detalhes.push(`${m.nome}: sem dados`);
      continue;
    }
    
    // Considera "batido" se MAIORIA dos dias = Supera ou Alinhado
    const bons = regsDoMes.filter(r => r.status_meta === 'Supera' || r.status_meta === 'Alinhado').length;
    const total = regsDoMes.length;
    const ratio = bons / total;
    
    if (ratio >= 0.7) {
      mesesBatidos++;
      detalhes.push(`${m.nome}: ✅`);
    } else {
      if (!quebrouNoMes) quebrouNoMes = m.nome;
      detalhes.push(`${m.nome}: 🔴`);
    }
  }
  
  return {
    mesesBatidos,
    mesesTotal: mesesAvaliados,
    quebrouNoMes,
    todosBateram: mesesAvaliados > 0 && mesesBatidos === mesesAvaliados,
    detalhe: detalhes.join(' '),
  };
}

// ============================================
// FUNÇÃO PRINCIPAL — ANALISA CARREIRA
// ============================================

export function analisarCarreira(
  cargo: string | null,
  dataAdmissao: string | null,
  dataEntradaManual: string | null,
  historico: Array<{ data_referencia: string; status_meta: string }>
): AnaliseCarreira {
  
  // Sem dados
  if (!cargo || !dataAdmissao) {
    return {
      cargo: cargo || 'Sem cargo',
      proximoCargo: null,
      dataEntrada: new Date(),
      mesesNaCarreira: 0,
      status: 'SEM_DADOS',
      emoji: '❓',
      cor: 'gray',
      titulo: 'Sem dados de carreira',
      descricao: 'Cadastre carreira atual e data de admissão pra ativar análise.',
      podePromover: false,
      prioridade: 'baixa',
      alerta: null,
    };
  }
  
  // Pega próximo cargo
  const idx = SEQUENCIA_CARREIRA.indexOf(cargo);
  const proximoCargo = idx >= 0 && idx < SEQUENCIA_CARREIRA.length - 1 
    ? SEQUENCIA_CARREIRA[idx + 1] 
    : null;
  
  // Topo da carreira
  if (cargo === 'MULTIPLICADOR') {
    const dataEntrada = calcularDataEntradaCarreira(dataAdmissao, cargo, dataEntradaManual);
    return {
      cargo,
      proximoCargo: null,
      dataEntrada: dataEntrada || new Date(),
      mesesNaCarreira: dataEntrada ? diferencaMeses(dataEntrada, new Date()) : 0,
      status: 'TOPO_CARREIRA',
      emoji: '🏆',
      cor: 'gold',
      titulo: 'Topo da carreira',
      descricao: 'Multiplicador — sem próximo nível na trilha.',
      podePromover: false,
      prioridade: 'normal',
      alerta: null,
    };
  }
  
  // Calcula data entrada estimada/manual
  const dataEntrada = calcularDataEntradaCarreira(dataAdmissao, cargo, dataEntradaManual);
  
  if (!dataEntrada) {
    return {
      cargo,
      proximoCargo,
      dataEntrada: new Date(),
      mesesNaCarreira: 0,
      status: 'SEM_DADOS',
      emoji: '❓',
      cor: 'gray',
      titulo: 'Dados incompletos',
      descricao: 'Não consegui calcular o tempo na carreira.',
      podePromover: false,
      prioridade: 'baixa',
      alerta: null,
    };
  }
  
  const hoje = new Date();
  const mesesNaCarreira = diferencaMeses(dataEntrada, hoje);
  
  // FASE 1 — MATURAÇÃO (mês 1-6)
  if (mesesNaCarreira < MESES_MATURACAO) {
    return {
      cargo,
      proximoCargo,
      dataEntrada,
      mesesNaCarreira,
      status: 'MATURACAO',
      emoji: '🟡',
      cor: 'yellow',
      titulo: `Em maturação (${mesesNaCarreira}/${MESES_MATURACAO})`,
      descricao: `Janela promocional abre em ${MESES_MATURACAO - mesesNaCarreira} mes(es).`,
      podePromover: false,
      prioridade: 'normal',
      alerta: null,
      mesesAteJanela: MESES_MATURACAO - mesesNaCarreira,
    };
  }
  
  // FASE 2 — JANELA PROMOCIONAL (mês 7-9)
  if (mesesNaCarreira >= MESES_MATURACAO && mesesNaCarreira < MESES_POR_NIVEL) {
    const mesNaJanela = mesesNaCarreira - MESES_MATURACAO + 1; // 1, 2 ou 3
    const quarter = getQuarter(hoje);
    const quarterInfo = analisarQuarter(historico, quarter, hoje.getFullYear());
    
    // Se ALGUM mês do quarter quebrou → PREJUDICADA
    if (quarterInfo.quebrouNoMes) {
      return {
        cargo,
        proximoCargo,
        dataEntrada,
        mesesNaCarreira,
        status: 'JANELA_PREJUDICADA',
        emoji: '🔴',
        cor: 'red',
        titulo: `Janela prejudicada (mês ${mesNaJanela}/${MESES_JANELA})`,
        descricao: `Quebrou em ${quarterInfo.quebrouNoMes}/${hoje.getFullYear()} no ${quarter}. Próxima chance: ${quarter === 'Q4' ? 'Q1 ano que vem' : `próximo trimestre`}.`,
        podePromover: false,
        prioridade: 'alta',
        alerta: `Conversar com colab - quebrou em ${quarterInfo.quebrouNoMes}`,
        mesNaJanela,
        quarterInfo: { quarter, ...quarterInfo },
      };
    }
    
    // Janela ATIVA - varia urgência por mês
    let prioridade: 'alta' | 'media' | 'critica' = 'media';
    let emoji = '🟢';
    let tituloExtra = '';
    
    if (mesNaJanela === 1) {
      prioridade = 'media';
      emoji = '🟢';
      tituloExtra = 'Recém-aberta';
    } else if (mesNaJanela === 2) {
      prioridade = 'alta';
      emoji = '🟡';
      tituloExtra = 'Atenção';
    } else {
      prioridade = 'critica';
      emoji = '🔥';
      tituloExtra = 'PROMOVER AGORA';
    }
    
    return {
      cargo,
      proximoCargo,
      dataEntrada,
      mesesNaCarreira,
      status: 'JANELA_ATIVA',
      emoji,
      cor: mesNaJanela === 3 ? 'red' : mesNaJanela === 2 ? 'orange' : 'green',
      titulo: `Janela ativa (mês ${mesNaJanela}/${MESES_JANELA}) - ${tituloExtra}`,
      descricao: `Quarter ${quarter}: ${quarterInfo.detalhe}. ${mesNaJanela === 3 ? `🎯 PROMOVER A ${proximoCargo}!` : `Faltam ${MESES_POR_NIVEL - mesesNaCarreira} mês(es).`}`,
      podePromover: true,
      prioridade,
      alerta: mesNaJanela === 3 
        ? `PROMOÇÃO IMINENTE! Promover a ${proximoCargo} este mês.`
        : mesNaJanela === 2
        ? `Promoção em ${MESES_POR_NIVEL - mesesNaCarreira} mês. Acompanhar de perto!`
        : `Janela acabou de abrir. Manter performance.`,
      mesNaJanela,
      quarterInfo: { quarter, ...quarterInfo },
    };
  }
  
  // FASE 3 — APTO PERPÉTUO (mês 10+)
  const mesesEsperando = mesesNaCarreira - MESES_POR_NIVEL;
  const quarter = getQuarter(hoje);
  const quarterInfo = analisarQuarter(historico, quarter, hoje.getFullYear());
  
  let prioridade: 'alta' | 'critica' = 'alta';
  let alerta = `Apto há ${mesesEsperando} mês(es). Avaliar promoção este trimestre.`;
  
  if (mesesEsperando >= 6) {
    prioridade = 'critica';
    alerta = `URGENTE: ${mesesEsperando} meses apto sem promoção. Risco de desengajamento!`;
  }
  
  // Se quarter tá perfeito, prioridade vira critica também
  if (quarterInfo.todosBateram) {
    prioridade = 'critica';
    alerta = `Quarter ${quarter} perfeito + ${mesesEsperando}m apto. ✅ PROMOVER A ${proximoCargo}!`;
  }
  
  return {
    cargo,
    proximoCargo,
    dataEntrada,
    mesesNaCarreira,
    status: 'APTO_PERPETUO',
    emoji: quarterInfo.todosBateram ? '🌟' : '⭐',
    cor: 'gold',
    titulo: `Apto perpétuo (há ${mesesEsperando}m)`,
    descricao: `Quarter ${quarter}: ${quarterInfo.detalhe}. ${quarterInfo.todosBateram ? `🎯 PROMOVER A ${proximoCargo}!` : 'Acompanhar quarter.'}`,
    podePromover: true,
    prioridade,
    alerta,
    mesesPerpetuo: mesesEsperando,
    quarterInfo: { quarter, ...quarterInfo },
  };
}

// ============================================
// AUXILIAR: detecta streak negativo
// ============================================

export function calcularStreakNegativo(
  historico: Array<{ data_referencia: string; status_meta: string }>
): number {
  if (!historico || historico.length === 0) return 0;
  
  const ordenado = [...historico].sort(
    (a, b) => new Date(b.data_referencia).getTime() - new Date(a.data_referencia).getTime()
  );
  
  let streak = 0;
  for (const dia of ordenado) {
    if (dia.status_meta === 'Abaixo') streak++;
    else break;
  }
  return streak;
}

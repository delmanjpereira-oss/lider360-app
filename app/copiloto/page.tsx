'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import FinalizarTarefaModal from './FinalizarTarefaModal';
// ============================================
// TIPOS
// ============================================
type TarefaCopiloto = {
  id: number;
  id_tarefa: string;
  id_groot: string;
  nome: string;
  processo: string | null;
  tipo: string;
  motivo: string | null;
  status: string;
  prioridade: string;
  diagnostico: string | null;
  analise_ia: string | null;
  hipotese: string | null;
  gatilho_origem: string;
  feedback_obrigatorio: boolean;
  feedback_texto: string | null;
  contexto_dados: any;
  gerado_por_ia: boolean;
  criado_em: string;
};
type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
  status: string;
};
type HistoricoSimples = {
  id_groot: string;
  data_referencia: string;
  prod_liquida: number;
  status_meta: string;
  impacto_net: number;
};
type ProdutividadeMensalLinha = {
  id_groot: string;
  mes: number;
  ano: number;
  processo: string;
  prod_liquida_media: number;
  unidades_total: number;
  dias_trabalhados: number;
};
// 🆕 OCUPAÇÃO (ocupacao_p2m) — só P2M tem
type OcupacaoLinha = {
  id_groot: string;
  data_referencia: string;
  ocupacao_pct: number;
};
// 🆕 IMA / QUALIDADE (ima_manual) — mensal, menor é melhor
type ImaLinha = {
  id_groot: string;
  processo: string;
  mes: number;
  ano: number;
  ima: number;
};
type MetasConfig = {
  checkinBase: number;
  checkinAlinhadoMax: number;
  p2mBase: number;
  p2mAlinhadoMax: number;
  // 🆕 metas de ocupação e IMA
  ocupacaoP2M: number;
  ocupacaoCheckin: number;
  imaP2M: number;
  imaCheckin: number;
};
type MonitorItem = {
  idGroot: string;
  id: number;
  nome: string;
  processo: string;
  ultimoStatus: string;
  ultimaLiquida: number;
  ultimoImpacto: number;
  diasAbaixo: number;
  fonte: 'diario' | 'mensal';
  diasMes?: number;
  tendencia?: 'subindo' | 'caindo' | 'estavel' | 'sem_base';
  variacaoPct?: number;
  mediaAnterior?: number;
};
// 🆕 item dos painéis de ocupação e IMA (dentro/fora)
type IndicadorItem = {
  idGroot: string;
  id: number;
  nome: string;
  processo: string;
  valor: number;   // ocupação (%) ou IMA
  meta: number;
  dentro: boolean;
  dias?: number;   // qtd de registros considerados (ocupação)
  mesRef?: string; // mês/ano de referência (IMA)
};
type ChatMensagem = {
  papel: 'user' | 'assistant';
  conteudo: string;
  criado_em?: string;
};
type Aba = 'tarefas' | 'chat' | 'aprendizado' | 'time';
// ============================================
// HELPERS
// ============================================
function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}
const CORES_PRIORIDADE: Record<string, { bg: string; border: string; text: string; bgIntenso: string }> = {
  critica: { bg: 'from-red-500/10 to-rose-500/5', border: 'border-red-500/40', text: 'text-red-300', bgIntenso: 'bg-red-500/20' },
  alta: { bg: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/40', text: 'text-orange-300', bgIntenso: 'bg-orange-500/20' },
  media: { bg: 'from-yellow-500/10 to-amber-500/5', border: 'border-yellow-500/40', text: 'text-yellow-300', bgIntenso: 'bg-yellow-500/20' },
  baixa: { bg: 'from-blue-500/10 to-cyan-500/5', border: 'border-blue-500/40', text: 'text-blue-300', bgIntenso: 'bg-blue-500/20' },
  normal: { bg: 'from-gray-500/10 to-slate-500/5', border: 'border-gray-500/40', text: 'text-gray-300', bgIntenso: 'bg-gray-500/20' },
};
const EMOJI_TIPO: Record<string, string> = {
  'Janela Promocional': '🔥',
  'Janela Prejudicada': '🔴',
  'Apto Perpétuo': '⭐',
  'Feedback Ofensor': '🚨',
  'Reconhecimento Supera': '🌟',
  'Aniversário': '🎂',
  'Reconhecimento Estratégico': '🏆',
  'Acompanhamento de Evolução': '📈',
  'Antecipação de Queda': '⚠️',
  'Coaching Preventivo': '💬',
  'Cuidado de Bem-Estar': '💚',
  'Oportunidade de Carreira': '🎯',
  'Quebra de Padrão': '🔍',
  'Reconhecimento Invisível': '💎',
  'Alerta de Ocupação': '📊',
  'Alerta de Qualidade (IMA)': '🎯',
};
const SUGESTOES_CHAT = [
  '🚨 Quem precisa de atenção urgente hoje?',
  '🌟 Quem merece reconhecimento essa semana?',
  '🎓 Quem tá pronto pra promoção?',
  '📉 Por que tem tanta gente caindo?',
  '💎 Quem é o consistente silencioso do time?',
  '🔥 Estratégia pra fechar o mês bem?',
];
// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export default function CopilotoPage() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('tarefas');
  
  // Estados
  const [tarefas, setTarefas] = useState<TarefaCopiloto[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoSimples[]>([]);
  const [produtividadeMensal, setProdutividadeMensal] = useState<ProdutividadeMensalLinha[]>([]);
  // 🆕 dados de ocupação e IMA
  const [ocupacaoData, setOcupacaoData] = useState<OcupacaoLinha[]>([]);
  const [imaData, setImaData] = useState<ImaLinha[]>([]);
  const [metasConfig, setMetasConfig] = useState<MetasConfig>({
    checkinBase: 296,
    checkinAlinhadoMax: 308,
    p2mBase: 329,
    p2mAlinhadoMax: 350,
    ocupacaoP2M: 80,
    ocupacaoCheckin: 75,
    imaP2M: 1567,
    imaCheckin: 1567,
  });
  const [loading, setLoading] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [ultimaAnalise, setUltimaAnalise] = useState<Date | null>(null);
  const [resumoAnalise, setResumoAnalise] = useState<any>(null);
  const [filtroPrioridade, setFiltroPrioridade] = useState<'todas' | 'critica' | 'alta'>('todas');
  
  const [tarefaAberta, setTarefaAberta] = useState<TarefaCopiloto | null>(null);
  const [tarefaParaFinalizar, setTarefaParaFinalizar] = useState<TarefaCopiloto | null>(null);
  
  // 🗑️ Modal de confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState<TarefaCopiloto | null>(null);
  const [deletando, setDeletando] = useState(false);
  
  // Chat
  const [chatMensagens, setChatMensagens] = useState<ChatMensagem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatEnviando, setChatEnviando] = useState(false);
  const [conversaAtual, setConversaAtual] = useState<string>('');
  
  // Aprendizado
  const [tarefasFinalizadas, setTarefasFinalizadas] = useState<any[]>([]);
  
  const jaRodouRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState({});
  
  // ============================================
  // CARREGAR DADOS (agora com config!)
  // ============================================
  
  const carregarDados = useCallback(async () => {
    try {
      const [tarsResp, colabsResp, histResp, mensalResp, finalizadas, configResp, ocupResp, imaResp] = await Promise.all([
        supabase.from('tarefas').select('*').eq('status', 'Pendente').order('criado_em', { ascending: false }),
        supabase.from('colaboradores').select('id, id_groot, nome, processo, status').eq('status', 'Ativo'),
        supabase.from('historico').select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net').order('data_referencia', { ascending: false }),
        supabase.from('produtividade_mensal').select('id_groot, mes, ano, processo, prod_liquida_media, unidades_total, dias_trabalhados').order('ano', { ascending: false }).order('mes', { ascending: false }),
        supabase.from('tarefas').select('*').eq('status', 'Finalizada').not('classificacao_aprendizado', 'is', null).order('finalizada_em', { ascending: false }).limit(30),
        supabase.from('config').select('chave, valor'),
        // 🆕 ocupação (últimos 30 dias) e IMA (mais recentes)
        supabase.from('ocupacao_p2m').select('id_groot, data_referencia, ocupacao_pct').gte('data_referencia', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('data_referencia', { ascending: false }),
        supabase.from('ima_manual').select('id_groot, processo, mes, ano, ima').order('ano', { ascending: false }).order('mes', { ascending: false }),
      ]);
      
      if (tarsResp.data) setTarefas(tarsResp.data as any);
      if (colabsResp.data) setColaboradores(colabsResp.data as any);
      if (histResp.data) setHistorico(histResp.data as any);
      if (mensalResp.data) setProdutividadeMensal(mensalResp.data as any);
      if (finalizadas.data) setTarefasFinalizadas(finalizadas.data as any);
      if (ocupResp.data) setOcupacaoData(ocupResp.data as any);
      if (imaResp.data) setImaData(imaResp.data as any);
      
      // 🆕 Lê metas REAIS do config
      if (configResp.data) {
        const map: Record<string, number> = {};
        configResp.data.forEach((c: any) => {
          map[c.chave] = Number(c.valor) || 0;
        });
        setMetasConfig({
          checkinBase: map.meta_checkin_base || 296,
          checkinAlinhadoMax: map.meta_checkin_alinhado_max || 308,
          p2mBase: map.meta_p2m_base || 329,
          p2mAlinhadoMax: map.meta_p2m_alinhado_max || 350,
          ocupacaoP2M: map.meta_ocupacao_p2m || 80,
          ocupacaoCheckin: map.meta_ocupacao_checkin || 75,
          imaP2M: map.meta_ima_p2m || 1567,
          imaCheckin: map.meta_ima_checkin || 1567,
        });
        console.log('📊 Metas carregadas:', {
          P2M: `${map.meta_p2m_base}-${map.meta_p2m_alinhado_max}`,
          Checkin: `${map.meta_checkin_base}-${map.meta_checkin_alinhado_max}`,
        });
      }
    } catch (e) {
      console.error('Erro carregando:', e);
    }
  }, []);
  
  const rodarAnalise = useCallback(async () => {
    if (analisando) return;
    setAnalisando(true);
    try {
      const resp = await fetch('/api/ia/copiloto', { method: 'POST' });
      const data = await resp.json();
      if (data.sucesso) {
        setResumoAnalise(data);
        setUltimaAnalise(new Date());
        await carregarDados();
      }
    } catch (e) {
      console.error('Erro IA:', e);
    } finally {
      setAnalisando(false);
    }
  }, [analisando, carregarDados]);
  
  useEffect(() => {
    (async () => {
      setLoading(true);
      await carregarDados();
      setLoading(false);
      
      if (!jaRodouRef.current) {
        jaRodouRef.current = true;
        await rodarAnalise();
      }
    })();
  }, [carregarDados, rodarAnalise]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      carregarDados();
      forceUpdate({});
    }, 30000);
    return () => clearInterval(interval);
  }, [carregarDados]);
  
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMensagens]);
  // 🗑️ ESC fecha modal de confirmação
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setConfirmDelete(null);
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
  
  // ============================================
  // 🗑️ DELETAR TAREFA
  // ============================================
  async function deletarTarefa(t: TarefaCopiloto) {
    setDeletando(true);
    try {
      const { error } = await supabase
        .from('tarefas')
        .delete()
        .eq('id', t.id);
      
      if (error) {
        console.error('Erro ao deletar tarefa:', error);
        if (typeof window !== 'undefined' && (window as any).showToast) {
          (window as any).showToast('error', '❌ Erro ao excluir: ' + error.message);
        }
        return;
      }
      
      // Remove do estado local (otimista)
      setTarefas(prev => prev.filter(x => x.id !== t.id));
      
      // Fecha modais
      setConfirmDelete(null);
      if (tarefaAberta?.id === t.id) {
        setTarefaAberta(null);
      }
      
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🗑️ Tarefa "${t.nome}" excluída`);
      }
      
      // Recarrega pra garantir sincronia
      await carregarDados();
    } catch (e: any) {
      console.error('Erro:', e);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('error', '❌ Erro: ' + e.message);
      }
    } finally {
      setDeletando(false);
    }
  }
  
  // ============================================
  // 🎯 LÓGICA CORRIGIDA - usa metas reais
  // ============================================
  
  function calcularStreak(idGroot: string): number {
    const dias = historico
      .filter((h) => h.id_groot === idGroot)
      .sort((a, b) => new Date(b.data_referencia).getTime() - new Date(a.data_referencia).getTime());
    let streak = 0;
    for (const dia of dias) {
      if (dia.status_meta === 'Abaixo') streak++;
      else break;
    }
    return streak;
  }
  
  // 🆕 FUNÇÃO CORRIGIDA - usa as 2 metas (base e max)
  function determinarStatusPorMeta(liquida: number, processo: string): string {
    if (liquida === 0) return 'Sem dados';
    
    let base = 0;
    let alinhadoMax = 0;
    
    if (processo === 'P2M') {
      base = metasConfig.p2mBase;
      alinhadoMax = metasConfig.p2mAlinhadoMax;
    } else if (processo === 'Checkin') {
      base = metasConfig.checkinBase;
      alinhadoMax = metasConfig.checkinAlinhadoMax;
    } else {
      // Sorting ou outros
      return 'Alinhado';
    }
    
    if (liquida < base) return 'Abaixo';
    if (liquida >= base && liquida <= alinhadoMax) return 'Alinhado';
    return 'Supera'; // > alinhadoMax
  }
  
  // ============================================
  // 🎯 MONITOR — JANELA MÓVEL (não segue o mês do calendário)
  // O painel é um placar de EVOLUÇÃO contínua, não um relatório mensal.
  // - Classificação: média dos ÚLTIMOS 30 DIAS corridos (rolando, nunca zera no dia 1º)
  // - Tendência: últimos 15 dias vs os 15 anteriores (pra onde a pessoa está indo)
  // Nenhuma tabela nova — tudo recalculado do histórico diário que já existe.
  // ============================================
  const JANELA_DIAS = 30;
  const META_TENDENCIA_DIAS = 15;
  const hojeMs = Date.now();
  const umDiaMs = 24 * 60 * 60 * 1000;
  // Índice: histórico por colaborador, com a data já em ms (uma vez só)
  const histPorColab: Record<string, { ms: number; liquida: number }[]> = {};
  historico.forEach((h) => {
    if (!h.prod_liquida || h.prod_liquida <= 0) return;
    const ms = new Date(h.data_referencia + 'T12:00:00').getTime();
    if (isNaN(ms)) return;
    if (!histPorColab[h.id_groot]) histPorColab[h.id_groot] = [];
    histPorColab[h.id_groot].push({ ms, liquida: h.prod_liquida });
  });
  function mediaEntre(registros: { ms: number; liquida: number }[], deMs: number, ateMs: number): { media: number; dias: number } {
    const dentro = registros.filter((r) => r.ms >= deMs && r.ms < ateMs);
    if (dentro.length === 0) return { media: 0, dias: 0 };
    const soma = dentro.reduce((s, r) => s + r.liquida, 0);
    return { media: Math.round(soma / dentro.length), dias: dentro.length };
  }
  // Calcula, por colaborador: média da janela (30d) + tendência (15 vs 15)
  const janelaPorId: Record<string, {
    media: number;
    dias: number;
    tendencia: 'subindo' | 'caindo' | 'estavel' | 'sem_base';
    variacaoPct: number;
    mediaAnterior: number;
  }> = {};
  Object.entries(histPorColab).forEach(([idGroot, registros]) => {
    // Janela principal: últimos 30 dias
    const inicioJanela = hojeMs - JANELA_DIAS * umDiaMs;
    const janela = mediaEntre(registros, inicioJanela, hojeMs + umDiaMs);
    if (janela.dias === 0) return; // sem dado recente, não entra no painel
    // Tendência: últimos 15d vs os 15d anteriores
    const inicioRecente = hojeMs - META_TENDENCIA_DIAS * umDiaMs;
    const recente = mediaEntre(registros, inicioRecente, hojeMs + umDiaMs);
    const inicioAnterior = hojeMs - 2 * META_TENDENCIA_DIAS * umDiaMs;
    const anterior = mediaEntre(registros, inicioAnterior, inicioRecente);
    let tendencia: 'subindo' | 'caindo' | 'estavel' | 'sem_base' = 'sem_base';
    let variacaoPct = 0;
    if (recente.dias >= 2 && anterior.dias >= 2 && anterior.media > 0) {
      variacaoPct = Number((((recente.media - anterior.media) / anterior.media) * 100).toFixed(1));
      if (variacaoPct > 3) tendencia = 'subindo';
      else if (variacaoPct < -3) tendencia = 'caindo';
      else tendencia = 'estavel';
    }
    janelaPorId[idGroot] = {
      media: janela.media,
      dias: janela.dias,
      tendencia,
      variacaoPct,
      mediaAnterior: anterior.media,
    };
  });
  const ultimoStatusPorId: Record<string, HistoricoSimples> = {};
  historico.forEach((h) => {
    if (!ultimoStatusPorId[h.id_groot]) ultimoStatusPorId[h.id_groot] = h;
  });
  const monitor = { ofensores: [] as MonitorItem[], alinhados: [] as MonitorItem[], superas: [] as MonitorItem[] };
  colaboradores.forEach((c) => {
    const janela = janelaPorId[c.id_groot];
    const ultimoDiario = ultimoStatusPorId[c.id_groot];
    if (janela) {
      const liquida = janela.media;
      const status = determinarStatusPorMeta(liquida, c.processo || '');
      const item: MonitorItem = {
        idGroot: c.id_groot,
        id: c.id,
        nome: c.nome,
        processo: c.processo || '-',
        ultimoStatus: status,
        ultimaLiquida: liquida,
        ultimoImpacto: 0,
        diasAbaixo: calcularStreak(c.id_groot),
        fonte: 'mensal', // janela móvel (mantém o campo por compatibilidade)
        diasMes: janela.dias,
        tendencia: janela.tendencia,
        variacaoPct: janela.variacaoPct,
        mediaAnterior: janela.mediaAnterior,
      };
      if (status === 'Abaixo') monitor.ofensores.push(item);
      else if (status === 'Alinhado') monitor.alinhados.push(item);
      else if (status === 'Supera') monitor.superas.push(item);
    } else if (ultimoDiario) {
      // fallback: sem dado na janela de 30d, usa o último registro disponível
      const liquida = Number(ultimoDiario.prod_liquida) || 0;
      const status = determinarStatusPorMeta(liquida, c.processo || '');
      const item: MonitorItem = {
        idGroot: c.id_groot,
        id: c.id,
        nome: c.nome,
        processo: c.processo || '-',
        ultimoStatus: status,
        ultimaLiquida: liquida,
        ultimoImpacto: ultimoDiario.impacto_net,
        diasAbaixo: calcularStreak(c.id_groot),
        fonte: 'diario',
        tendencia: 'sem_base',
      };
      if (status === 'Abaixo') monitor.ofensores.push(item);
      else if (status === 'Alinhado') monitor.alinhados.push(item);
      else if (status === 'Supera') monitor.superas.push(item);
    }
  });
  // Ofensores: prioriza quem está CAINDO (urgente) e com mais dias abaixo
  const pesoTendencia = (t?: string) => (t === 'caindo' ? 0 : t === 'estavel' ? 1 : t === 'subindo' ? 2 : 1);
  monitor.ofensores.sort((a, b) => {
    const pa = pesoTendencia(a.tendencia);
    const pb = pesoTendencia(b.tendencia);
    if (pa !== pb) return pa - pb; // caindo primeiro
    return b.diasAbaixo - a.diasAbaixo;
  });
  monitor.alinhados.sort((a, b) => (b.variacaoPct || 0) - (a.variacaoPct || 0));
  monitor.superas.sort((a, b) => (b.variacaoPct || 0) - (a.variacaoPct || 0));

  // ============================================
  // 🆕 MONITOR DE OCUPAÇÃO (dentro/fora) — só P2M tem ocupação
  // Média dos últimos 30 dias por colaborador. Dentro = média >= meta.
  // ============================================
  const ocupPorColab: Record<string, number[]> = {};
  ocupacaoData.forEach((o) => {
    const v = Number(o.ocupacao_pct) || 0;
    if (v <= 0) return;
    if (!ocupPorColab[o.id_groot]) ocupPorColab[o.id_groot] = [];
    ocupPorColab[o.id_groot].push(v);
  });
  const monitorOcupacao = { dentro: [] as IndicadorItem[], fora: [] as IndicadorItem[] };
  colaboradores.forEach((c) => {
    const valores = ocupPorColab[c.id_groot];
    if (!valores || valores.length === 0) return; // sem ocupação (ex: Checkin) → não entra
    const media = Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
    const meta = c.processo === 'P2M' ? metasConfig.ocupacaoP2M : metasConfig.ocupacaoCheckin;
    const dentro = media >= meta;
    const item: IndicadorItem = {
      idGroot: c.id_groot,
      id: c.id,
      nome: c.nome,
      processo: c.processo || '-',
      valor: media,
      meta,
      dentro,
      dias: valores.length,
    };
    if (dentro) monitorOcupacao.dentro.push(item);
    else monitorOcupacao.fora.push(item);
  });
  // fora primeiro os mais distantes da meta; dentro os melhores primeiro
  monitorOcupacao.fora.sort((a, b) => (a.meta - a.valor) - (b.meta - b.valor)).reverse();
  monitorOcupacao.dentro.sort((a, b) => b.valor - a.valor);

  // ============================================
  // 🆕 MONITOR DE IMA / QUALIDADE (dentro/fora) — MENOR é melhor
  // Usa o registro mais recente de cada colab. Dentro = IMA <= meta.
  // ============================================
  const imaMaisRecentePorColab: Record<string, ImaLinha> = {};
  imaData.forEach((i) => {
    // imaData vem ordenado ano desc, mes desc → o primeiro de cada colab é o mais recente
    if (!imaMaisRecentePorColab[i.id_groot]) imaMaisRecentePorColab[i.id_groot] = i;
  });
  const monitorIma = { dentro: [] as IndicadorItem[], fora: [] as IndicadorItem[] };
  colaboradores.forEach((c) => {
    const reg = imaMaisRecentePorColab[c.id_groot];
    if (!reg) return; // sem IMA → não entra
    const valor = Number(reg.ima) || 0;
    if (valor <= 0) return;
    const meta = c.processo === 'P2M' ? metasConfig.imaP2M : metasConfig.imaCheckin;
    const dentro = valor <= meta; // menor é melhor
    const item: IndicadorItem = {
      idGroot: c.id_groot,
      id: c.id,
      nome: c.nome,
      processo: c.processo || '-',
      valor,
      meta,
      dentro,
      mesRef: `${String(reg.mes).padStart(2, '0')}/${reg.ano}`,
    };
    if (dentro) monitorIma.dentro.push(item);
    else monitorIma.fora.push(item);
  });
  // fora primeiro os que mais estouram a meta; dentro os melhores (menores) primeiro
  monitorIma.fora.sort((a, b) => (b.valor - b.meta) - (a.valor - a.meta));
  monitorIma.dentro.sort((a, b) => a.valor - b.valor);
  // ============================================
  // 🫀 PLACAR DE EVOLUÇÃO DO TIME (o "coração")
  // Compara ofensores de AGORA (janela atual) vs ~30 dias atrás.
  // Precisa de histórico de ~60 dias; se não tiver, mostra "aguardando".
  // ============================================
  const placarEvolucao = (() => {
    // classificação de 30 dias atrás: janela [hoje-60d, hoje-30d]
    const fimAntigo = hojeMs - JANELA_DIAS * umDiaMs;
    const inicioAntigo = hojeMs - 2 * JANELA_DIAS * umDiaMs;
    let ofensoresAntes = 0;
    let temBaseAntiga = false;
    colaboradores.forEach((c) => {
      const registros = histPorColab[c.id_groot];
      if (!registros) return;
      const janelaAntiga = mediaEntre(registros, inicioAntigo, fimAntigo);
      if (janelaAntiga.dias >= 3) {
        temBaseAntiga = true;
        const status = determinarStatusPorMeta(janelaAntiga.media, c.processo || '');
        if (status === 'Abaixo') ofensoresAntes++;
      }
    });
    const ofensoresAgora = monitor.ofensores.length;
    return {
      temBase: temBaseAntiga,
      antes: ofensoresAntes,
      agora: ofensoresAgora,
      delta: ofensoresAgora - ofensoresAntes, // negativo = melhorou (menos ofensores)
    };
  })();
  
  const ordemPrio: Record<string, number> = { critica: 1, alta: 2, media: 3, baixa: 4, normal: 5 };
  const tarefasOrdenadas = [...tarefas].sort((a, b) => {
    const ap = ordemPrio[a.prioridade] || 9;
    const bp = ordemPrio[b.prioridade] || 9;
    if (ap !== bp) return ap - bp;
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
  });
  const tarefasFiltradas = filtroPrioridade === 'todas' ? tarefasOrdenadas : tarefasOrdenadas.filter(t => t.prioridade === filtroPrioridade);
  const statsPrio = {
    critica: tarefas.filter(t => t.prioridade === 'critica').length,
    alta: tarefas.filter(t => t.prioridade === 'alta').length,
  };
  
  // ============================================
  // CHAT
  // ============================================
  
  async function enviarMensagem(textoMsg?: string) {
    const mensagem = (textoMsg || chatInput).trim();
    if (!mensagem || chatEnviando) return;
    
    setChatInput('');
    setChatEnviando(true);
    setChatMensagens(prev => [...prev, { papel: 'user', conteudo: mensagem }]);
    
    try {
      const resp = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem, id_conversa: conversaAtual || undefined }),
      });
      
      const data = await resp.json();
      
      if (data.sucesso) {
        if (!conversaAtual) setConversaAtual(data.id_conversa);
        setChatMensagens(prev => [...prev, { papel: 'assistant', conteudo: data.resposta }]);
      } else {
        setChatMensagens(prev => [...prev, { papel: 'assistant', conteudo: `❌ Erro: ${data.erro || 'Falha'}` }]);
      }
    } catch (e: any) {
      setChatMensagens(prev => [...prev, { papel: 'assistant', conteudo: `❌ Erro: ${e.message}` }]);
    } finally {
      setChatEnviando(false);
    }
  }
  
  function novaConversa() {
    setChatMensagens([]);
    setConversaAtual('');
    setChatInput('');
  }
  
  // ============================================
  // APRENDIZADO
  // ============================================
  
  const aprendizadoStats = (() => {
    if (tarefasFinalizadas.length === 0) return null;
    const sucessos = tarefasFinalizadas.filter(t => 
      t.classificacao_aprendizado === 'sucesso_confirmado' || t.classificacao_aprendizado === 'abordagem_funcionou'
    ).length;
    const falhas = tarefasFinalizadas.filter(t => 
      t.classificacao_aprendizado === 'falha_confirmada' || t.classificacao_aprendizado === 'abordagem_falhou'
    ).length;
    const neutros = tarefasFinalizadas.filter(t => t.classificacao_aprendizado === 'efeito_neutro').length;
    const taxaSucesso = (sucessos + falhas) > 0 ? Math.round((sucessos / (sucessos + falhas)) * 100) : 0;
    
    const porTipo: Record<string, { sucesso: number; falha: number }> = {};
    tarefasFinalizadas.forEach(t => {
      if (!t.tipo) return;
      if (!porTipo[t.tipo]) porTipo[t.tipo] = { sucesso: 0, falha: 0 };
      if (t.classificacao_aprendizado === 'sucesso_confirmado' || t.classificacao_aprendizado === 'abordagem_funcionou') {
        porTipo[t.tipo].sucesso++;
      } else if (t.classificacao_aprendizado === 'falha_confirmada' || t.classificacao_aprendizado === 'abordagem_falhou') {
        porTipo[t.tipo].falha++;
      }
    });
    
    const tiposRanking = Object.entries(porTipo).map(([tipo, vals]) => ({
      tipo, sucesso: vals.sucesso, falha: vals.falha, total: vals.sucesso + vals.falha,
      taxa: (vals.sucesso + vals.falha) > 0 ? Math.round((vals.sucesso / (vals.sucesso + vals.falha)) * 100) : 0,
    })).sort((a, b) => b.taxa - a.taxa);
    
    return { total: tarefasFinalizadas.length, sucessos, falhas, neutros, taxaSucesso, tiposRanking };
  })();
  
  const timeHealth = colaboradores.length > 0 ? {
    totalColabs: colaboradores.length,
    ofensores: monitor.ofensores.length,
    alinhados: monitor.alinhados.length,
    superas: monitor.superas.length,
  } : null;
  
  function abrirTarefa(t: TarefaCopiloto) { setTarefaAberta(t); }
  function fecharTarefa() { setTarefaAberta(null); }
  // 🆕 Badge visual de tendência (seta + variação) pra usar nos cards
  function badgeTendencia(item: MonitorItem) {
    const t = item.tendencia;
    if (!t || t === 'sem_base') return null;
    if (t === 'subindo') {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-green-500/20 text-green-300 flex items-center gap-0.5" title={`Subindo: ${item.mediaAnterior} → ${item.ultimaLiquida} pç/h`}>
          ↗ +{Math.abs(item.variacaoPct || 0)}%
        </span>
      );
    }
    if (t === 'caindo') {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-500/20 text-red-300 flex items-center gap-0.5" title={`Caindo: ${item.mediaAnterior} → ${item.ultimaLiquida} pç/h`}>
          ↘ {item.variacaoPct}%
        </span>
      );
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-500/20 text-gray-400" title="Estável">
        → estável
      </span>
    );
  }
  function abrirFinalizacao(t: TarefaCopiloto) {
    setTarefaAberta(null);
    setTarefaParaFinalizar(t);
  }
  async function onFinalizacaoCompleta() {
    setTarefaParaFinalizar(null);
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast('success', '🧠 Tarefa finalizada! A IA aprendeu.');
    }
    await carregarDados();
  }
  
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            🤖 Copiloto <span className="text-[#FFD700]">IA</span>
          </h1>
          <div className="flex items-center gap-2 text-sm">
            {analisando ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                <span className="text-yellow-400">🧠 IA analisando...</span>
              </>
            ) : ultimaAnalise ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-green-400">Análise viva</span>
                <span className="text-gray-500">· {tempoRelativo(ultimaAnalise.toISOString())}</span>
                {resumoAnalise?.aprendizado_usado && (
                  <span className="text-purple-400 text-xs">· 🧠 com aprendizado</span>
                )}
              </>
            ) : loading ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-gray-400 animate-pulse"></span>
                <span className="text-gray-400">Conectando...</span>
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="text-blue-400">Pronto</span>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* ABAS */}
      <div className="border-b border-[#2a2a2a]">
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'tarefas' as Aba, label: '🎯 Tarefas', count: tarefas.length },
            { key: 'chat' as Aba, label: '💬 Chat', count: 0 },
            { key: 'aprendizado' as Aba, label: '📊 Aprendizado', count: aprendizadoStats?.total },
            { key: 'time' as Aba, label: '👥 Time', count: 0 },
          ].map((tab) => {
            const ativo = abaAtiva === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setAbaAtiva(tab.key)}
                className={`px-4 py-3 font-bold text-sm transition-all border-b-2 ${
                  ativo ? 'border-[#FFD700] text-[#FFD700]' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    ativo ? 'bg-[#FFD700]/20 text-[#FFD700]' : 'bg-[#2a2a2a] text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* ============================================ */}
      {/* ABA: TAREFAS */}
      {/* ============================================ */}
      {abaAtiva === 'tarefas' && (
        <div className="space-y-6">
          {!loading && colaboradores.length > 0 && (
            <div>
              {/* 🫀 PLACAR DE EVOLUÇÃO — o coração do painel (menos ofensor com o tempo) */}
              <div className="bg-gradient-to-br from-[#151b2e] to-[#0f1420] border-2 border-[#FFD700]/25 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🫀</span>
                    <div>
                      <p className="text-sm font-black text-white">Evolução do time</p>
                      <p className="text-xs text-gray-400">Placar contínuo dos últimos 30 dias — o objetivo é menos ofensor com o tempo</p>
                    </div>
                  </div>
                  {placarEvolucao.temBase ? (
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold">30d atrás</p>
                        <p className="text-2xl font-black text-gray-400">{placarEvolucao.antes}</p>
                        <p className="text-[10px] text-gray-500">ofensores</p>
                      </div>
                      <span className="text-2xl text-gray-600">→</span>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase font-bold">Agora</p>
                        <p className={`text-2xl font-black ${placarEvolucao.agora <= placarEvolucao.antes ? 'text-green-400' : 'text-red-400'}`}>
                          {placarEvolucao.agora}
                        </p>
                        <p className="text-[10px] text-gray-500">ofensores</p>
                      </div>
                      <div className={`px-3 py-2 rounded-xl font-black text-sm ${
                        placarEvolucao.delta < 0 ? 'bg-green-500/20 text-green-300' :
                        placarEvolucao.delta > 0 ? 'bg-red-500/20 text-red-300' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {placarEvolucao.delta < 0
                          ? `↘ ${Math.abs(placarEvolucao.delta)} a menos 🎉`
                          : placarEvolucao.delta > 0
                          ? `↗ ${placarEvolucao.delta} a mais`
                          : '→ estável'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 max-w-xs">
                      ⏳ Aguardando histórico — o placar de evolução aparece quando houver ~60 dias de dados acumulados pra comparar.
                    </div>
                  )}
                </div>
              </div>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                📊 Monitoramento Operacional
                <span className="text-xs text-gray-500 font-normal">
                  · janela móvel 30d · P2M {metasConfig.p2mBase}-{metasConfig.p2mAlinhadoMax} · Checkin {metasConfig.checkinBase}-{metasConfig.checkinAlinhadoMax}
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* OFENSORES */}
                <div className="bg-red-500/5 border border-red-500/30 rounded-2xl overflow-hidden">
                  <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30 flex items-center justify-between">
                    <h3 className="font-black text-red-300">🚨 Ofensores</h3>
                    <span className="text-2xl font-black text-red-300">{monitor.ofensores.length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {monitor.ofensores.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-6">Nenhum ofensor 🎉</p>
                    ) : (
                      monitor.ofensores.map((o) => (
                        <Link key={o.idGroot} href={`/meu-time/${o.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg p-3 transition-all">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-red-300 font-bold text-xs">{iniciais(o.nome)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                              <p className="text-xs text-gray-500">
                                {o.processo} • {o.ultimaLiquida} pç/h
                                {o.fonte === 'mensal' && o.diasMes && <span className="ml-1 text-gray-600">· {o.diasMes}d</span>}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {badgeTendencia(o)}
                              {o.diasAbaixo >= 3 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-red-500/30 text-red-300 rounded-full font-bold">{o.diasAbaixo}d abaixo</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
                
                {/* ALINHADOS */}
                <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl overflow-hidden">
                  <div className="bg-blue-500/20 px-4 py-3 border-b border-blue-500/30 flex items-center justify-between">
                    <h3 className="font-black text-blue-300">✓ Alinhados</h3>
                    <span className="text-2xl font-black text-blue-300">{monitor.alinhados.length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {monitor.alinhados.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-6">Sem dados ainda</p>
                    ) : (
                      monitor.alinhados.map((a) => (
                        <Link key={a.idGroot} href={`/meu-time/${a.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-blue-500/30 rounded-lg p-3 transition-all">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">{iniciais(a.nome)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{a.nome}</p>
                              <p className="text-xs text-gray-500">
                                {a.processo} • {a.ultimaLiquida} pç/h
                                {a.fonte === 'mensal' && a.diasMes && <span className="ml-1 text-gray-600">· {a.diasMes}d</span>}
                              </p>
                            </div>
                            {badgeTendencia(a)}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
                
                {/* SUPERAS */}
                <div className="bg-green-500/5 border border-green-500/30 rounded-2xl overflow-hidden">
                  <div className="bg-green-500/20 px-4 py-3 border-b border-green-500/30 flex items-center justify-between">
                    <h3 className="font-black text-green-300">🌟 Superas</h3>
                    <span className="text-2xl font-black text-green-300">{monitor.superas.length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {monitor.superas.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-6">Nenhum supera ainda</p>
                    ) : (
                      monitor.superas.map((s) => (
                        <Link key={s.idGroot} href={`/meu-time/${s.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-lg p-3 transition-all">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center text-green-300 font-bold text-xs">{iniciais(s.nome)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{s.nome}</p>
                              <p className="text-xs text-gray-500">
                                {s.processo} • {s.ultimaLiquida} pç/h
                                {s.fonte === 'mensal' && s.diasMes && <span className="ml-1 text-gray-600">· {s.diasMes}d</span>}
                              </p>
                            </div>
                            {badgeTendencia(s)}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* ============================================ */}
              {/* 🆕 PAINEL OCUPAÇÃO (dentro/fora) — só P2M */}
              {/* ============================================ */}
              {(monitorOcupacao.dentro.length > 0 || monitorOcupacao.fora.length > 0) && (
                <>
                  <h2 className="text-lg font-bold text-white mt-8 mb-4 flex items-center gap-2">
                    📊 Ocupação (Totefullness)
                    <span className="text-xs text-gray-500 font-normal">
                      · P2M · meta {metasConfig.ocupacaoP2M}% · média 30d
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* FORA DA META */}
                    <div className="bg-red-500/5 border border-red-500/30 rounded-2xl overflow-hidden">
                      <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30 flex items-center justify-between">
                        <h3 className="font-black text-red-300">🔴 Fora da meta</h3>
                        <span className="text-2xl font-black text-red-300">{monitorOcupacao.fora.length}</span>
                      </div>
                      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                        {monitorOcupacao.fora.length === 0 ? (
                          <p className="text-center text-gray-500 text-sm py-6">Todos dentro 🎉</p>
                        ) : (
                          monitorOcupacao.fora.map((o) => (
                            <Link key={o.idGroot} href={`/meu-time/${o.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg p-3 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-red-300 font-bold text-xs">{iniciais(o.nome)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                                  <p className="text-xs text-gray-500">{o.processo}{o.dias ? ` · ${o.dias}d` : ''}</p>
                                </div>
                                <span className="text-sm font-black text-red-300">{o.valor}%</span>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                    {/* DENTRO DA META */}
                    <div className="bg-green-500/5 border border-green-500/30 rounded-2xl overflow-hidden">
                      <div className="bg-green-500/20 px-4 py-3 border-b border-green-500/30 flex items-center justify-between">
                        <h3 className="font-black text-green-300">✅ Dentro da meta</h3>
                        <span className="text-2xl font-black text-green-300">{monitorOcupacao.dentro.length}</span>
                      </div>
                      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                        {monitorOcupacao.dentro.length === 0 ? (
                          <p className="text-center text-gray-500 text-sm py-6">Ninguém dentro ainda</p>
                        ) : (
                          monitorOcupacao.dentro.map((o) => (
                            <Link key={o.idGroot} href={`/meu-time/${o.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-lg p-3 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center text-green-300 font-bold text-xs">{iniciais(o.nome)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                                  <p className="text-xs text-gray-500">{o.processo}{o.dias ? ` · ${o.dias}d` : ''}</p>
                                </div>
                                <span className="text-sm font-black text-green-300">{o.valor}%</span>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* 🆕 PAINEL IMA / QUALIDADE (dentro/fora) */}
              {/* ============================================ */}
              {(monitorIma.dentro.length > 0 || monitorIma.fora.length > 0) && (
                <>
                  <h2 className="text-lg font-bold text-white mt-8 mb-4 flex items-center gap-2">
                    🎯 Qualidade (IMA)
                    <span className="text-xs text-gray-500 font-normal">
                      · limite P2M {metasConfig.imaP2M} · Checkin {metasConfig.imaCheckin} · menor é melhor
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* FORA DO LIMITE (IMA alto) */}
                    <div className="bg-red-500/5 border border-red-500/30 rounded-2xl overflow-hidden">
                      <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30 flex items-center justify-between">
                        <h3 className="font-black text-red-300">🔴 Fora do limite</h3>
                        <span className="text-2xl font-black text-red-300">{monitorIma.fora.length}</span>
                      </div>
                      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                        {monitorIma.fora.length === 0 ? (
                          <p className="text-center text-gray-500 text-sm py-6">Todos dentro 🎉</p>
                        ) : (
                          monitorIma.fora.map((o) => (
                            <Link key={o.idGroot} href={`/meu-time/${o.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg p-3 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-red-300 font-bold text-xs">{iniciais(o.nome)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                                  <p className="text-xs text-gray-500">{o.processo}{o.mesRef ? ` · ${o.mesRef}` : ''}</p>
                                </div>
                                <span className="text-sm font-black text-red-300">{o.valor}</span>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                    {/* DENTRO DO LIMITE (IMA bom) */}
                    <div className="bg-green-500/5 border border-green-500/30 rounded-2xl overflow-hidden">
                      <div className="bg-green-500/20 px-4 py-3 border-b border-green-500/30 flex items-center justify-between">
                        <h3 className="font-black text-green-300">✅ Dentro do limite</h3>
                        <span className="text-2xl font-black text-green-300">{monitorIma.dentro.length}</span>
                      </div>
                      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                        {monitorIma.dentro.length === 0 ? (
                          <p className="text-center text-gray-500 text-sm py-6">Ninguém dentro ainda</p>
                        ) : (
                          monitorIma.dentro.map((o) => (
                            <Link key={o.idGroot} href={`/meu-time/${o.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-lg p-3 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center text-green-300 font-bold text-xs">{iniciais(o.nome)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{o.nome}</p>
                                  <p className="text-xs text-gray-500">{o.processo}{o.mesRef ? ` · ${o.mesRef}` : ''}</p>
                                </div>
                                <span className="text-sm font-black text-green-300">{o.valor}</span>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* TAREFAS DA IA */}
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                🧠 Tarefas Inteligentes
                <span className="text-xs text-gray-500 font-normal">(geradas pela IA)</span>
              </h2>
              {tarefas.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setFiltroPrioridade('todas')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroPrioridade === 'todas' ? 'bg-[#FFD700] text-black' : 'bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]'}`}>
                    Todas ({tarefas.length})
                  </button>
                  {statsPrio.critica > 0 && (
                    <button onClick={() => setFiltroPrioridade('critica')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroPrioridade === 'critica' ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
                      🚨 Críticas ({statsPrio.critica})
                    </button>
                  )}
                  {statsPrio.alta > 0 && (
                    <button onClick={() => setFiltroPrioridade('alta')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroPrioridade === 'alta' ? 'bg-orange-500 text-white' : 'bg-orange-500/10 text-orange-300 border border-orange-500/30'}`}>
                      🔥 Altas ({statsPrio.alta})
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {loading || analisando ? (
              <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-12 text-center">
                <span className="text-5xl block mb-3 animate-pulse">🧠</span>
                <p className="text-white font-bold">{analisando ? 'IA analisando...' : 'Carregando...'}</p>
              </div>
            ) : tarefasFiltradas.length === 0 ? (
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-2 border-dashed border-green-500/30 rounded-2xl p-8 text-center">
                <span className="text-5xl block mb-3">🎉</span>
                <p className="text-white font-bold mb-1">Tudo em ordem!</p>
                <p className="text-xs text-gray-400">A IA não detectou nada crítico no momento.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tarefasFiltradas.map((t) => {
                  const cor = CORES_PRIORIDADE[t.prioridade] || CORES_PRIORIDADE.normal;
                  const emoji = EMOJI_TIPO[t.tipo] || '📋';
                  return (
                    <div key={t.id_tarefa} className={`relative bg-gradient-to-br ${cor.bg} border ${cor.border} rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl`}>
                      {/* 🗑️ Botão deletar - canto superior direito */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(t);
                        }}
                        title="Excluir tarefa"
                        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#0a0a0a]/80 hover:bg-red-500/20 border border-[#2a2a2a] hover:border-red-500/50 text-gray-500 hover:text-red-400 flex items-center justify-center transition-all"
                      >
                        🗑️
                      </button>
                      
                      <button onClick={() => abrirTarefa(t)} className="w-full text-left">
                        <div className="flex items-start gap-4 pr-10">
                          <div className={`w-12 h-12 rounded-xl ${cor.bgIntenso} flex items-center justify-center ${cor.text} font-black text-sm flex-shrink-0`}>
                            {iniciais(t.nome)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cor.bgIntenso} ${cor.text}`}>{emoji} {t.tipo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${cor.bgIntenso} ${cor.text}`}>{t.prioridade}</span>
                              {t.gerado_por_ia && <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300">🤖 IA</span>}
                            </div>
                            <h3 className="text-white font-black text-lg mb-1">{t.nome}</h3>
                            {t.processo && <p className="text-xs text-gray-400 mb-3">{t.processo}</p>}
                            {t.diagnostico && (
                              <div className="bg-[#0a0a0a]/60 rounded-lg p-3 mb-2 border border-[#2a2a2a]">
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">📊 Diagnóstico</p>
                                <p className="text-sm text-gray-200 leading-relaxed">{t.diagnostico}</p>
                              </div>
                            )}
                            {t.motivo && (
                              <div className="flex items-start gap-2 mt-2">
                                <span className="text-[#FFD700] text-base">→</span>
                                <p className="text-sm text-[#FFD700] font-bold">{t.motivo}</p>
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2a2a]">
                              <span className="text-xs text-gray-500">{tempoRelativo(t.criado_em)}</span>
                              <span className="text-xs text-[#FFD700] font-bold">Ver detalhes →</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* ABA: CHAT */}
      {abaAtiva === 'chat' && (
        <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
          <div className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <div>
                <h3 className="text-white font-bold text-sm">Estratega do Time</h3>
                <p className="text-xs text-gray-500">Claude Sonnet 4.5 · com contexto completo</p>
              </div>
            </div>
            {chatMensagens.length > 0 && (
              <button onClick={novaConversa} className="text-xs text-purple-400 hover:text-purple-300 font-bold">+ Nova conversa</button>
            )}
          </div>
          
          <div ref={chatRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatMensagens.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <span className="text-6xl">💬</span>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Pergunte qualquer coisa</h3>
                  <p className="text-sm text-gray-400 max-w-md">Eu sei tudo sobre o seu time. Performance, padrões, oportunidades, riscos.</p>
                </div>
                <div className="w-full max-w-2xl space-y-2 mt-6">
                  <p className="text-xs text-gray-500 uppercase font-bold">Sugestões:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SUGESTOES_CHAT.map((sug, i) => (
                      <button key={i} onClick={() => enviarMensagem(sug.replace(/^.{2}\s/, ''))} disabled={chatEnviando}
                        className="bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#2a2a2a] hover:border-purple-500/30 rounded-lg p-3 text-left text-sm text-gray-300 transition-all disabled:opacity-50">
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {chatMensagens.map((msg, i) => (
                  <div key={i} className={`flex ${msg.papel === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 ${msg.papel === 'user' ? 'bg-[#FFD700] text-black' : 'bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 text-gray-100'}`}>
                      {msg.papel === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">🤖</span>
                          <span className="text-xs font-bold text-purple-300">Estratega</span>
                        </div>
                      )}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{
                        __html: msg.conteudo
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/^### (.+)$/gm, '<h3 class="font-bold text-base mt-3 mb-1 text-purple-300">$1</h3>')
                          .replace(/^- (.+)$/gm, '• $1')
                      }} />
                    </div>
                  </div>
                ))}
                {chatEnviando && (
                  <div className="flex justify-start">
                    <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg animate-pulse">🤖</span>
                        <span className="text-sm text-purple-300">Pensando...</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="border-t border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
                placeholder="Pergunte sobre o seu time..." disabled={chatEnviando}
                className="flex-1 bg-[#0a0a0a] border border-[#2a2a2a] focus:border-purple-500/60 rounded-xl px-4 py-3 text-white text-sm outline-none disabled:opacity-50" />
              <button onClick={() => enviarMensagem()} disabled={chatEnviando || !chatInput.trim()}
                className="bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-bold px-5 rounded-xl disabled:opacity-30 transition-all">
                {chatEnviando ? '⏳' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ABA: APRENDIZADO */}
      {abaAtiva === 'aprendizado' && (
        <div className="space-y-6">
          {!aprendizadoStats ? (
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center">
              <span className="text-6xl block mb-4">🧠</span>
              <h3 className="text-xl font-bold text-white mb-2">IA ainda não tem aprendizado</h3>
              <p className="text-sm text-gray-400 mb-4">A IA precisa que você finalize tarefas e marque o resultado.<br/>Quanto mais feedback você der, mais inteligente ela fica.</p>
              <button onClick={() => setAbaAtiva('tarefas')} className="bg-[#FFD700] text-black font-bold px-6 py-2 rounded-lg hover:bg-yellow-300 transition-all text-sm">→ Ir pras tarefas</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-white">{aprendizadoStats.total}</p>
                  <p className="text-xs text-gray-400 mt-1">Tarefas finalizadas</p>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-green-400">{aprendizadoStats.sucessos}</p>
                  <p className="text-xs text-green-300 mt-1">✅ Sucessos</p>
                </div>
                <div className="bg-gradient-to-br from-red-500/10 to-rose-500/5 border border-red-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-red-400">{aprendizadoStats.falhas}</p>
                  <p className="text-xs text-red-300 mt-1">❌ Falhas</p>
                </div>
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-purple-400">{aprendizadoStats.taxaSucesso}%</p>
                  <p className="text-xs text-purple-300 mt-1">Taxa de sucesso</p>
                </div>
              </div>
              
              {aprendizadoStats.tiposRanking.length > 0 && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
                  <div className="bg-[#0a0a0a] px-5 py-3 border-b border-[#2a2a2a]">
                    <h3 className="font-bold text-[#FFD700]">📈 Ranking de Estratégias</h3>
                  </div>
                  <div className="divide-y divide-[#2a2a2a]">
                    {aprendizadoStats.tiposRanking.map((tipo, i) => (
                      <div key={tipo.tipo} className="p-4 flex items-center gap-4">
                        <div className="text-2xl">{i + 1}º</div>
                        <div className="flex-1">
                          <p className="text-white font-bold">{EMOJI_TIPO[tipo.tipo] || '📋'} {tipo.tipo}</p>
                          <div className="flex gap-3 mt-1 text-xs">
                            <span className="text-green-400">✅ {tipo.sucesso}</span>
                            <span className="text-red-400">❌ {tipo.falha}</span>
                            <span className="text-gray-500">Total: {tipo.total}</span>
                          </div>
                        </div>
                        <div className={`text-2xl font-black ${tipo.taxa >= 70 ? 'text-green-400' : tipo.taxa >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {tipo.taxa}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
                <div className="bg-[#0a0a0a] px-5 py-3 border-b border-[#2a2a2a]">
                  <h3 className="font-bold text-[#FFD700]">📚 Histórico Recente</h3>
                </div>
                <div className="divide-y divide-[#2a2a2a] max-h-96 overflow-y-auto">
                  {tarefasFinalizadas.slice(0, 15).map((t) => {
                    const corClass = t.classificacao_aprendizado?.includes('sucesso') ? 'text-green-400 bg-green-500/10' :
                      t.classificacao_aprendizado?.includes('falha') ? 'text-red-400 bg-red-500/10' : 'text-yellow-400 bg-yellow-500/10';
                    return (
                      <div key={t.id} className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-white font-bold text-sm">{t.nome}</span>
                          <span className="text-xs text-gray-500">{t.tipo}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ml-auto ${corClass}`}>
                            {t.classificacao_aprendizado}
                          </span>
                        </div>
                        {t.observacao_tl && <p className="text-xs text-gray-400 italic">"{t.observacao_tl}"</p>}
                        {t.performance_depois_30d?.variacao_pct !== undefined && (
                          <p className="text-xs mt-1">Performance 30d: 
                            <span className={t.performance_depois_30d.variacao_pct > 0 ? 'text-green-400' : 'text-red-400'}>
                              {' '}{t.performance_depois_30d.variacao_pct > 0 ? '+' : ''}{t.performance_depois_30d.variacao_pct}%
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* ABA: TIME */}
      {abaAtiva === 'time' && (
        <div className="space-y-6">
          {timeHealth && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-white">{timeHealth.totalColabs}</p>
                  <p className="text-xs text-gray-400 mt-1">Total colabs</p>
                </div>
                <div className="bg-gradient-to-br from-red-500/10 to-rose-500/5 border border-red-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-red-400">{timeHealth.ofensores}</p>
                  <p className="text-xs text-red-300 mt-1">🚨 Ofensores</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-blue-400">{timeHealth.alinhados}</p>
                  <p className="text-xs text-blue-300 mt-1">✓ Alinhados</p>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/30 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-green-400">{timeHealth.superas}</p>
                  <p className="text-xs text-green-300 mt-1">🌟 Superas</p>
                </div>
              </div>
              
              {/* 🆕 METAS VIGENTES */}
              <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-5">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  🎯 Metas Vigentes
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-blue-300 font-bold mb-1">🚚 P2M</p>
                    <p className="text-gray-400">Abaixo: &lt; {metasConfig.p2mBase} pç/h</p>
                    <p className="text-gray-400">Alinhado: {metasConfig.p2mBase} - {metasConfig.p2mAlinhadoMax} pç/h</p>
                    <p className="text-gray-400">Supera: &gt; {metasConfig.p2mAlinhadoMax} pç/h</p>
                    <p className="text-gray-500 mt-2 text-xs">Ocupação: ≥ {metasConfig.ocupacaoP2M}% · IMA: ≤ {metasConfig.imaP2M}</p>
                  </div>
                  <div>
                    <p className="text-cyan-300 font-bold mb-1">📦 Checkin</p>
                    <p className="text-gray-400">Abaixo: &lt; {metasConfig.checkinBase} pç/h</p>
                    <p className="text-gray-400">Alinhado: {metasConfig.checkinBase} - {metasConfig.checkinAlinhadoMax} pç/h</p>
                    <p className="text-gray-400">Supera: &gt; {metasConfig.checkinAlinhadoMax} pç/h</p>
                    <p className="text-gray-500 mt-2 text-xs">IMA: ≤ {metasConfig.imaCheckin}</p>
                  </div>
                </div>
              </div>
              
              {resumoAnalise && (
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    📊 Última Análise da IA
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400">Meta diária</p>
                      <p className="text-2xl font-black text-white">{resumoAnalise.meta_diaria || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Tarefas hoje</p>
                      <p className="text-2xl font-black text-purple-400">{resumoAnalise.tarefas_hoje || 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Contexto</p>
                      <p className="text-base font-black text-white capitalize">{(resumoAnalise.contexto || '').replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Aprendizado</p>
                      <p className="text-base font-black text-purple-400">{resumoAnalise.aprendizado_usado ? '🧠 Ativo' : '⏳ Aguardando'}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <button onClick={() => setAbaAtiva('chat')} className="w-full bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-purple-500/30 transition-all flex items-center justify-center gap-2">
                💬 Perguntar pra IA estratega →
              </button>
            </>
          )}
        </div>
      )}
      
      {/* MODAL DETALHES */}
      {tarefaAberta && (
        <div className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm" onClick={fecharTarefa}>
          <div onClick={(e) => e.stopPropagation()} className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-[#FFD700]/30 rounded-t-3xl md:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-b border-[#2a2a2a] p-5 flex items-start justify-between gap-3 z-10">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso} ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>{tarefaAberta.prioridade}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${CORES_PRIORIDADE[tarefaAberta.prioridade].bgIntenso} ${CORES_PRIORIDADE[tarefaAberta.prioridade].text}`}>{EMOJI_TIPO[tarefaAberta.tipo] || '📋'} {tarefaAberta.tipo}</span>
                </div>
                <h2 className="text-2xl font-black text-white">{tarefaAberta.nome}</h2>
                <p className="text-xs text-gray-500 mt-1">{tarefaAberta.processo} · ID {tarefaAberta.id_groot}</p>
              </div>
              <button onClick={fecharTarefa} className="w-8 h-8 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white flex items-center justify-center">×</button>
            </div>
            
            <div className="p-5 space-y-4">
              {tarefaAberta.diagnostico && (
                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-2">📊 Diagnóstico</p>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{tarefaAberta.diagnostico}</p>
                </div>
              )}
              {tarefaAberta.analise_ia && (
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/30 rounded-2xl p-4">
                  <p className="text-xs text-purple-300 uppercase font-bold mb-2">🧠 Análise da IA</p>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{tarefaAberta.analise_ia}</p>
                </div>
              )}
              {tarefaAberta.hipotese && (
                <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-2xl p-4">
                  <p className="text-xs text-yellow-300 uppercase font-bold mb-2">💡 Hipótese</p>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{tarefaAberta.hipotese}</p>
                </div>
              )}
              {tarefaAberta.motivo && (
                <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-2xl p-4">
                  <p className="text-xs text-[#FFD700] uppercase font-bold mb-2">🎯 Ação Sugerida</p>
                  <p className="text-sm text-white font-bold leading-relaxed whitespace-pre-line">{tarefaAberta.motivo}</p>
                </div>
              )}
              
              {(() => {
                const colab = colaboradores.find(c => c.id_groot === tarefaAberta.id_groot);
                if (!colab) return null;
                return (
                  <Link href={`/meu-time/${colab.id}`} className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 text-center text-sm text-blue-300 font-bold transition-all">
                    👤 Ver perfil completo de {tarefaAberta.nome} →
                  </Link>
                );
              })()}
            </div>
            
            <div className="sticky bottom-0 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-t border-[#2a2a2a] p-5 flex gap-3 flex-wrap">
              <button onClick={fecharTarefa} className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold py-3 rounded-xl transition-all min-w-[120px]">
                Fechar
              </button>
              <button
                onClick={() => setConfirmDelete(tarefaAberta)}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 font-bold py-3 px-4 rounded-xl transition-all flex items-center gap-2"
                title="Excluir tarefa"
              >
                🗑️ Excluir
              </button>
              <button onClick={() => abrirFinalizacao(tarefaAberta)} className="flex-1 bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white font-black py-3 rounded-xl shadow-lg shadow-purple-500/30 transition-all min-w-[160px]">
                🧠 Finalizar com IA
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 🗑️ MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => !deletando && setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-red-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-2xl">
                🗑️
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Excluir tarefa?</h3>
                <p className="text-xs text-gray-500">Esta ação não pode ser desfeita</p>
              </div>
            </div>
            
            <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-300 mb-1">
                <strong className="text-white">{confirmDelete.nome}</strong>
              </p>
              <p className="text-xs text-gray-500">
                {EMOJI_TIPO[confirmDelete.tipo] || '📋'} {confirmDelete.tipo} · {confirmDelete.prioridade}
              </p>
              {confirmDelete.motivo && (
                <p className="text-xs text-gray-400 mt-2 italic">"{confirmDelete.motivo}"</p>
              )}
            </div>
            
            <p className="text-xs text-gray-400 mb-5">
              A tarefa será excluída do banco. Se a IA detectar a mesma situação na próxima análise, ela pode gerar novamente.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deletando}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => deletarTarefa(confirmDelete)}
                disabled={deletando}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-black py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletando ? '⏳ Excluindo...' : '🗑️ Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {tarefaParaFinalizar && (
        <FinalizarTarefaModal tarefa={tarefaParaFinalizar} onClose={() => setTarefaParaFinalizar(null)} onFinalizar={onFinalizacaoCompleta} />
      )}
    </div>
  );
}

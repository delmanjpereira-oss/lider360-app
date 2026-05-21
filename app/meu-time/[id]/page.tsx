'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  cargo: string | null;
  processo: string | null;
  status: string;
  carreira: string | null;
  data_admissao: string | null;
  aniversario: string | null;
  created_at: string;
};

type HistoricoLinha = {
  id: number;
  data_referencia: string;
  processo: string;
  prod_liquida: number;
  prod_efetiva: number;
  utilizacao: string | null;
  tempo_processo: string | null;
  tempo_efetivo: string | null;
  tempo_ocioso: string | null;
  unidades: number;
  impacto_net: number;
  status_meta: string;
  ima: number;
};

type DpmoEvento = {
  id: number;
  checkin_data: string;
  representante: string;
  id_groot: string | null;
  qtd_dif: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
  processo: string;
};

type DpmoAgregado = {
  id: number;
  representante: string;
  id_groot: string | null;
  processo: string;
  semana: number;
  ano: number;
  trimestre: string;
  dpmo: number;
};

type OcupacaoP2M = {
  id: number;
  user_id: string;
  id_groot: string | null;
  data_referencia: string;
  nome_rep: string;
  qtd_totes: number;
  ocupacao_pct: number;
  semana: number;
  ano: number;
  mes: number;
  trimestre: string;
};

type FeedbackBreve = {
  feedback_id: string;
  tipo: string;
  classificacao: string;
  observacao: string;
  registrado_em: string;
};

type DpmoSemana = {
  ano: number;
  semana: number;
  defeitos: number;
  unidades: number;
  dpmo: number;
  diasAuditados: string[];
  statusCalculo: 'completo' | 'falta_inventario' | 'falta_produtividade';
};

type TurnoDiario = {
  id: number;
  data_referencia: string;
  net_geral_real: number;
  unidades_total: number;
  pct_efetivo: number;
  pct_ocioso: number;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatarData(data: string | null): string {
  if (!data) return 'Não informado';
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatarDataCurta(data: string): string {
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function mesesEmpresa(dataAdmissao: string | null): string {
  if (!dataAdmissao) return 'Não informado';
  const inicio = new Date(dataAdmissao);
  const agora = new Date();
  const meses = Math.floor((agora.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30));
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  if (anos === 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  if (mesesRestantes === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${mesesRestantes} meses`;
}

function diasParaAniversario(aniversario: string | null): string {
  if (!aniversario) return 'Não informado';
  const hoje = new Date();
  const data = new Date(aniversario);
  const proximo = new Date(hoje.getFullYear(), data.getMonth(), data.getDate());
  if (proximo < hoje) proximo.setFullYear(hoje.getFullYear() + 1);
  const diff = Math.ceil((proximo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '🎂 Hoje!';
  if (diff === 1) return 'Amanhã';
  return `Em ${diff} dias`;
}

function corStatus(status: string): string {
  switch (status) {
    case 'Supera': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'Alinhado': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Abaixo': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function iconeTipo(tipo: string): string {
  switch (tipo) {
    case 'Reconhecimento': return '🏆';
    case 'Alinhamento': return '🎯';
    case 'Acompanhamento': return '📊';
    default: return '✏️';
  }
}

function tempoParaSegundos(tempo: string | null): number {
  if (!tempo) return 0;
  const partes = tempo.split(':').map(Number);
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return partes[0] * 3600 + partes[1] * 60;
  return 0;
}

function segundosParaTempo(seg: number): string {
  if (seg <= 0) return '-';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcularOciosidade(tempoProcesso: string | null, tempoEfetivo: string | null): string {
  const proc = tempoParaSegundos(tempoProcesso);
  const efe = tempoParaSegundos(tempoEfetivo);
  if (proc <= 0 || efe <= 0) return '-';
  const ocioso = proc - efe;
  if (ocioso <= 0) return '00:00:00';
  return segundosParaTempo(ocioso);
}

function getSemanaIso(dataStr: string): { semana: number; ano: number } {
  const d = new Date(dataStr + 'T12:00:00');
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaDaSemana = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  return { semana, ano: utc.getUTCFullYear() };
}

// 🎯 Calcula NET individual do colab (unidades / horas tempo_processo)
function calcularNetIndividual(unidades: number, tempoProcesso: string | null): number {
  const seg = tempoParaSegundos(tempoProcesso);
  if (seg <= 0 || unidades <= 0) return 0;
  const horas = seg / 3600;
  return unidades / horas;
}

// 🎯 Calcula impacto NET real (compara NET ind vs NET time)
function calcularImpactoReal(netIndividual: number, netTime: number): number {
  if (netTime <= 0 || netIndividual <= 0) return 0;
  let impacto = ((netIndividual - netTime) / netTime) * 100;
  impacto = Math.max(-100, Math.min(200, impacto));
  return Number(impacto.toFixed(1));
}

// 🎯 Análise descritiva baseada no impacto
function analiseDoDia(netIndividual: number, netTime: number, impacto: number): { emoji: string; texto: string; cor: string } {
  if (impacto >= 50) {
    return { emoji: '🚀', texto: 'Carregou o time!', cor: 'text-green-400' };
  }
  if (impacto >= 20) {
    return { emoji: '🔥', texto: 'Muito acima', cor: 'text-green-400' };
  }
  if (impacto >= 5) {
    return { emoji: '🟢', texto: 'Levemente acima', cor: 'text-green-300' };
  }
  if (impacto >= -5) {
    return { emoji: '⚪', texto: 'No padrão', cor: 'text-gray-300' };
  }
  if (impacto >= -20) {
    return { emoji: '🟡', texto: 'Levemente abaixo', cor: 'text-yellow-400' };
  }
  if (impacto >= -50) {
    return { emoji: '🔴', texto: 'Abaixo do time', cor: 'text-red-400' };
  }
  return { emoji: '🚨', texto: 'Crítico - atenção!', cor: 'text-red-500' };
}

export default function DetalheColaboradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);
  const [dpmoEventos, setDpmoEventos] = useState<DpmoEvento[]>([]);
  const [dpmoAgregado, setDpmoAgregado] = useState<DpmoAgregado[]>([]);
  const [ocupacaoP2M, setOcupacaoP2M] = useState<OcupacaoP2M[]>([]);
  const [imaManual, setImaManual] = useState<any[]>([]);
  const [feedbacksRecentes, setFeedbacksRecentes] = useState<FeedbackBreve[]>([]);
  const [turnosDiarios, setTurnosDiarios] = useState<TurnoDiario[]>([]);
  const [metaIma, setMetaIma] = useState(1567);
  const [loading, setLoading] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscar() {
      try {
        const { data, error } = await supabase
          .from('colaboradores')
          .select('*')
          .eq('id', parseInt(id))
          .single();
        if (error) setErro(error.message);
        else {
          setColaborador(data);
          if (data) {
            buscarHistorico(data.id_groot);
            buscarDpmoEventos(data.id_groot, data.nome, data.processo);
            buscarDpmoAgregado(data.id_groot, data.nome, data.processo);
            buscarOcupacaoP2M(data.id_groot, data.nome, data.processo);
            buscarFeedbacks(data.id_groot);
            buscarImaManual(data.id_groot, data.processo);
            buscarMetaIma(data.processo);
            buscarTurnosDiarios();
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        setErro(msg);
      } finally {
        setLoading(false);
      }
    }
    buscar();
  }, [id]);

  async function buscarMetaIma(processo: string | null) {
    if (!processo) return;
    const chave = processo === 'Checkin' ? 'meta_ima_checkin' : processo === 'P2M' ? 'meta_ima_p2m' : null;
    if (!chave) return;
    const { data } = await supabase.from('config').select('valor').eq('chave', chave).single();
    if (data) setMetaIma(Number(data.valor));
  }

  async function buscarHistorico(idGroot: string) {
    try {
      setLoadingHistorico(true);
      const { data } = await supabase
        .from('historico')
        .select('*')
        .eq('id_groot', idGroot)
        .order('data_referencia', { ascending: false });
      setHistorico(data || []);
    } finally {
      setLoadingHistorico(false);
    }
  }

  async function buscarTurnosDiarios() {
    try {
      const { data, error } = await supabase
        .from('net_turno_diario')
        .select('id, data_referencia, net_geral_real, unidades_total, pct_efetivo, pct_ocioso')
        .order('data_referencia', { ascending: false });
      
      if (error) {
        console.warn('⚠️ Tabela net_turno_diario não existe ou erro:', error);
        return;
      }
      
      if (data) {
        setTurnosDiarios(data as TurnoDiario[]);
      }
    } catch (e) {
      console.warn('Erro buscando turnos:', e);
    }
  }

  async function buscarDpmoEventos(idGroot: string, nome: string, processoColaborador: string | null) {
    try {
      if (processoColaborador !== 'Checkin' && processoColaborador !== 'P2M') {
        setDpmoEventos([]);
        return;
      }

      const { data: porId } = await supabase
        .from('dpmo_eventos')
        .select('*')
        .eq('id_groot', idGroot)
        .order('checkin_data', { ascending: false });

      const { data: porNome } = await supabase
        .from('dpmo_eventos')
        .select('*')
        .ilike('representante', nome)
        .is('id_groot', null);

      const todos: DpmoEvento[] = [];
      const idsVistos = new Set<number>();
      [...(porId || []), ...(porNome || [])].forEach((e) => {
        if (!idsVistos.has(e.id)) {
          idsVistos.add(e.id);
          todos.push(e as DpmoEvento);
        }
      });
      setDpmoEventos(todos);
    } catch (e) {
      console.error('Erro buscando DPMO eventos:', e);
    }
  }

  async function buscarDpmoAgregado(idGroot: string, nome: string, processoColaborador: string | null) {
    try {
      if (processoColaborador !== 'Checkin' && processoColaborador !== 'P2M') {
        setDpmoAgregado([]);
        return;
      }
      const procDpmo = processoColaborador === 'Checkin' ? 'CK' : 'P2M';

      const { data: porId } = await supabase
        .from('dpmo_agregado')
        .select('*')
        .eq('id_groot', idGroot)
        .eq('processo', procDpmo)
        .order('ano', { ascending: false })
        .order('semana', { ascending: false });

      const { data: porNome } = await supabase
        .from('dpmo_agregado')
        .select('*')
        .ilike('representante', nome)
        .eq('processo', procDpmo)
        .is('id_groot', null);

      const todos: DpmoAgregado[] = [];
      const idsVistos = new Set<number>();
      [...(porId || []), ...(porNome || [])].forEach((e) => {
        if (!idsVistos.has(e.id)) {
          idsVistos.add(e.id);
          todos.push(e as DpmoAgregado);
        }
      });
      setDpmoAgregado(todos);
    } catch (e) {
      console.error('Erro buscando DPMO agregado:', e);
    }
  }

  async function buscarOcupacaoP2M(idGroot: string, nome: string, processoColaborador: string | null) {
    try {
      if (processoColaborador !== 'P2M') {
        setOcupacaoP2M([]);
        return;
      }

      const { data: porId } = await supabase
        .from('ocupacao_p2m')
        .select('*')
        .eq('id_groot', idGroot)
        .order('data_referencia', { ascending: false });

      setOcupacaoP2M((porId as OcupacaoP2M[]) || []);
    } catch (e) {
      console.error('Erro buscando ocupação P2M:', e);
    }
  }

  async function buscarFeedbacks(idGroot: string) {
    const { data } = await supabase
      .from('feedbacks')
      .select('feedback_id, tipo, classificacao, observacao, registrado_em')
      .eq('id_groot', idGroot)
      .order('registrado_em', { ascending: false })
      .limit(3);
    if (data) setFeedbacksRecentes(data as FeedbackBreve[]);
  }

  async function buscarImaManual(idGroot: string, processoColaborador: string | null) {
    if (!processoColaborador) return;
    try {
      const { data } = await supabase
        .from('ima_manual')
        .select('mes, ano, trimestre, processo, ima, atualizado_em')
        .eq('id_groot', idGroot)
        .eq('processo', processoColaborador)
        .order('ano', { ascending: false })
        .order('mes', { ascending: false });
      
      if (data) {
        setImaManual(data);
      }
    } catch (e) {
      console.warn('Erro buscando IMA manual:', e);
    }
  }

  async function excluir() {
    if (!colaborador) return;
    const ok = await (window as any).showConfirm({
      title: 'Excluir colaborador',
      message: `Deseja excluir ${colaborador.nome}?`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('colaboradores').delete().eq('id', colaborador.id);
    if (error) (window as any).showToast('error', 'Erro: ' + error.message);
    else {
      (window as any).showToast('success', 'Colaborador removido');
      router.push('/meu-time');
    }
  }

  const turnosPorData = new Map<string, TurnoDiario>();
  turnosDiarios.forEach((t) => turnosPorData.set(t.data_referencia, t));

  function calcularDpmoPorSemana(): DpmoSemana[] {
    const resultado: Record<string, DpmoSemana> = {};

    const procPrincipal = colaborador?.processo === 'Checkin' ? 'CK' : colaborador?.processo === 'P2M' ? 'P2M' : null;
    if (!procPrincipal) return [];

    const eventosPrincipal = dpmoEventos.filter((e) => e.processo === procPrincipal);
    const agregadoPrincipal = dpmoAgregado.filter((d) => d.processo === procPrincipal);

    let dataMaximaInventario = '';
    eventosPrincipal.forEach((e) => {
      if (e.checkin_data > dataMaximaInventario) dataMaximaInventario = e.checkin_data;
    });

    agregadoPrincipal.forEach((d) => {
      const chave = `${d.ano}-S${d.semana}`;
      if (!resultado[chave]) {
        resultado[chave] = {
          ano: d.ano,
          semana: d.semana,
          defeitos: 0,
          unidades: 0,
          dpmo: d.dpmo,
          diasAuditados: [],
          statusCalculo: 'completo',
        };
      } else {
        resultado[chave].dpmo = d.dpmo;
        resultado[chave].statusCalculo = 'completo';
      }
    });

    eventosPrincipal.forEach((e) => {
      const chave = `${e.ano}-S${e.semana}`;
      if (!resultado[chave]) {
        resultado[chave] = {
          ano: e.ano,
          semana: e.semana,
          defeitos: 0,
          unidades: 0,
          dpmo: 0,
          diasAuditados: [],
          statusCalculo: 'falta_produtividade',
        };
      }
      resultado[chave].defeitos += e.qtd_dif || 0;
      if (!resultado[chave].diasAuditados.includes(e.checkin_data)) {
        resultado[chave].diasAuditados.push(e.checkin_data);
      }
    });

    historico.forEach((h) => {
      if (dataMaximaInventario && h.data_referencia > dataMaximaInventario) return;
      const { ano, semana } = getSemanaIso(h.data_referencia);
      const chave = `${ano}-S${semana}`;
      
      if (!resultado[chave]) {
        resultado[chave] = {
          ano,
          semana,
          defeitos: 0,
          unidades: 0,
          dpmo: 0,
          diasAuditados: [],
          statusCalculo: 'falta_inventario',
        };
      }
      resultado[chave].unidades += h.unidades || 0;
    });

    return Object.values(resultado).sort((a, b) => {
      if (a.ano !== b.ano) return b.ano - a.ano;
      return b.semana - a.semana;
    });
  }

  const dpmoOutroProcesso = (() => {
    if (!colaborador) return null;
    const procPrincipal = colaborador.processo === 'Checkin' ? 'CK' : colaborador.processo === 'P2M' ? 'P2M' : null;
    if (!procPrincipal) return null;
    
    const outroProcesso = procPrincipal === 'CK' ? 'P2M' : 'CK';
    const eventosOutro = dpmoEventos.filter((e) => e.processo === outroProcesso);
    
    if (eventosOutro.length === 0) return null;
    
    const totalDef = eventosOutro.reduce((s, e) => s + (e.qtd_dif || 0), 0);
    const datasAuditadas = new Set(eventosOutro.map((e) => e.checkin_data));
    
    return {
      processo: outroProcesso === 'CK' ? 'Checkin' : 'P2M',
      processoSigla: outroProcesso,
      defeitos: totalDef,
      diasAuditados: datasAuditadas.size,
      eventos: eventosOutro.length,
    };
  })();

  const dpmoPorSemana = calcularDpmoPorSemana();
  const semanasCompletas = dpmoPorSemana.filter((s) => s.statusCalculo === 'completo');
  const semanasFaltando = dpmoPorSemana.filter((s) => s.statusCalculo !== 'completo');

  const dpmoTotal = (() => {
    if (imaManual.length > 0) {
      const totalIma = imaManual.reduce((s, m) => s + (Number(m.ima) || 0), 0);
      const mediaIma = Math.round(totalIma / imaManual.length);
      const totalDef = dpmoEventos.reduce((s, e) => s + (e.qtd_dif || 0), 0);
      const totalUnid = historico.reduce((s, h) => s + (h.unidades || 0), 0);
      return { defeitos: totalDef, unidades: totalUnid, dpmo: mediaIma };
    }

    if (dpmoAgregado.length > 0) {
      const procPrincipal = colaborador?.processo === 'Checkin' ? 'CK' : colaborador?.processo === 'P2M' ? 'P2M' : null;
      const agrPrincipal = dpmoAgregado.filter((d) => d.processo === procPrincipal);
      
      if (agrPrincipal.length > 0) {
        const somaDpmo = agrPrincipal.reduce((s, d) => s + (d.dpmo || 0), 0);
        const mediaDpmo = Math.round(somaDpmo / agrPrincipal.length);
        return { defeitos: 0, unidades: 0, dpmo: mediaDpmo };
      }
    }

    let dataMax = '';
    dpmoEventos.forEach((e) => {
      if (e.checkin_data > dataMax) dataMax = e.checkin_data;
    });
    if (!dataMax) return null;

    const semanasComInventario = new Set<string>();
    dpmoEventos.forEach((e) => {
      semanasComInventario.add(`${e.ano}-S${e.semana}`);
    });

    const totalDef = dpmoEventos.reduce((s, e) => s + (e.qtd_dif || 0), 0);
    const totalUnid = historico
      .filter((h) => h.data_referencia <= dataMax)
      .filter((h) => {
        const { ano, semana } = getSemanaIso(h.data_referencia);
        return semanasComInventario.has(`${ano}-S${semana}`);
      })
      .reduce((s, h) => s + (h.unidades || 0), 0);

    if (totalUnid === 0 || totalDef === 0) return null;
    return {
      defeitos: totalDef,
      unidades: totalUnid,
      dpmo: Math.round((totalDef / totalUnid) * 1_000_000),
    };
  })();

  const historicoFiltrado = (() => {
    const agora = new Date();
    const mesAtual = agora.getMonth() + 1;
    const anoAtual = agora.getFullYear();
    return historico.filter((h) => {
      const data = new Date(h.data_referencia + 'T12:00:00');
      return data.getMonth() + 1 === mesAtual && data.getFullYear() === anoAtual;
    });
  })();

  // 🎯 Calcula média de impacto NET com base no NOVO cálculo (turno)
  const stats = (() => {
    const validos = historicoFiltrado.filter((h) => h.prod_liquida > 0);
    if (validos.length === 0) return null;
    const somaLiq = validos.reduce((s, h) => s + h.prod_liquida, 0);
    
    // 🎯 IMPACTO NET MÉDIO via NOVO cálculo (turno)
    let somaImpactoReal = 0;
    let qtdComTurno = 0;
    validos.forEach((h) => {
      const turno = turnosPorData.get(h.data_referencia);
      if (turno) {
        const netInd = calcularNetIndividual(h.unidades, h.tempo_processo);
        const impacto = calcularImpactoReal(netInd, turno.net_geral_real);
        somaImpactoReal += impacto;
        qtdComTurno++;
      }
    });
    const mediaImpactoReal = qtdComTurno > 0 ? Number((somaImpactoReal / qtdComTurno).toFixed(1)) : 0;
    
    const ociosidadesValidas = validos
      .map((h) => tempoParaSegundos(h.tempo_processo) - tempoParaSegundos(h.tempo_efetivo))
      .filter((o) => o > 0);
    const ociosidadeMediaSeg = ociosidadesValidas.length > 0
      ? Math.round(ociosidadesValidas.reduce((s, v) => s + v, 0) / ociosidadesValidas.length)
      : 0;

    const melhorDia = validos.reduce((max, h) => (h.prod_liquida > max.prod_liquida ? h : max));
    const piorDia = validos.reduce((min, h) => (h.prod_liquida < min.prod_liquida ? h : min));
    return {
      totalDias: validos.length,
      mediaLiquida: Math.round(somaLiq / validos.length),
      mediaImpacto: mediaImpactoReal,
      diasComTurno: qtdComTurno,
      ociosidadeMedia: segundosParaTempo(ociosidadeMediaSeg),
      ociosidadeMediaSeg,
      diasSupera: validos.filter((h) => h.status_meta === 'Supera').length,
      diasAlinhado: validos.filter((h) => h.status_meta === 'Alinhado').length,
      diasAbaixo: validos.filter((h) => h.status_meta === 'Abaixo').length,
      melhorDia,
      piorDia,
      ultimoStatus: historicoFiltrado[0]?.status_meta || 'Sem dados',
    };
  })();

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (erro || !colaborador) {
    return (
      <div className="space-y-6">
        <Link href="/meu-time" className="text-gray-400 hover:text-white">← Voltar</Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold">{erro || 'Colaborador não encontrado'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/meu-time" className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2">
        ← Voltar para MEU TIME
      </Link>

      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
        <div className="flex items-start gap-6 flex-wrap">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-3xl flex-shrink-0 shadow-lg shadow-yellow-500/30">
            {iniciais(colaborador.nome)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black text-white mb-2">{colaborador.nome}</h1>
            <p className="text-gray-400 mb-3">{colaborador.cargo || 'Sem cargo cadastrado'}</p>
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-3 py-1 rounded-full font-bold ${colaborador.status === 'Ativo' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                {colaborador.status}
              </span>
              {colaborador.processo && (
                <span className="text-xs px-3 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400">{colaborador.processo}</span>
              )}
              {colaborador.carreira && (
                <span className="text-xs px-3 py-1 rounded-full font-bold bg-[#FFD700]/20 text-[#FFD700]">{colaborador.carreira}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link href={`/meu-time/${colaborador.id}/feedbacks`} className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 font-bold px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-2">💬 Feedbacks</Link>
            <Link href={`/meu-time/${colaborador.id}/editar`} className="bg-[#FFD700] text-black font-bold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors text-sm">✏️ Editar</Link>
            <button onClick={excluir} className="bg-red-500/10 text-red-400 font-bold px-4 py-2 rounded-lg hover:bg-red-500/20 transition-colors text-sm">🗑️ Excluir</button>
          </div>
        </div>
      </div>

      {!loadingHistorico && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📊</span>
              <span className="text-2xl font-black text-white">{stats.mediaLiquida}</span>
            </div>
            <p className="text-xs text-gray-400">Líquida média (pç/h)</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4" title={`Calculado em ${stats.diasComTurno} dia(s) com NET do time registrada`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📈</span>
              <span className={`text-2xl font-black ${stats.mediaImpacto > 0 ? 'text-green-400' : stats.mediaImpacto < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {stats.mediaImpacto > 0 ? '+' : ''}{stats.mediaImpacto}%
              </span>
            </div>
            <p className="text-xs text-gray-400">Impacto NET ({stats.diasComTurno}d)</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-orange-500/30 rounded-2xl p-4" title="T.Processo - T.Efetivo">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">⏱️</span>
              <span className="text-2xl font-black text-orange-400 font-mono">{stats.ociosidadeMedia}</span>
            </div>
            <p className="text-xs text-gray-400">Ociosidade média</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📅</span>
              <span className="text-2xl font-black text-cyan-400">{stats.totalDias}</span>
            </div>
            <p className="text-xs text-gray-400">Dias no mês</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🎯</span>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${corStatus(stats.ultimoStatus)}`}>{stats.ultimoStatus}</span>
            </div>
            <p className="text-xs text-gray-400">Último status</p>
          </div>
        </div>
      )}

      {/* SEÇÃO DPMO */}
      {(colaborador.processo === 'Checkin' || colaborador.processo === 'P2M') && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-purple-400 flex items-center gap-2">
              📊 DPMO (Qualidade)
            </h2>
            <span className="text-xs text-gray-500">Cálculo: (Σ Defeitos / Σ Unidades) × 1.000.000</span>
          </div>

          {dpmoPorSemana.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <span className="text-4xl block mb-2">📭</span>
              <p>Sem dados de DPMO ainda</p>
              <p className="text-xs text-gray-500 mt-1">
                Sobe o CSV INVENTÁRIO DPMO em MEU TIME → 📊 Upload DPMO
              </p>
            </div>
          ) : (
            <>
              {dpmoTotal !== null ? (
                <div className={`rounded-lg p-4 border ${dpmoTotal.dpmo > metaIma ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold mb-1">TOTAL GERAL</p>
                      <p className={`text-4xl font-black font-mono ${dpmoTotal.dpmo > metaIma ? 'text-red-400' : 'text-green-400'}`}>
                        {dpmoTotal.dpmo.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {dpmoTotal.defeitos} defeitos / {dpmoTotal.unidades.toLocaleString('pt-BR')} unidades
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Meta IMA</p>
                      <p className="text-2xl font-bold text-white">{metaIma}</p>
                      <p className={`text-xs font-bold mt-1 ${dpmoTotal.dpmo > metaIma ? 'text-red-400' : 'text-green-400'}`}>
                        {dpmoTotal.dpmo > metaIma ? '⚠️ acima da meta' : '✓ na meta'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-yellow-300 text-sm">
                    ⚠️ <strong>Faltam dados.</strong> Sobe o CSV INVENTÁRIO DPMO em MEU TIME → 📊 Upload DPMO.
                  </p>
                </div>
              )}

              {semanasCompletas.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                        <th className="py-2 pr-2">Período</th>
                        <th className="py-2 pr-2 text-center">Dias auditados</th>
                        <th className="py-2 pr-2 text-right">Defeitos</th>
                        <th className="py-2 pr-2 text-right">Unidades</th>
                        <th className="py-2 pr-2 text-right">DPMO</th>
                        <th className="py-2 pr-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semanasCompletas.slice(0, 12).map((s) => (
                        <tr key={`${s.ano}-${s.semana}`} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                          <td className="py-2 pr-2 text-white">Semana {s.semana} / {s.ano}</td>
                          <td className="py-2 pr-2 text-center text-gray-400 text-xs">{s.diasAuditados.length} dia(s)</td>
                          <td className="py-2 pr-2 text-right text-red-400 font-mono">{s.defeitos}</td>
                          <td className="py-2 pr-2 text-right text-gray-300 font-mono">{s.unidades.toLocaleString('pt-BR')}</td>
                          <td className={`py-2 pr-2 text-right font-mono font-bold ${s.dpmo > metaIma ? 'text-red-400' : 'text-green-400'}`}>
                            {s.dpmo.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 pr-2">
                            {s.dpmo > metaIma ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400">Acima</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-green-500/20 text-green-400">Na meta</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {semanasFaltando.length > 0 && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-blue-300 font-bold mb-2">⏳ Semanas aguardando:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {semanasFaltando.map((s) => (
                      <span key={`${s.ano}-${s.semana}`} className="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                        S{s.semana}/{s.ano}: {s.statusCalculo === 'falta_inventario' ? 'falta inventário' : 'falta produtividade'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                💡 <strong>Cálculo igual Looker:</strong> Soma unidades das semanas auditadas <strong>até a última data de inventário</strong>. 
                Se você tem produtividade até dia 16 mas inventário até dia 15, ignora o dia 16 (não foi auditado). Igual Looker faz.
              </div>
            </>
          )}
        </div>
      )}

      {/* SEÇÃO FEEDBACK ADICIONAL */}
      {dpmoOutroProcesso && dpmoOutroProcesso.defeitos > 0 && (
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-2xl p-6 space-y-3" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">💬</span>
            <div className="flex-1">
              <h2 className="text-base font-bold text-amber-400">
                Dados extras de {dpmoOutroProcesso.processo} — apenas pra feedback
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Esse colaborador trabalhou em outro processo no período. <strong>Estes dados NÃO contam na calibração</strong>, apenas pra você dar feedback.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-[#0a0a0a]/50 rounded-lg p-3 border border-amber-500/20">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Eventos</p>
              <p className="text-2xl font-black text-amber-300 font-mono">{dpmoOutroProcesso.eventos}</p>
            </div>
            <div className="bg-[#0a0a0a]/50 rounded-lg p-3 border border-amber-500/20">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Defeitos</p>
              <p className="text-2xl font-black text-red-400 font-mono">{dpmoOutroProcesso.defeitos}</p>
            </div>
            <div className="bg-[#0a0a0a]/50 rounded-lg p-3 border border-amber-500/20">
              <p className="text-xs text-gray-400 uppercase font-bold mb-1">Dias auditados</p>
              <p className="text-2xl font-black text-amber-300 font-mono">{dpmoOutroProcesso.diasAuditados}</p>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-200">
            💡 <strong>Como usar:</strong> Esse colaborador é <strong>{colaborador.processo}</strong> mas teve atividade em <strong>{dpmoOutroProcesso.processo}</strong> no período. 
            Use essa info no feedback: &quot;Bom trabalho ajudando no {dpmoOutroProcesso.processo}!&quot; mas continue focando o desenvolvimento dele no processo principal.
          </div>
        </div>
      )}

      {/* SEÇÃO OCUPAÇÃO P2M */}
      {colaborador.processo === 'P2M' && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
              📦 Ocupação P2M (Qualidade)
            </h2>
            <span className="text-xs text-gray-500">Meta: 80%+ — Quanto maior, melhor</span>
          </div>

          {ocupacaoP2M.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <span className="text-4xl block mb-2">📭</span>
              <p>Sem dados de Ocupação P2M ainda</p>
              <p className="text-xs text-gray-500 mt-1">
                Sobe o CSV &quot;Totefullness&quot; em MEU TIME → 🎯 Upload Ocupação
              </p>
              <p className="text-xs text-yellow-400 mt-2">
                💡 Confira se o <code>user_id_meli</code> deste colaborador está cadastrado
              </p>
            </div>
          ) : (
            (() => {
              const agora = new Date();
              const mesAtual = agora.getMonth() + 1;
              const anoAtual = agora.getFullYear();
              const doMes = ocupacaoP2M.filter((o) => {
                const d = new Date(o.data_referencia + 'T12:00:00');
                return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
              });

              if (doMes.length === 0) {
                return (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    <span className="text-3xl block mb-2">📅</span>
                    <p>Sem dados de Ocupação deste mês</p>
                  </div>
                );
              }

              const mediaOcup = doMes.reduce((s, o) => s + o.ocupacao_pct, 0) / doMes.length;
              const totalTotes = doMes.reduce((s, o) => s + o.qtd_totes, 0);
              const naMeta = mediaOcup >= 80;

              return (
                <>
                  <div className={`rounded-lg p-4 border ${naMeta ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-xs text-gray-400 uppercase font-bold mb-1">OCUPAÇÃO MÉDIA DO MÊS</p>
                        <p className={`text-4xl font-black font-mono ${naMeta ? 'text-green-400' : 'text-yellow-400'}`}>
                          {mediaOcup.toFixed(2)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {doMes.length} dia(s) · {totalTotes.toLocaleString('pt-BR')} totes no total
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Meta</p>
                        <p className="text-2xl font-bold text-white">80%</p>
                        <p className={`text-xs font-bold mt-1 ${naMeta ? 'text-green-400' : 'text-yellow-400'}`}>
                          {naMeta ? '✓ acima da meta' : '⚠️ abaixo da meta'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                          <th className="py-2 pr-2">Data</th>
                          <th className="py-2 pr-2 text-right">Qtd Totes</th>
                          <th className="py-2 pr-2 text-right">Ocupação</th>
                          <th className="py-2 pr-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doMes.map((o) => (
                          <tr key={o.id} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a]">
                            <td className="py-2 pr-2 text-white font-mono">{formatarDataCurta(o.data_referencia)}</td>
                            <td className="py-2 pr-2 text-right text-gray-300 font-mono">{o.qtd_totes}</td>
                            <td className={`py-2 pr-2 text-right font-mono font-bold ${o.ocupacao_pct >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {o.ocupacao_pct.toFixed(2)}%
                            </td>
                            <td className="py-2 pr-2">
                              {o.ocupacao_pct >= 80 ? (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-green-500/20 text-green-400">Na meta</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-yellow-500/20 text-yellow-400">Abaixo</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
                    💡 <strong>Ocupação = eficiência do tempo</strong> (não quantidade de totes). 
                    Quanto menos pausas/ociosidade durante o trabalho com totes, maior a ocupação.
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {!loadingHistorico && stats && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
          <h3 className="text-sm font-bold text-gray-400 mb-4">DISTRIBUIÇÃO DE STATUS</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-green-400">{stats.diasSupera}</div>
              <div className="text-xs text-gray-500 mt-1">Supera</div>
            </div>
            <div className="text-center border-x border-[#2a2a2a]">
              <div className="text-3xl font-black text-blue-400">{stats.diasAlinhado}</div>
              <div className="text-xs text-gray-500 mt-1">Alinhado</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-red-400">{stats.diasAbaixo}</div>
              <div className="text-xs text-gray-500 mt-1">Abaixo</div>
            </div>
          </div>
        </div>
      )}

      {!loadingHistorico && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/30 rounded-2xl p-4">
            <p className="text-xs text-green-400 font-bold mb-1">🏆 MELHOR DIA</p>
            <p className="text-2xl font-black text-white">{stats.melhorDia.prod_liquida} pç/h</p>
            <p className="text-xs text-gray-400">{formatarData(stats.melhorDia.data_referencia)}</p>
          </div>
          <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/30 rounded-2xl p-4">
            <p className="text-xs text-red-400 font-bold mb-1">📉 PIOR DIA</p>
            <p className="text-2xl font-black text-white">{stats.piorDia.prod_liquida} pç/h</p>
            <p className="text-xs text-gray-400">{formatarData(stats.piorDia.data_referencia)}</p>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#FFD700]">💬 Feedbacks Recentes</h2>
          <Link href={`/meu-time/${colaborador.id}/feedbacks`} className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-bold">Ver todos →</Link>
        </div>
        {feedbacksRecentes.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-4xl block mb-2">📭</span>
            <p className="text-gray-400 text-sm mb-3">Nenhum feedback ainda</p>
            <Link href={`/meu-time/${colaborador.id}/feedbacks`} className="inline-block bg-[#FFD700] text-black font-bold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors text-sm">+ Registrar primeiro feedback</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacksRecentes.map((fb) => (
              <div key={fb.feedback_id} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{iconeTipo(fb.tipo)}</span>
                    <span className="text-sm font-bold text-white">{fb.tipo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corStatus(fb.classificacao)}`}>{fb.classificacao}</span>
                  </div>
                  <span className="text-xs text-gray-500">{tempoRelativo(fb.registrado_em)}</span>
                </div>
                <p className="text-gray-300 text-sm line-clamp-2">{fb.observacao}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
          <h2 className="text-lg font-bold text-[#FFD700] mb-4">📋 Dados Cadastrais</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">ID Groot</span>
              <span className="text-white font-mono">{colaborador.id_groot}</span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Cargo</span>
              <span className="text-white">{colaborador.cargo || 'Não informado'}</span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Processo</span>
              <span className="text-white">{colaborador.processo || 'Não informado'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Carreira</span>
              <span className="text-[#FFD700] font-bold">{colaborador.carreira || 'Não informado'}</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
          <h2 className="text-lg font-bold text-[#FFD700] mb-4">📅 Datas Importantes</h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-gray-400 mb-1">Data de Admissão</p>
              <p className="text-white">{formatarData(colaborador.data_admissao)}</p>
              <p className="text-xs text-gray-500 mt-1">{mesesEmpresa(colaborador.data_admissao)} na empresa</p>
            </div>
            <div className="pt-3 border-t border-[#2a2a2a]">
              <p className="text-gray-400 mb-1">Aniversário</p>
              <p className="text-white">{formatarData(colaborador.aniversario)}</p>
              <p className="text-xs text-pink-400 mt-1">🎂 {diasParaAniversario(colaborador.aniversario)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🎯 TABELA HISTÓRICO — Imp.NET SUBSTITUÍDO + Análise do Dia */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-lg font-bold text-[#FFD700]">📊 Histórico do Mês</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {turnosDiarios.length > 0 && (
              <span className="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-bold flex items-center gap-1">
                📥 {turnosDiarios.length} turnos registrados
              </span>
            )}
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full font-bold">
              {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        {loadingHistorico ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">⏳</span>
            <p className="text-gray-400">Carregando histórico...</p>
          </div>
        ) : historicoFiltrado.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">📭</span>
            <p className="text-gray-400 mb-2">Sem dados desse mês ainda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-xs text-gray-400 uppercase">
                  <th className="py-3 pr-3">Data</th>
                  <th className="py-3 pr-3 text-right">Líquida</th>
                  <th className="py-3 pr-3 text-right">Unidades</th>
                  <th className="py-3 pr-3 text-right">T.Processo</th>
                  <th className="py-3 pr-3 text-right">T.Efetivo</th>
                  <th className="py-3 pr-3 text-right">Ociosidade</th>
                  <th className="py-3 pr-3 text-right">Util.</th>
                  {/* 🎯 IMP.NET AGORA VEM DO NOVO CÁLCULO (via turno) */}
                  <th className="py-3 pr-3 text-right">Imp.NET</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-3 text-right">NET Time</th>
                  {/* 🎯 NOVA COLUNA */}
                  <th className="py-3 pr-3 border-l border-[#2a2a2a] bg-green-500/5">
                    <div className="text-green-400">Análise do Dia</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {historicoFiltrado.map((h) => {
                  const ociosidadeCalc = calcularOciosidade(h.tempo_processo, h.tempo_efetivo);
                  
                  // 🎯 Calcula tudo a partir do turno registrado
                  const turnoDoDia = turnosPorData.get(h.data_referencia);
                  const netIndividual = calcularNetIndividual(h.unidades, h.tempo_processo);
                  const impactoReal = turnoDoDia 
                    ? calcularImpactoReal(netIndividual, turnoDoDia.net_geral_real)
                    : null;
                  const analise = turnoDoDia && impactoReal !== null 
                    ? analiseDoDia(netIndividual, turnoDoDia.net_geral_real, impactoReal)
                    : null;
                  
                  return (
                    <tr key={h.id} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a] transition-colors">
                      <td className="py-3 pr-3 text-white font-mono">{formatarDataCurta(h.data_referencia)}</td>
                      <td className="py-3 pr-3 text-right text-white font-mono font-bold">{h.prod_liquida.toFixed(0)}</td>
                      <td className="py-3 pr-3 text-right text-gray-300 font-mono">{h.unidades.toLocaleString('pt-BR')}</td>
                      <td className="py-3 pr-3 text-right text-gray-400 font-mono text-xs">{h.tempo_processo || '-'}</td>
                      <td className="py-3 pr-3 text-right text-gray-400 font-mono text-xs">{h.tempo_efetivo || '-'}</td>
                      <td className="py-3 pr-3 text-right text-orange-400 font-mono text-xs font-bold" title="T.Processo - T.Efetivo">
                        {ociosidadeCalc}
                      </td>
                      <td className="py-3 pr-3 text-right text-gray-300 text-xs">{h.utilizacao || '-'}</td>
                      {/* 🎯 IMP.NET = porcentagem do NOVO cálculo (via turno) */}
                      <td className={`py-3 pr-3 text-right font-mono font-bold ${
                        impactoReal === null ? 'text-gray-500' :
                        impactoReal > 0 ? 'text-green-400' : 
                        impactoReal < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {impactoReal === null ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : (
                          <>{impactoReal > 0 ? '+' : ''}{impactoReal.toFixed(1)}%</>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corStatus(h.status_meta)}`}>{h.status_meta}</span>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        {turnoDoDia ? (
                          <span className="text-[#FFD700] font-mono font-bold text-sm">
                            {Math.round(turnoDoDia.net_geral_real)}
                            <span className="text-[10px] text-gray-500 ml-1">pç/h</span>
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      {/* 🎯 ANÁLISE DO DIA */}
                      <td className="py-3 pr-3 border-l border-[#2a2a2a] bg-green-500/5">
                        {analise ? (
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{analise.emoji}</span>
                            <div>
                              <div className={`text-xs font-bold ${analise.cor}`}>{analise.texto}</div>
                              <div className="text-[10px] text-gray-500 font-mono">NET ind: {Math.round(netIndividual)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-600 text-xs">
                            <div>— sem registro</div>
                            <div className="text-[9px]">do turno</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {/* Legenda explicativa */}
            <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
              <p className="font-bold">💡 Análise do Dia - escala de avaliação:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
                <div className="flex items-center gap-1"><span>🚀</span> <span className="text-green-400">Carregou (+50%+)</span></div>
                <div className="flex items-center gap-1"><span>🔥</span> <span className="text-green-400">Muito acima (+20%+)</span></div>
                <div className="flex items-center gap-1"><span>🟢</span> <span className="text-green-300">Levemente acima</span></div>
                <div className="flex items-center gap-1"><span>⚪</span> <span className="text-gray-300">No padrão</span></div>
                <div className="flex items-center gap-1"><span>🟡</span> <span className="text-yellow-400">Leve queda</span></div>
                <div className="flex items-center gap-1"><span>🔴</span> <span className="text-red-400">Abaixo do time</span></div>
                <div className="flex items-center gap-1"><span>🚨</span> <span className="text-red-500">Crítico (-50%+)</span></div>
              </div>
              <p className="mt-2 text-blue-200">
                💡 <strong>Imp.NET</strong> e <strong>Análise</strong> são calculados a partir do <strong>NET Time</strong> registrado no fim do turno. 
                Sem registro do dia, aparece &quot;—&quot;.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

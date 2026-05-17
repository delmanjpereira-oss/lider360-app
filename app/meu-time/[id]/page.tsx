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

function getSemanaIso(dataStr: string): { semana: number; ano: number } {
  const d = new Date(dataStr + 'T12:00:00');
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaDaSemana = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const inicioAno = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((utc.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
  return { semana, ano: utc.getUTCFullYear() };
}

export default function DetalheColaboradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [historico, setHistorico] = useState<HistoricoLinha[]>([]);
  const [dpmoEventos, setDpmoEventos] = useState<DpmoEvento[]>([]);
  const [feedbacksRecentes, setFeedbacksRecentes] = useState<FeedbackBreve[]>([]);
  const [metaIma, setMetaIma] = useState(1567);
  const [loading, setLoading] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<'7' | '30' | '90' | 'tudo'>('30');

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
            buscarFeedbacks(data.id_groot);
            buscarMetaIma(data.processo);
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

  async function buscarFeedbacks(idGroot: string) {
    const { data } = await supabase
      .from('feedbacks')
      .select('feedback_id, tipo, classificacao, observacao, registrado_em')
      .eq('id_groot', idGroot)
      .order('registrado_em', { ascending: false })
      .limit(3);
    if (data) setFeedbacksRecentes(data as FeedbackBreve[]);
  }

  async function excluir() {
    if (!colaborador) return;
    const ok = await window.showConfirm({
      title: 'Excluir colaborador',
      message: `Deseja excluir ${colaborador.nome}?`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('colaboradores').delete().eq('id', colaborador.id);
    if (error) window.showToast('error', 'Erro: ' + error.message);
    else {
      window.showToast('success', 'Colaborador removido');
      router.push('/meu-time');
    }
  }

  // 🎯 CÁLCULO INTELIGENTE — Só soma unidades das DATAS que tem inventário!
  function calcularDpmoPorSemana(): DpmoSemana[] {
    const resultado: Record<string, DpmoSemana> = {};

    // 1. Lista DATAS distintas onde tem inventário
    const datasComInventario = new Set<string>();
    dpmoEventos.forEach((e) => {
      datasComInventario.add(e.checkin_data); // YYYY-MM-DD
    });

    // 2. Acumula DEFEITOS por semana (do dpmo_eventos)
    dpmoEventos.forEach((e) => {
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

    // 3. Acumula UNIDADES APENAS dos dias QUE TEM INVENTÁRIO
    historico.forEach((h) => {
      // 🎯 SÓ INCLUI se essa data foi auditada (tem inventário)
      if (!datasComInventario.has(h.data_referencia)) return;

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

    // 4. Verifica também semanas com produtividade mas sem inventário
    historico.forEach((h) => {
      const { ano, semana } = getSemanaIso(h.data_referencia);
      const chave = `${ano}-S${semana}`;
      if (!resultado[chave]) {
        resultado[chave] = {
          ano,
          semana,
          defeitos: 0,
          unidades: h.unidades || 0,
          dpmo: 0,
          diasAuditados: [],
          statusCalculo: 'falta_inventario',
        };
      }
    });

    // 5. Calcula DPMO onde tem OS 2 (defeitos + unidades das datas auditadas)
    Object.values(resultado).forEach((s) => {
      const temInventario = dpmoEventos.some((e) => e.ano === s.ano && e.semana === s.semana);
      
      if (temInventario && s.unidades > 0) {
        s.dpmo = Math.round((s.defeitos / s.unidades) * 1_000_000);
        s.statusCalculo = 'completo';
      } else if (temInventario && s.unidades === 0) {
        s.statusCalculo = 'falta_produtividade';
      } else if (!temInventario) {
        s.statusCalculo = 'falta_inventario';
      }
    });

    return Object.values(resultado).sort((a, b) => {
      if (a.ano !== b.ano) return b.ano - a.ano;
      return b.semana - a.semana;
    });
  }

  const dpmoPorSemana = calcularDpmoPorSemana();
  const semanasCompletas = dpmoPorSemana.filter((s) => s.statusCalculo === 'completo');
  const semanasFaltando = dpmoPorSemana.filter((s) => s.statusCalculo !== 'completo');

  // 🎯 DPMO TOTAL — ponderado, só com semanas completas
  const dpmoTotal = (() => {
    if (semanasCompletas.length === 0) return null;
    const totalDef = semanasCompletas.reduce((s, x) => s + x.defeitos, 0);
    const totalUnid = semanasCompletas.reduce((s, x) => s + x.unidades, 0);
    if (totalUnid === 0) return null;
    return {
      defeitos: totalDef,
      unidades: totalUnid,
      dpmo: Math.round((totalDef / totalUnid) * 1_000_000),
    };
  })();

  const historicoFiltrado = (() => {
    if (filtroPeriodo === 'tudo') return historico;
    const dias = parseInt(filtroPeriodo);
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    return historico.filter((h) => new Date(h.data_referencia) >= limite);
  })();

  const stats = (() => {
    const validos = historicoFiltrado.filter((h) => h.prod_liquida > 0);
    if (validos.length === 0) return null;
    const somaLiq = validos.reduce((s, h) => s + h.prod_liquida, 0);
    const somaImp = validos.reduce((s, h) => s + h.impacto_net, 0);
    const melhorDia = validos.reduce((max, h) => (h.prod_liquida > max.prod_liquida ? h : max));
    const piorDia = validos.reduce((min, h) => (h.prod_liquida < min.prod_liquida ? h : min));
    return {
      totalDias: validos.length,
      mediaLiquida: Math.round(somaLiq / validos.length),
      mediaImpacto: Number((somaImp / validos.length).toFixed(1)),
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📊</span>
              <span className="text-3xl font-black text-white">{stats.mediaLiquida}</span>
            </div>
            <p className="text-xs text-gray-400">Líquida média (pç/h)</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📈</span>
              <span className={`text-3xl font-black ${stats.mediaImpacto > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.mediaImpacto > 0 ? '+' : ''}{stats.mediaImpacto}%
              </span>
            </div>
            <p className="text-xs text-gray-400">Impacto NET médio</p>
          </div>
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📅</span>
              <span className="text-3xl font-black text-cyan-400">{stats.totalDias}</span>
            </div>
            <p className="text-xs text-gray-400">Dias com dados</p>
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

      {/* 🎯 SEÇÃO DPMO */}
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
                💡 <strong>Cálculo inteligente:</strong> Soma só as unidades dos DIAS AUDITADOS (que têm inventário).
                Se a produtividade está mais adiantada que o inventário, ignora os dias sem auditoria. Garante que bate 100% com Looker!
              </div>
            </>
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

      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-lg font-bold text-[#FFD700]">📊 Histórico de Produção</h2>
          <div className="flex gap-1 bg-[#0a0a0a] rounded-lg p-1">
            {(['7', '30', '90', 'tudo'] as const).map((periodo) => (
              <button key={periodo} onClick={() => setFiltroPeriodo(periodo)} className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${filtroPeriodo === periodo ? 'bg-[#FFD700] text-black' : 'text-gray-400 hover:text-white'}`}>
                {periodo === 'tudo' ? 'Tudo' : `${periodo}d`}
              </button>
            ))}
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
            <p className="text-gray-400 mb-2">Sem dados no período</p>
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
                  <th className="py-3 pr-3 text-right">Imp.NET</th>
                  <th className="py-3 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {historicoFiltrado.map((h) => (
                  <tr key={h.id} className="border-b border-[#2a2a2a] hover:bg-[#0a0a0a] transition-colors">
                    <td className="py-3 pr-3 text-white font-mono">{formatarDataCurta(h.data_referencia)}</td>
                    <td className="py-3 pr-3 text-right text-white font-mono font-bold">{h.prod_liquida.toFixed(0)}</td>
                    <td className="py-3 pr-3 text-right text-gray-300 font-mono">{h.unidades.toLocaleString('pt-BR')}</td>
                    <td className="py-3 pr-3 text-right text-gray-400 font-mono text-xs">{h.tempo_processo || '-'}</td>
                    <td className="py-3 pr-3 text-right text-gray-400 font-mono text-xs">{h.tempo_efetivo || '-'}</td>
                    <td className="py-3 pr-3 text-right text-gray-400 font-mono text-xs">{h.tempo_ocioso || '-'}</td>
                    <td className="py-3 pr-3 text-right text-gray-300 text-xs">{h.utilizacao || '-'}</td>
                    <td className={`py-3 pr-3 text-right font-mono font-bold ${h.impacto_net > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {h.impacto_net > 0 ? '+' : ''}{h.impacto_net.toFixed(1)}%
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corStatus(h.status_meta)}`}>{h.status_meta}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

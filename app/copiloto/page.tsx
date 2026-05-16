'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  cargo: string | null;
  processo: string | null;
  status: string;
  aniversario: string | null;
  data_admissao: string | null;
};

type HistoricoSimples = {
  id_groot: string;
  data_referencia: string;
  prod_liquida: number;
  status_meta: string;
  impacto_net: number;
};

type Tarefa = {
  id: number;
  id_tarefa: string;
  id_groot: string;
  nome: string;
  processo: string | null;
  tipo: string;
  motivo: string | null;
  status: string;
  criado_em: string;
};

type Upload = {
  upload_id: string;
  data_referencia: string;
  enviado_em: string;
};

type Alerta = {
  nivel: 'alto' | 'medio' | 'baixo';
  icone: string;
  texto: string;
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
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);

  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

export default function CopilotoPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<HistoricoSimples[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerandoTarefas, setGerandoTarefas] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    try {
      setLoading(true);

      const [colabsResp, histResp, tarResp, upResp] = await Promise.all([
        supabase.from('colaboradores').select('*').order('nome'),
        supabase
          .from('historico')
          .select('id_groot, data_referencia, prod_liquida, status_meta, impacto_net')
          .order('data_referencia', { ascending: false }),
        supabase
          .from('tarefas')
          .select('*')
          .eq('status', 'Pendente')
          .order('criado_em', { ascending: false }),
        supabase
          .from('uploads')
          .select('upload_id, data_referencia, enviado_em')
          .order('enviado_em', { ascending: false })
          .limit(10),
      ]);

      if (colabsResp.data) setColaboradores(colabsResp.data);
      if (histResp.data) setHistorico(histResp.data);
      if (tarResp.data) setTarefas(tarResp.data);
      if (upResp.data) setUploads(upResp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Calcula último status de cada colaborador (pega só a entrada mais recente)
  const ultimoStatusPorId: Record<string, HistoricoSimples> = {};
  historico.forEach((h) => {
    if (!ultimoStatusPorId[h.id_groot]) {
      ultimoStatusPorId[h.id_groot] = h;
    }
  });

  // Calcula streak de dias seguidos abaixo
  function calcularStreak(idGroot: string): number {
    const dias = historico
      .filter((h) => h.id_groot === idGroot)
      .sort(
        (a, b) =>
          new Date(b.data_referencia).getTime() -
          new Date(a.data_referencia).getTime()
      );

    let streak = 0;
    for (const dia of dias) {
      if (dia.status_meta === 'Abaixo') streak++;
      else break;
    }
    return streak;
  }

  // Monta listas de monitoramento
  const monitor = {
    ofensores: [] as MonitorItem[],
    alinhados: [] as MonitorItem[],
    superas: [] as MonitorItem[],
  };

  colaboradores.forEach((c) => {
    const ultimo = ultimoStatusPorId[c.id_groot];
    if (!ultimo) return;
    if (c.status !== 'Ativo') return;

    const item: MonitorItem = {
      idGroot: c.id_groot,
      id: c.id,
      nome: c.nome,
      processo: c.processo || '-',
      ultimoStatus: ultimo.status_meta,
      ultimaLiquida: ultimo.prod_liquida,
      ultimoImpacto: ultimo.impacto_net,
      diasAbaixo: calcularStreak(c.id_groot),
    };

    if (ultimo.status_meta === 'Abaixo') monitor.ofensores.push(item);
    else if (ultimo.status_meta === 'Alinhado') monitor.alinhados.push(item);
    else if (ultimo.status_meta === 'Supera') monitor.superas.push(item);
  });

  // Ordena por relevância
  monitor.ofensores.sort((a, b) => b.diasAbaixo - a.diasAbaixo);
  monitor.alinhados.sort((a, b) => b.ultimoImpacto - a.ultimoImpacto);
  monitor.superas.sort((a, b) => b.ultimoImpacto - a.ultimoImpacto);

  // Gera alertas
  const hoje = new Date();
  const hojeStr = hoje.toISOString().split('T')[0];

  const alertas: Alerta[] = [];

  // Aniversários hoje
  const aniversariantes = colaboradores.filter((c) => {
    if (!c.aniversario) return false;
    const aniv = new Date(c.aniversario);
    return (
      aniv.getMonth() === hoje.getMonth() && aniv.getDate() === hoje.getDate()
    );
  });

  if (aniversariantes.length > 0) {
    alertas.push({
      nivel: 'medio',
      icone: '🎂',
      texto: `Hoje tem ${aniversariantes.length} aniversário(s): ${aniversariantes
        .map((a) => a.nome.split(' ')[0])
        .join(', ')}`,
    });
  }

  // Aniversários próximos (próximos 7 dias)
  const aniversariosProximos = colaboradores.filter((c) => {
    if (!c.aniversario) return false;
    const aniv = new Date(c.aniversario);
    const proximo = new Date(
      hoje.getFullYear(),
      aniv.getMonth(),
      aniv.getDate()
    );
    if (proximo < hoje) proximo.setFullYear(hoje.getFullYear() + 1);
    const dias = Math.ceil(
      (proximo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    );
    return dias > 0 && dias <= 7;
  });

  if (aniversariosProximos.length > 0) {
    alertas.push({
      nivel: 'baixo',
      icone: '🎉',
      texto: `${aniversariosProximos.length} aniversário(s) nos próximos 7 dias`,
    });
  }

  // Verifica se tem upload de hoje
  const temUploadHoje = uploads.some(
    (u) =>
      u.data_referencia === hojeStr ||
      new Date(u.enviado_em).toISOString().split('T')[0] === hojeStr
  );

  if (!temUploadHoje && uploads.length > 0) {
    alertas.push({
      nivel: 'alto',
      icone: '📤',
      texto: 'Nenhum CSV foi enviado hoje. Mantenha os dados atualizados!',
    });
  }

  // Ofensores críticos (streak >= 3)
  const ofensoresCriticos = monitor.ofensores.filter((o) => o.diasAbaixo >= 3);
  if (ofensoresCriticos.length > 0) {
    alertas.push({
      nivel: 'alto',
      icone: '🚨',
      texto: `${ofensoresCriticos.length} colaborador(es) em sequência crítica (3+ dias abaixo)`,
    });
  }

  // Tarefas pendentes
  if (tarefas.length > 0) {
    alertas.push({
      nivel: 'medio',
      icone: '📋',
      texto: `${tarefas.length} tarefa(s) pendente(s) de feedback`,
    });
  }

  if (alertas.length === 0) {
    alertas.push({
      nivel: 'baixo',
      icone: '✅',
      texto: 'Operação estável. Tudo em ordem!',
    });
  }

  // ── GERAÇÃO DE TAREFAS AUTOMÁTICAS ──
  async function gerarTarefasAutomaticas() {
    setGerandoTarefas(true);
    setMensagem(null);

    try {
      const novasTarefas: Array<{
        id_tarefa: string;
        id_groot: string;
        nome: string;
        processo: string;
        tipo: string;
        motivo: string;
        status: string;
      }> = [];

      // Tarefas pra ofensores (streak >= 3)
      ofensoresCriticos.forEach((o) => {
        // Evita duplicar — só cria se ainda não tem tarefa pendente do mesmo tipo
        const jaExiste = tarefas.some(
          (t) =>
            t.id_groot === o.idGroot && t.tipo === 'Feedback Ofensor'
        );
        if (jaExiste) return;

        novasTarefas.push({
          id_tarefa: 'TASK-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          id_groot: o.idGroot,
          nome: o.nome,
          processo: o.processo,
          tipo: 'Feedback Ofensor',
          motivo: `${o.diasAbaixo} dia(s) seguido(s) abaixo da meta. Média ${o.ultimaLiquida} pç/h.`,
          status: 'Pendente',
        });
      });

      // Tarefas pra superas (impacto > 10%)
      monitor.superas.slice(0, 5).forEach((s) => {
        if (s.ultimoImpacto < 10) return;
        const jaExiste = tarefas.some(
          (t) =>
            t.id_groot === s.idGroot && t.tipo === 'Reconhecimento Supera'
        );
        if (jaExiste) return;

        novasTarefas.push({
          id_tarefa: 'TASK-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          id_groot: s.idGroot,
          nome: s.nome,
          processo: s.processo,
          tipo: 'Reconhecimento Supera',
          motivo: `Impacto NET +${s.ultimoImpacto.toFixed(1)}%. Top performance — reconhecer!`,
          status: 'Pendente',
        });
      });

      // Aniversários — tarefas
      aniversariantes.forEach((a) => {
        const jaExiste = tarefas.some(
          (t) => t.id_groot === a.id_groot && t.tipo === 'Aniversário'
        );
        if (jaExiste) return;

        novasTarefas.push({
          id_tarefa: 'TASK-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          id_groot: a.id_groot,
          nome: a.nome,
          processo: a.processo || '-',
          tipo: 'Aniversário',
          motivo: 'Aniversário hoje! 🎂 Não esqueça de parabenizar.',
          status: 'Pendente',
        });
      });

      if (novasTarefas.length === 0) {
        setMensagem(
          'ℹ️ Nenhuma tarefa nova pra gerar. Tudo já tá em ordem ou as tarefas atuais cobrem os pontos críticos.'
        );
      } else {
        const { error } = await supabase.from('tarefas').insert(novasTarefas);
        if (error) {
          setMensagem('❌ Erro: ' + error.message);
        } else {
          setMensagem(`✅ ${novasTarefas.length} nova(s) tarefa(s) criada(s)!`);
          await carregarTudo();
        }
      }

      setTimeout(() => setMensagem(null), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setMensagem('❌ ' + msg);
    } finally {
      setGerandoTarefas(false);
    }
  }

  async function concluirTarefa(idTarefa: string) {
    const { error } = await supabase
      .from('tarefas')
      .update({ status: 'Concluída', concluido_em: new Date().toISOString() })
      .eq('id_tarefa', idTarefa);

    if (error) {
      alert('Erro: ' + error.message);
    } else {
      carregarTudo();
    }
  }

  async function excluirTarefa(idTarefa: string) {
    const confirma = window.confirm('Deseja excluir essa tarefa?');
    if (!confirma) return;

    const { error } = await supabase
      .from('tarefas')
      .delete()
      .eq('id_tarefa', idTarefa);

    if (error) {
      alert('Erro: ' + error.message);
    } else {
      carregarTudo();
    }
  }

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Carregando inteligência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            🤖 Copiloto <span className="text-[#FFD700]">IA</span>
          </h1>
          <p className="text-gray-400">
            Monitoramento operacional inteligente do MEU TIME
          </p>
        </div>

        <button
          onClick={gerarTarefasAutomaticas}
          disabled={gerandoTarefas}
          className="bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {gerandoTarefas ? '⏳ Analisando...' : '🔥 Gerar tarefas automáticas'}
        </button>
      </div>

      {/* Mensagem */}
      {mensagem && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
          <p className="text-blue-300 font-bold">{mensagem}</p>
        </div>
      )}

      {/* ALERTAS INTELIGENTES */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#FFD700] mb-4 flex items-center gap-2">
          📢 Alertas Inteligentes
        </h2>

        <div className="space-y-2">
          {alertas.map((alerta, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                alerta.nivel === 'alto'
                  ? 'bg-red-500/10 border-red-500/30'
                  : alerta.nivel === 'medio'
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-green-500/10 border-green-500/30'
              }`}
            >
              <span className="text-2xl">{alerta.icone}</span>
              <p
                className={`text-sm font-bold ${
                  alerta.nivel === 'alto'
                    ? 'text-red-300'
                    : alerta.nivel === 'medio'
                    ? 'text-yellow-300'
                    : 'text-green-300'
                }`}
              >
                {alerta.texto}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* MONITORAMENTO OPERACIONAL */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          📊 Monitoramento Operacional
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Ofensores */}
          <div className="bg-red-500/5 border border-red-500/30 rounded-2xl overflow-hidden">
            <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-red-300">🚨 Ofensores</h3>
                <span className="text-2xl font-black text-red-300">
                  {monitor.ofensores.length}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {monitor.ofensores.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-6">
                  Nenhum ofensor 🎉
                </p>
              ) : (
                monitor.ofensores.map((o) => (
                  <Link
                    key={o.idGroot}
                    href={`/meu-time/${o.id}`}
                    className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-red-500/30 rounded-lg p-3 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center text-red-300 font-bold text-xs">
                        {iniciais(o.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {o.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.processo} • {o.ultimaLiquida} pç/h
                        </p>
                      </div>
                      {o.diasAbaixo >= 3 && (
                        <span className="text-xs px-2 py-0.5 bg-red-500/30 text-red-300 rounded-full font-bold">
                          {o.diasAbaixo}d
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Alinhados */}
          <div className="bg-blue-500/5 border border-blue-500/30 rounded-2xl overflow-hidden">
            <div className="bg-blue-500/20 px-4 py-3 border-b border-blue-500/30">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-blue-300">✓ Alinhados</h3>
                <span className="text-2xl font-black text-blue-300">
                  {monitor.alinhados.length}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {monitor.alinhados.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-6">
                  Sem dados ainda
                </p>
              ) : (
                monitor.alinhados.map((a) => (
                  <Link
                    key={a.idGroot}
                    href={`/meu-time/${a.id}`}
                    className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-blue-500/30 rounded-lg p-3 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">
                        {iniciais(a.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {a.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {a.processo} • {a.ultimaLiquida} pç/h
                        </p>
                      </div>
                      <span
                        className={`text-xs font-mono font-bold ${
                          a.ultimoImpacto > 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {a.ultimoImpacto > 0 ? '+' : ''}
                        {a.ultimoImpacto.toFixed(1)}%
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Superas */}
          <div className="bg-green-500/5 border border-green-500/30 rounded-2xl overflow-hidden">
            <div className="bg-green-500/20 px-4 py-3 border-b border-green-500/30">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-green-300">🌟 Superas</h3>
                <span className="text-2xl font-black text-green-300">
                  {monitor.superas.length}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {monitor.superas.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-6">
                  Nenhum supera ainda
                </p>
              ) : (
                monitor.superas.map((s) => (
                  <Link
                    key={s.idGroot}
                    href={`/meu-time/${s.id}`}
                    className="block bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-green-500/30 rounded-lg p-3 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-500/30 flex items-center justify-center text-green-300 font-bold text-xs">
                        {iniciais(s.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {s.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {s.processo} • {s.ultimaLiquida} pç/h
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-green-400">
                        +{s.ultimoImpacto.toFixed(1)}%
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TAREFAS PENDENTES */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-[#FFD700] flex items-center gap-2">
            ✅ Tarefas Pendentes
          </h2>
          <span className="text-sm text-gray-400">
            {tarefas.length} tarefa(s)
          </span>
        </div>

        {tarefas.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">🎉</span>
            <h3 className="text-xl font-bold text-white mb-2">
              Sem tarefas pendentes
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Clica no botão amarelão acima pra gerar tarefas baseadas no
              monitoramento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tarefas.map((t) => (
              <div
                key={t.id_tarefa}
                className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          t.tipo === 'Feedback Ofensor'
                            ? 'bg-red-500/20 text-red-400'
                            : t.tipo === 'Reconhecimento Supera'
                            ? 'bg-green-500/20 text-green-400'
                            : t.tipo === 'Aniversário'
                            ? 'bg-pink-500/20 text-pink-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {t.tipo}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {t.nome}
                      </span>
                      {t.processo && (
                        <span className="text-xs text-gray-500">
                          • {t.processo}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300">{t.motivo}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Criada {tempoRelativo(t.criado_em)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/meu-time/${(colaboradores.find(c => c.id_groot === t.id_groot) || {} as Colaborador).id || ''}/feedbacks`}
                      className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded font-bold transition-colors"
                    >
                      💬 Dar feedback
                    </Link>
                    <button
                      onClick={() => concluirTarefa(t.id_tarefa)}
                      className="text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 px-3 py-1.5 rounded font-bold transition-colors"
                    >
                      ✓ Concluir
                    </button>
                    <button
                      onClick={() => excluirTarefa(t.id_tarefa)}
                      className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded font-bold transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info do que vai vir */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-4 text-sm">
        <p className="text-purple-300 font-bold mb-2">
          🔮 Próxima atualização do Copiloto:
        </p>
        <ul className="space-y-1 list-disc pl-5 text-purple-200 text-xs">
          <li>
            <strong>Integração com Claude API</strong> — análise inteligente de
            cada colaborador
          </li>
          <li>
            <strong>Sugestão de feedback escrito</strong> — Copiloto escreve um
            rascunho que você ajusta
          </li>
          <li>
            <strong>Perfil comportamental automático</strong> — análise do
            histórico + feedbacks
          </li>
          <li>
            <strong>Detecção de padrões</strong> — &ldquo;Falso Supera&rdquo;,
            tendências, anomalias
          </li>
        </ul>
      </div>
    </div>
  );
}

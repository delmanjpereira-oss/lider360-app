'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';

type Colaborador = {
  id: number;
  id_groot: string;
  nome: string;
  processo: string | null;
};

type Feedback = {
  id: number;
  feedback_id: string;
  id_groot: string;
  nome: string | null;
  processo: string | null;
  tipo: string;
  data_referencia: string | null;
  observacao: string;
  responsavel: string | null;
  classificacao: string;
  registrado_em: string;
};

const TIPOS_FEEDBACK = [
  { valor: 'Livre', icone: '✏️', cor: 'text-gray-300' },
  { valor: 'Reconhecimento', icone: '🏆', cor: 'text-green-400' },
  { valor: 'Alinhamento', icone: '🎯', cor: 'text-blue-400' },
  { valor: 'Acompanhamento', icone: '📊', cor: 'text-yellow-400' },
];

const CLASSIFICACOES = [
  { valor: 'Supera', icone: '🌟', bg: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { valor: 'Alinhado', icone: '✓', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { valor: 'Abaixo', icone: '⚠️', bg: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tempoRelativo(iso: string): string {
  const agora = new Date();
  const data = new Date(iso);
  const diff = Math.floor((agora.getTime() - data.getTime()) / 1000);

  if (diff < 60) return 'Agora mesmo';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return formatarDataHora(iso);
}

export default function FeedbacksPage() {
  const params = useParams();
  const id = params.id as string;

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Form
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [novoTipo, setNovoTipo] = useState('Livre');
  const [novaClassificacao, setNovaClassificacao] = useState('Alinhado');
  const [novaObservacao, setNovaObservacao] = useState('');
  const [novaData, setNovaData] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    try {
      setLoading(true);
      const { data: colab, error: errColab } = await supabase
        .from('colaboradores')
        .select('id, id_groot, nome, processo')
        .eq('id', parseInt(id))
        .single();

      if (errColab) {
        setErro(errColab.message);
        return;
      }

      setColaborador(colab);

      const { data: fbs, error: errFb } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('id_groot', colab.id_groot)
        .order('registrado_em', { ascending: false });

      if (errFb) {
        setErro(errFb.message);
      } else {
        setFeedbacks(fbs || []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  async function salvarFeedback() {
    if (!colaborador) return;
    if (!novaObservacao.trim()) {
      setErro('Escreve algo no feedback antes de salvar.');
      return;
    }

    setSalvando(true);
    setErro(null);
    setSucesso(null);

    try {
      const feedbackId =
        'FB-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const { error } = await supabase.from('feedbacks').insert({
        feedback_id: feedbackId,
        id_groot: colaborador.id_groot,
        nome: colaborador.nome,
        processo: colaborador.processo,
        tipo: novoTipo,
        data_referencia: novaData,
        observacao: novaObservacao.trim(),
        responsavel: 'delman.jpereira@mercadolivre.com',
        classificacao: novaClassificacao,
      });

      if (error) {
        setErro(error.message);
      } else {
        setSucesso('✅ Feedback registrado!');
        // Limpa form
        setNovaObservacao('');
        setNovoTipo('Livre');
        setNovaClassificacao('Alinhado');
        setNovaData(new Date().toISOString().split('T')[0]);
        setMostrarForm(false);
        // Recarrega lista
        await carregar();
        // Esconde mensagem depois de 3s
        setTimeout(() => setSucesso(null), 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirFeedback(feedbackId: string) {
    const confirma = window.confirm('Deseja excluir esse feedback?');
    if (!confirma) return;

    const { error } = await supabase
      .from('feedbacks')
      .delete()
      .eq('feedback_id', feedbackId);

    if (error) {
      alert('Erro: ' + error.message);
    } else {
      carregar();
    }
  }

  // Estatísticas
  const stats = {
    total: feedbacks.length,
    supera: feedbacks.filter((f) => f.classificacao === 'Supera').length,
    alinhado: feedbacks.filter((f) => f.classificacao === 'Alinhado').length,
    abaixo: feedbacks.filter((f) => f.classificacao === 'Abaixo').length,
  };

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">⏳</span>
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (erro && !colaborador) {
    return (
      <div className="space-y-6">
        <Link href="/meu-time" className="text-gray-400 hover:text-white">
          ← Voltar
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold">{erro}</p>
        </div>
      </div>
    );
  }

  if (!colaborador) return null;

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href={`/meu-time/${id}`}
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para {colaborador.nome}
      </Link>

      {/* Header */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-xl flex-shrink-0">
            {iniciais(colaborador.nome)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black mb-1">
              💬 Feedbacks
            </h1>
            <p className="text-gray-400">
              {colaborador.nome} • {colaborador.processo || 'Sem processo'}
            </p>
          </div>

          {!mostrarForm && (
            <button
              onClick={() => setMostrarForm(true)}
              className="bg-[#FFD700] text-black font-bold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
            >
              <span>+</span> Novo Feedback
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      {sucesso && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
          <p className="text-green-400 font-bold">{sucesso}</p>
        </div>
      )}

      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}

      {/* FORM DE NOVO FEEDBACK */}
      {mostrarForm && (
        <div className="bg-[#1a1a1a] border-2 border-[#FFD700]/50 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#FFD700]">
            ✏️ Registrar Feedback
          </h2>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Tipo
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TIPOS_FEEDBACK.map((t) => (
                <button
                  key={t.valor}
                  onClick={() => setNovoTipo(t.valor)}
                  className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                    novoTipo === t.valor
                      ? 'border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]'
                      : 'border-[#2a2a2a] bg-[#0a0a0a] text-gray-400 hover:border-[#FFD700]/50'
                  }`}
                >
                  <span className="text-xl block mb-1">{t.icone}</span>
                  {t.valor}
                </button>
              ))}
            </div>
          </div>

          {/* Classificação */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Classificação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CLASSIFICACOES.map((c) => (
                <button
                  key={c.valor}
                  onClick={() => setNovaClassificacao(c.valor)}
                  className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                    novaClassificacao === c.valor
                      ? c.bg
                      : 'border-[#2a2a2a] bg-[#0a0a0a] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <span className="text-xl block mb-1">{c.icone}</span>
                  {c.valor}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Data de referência
            </label>
            <input
              type="date"
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
              className="w-full md:w-auto bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none"
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">
              Observação <span className="text-red-400">*</span>
            </label>
            <textarea
              value={novaObservacao}
              onChange={(e) => setNovaObservacao(e.target.value)}
              rows={5}
              placeholder="Ex: Conversei sobre a importância de manter consistência. Ele se comprometeu a manter o ritmo nos próximos dias..."
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white focus:border-[#FFD700] focus:outline-none resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {novaObservacao.length} caracteres
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4 border-t border-[#2a2a2a]">
            <button
              onClick={salvarFeedback}
              disabled={salvando}
              className="flex-1 bg-[#FFD700] text-black font-bold py-3 rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50"
            >
              {salvando ? '💾 Salvando...' : '✅ Salvar Feedback'}
            </button>
            <button
              onClick={() => {
                setMostrarForm(false);
                setNovaObservacao('');
                setErro(null);
              }}
              className="px-6 py-3 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#3a3a3a] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ESTATÍSTICAS */}
      {feedbacks.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">💬</span>
              <span className="text-2xl font-black text-white">
                {stats.total}
              </span>
            </div>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">🌟</span>
              <span className="text-2xl font-black text-green-400">
                {stats.supera}
              </span>
            </div>
            <p className="text-xs text-gray-400">Supera</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">✓</span>
              <span className="text-2xl font-black text-blue-400">
                {stats.alinhado}
              </span>
            </div>
            <p className="text-xs text-gray-400">Alinhado</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl">⚠️</span>
              <span className="text-2xl font-black text-red-400">
                {stats.abaixo}
              </span>
            </div>
            <p className="text-xs text-gray-400">Abaixo</p>
          </div>
        </div>
      )}

      {/* LINHA DO TEMPO */}
      {feedbacks.length === 0 && !mostrarForm ? (
        <div className="bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Nenhum feedback ainda
          </h3>
          <p className="text-gray-400 mb-6">
            Registre seu primeiro feedback pra começar a construir o perfil
            comportamental do {colaborador.nome.split(' ')[0]}
          </p>
          <button
            onClick={() => setMostrarForm(true)}
            className="bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 transition-colors"
          >
            + Primeiro Feedback
          </button>
        </div>
      ) : feedbacks.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase">
            📅 Linha do tempo ({feedbacks.length})
          </h2>

          {feedbacks.map((fb) => {
            const tipo = TIPOS_FEEDBACK.find((t) => t.valor === fb.tipo);
            const classif = CLASSIFICACOES.find(
              (c) => c.valor === fb.classificacao
            );

            return (
              <div
                key={fb.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 hover:border-[#FFD700]/30 transition-all"
              >
                {/* Header do feedback */}
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl">
                      {tipo?.icone || '✏️'}
                    </span>
                    <div>
                      <p className={`font-bold ${tipo?.cor || 'text-white'}`}>
                        {fb.tipo}
                      </p>
                      <p className="text-xs text-gray-500">
                        {tempoRelativo(fb.registrado_em)} •{' '}
                        {formatarDataHora(fb.registrado_em)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {classif && (
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-bold border ${classif.bg}`}
                      >
                        {classif.icone} {classif.valor}
                      </span>
                    )}
                    <button
                      onClick={() => excluirFeedback(fb.feedback_id)}
                      className="text-red-400/40 hover:text-red-400 transition-colors text-sm p-1"
                      title="Excluir feedback"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Texto do feedback */}
                <p className="text-white whitespace-pre-wrap leading-relaxed">
                  {fb.observacao}
                </p>

                {/* Rodapé */}
                {fb.data_referencia && (
                  <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-[#2a2a2a]">
                    📅 Referente a:{' '}
                    {new Date(fb.data_referencia + 'T12:00:00').toLocaleDateString(
                      'pt-BR'
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

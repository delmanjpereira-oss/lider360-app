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

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatarData(data: string | null): string {
  if (!data) return 'Não informado';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function mesesEmpresa(dataAdmissao: string | null): string {
  if (!dataAdmissao) return 'Não informado';
  const inicio = new Date(dataAdmissao);
  const agora = new Date();
  const diffMs = agora.getTime() - inicio.getTime();
  const meses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;

  if (anos === 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  if (mesesRestantes === 0)
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${mesesRestantes} ${
    mesesRestantes === 1 ? 'mês' : 'meses'
  }`;
}

function diasParaAniversario(aniversario: string | null): string {
  if (!aniversario) return 'Não informado';
  const hoje = new Date();
  const data = new Date(aniversario);
  const proximo = new Date(
    hoje.getFullYear(),
    data.getMonth(),
    data.getDate()
  );

  if (proximo < hoje) {
    proximo.setFullYear(hoje.getFullYear() + 1);
  }

  const diff = Math.ceil(
    (proximo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff === 0) return '🎂 Hoje!';
  if (diff === 1) return 'Amanhã';
  return `Em ${diff} dias`;
}

export default function DetalheColaboradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscar() {
      try {
        const { data, error } = await supabase
          .from('colaboradores')
          .select('*')
          .eq('id', parseInt(id))
          .single();

        if (error) {
          setErro(error.message);
        } else {
          setColaborador(data);
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

  async function excluir() {
    if (!colaborador) return;
    const confirma = window.confirm(`Deseja excluir ${colaborador.nome}?`);
    if (!confirma) return;

    const { error } = await supabase
      .from('colaboradores')
      .delete()
      .eq('id', colaborador.id);

    if (error) {
      alert('Erro: ' + error.message);
    } else {
      router.push('/meu-time');
    }
  }

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
        <Link href="/meu-time" className="text-gray-400 hover:text-white">
          ← Voltar
        </Link>
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold">
            {erro || 'Colaborador não encontrado'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      {/* Header com avatar grande */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <div className="flex items-start gap-6 flex-wrap">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-3xl flex-shrink-0">
            {iniciais(colaborador.nome)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black text-white mb-2">
              {colaborador.nome}
            </h1>
            <p className="text-gray-400 mb-3">
              {colaborador.cargo || 'Sem cargo cadastrado'}
            </p>

            {/* Chips */}
            <div className="flex flex-wrap gap-2">
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold ${
                  colaborador.status === 'Ativo'
                    ? 'bg-green-500/20 text-green-400'
                    : colaborador.status === 'Afastado'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {colaborador.status}
              </span>
              {colaborador.processo && (
                <span className="text-xs px-3 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400">
                  {colaborador.processo}
                </span>
              )}
              {colaborador.carreira && (
                <span className="text-xs px-3 py-1 rounded-full font-bold bg-[#FFD700]/20 text-[#FFD700]">
                  {colaborador.carreira}
                </span>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex flex-col gap-2">
            <Link
              href={`/meu-time/${colaborador.id}/editar`}
              className="bg-[#FFD700] text-black font-bold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors text-sm"
            >
              ✏️ Editar
            </Link>
            <button
              onClick={excluir}
              className="bg-red-500/10 text-red-400 font-bold px-4 py-2 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
            >
              🗑️ Excluir
            </button>
          </div>
        </div>
      </div>

      {/* Grid de informações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dados cadastrais */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#FFD700] mb-4">
            📋 Dados Cadastrais
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">ID Groot</span>
              <span className="text-white font-mono">
                {colaborador.id_groot}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Nome</span>
              <span className="text-white">{colaborador.nome}</span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Cargo</span>
              <span className="text-white">
                {colaborador.cargo || 'Não informado'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Processo</span>
              <span className="text-white">
                {colaborador.processo || 'Não informado'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#2a2a2a] pb-2">
              <span className="text-gray-400">Status</span>
              <span className="text-white">{colaborador.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Carreira</span>
              <span className="text-[#FFD700] font-bold">
                {colaborador.carreira || 'Não informado'}
              </span>
            </div>
          </div>
        </div>

        {/* Datas importantes */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#FFD700] mb-4">
            📅 Datas Importantes
          </h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-gray-400 mb-1">Data de Admissão</p>
              <p className="text-white">
                {formatarData(colaborador.data_admissao)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {mesesEmpresa(colaborador.data_admissao)} na empresa
              </p>
            </div>
            <div className="pt-3 border-t border-[#2a2a2a]">
              <p className="text-gray-400 mb-1">Aniversário</p>
              <p className="text-white">
                {formatarData(colaborador.aniversario)}
              </p>
              <p className="text-xs text-pink-400 mt-1">
                🎂 {diasParaAniversario(colaborador.aniversario)}
              </p>
            </div>
            <div className="pt-3 border-t border-[#2a2a2a]">
              <p className="text-gray-400 mb-1">Cadastrado em</p>
              <p className="text-white">
                {formatarData(colaborador.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Seções "em breve" */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-2">📊</span>
          <h3 className="font-bold text-white mb-1">Histórico DPMO</h3>
          <p className="text-xs text-gray-500">Em breve</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-2">💬</span>
          <h3 className="font-bold text-white mb-1">Feedbacks</h3>
          <p className="text-xs text-gray-500">Em breve</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 text-center">
          <span className="text-4xl block mb-2">🏥</span>
          <h3 className="font-bold text-white mb-1">Atestados</h3>
          <p className="text-xs text-gray-500">Em breve</p>
        </div>
      </div>
    </div>
  );
}

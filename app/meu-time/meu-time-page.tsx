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
  carreira: string | null;
  data_admissao: string | null;
  aniversario: string | null;
};

export default function MeuTimePage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    buscarColaboradores();
  }, []);

  async function buscarColaboradores() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('colaboradores')
        .select('*')
        .order('nome');

      if (error) {
        setErro(error.message);
      } else {
        setColaboradores(data || []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  async function excluirColaborador(id: number, nome: string) {
    const confirma = window.confirm(`Deseja excluir ${nome}?`);
    if (!confirma) return;

    const { error } = await supabase
      .from('colaboradores')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Erro ao excluir: ' + error.message);
    } else {
      // Atualiza a lista
      buscarColaboradores();
    }
  }

  // Filtra colaboradores pela busca
  const colaboradoresFiltrados = colaboradores.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.id_groot.includes(busca) ||
      (c.cargo && c.cargo.toLowerCase().includes(busca.toLowerCase())) ||
      (c.processo && c.processo.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            MEU <span className="text-[#FFD700]">TIME</span>
          </h1>
          <p className="text-gray-400">{colaboradores.length} colaboradores</p>
        </div>

        <Link
          href="/meu-time/cadastrar"
          className="bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
        >
          <span>+</span> Novo Colaborador
        </Link>
      </div>

      {/* Busca */}
      {!loading && colaboradores.length > 0 && (
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por nome, ID, cargo ou processo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-3 pl-12 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            🔍
          </span>
          {busca && (
            <p className="text-sm text-gray-500 mt-2">
              {colaboradoresFiltrados.length} encontrados
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">⏳</span>
          <p className="text-gray-400">Carregando colaboradores...</p>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold mb-2">Erro ao carregar:</p>
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !erro && colaboradores.length === 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <h2 className="text-2xl font-bold text-white mb-2">
            Nenhum colaborador ainda
          </h2>
          <p className="text-gray-400 mb-6">
            Comece cadastrando o primeiro colaborador do seu time
          </p>
          <Link
            href="/meu-time/cadastrar"
            className="inline-block bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 transition-colors"
          >
            + Cadastrar Primeiro
          </Link>
        </div>
      )}

      {/* Lista de cards */}
      {!loading && colaboradoresFiltrados.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {colaboradoresFiltrados.map((c) => (
            <div
              key={c.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#FFD700] transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{c.nome}</h3>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    c.status === 'Ativo'
                      ? 'bg-green-500/20 text-green-400'
                      : c.status === 'Afastado'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {c.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                {c.cargo && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">💼</span>
                    <span className="text-gray-300">{c.cargo}</span>
                  </div>
                )}
                {c.processo && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">📦</span>
                    <span className="text-gray-300">{c.processo}</span>
                  </div>
                )}
                {c.carreira && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">🎯</span>
                    <span className="text-[#FFD700] font-bold">
                      {c.carreira}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[#2a2a2a]">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 text-xs">ID:</span>
                    <span className="text-gray-500 text-xs">{c.id_groot}</span>
                  </div>
                  <button
                    onClick={() => excluirColaborador(c.id, c.nome)}
                    className="text-red-400 text-xs opacity-0 group-hover:opacity-100 hover:underline transition-opacity"
                  >
                    🗑️ Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {!loading &&
        colaboradores.length > 0 &&
        colaboradoresFiltrados.length === 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
            <span className="text-6xl block mb-4">🔍</span>
            <p className="text-gray-400">
              Nenhum colaborador encontrado com {`"${busca}"`}
            </p>
          </div>
        )}
    </div>
  );
}

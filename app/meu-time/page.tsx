'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    async function buscarColaboradores() {
      try {
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

    buscarColaboradores();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-black mb-2">
          MEU <span className="text-[#FFD700]">TIME</span>
        </h1>
        <p className="text-gray-400">{colaboradores.length} colaboradores</p>
      </div>

      {loading && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">⏳</span>
          <p className="text-gray-400">Carregando colaboradores...</p>
        </div>
      )}

      {erro && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
          <p className="text-red-400 font-bold mb-2">Erro ao carregar:</p>
          <p className="text-red-300 text-sm">{erro}</p>
        </div>
      )}

      {!loading && !erro && colaboradores.length === 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4">📭</span>
          <p className="text-gray-400">Nenhum colaborador cadastrado ainda.</p>
        </div>
      )}

      {!loading && colaboradores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {colaboradores.map((c) => (
            <div
              key={c.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 hover:border-[#FFD700] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{c.nome}</h3>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    c.status === 'Ativo'
                      ? 'bg-green-500/20 text-green-400'
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
                    <span className="text-[#FFD700] font-bold">{c.carreira}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-[#2a2a2a]">
                  <span className="text-gray-600 text-xs">ID:</span>
                  <span className="text-gray-500 text-xs">{c.id_groot}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

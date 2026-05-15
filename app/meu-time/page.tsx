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

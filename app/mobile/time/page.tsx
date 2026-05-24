'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

type Colab = {
  id: number;
  id_groot: string;
  nome: string;
  cargo: string | null;
  processo: string | null;
  carreira: string | null;
};

export default function TimeMobilePage() {
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('colaboradores')
        .select('id, id_groot, nome, cargo, processo, carreira')
        .eq('status', 'Ativo')
        .order('nome');
      setColabs(data || []);
      setLoading(false);
    })();
  }, []);

  const filtrados = busca
    ? colabs.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : colabs;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-white">👥 Meu Time</h2>
        <p className="text-xs text-gray-400">{colabs.length} colab{colabs.length !== 1 ? 's' : ''} ativo{colabs.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Busca */}
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="🔎 Buscar..."
        className="w-full bg-[#1a1a1a] border-2 border-[#2a2a2a] focus:border-[#FFD700] rounded-xl px-4 py-3 text-white text-sm outline-none"
      />

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8">
          <span className="text-4xl block mb-2 animate-pulse">⏳</span>
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              href={`/meu-time/${c.id}`}
              className="block bg-[#1a1a1a] border border-[#2a2a2a] active:bg-[#222] rounded-xl p-3 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 font-black text-xs flex-shrink-0">
                  {c.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{c.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.processo && (
                      <span className="text-[10px] text-cyan-400 font-bold">{c.processo}</span>
                    )}
                    {c.carreira && (
                      <span className="text-[10px] text-gray-500">· {c.carreira}</span>
                    )}
                  </div>
                </div>
                <span className="text-gray-500 text-lg">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div className="text-center py-8">
          <span className="text-4xl block mb-2">🔍</span>
          <p className="text-gray-500 text-sm">Nenhum colab encontrado</p>
        </div>
      )}
    </div>
  );
}

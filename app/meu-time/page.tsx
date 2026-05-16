'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

const corCarreira: Record<string, string> = {
  'REP 1': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'REP 2': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'REP 3': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  MULTIPLICADOR: 'bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/30',
};

const corProcesso: Record<string, string> = {
  Checkin: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  P2M: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Sorting: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function isAniversarioHoje(aniversario: string | null): boolean {
  if (!aniversario) return false;
  const hoje = new Date();
  const data = new Date(aniversario);
  return hoje.getMonth() === data.getMonth() && hoje.getDate() === data.getDate();
}

export default function MeuTimePage() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [versao, setVersao] = useState(0); // ⭐ pra forçar refetch

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('*')
        .order('nome');
      if (error) {
        if (typeof window !== 'undefined' && window.showToast) {
          window.showToast('error', 'Erro: ' + error.message);
        }
      } else {
        setColaboradores(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  async function excluir(colab: Colaborador) {
    const ok = await window.showConfirm({
      title: 'Excluir colaborador',
      message: `Tem certeza que deseja excluir ${colab.nome}? Essa ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('colaboradores').delete().eq('id', colab.id);
    if (error) {
      window.showToast('error', 'Erro: ' + error.message);
    } else {
      window.showToast('success', `${colab.nome} foi removido com sucesso`);
      // 🎯 FORÇA REFETCH (corrige o bug)
      setVersao((v) => v + 1);
    }
  }

  const filtrados = colaboradores.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroProcesso !== 'todos' && c.processo !== filtroProcesso) return false;
    if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
    return true;
  });

  const stats = {
    total: colaboradores.length,
    ativos: colaboradores.filter((c) => c.status === 'Ativo').length,
    ferias: colaboradores.filter((c) => c.status === 'Férias').length,
    aniversariantes: colaboradores.filter((c) => isAniversarioHoje(c.aniversario)).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            👥 Meu <span className="text-[#FFD700]">Time</span>
          </h1>
          <p className="text-gray-400">
            {stats.total === 0
              ? 'Cadastre seus colaboradores pra começar'
              : `${stats.total} colaboradores cadastrados`}
          </p>
        </div>

        {/* Botões de ação rápida */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/meu-time/upload"
            title="Upload CSV de Produtividade"
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-blue-600/10 hover:from-blue-500/40 hover:to-blue-600/30 text-blue-300 rounded-xl transition-all text-2xl border border-blue-500/30 hover:border-blue-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/20 active:translate-y-0"
          >
            📤
          </Link>

          <Link
            href="/meu-time/dpmo"
            title="Upload DPMO"
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-purple-600/10 hover:from-purple-500/40 hover:to-purple-600/30 text-purple-300 rounded-xl transition-all text-2xl border border-purple-500/30 hover:border-purple-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/20 active:translate-y-0"
          >
            📊
          </Link>

          <Link
            href="/meu-time/importar"
            title="Importar colaboradores em massa (CSV)"
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-green-600/10 hover:from-green-500/40 hover:to-green-600/30 text-green-300 rounded-xl transition-all text-2xl border border-green-500/30 hover:border-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/20 active:translate-y-0"
          >
            📥
          </Link>

          <Link
            href="/meu-time/configuracoes"
            title="Configurações de Metas"
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] hover:from-[#3a3a3a] hover:to-[#2a2a2a] text-gray-400 hover:text-white rounded-xl transition-all text-2xl border border-[#3a3a3a] hover:border-[#FFD700] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
          >
            ⚙️
          </Link>

          <div className="w-px h-12 bg-[#2a2a2a] mx-1"></div>

          <Link
            href="/meu-time/cadastrar"
            className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-bold px-6 py-3 rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all flex items-center gap-2 shadow-lg shadow-yellow-500/30 hover:shadow-xl hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="text-xl">+</span> Novo
          </Link>
        </div>
      </div>

      {/* Estatísticas */}
      {!loading && colaboradores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50"
            style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">👥</span>
              <span className="text-3xl font-black text-white">{stats.total}</span>
            </div>
            <p className="text-xs text-gray-400">Total</p>
          </div>

          <div
            className="bg-gradient-to-br from-green-500/10 to-green-700/5 border border-green-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/20"
            style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✅</span>
              <span className="text-3xl font-black text-green-400">{stats.ativos}</span>
            </div>
            <p className="text-xs text-green-300">Ativos</p>
          </div>

          <div
            className="bg-gradient-to-br from-blue-500/10 to-blue-700/5 border border-blue-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/20"
            style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🌴</span>
              <span className="text-3xl font-black text-blue-400">{stats.ferias}</span>
            </div>
            <p className="text-xs text-blue-300">Em férias</p>
          </div>

          <div
            className="bg-gradient-to-br from-pink-500/10 to-pink-700/5 border border-pink-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-pink-500/20"
            style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🎂</span>
              <span className="text-3xl font-black text-pink-400">
                {stats.aniversariantes}
              </span>
            </div>
            <p className="text-xs text-pink-300">Aniversariantes hoje</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {!loading && colaboradores.length > 0 && (
        <div
          className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 flex items-center gap-3 flex-wrap"
          style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
        >
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔍 Buscar por nome..."
            className="flex-1 min-w-[200px] bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#FFD700] focus:outline-none transition-colors"
          />
          <select
            value={filtroProcesso}
            onChange={(e) => setFiltroProcesso(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#FFD700] focus:outline-none transition-colors"
          >
            <option value="todos">Todos os processos</option>
            <option value="Checkin">📦 Checkin</option>
            <option value="P2M">🚚 P2M</option>
            <option value="Sorting">📋 Sorting</option>
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#FFD700] focus:outline-none transition-colors"
          >
            <option value="todos">Todos os status</option>
            <option value="Ativo">Ativo</option>
            <option value="Férias">Férias</option>
            <option value="Afastado">Afastado</option>
            <option value="Inativo">Inativo</option>
          </select>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-12 text-center">
          <span className="text-6xl block mb-4 animate-pulse">⏳</span>
          <p className="text-gray-400">Carregando colaboradores...</p>
        </div>
      )}

      {/* Vazio total */}
      {!loading && colaboradores.length === 0 && (
        <div
          className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center"
          style={{ boxShadow: '0 15px 35px -10px rgba(0,0,0,0.5)' }}
        >
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Nenhum colaborador cadastrado
          </h3>
          <p className="text-gray-400 mb-6 text-sm">
            Comece adicionando seus colaboradores
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link
              href="/meu-time/cadastrar"
              className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-bold px-6 py-3 rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all shadow-lg shadow-yellow-500/30"
            >
              + Adicionar um por um
            </Link>
            <Link
              href="/meu-time/importar"
              className="bg-gradient-to-br from-green-500/30 to-green-600/20 text-green-300 font-bold px-6 py-3 rounded-xl hover:from-green-500/40 transition-all border border-green-500/30"
            >
              📥 Importar CSV
            </Link>
          </div>
        </div>
      )}

      {/* Sem resultados com filtro */}
      {!loading && colaboradores.length > 0 && filtrados.length === 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-3">🔍</span>
          <p className="text-gray-400">Nenhum colaborador encontrado com esses filtros</p>
        </div>
      )}

      {/* Grid de cards */}
      {!loading && filtrados.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => (
            <div
              key={c.id}
              className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-[#FFD700]/30 group"
              style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
            >
              <Link href={`/meu-time/${c.id}`} className="block">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-lg flex-shrink-0 shadow-lg shadow-yellow-500/30 group-hover:scale-105 transition-transform">
                    {iniciais(c.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-base truncate group-hover:text-[#FFD700] transition-colors">
                      {c.nome}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono">{c.id_groot}</p>
                    {c.cargo && (
                      <p className="text-xs text-gray-400 mt-0.5">{c.cargo}</p>
                    )}
                  </div>
                  {isAniversarioHoje(c.aniversario) && (
                    <span className="text-2xl animate-bounce" title="Aniversário hoje!">
                      🎂
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      c.status === 'Ativo'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : c.status === 'Férias'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.processo && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                        corProcesso[c.processo] ||
                        'bg-gray-500/20 text-gray-400 border-gray-500/30'
                      }`}
                    >
                      {c.processo}
                    </span>
                  )}
                  {c.carreira && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                        corCarreira[c.carreira] ||
                        'bg-gray-500/20 text-gray-400 border-gray-500/30'
                      }`}
                    >
                      {c.carreira}
                    </span>
                  )}
                </div>
              </Link>

              {/* Ações */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a2a2a]">
                <Link
                  href={`/meu-time/${c.id}/feedbacks`}
                  className="flex-1 text-center text-xs bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 font-bold py-2 rounded-lg transition-all active:scale-95"
                >
                  💬 Feedback
                </Link>
                <Link
                  href={`/meu-time/${c.id}/editar`}
                  className="flex-1 text-center text-xs bg-[#FFD700]/10 text-[#FFD700] hover:bg-[#FFD700]/20 font-bold py-2 rounded-lg transition-all active:scale-95"
                >
                  ✏️ Editar
                </Link>
                <button
                  onClick={() => excluir(c)}
                  className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 font-bold py-2 px-3 rounded-lg transition-all active:scale-95"
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

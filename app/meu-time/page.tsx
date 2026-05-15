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

const corCarreira: Record<string, string> = {
  REP1: 'bg-blue-500/20 text-blue-400',
  REP2: 'bg-purple-500/20 text-purple-400',
  REP3: 'bg-pink-500/20 text-pink-400',
  MULTIPLICADOR: 'bg-[#FFD700]/20 text-[#FFD700]',
};

const corProcesso: Record<string, string> = {
  Checkin: 'bg-cyan-500/20 text-cyan-400',
  P2M: 'bg-orange-500/20 text-orange-400',
  Sorting: 'bg-emerald-500/20 text-emerald-400',
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
  return (
    hoje.getMonth() === data.getMonth() && hoje.getDate() === data.getDate()
  );
}

function mesesEmpresa(dataAdmissao: string | null): number | null {
  if (!dataAdmissao) return null;
  const inicio = new Date(dataAdmissao);
  const agora = new Date();
  const diffMs = agora.getTime() - inicio.getTime();
  const meses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  return meses;
}

export default function MeuTimePage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState<string>('TODOS');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroCarreira, setFiltroCarreira] = useState<string>('TODOS');

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

    const { error } = await supabase.from('colaboradores').delete().eq('id', id);

    if (error) {
      alert('Erro ao excluir: ' + error.message);
    } else {
      buscarColaboradores();
    }
  }

  const colaboradoresFiltrados = colaboradores.filter((c) => {
    const matchBusca =
      busca === '' ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.id_groot.includes(busca) ||
      (c.cargo && c.cargo.toLowerCase().includes(busca.toLowerCase()));

    const matchProcesso =
      filtroProcesso === 'TODOS' || c.processo === filtroProcesso;
    const matchStatus = filtroStatus === 'TODOS' || c.status === filtroStatus;
    const matchCarreira =
      filtroCarreira === 'TODOS' || c.carreira === filtroCarreira;

    return matchBusca && matchProcesso && matchStatus && matchCarreira;
  });

  const stats = {
    total: colaboradores.length,
    ativos: colaboradores.filter((c) => c.status === 'Ativo').length,
    inativos: colaboradores.filter((c) => c.status === 'Inativo').length,
    afastados: colaboradores.filter((c) => c.status === 'Afastado').length,
    checkin: colaboradores.filter((c) => c.processo === 'Checkin').length,
    p2m: colaboradores.filter((c) => c.processo === 'P2M').length,
    sorting: colaboradores.filter((c) => c.processo === 'Sorting').length,
    aniversariantes: colaboradores.filter((c) => isAniversarioHoje(c.aniversario))
      .length,
  };

  function limparFiltros() {
    setBusca('');
    setFiltroProcesso('TODOS');
    setFiltroStatus('TODOS');
    setFiltroCarreira('TODOS');
  }

  const temFiltrosAtivos =
    busca !== '' ||
    filtroProcesso !== 'TODOS' ||
    filtroStatus !== 'TODOS' ||
    filtroCarreira !== 'TODOS';

  return (
    <div className="space-y-6">
      {/* Header com botões de ação */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            MEU <span className="text-[#FFD700]">TIME</span>
          </h1>
          <p className="text-gray-400">
            {colaboradores.length} colaboradores cadastrados
          </p>
        </div>

        {/* Botões de ação rápida */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Upload CSV — azul */}
          <Link
            href="/meu-time/upload"
            title="Upload CSV de Produtividade"
            className="w-12 h-12 flex items-center justify-center bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 hover:text-blue-300 rounded-lg transition-all text-2xl border border-blue-500/30 hover:border-blue-400"
          >
            📤
          </Link>

          {/* Upload DPMO — roxo (placeholder pro próximo bloco) */}
          <Link
            href="/meu-time/dpmo"
            title="Upload DPMO (em breve)"
            className="w-12 h-12 flex items-center justify-center bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 hover:text-purple-300 rounded-lg transition-all text-2xl border border-purple-500/30 hover:border-purple-400"
          >
            📊
          </Link>

          {/* Configurações de Metas — cinza */}
          <Link
            href="/meu-time/configuracoes"
            title="Configurações de Metas"
            className="w-12 h-12 flex items-center justify-center bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-400 hover:text-white rounded-lg transition-all text-2xl border border-[#3a3a3a] hover:border-[#FFD700]"
          >
            ⚙️
          </Link>

          {/* Separador visual */}
          <div className="w-px h-12 bg-[#2a2a2a] mx-1"></div>

          {/* Novo Colaborador — botão principal amarelo */}
          <Link
            href="/meu-time/cadastrar"
            className="bg-[#FFD700] text-black font-bold px-6 py-3 rounded-lg hover:bg-yellow-300 transition-colors flex items-center gap-2"
          >
            <span>+</span> Novo Colaborador
          </Link>
        </div>
      </div>

      {/* Estatísticas */}
      {!loading && colaboradores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">👥</span>
              <span className="text-3xl font-black text-white">
                {stats.total}
              </span>
            </div>
            <p className="text-xs text-gray-400">Total</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✅</span>
              <span className="text-3xl font-black text-green-400">
                {stats.ativos}
              </span>
            </div>
            <p className="text-xs text-gray-400">Ativos</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">⏸️</span>
              <span className="text-3xl font-black text-yellow-400">
                {stats.afastados}
              </span>
            </div>
            <p className="text-xs text-gray-400">Afastados</p>
          </div>

          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🎂</span>
              <span className="text-3xl font-black text-pink-400">
                {stats.aniversariantes}
              </span>
            </div>
            <p className="text-xs text-gray-400">Aniversariantes hoje</p>
          </div>
        </div>
      )}

      {/* Distribuição por processo */}
      {!loading && colaboradores.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
          <h3 className="text-sm font-bold text-gray-400 mb-4">
            DISTRIBUIÇÃO POR PROCESSO
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-black text-cyan-400">
                {stats.checkin}
              </div>
              <div className="text-xs text-gray-500 mt-1">Checkin</div>
            </div>
            <div className="text-center border-x border-[#2a2a2a]">
              <div className="text-3xl font-black text-orange-400">
                {stats.p2m}
              </div>
              <div className="text-xs text-gray-500 mt-1">P2M</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-400">
                {stats.sorting}
              </div>
              <div className="text-xs text-gray-500 mt-1">Sorting</div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {!loading && colaboradores.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por nome, ID ou cargo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-3 pl-12 text-white focus:border-[#FFD700] focus:outline-none transition-colors"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
              🔍
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={filtroProcesso}
              onChange={(e) => setFiltroProcesso(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white focus:border-[#FFD700] focus:outline-none"
            >
              <option value="TODOS">📦 Todos os Processos</option>
              <option value="Checkin">Checkin</option>
              <option value="P2M">P2M</option>
              <option value="Sorting">Sorting</option>
            </select>

            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white focus:border-[#FFD700] focus:outline-none"
            >
              <option value="TODOS">⚡ Todos os Status</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Afastado">Afastado</option>
            </select>

            <select
              value={filtroCarreira}
              onChange={(e) => setFiltroCarreira(e.target.value)}
              className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white focus:border-[#FFD700] focus:outline-none"
            >
              <option value="TODOS">🎯 Todas as Carreiras</option>
              <option value="REP1">REP1</option>
              <option value="REP2">REP2</option>
              <option value="REP3">REP3</option>
              <option value="MULTIPLICADOR">MULTIPLICADOR</option>
            </select>
          </div>

          {temFiltrosAtivos && (
            <div className="flex items-center justify-between pt-2 border-t border-[#2a2a2a]">
              <p className="text-sm text-gray-400">
                <span className="text-[#FFD700] font-bold">
                  {colaboradoresFiltrados.length}
                </span>{' '}
                de {colaboradores.length} encontrados
              </p>
              <button
                onClick={limparFiltros}
                className="text-sm text-gray-500 hover:text-white transition-colors"
              >
                ✕ Limpar filtros
              </button>
            </div>
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
          {colaboradoresFiltrados.map((c) => {
            const meses = mesesEmpresa(c.data_admissao);
            const aniversario = isAniversarioHoje(c.aniversario);

            return (
              <div
                key={c.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-5 hover:border-[#FFD700] transition-all group cursor-pointer"
              >
                <Link href={`/meu-time/${c.id}`} className="block">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-lg flex-shrink-0">
                      {iniciais(c.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white truncate">
                        {c.nome}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">
                        {c.cargo || 'Sem cargo'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        c.status === 'Ativo'
                          ? 'bg-green-500/20 text-green-400'
                          : c.status === 'Afastado'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {c.status}
                    </span>

                    {c.processo && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          corProcesso[c.processo] ||
                          'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {c.processo}
                      </span>
                    )}

                    {c.carreira && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          corCarreira[c.carreira] ||
                          'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {c.carreira}
                      </span>
                    )}

                    {aniversario && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-pink-500/20 text-pink-400 animate-pulse">
                        🎂 Aniversário!
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-[#2a2a2a]">
                    <span>ID: {c.id_groot}</span>
                    {meses !== null && <span>{meses}m na empresa</span>}
                  </div>
                </Link>

                <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/meu-time/${c.id}/editar`}
                    className="flex-1 text-center text-xs py-1.5 bg-[#2a2a2a] text-white rounded hover:bg-[#3a3a3a] transition-colors"
                  >
                    ✏️ Editar
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      excluirColaborador(c.id, c.nome);
                    }}
                    className="flex-1 text-xs py-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                  >
                    🗑️ Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {!loading &&
        colaboradores.length > 0 &&
        colaboradoresFiltrados.length === 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-12 text-center">
            <span className="text-6xl block mb-4">🔍</span>
            <p className="text-gray-400 mb-4">
              Nenhum colaborador encontrado com esses filtros
            </p>
            <button
              onClick={limparFiltros}
              className="bg-[#FFD700] text-black font-bold px-6 py-2 rounded-lg hover:bg-yellow-300 transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        )}
    </div>
  );
}

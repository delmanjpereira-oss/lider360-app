'use client';

import { useEffect, useState, useCallback } from 'react';
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
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroProcesso, setFiltroProcesso] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [versao, setVersao] = useState(0);

  // 🎯 MODO EDIÇÃO em massa
  const [modoEdicao, setModoEdicao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [novoProcesso, setNovoProcesso] = useState('');
  const [novoStatus, setNovoStatus] = useState('');
  const [novaCarreira, setNovaCarreira] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [confirmacaoExcluir, setConfirmacaoExcluir] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const inicio = performance.now();
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('id, id_groot, nome, cargo, processo, status, carreira, data_admissao, aniversario')
        .order('nome');
      
      const tempo = Math.round(performance.now() - inicio);
      
      if (error) {
        console.error(`❌ Erro ao carregar colaboradores (${tempo}ms):`, error);
        alert('Erro: ' + error.message);
      } else {
        console.log(`✅ ${data?.length || 0} colaboradores carregados em ${tempo}ms`);
        setColaboradores(data || []);
      }
    } catch (e: any) {
      console.error('Exceção:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

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

  // ============================================
  // 🎯 FUNÇÕES DO MODO EDIÇÃO
  // ============================================
  function ativarEdicao() {
    setModoEdicao(true);
    setSelecionados(new Set());
  }

  function sairEdicao() {
    setModoEdicao(false);
    setSelecionados(new Set());
    setNovoProcesso('');
    setNovoStatus('');
    setNovaCarreira('');
  }

  function toggleSelecao(id: number) {
    const nova = new Set(selecionados);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    setSelecionados(nova);
  }

  function toggleSelecionarTodos() {
    if (selecionados.size === filtrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(filtrados.map(c => c.id)));
    }
  }

  async function aplicarMudancaProcesso() {
    if (!novoProcesso || selecionados.size === 0) return;
    setAplicando(true);
    const ids = Array.from(selecionados);
    const { error } = await supabase
      .from('colaboradores')
      .update({ processo: novoProcesso })
      .in('id', ids);
    
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ ${ids.length} colab(s) mudado(s) pra ${novoProcesso}`);
      }
      setNovoProcesso('');
      setVersao(v => v + 1);
    }
    setAplicando(false);
  }

  async function aplicarMudancaStatus() {
    if (!novoStatus || selecionados.size === 0) return;
    setAplicando(true);
    const ids = Array.from(selecionados);
    const { error } = await supabase
      .from('colaboradores')
      .update({ status: novoStatus })
      .in('id', ids);
    
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ Status de ${ids.length} colab(s) alterado pra ${novoStatus}`);
      }
      setNovoStatus('');
      setVersao(v => v + 1);
    }
    setAplicando(false);
  }

  async function aplicarMudancaCarreira() {
    if (!novaCarreira || selecionados.size === 0) return;
    setAplicando(true);
    const ids = Array.from(selecionados);
    const { error } = await supabase
      .from('colaboradores')
      .update({ carreira: novaCarreira })
      .in('id', ids);
    
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `✅ Carreira de ${ids.length} colab(s) alterada pra ${novaCarreira}`);
      }
      setNovaCarreira('');
      setVersao(v => v + 1);
    }
    setAplicando(false);
  }

  async function excluirSelecionados() {
    setAplicando(true);
    const ids = Array.from(selecionados);
    const { error } = await supabase
      .from('colaboradores')
      .delete()
      .in('id', ids);
    
    if (error) {
      alert('Erro: ' + error.message);
    } else {
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('success', `🗑️ ${ids.length} colab(s) excluído(s)`);
      }
      setVersao(v => v + 1);
      setSelecionados(new Set());
    }
    setConfirmacaoExcluir(false);
    setAplicando(false);
  }

  const todosSelecionados = filtrados.length > 0 && selecionados.size === filtrados.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2">
            👥 Meu <span className="text-[#FFD700]">Time</span>
          </h1>
        </div>

        {/* Botões de ação rápida */}
        <div className="flex items-center gap-2 flex-wrap">
          {!modoEdicao ? (
            <>
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
                href="/meu-time/ocupacao"
                title="Upload Ocupação P2M"
                className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 hover:from-emerald-500/40 hover:to-emerald-600/30 text-emerald-300 rounded-xl transition-all text-2xl border border-emerald-500/30 hover:border-emerald-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/20 active:translate-y-0"
              >
                📦
              </Link>

              <Link
                href="/meu-time/importar"
                title="Importar colaboradores em massa (CSV)"
                className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-green-600/10 hover:from-green-500/40 hover:to-green-600/30 text-green-300 rounded-xl transition-all text-2xl border border-green-500/30 hover:border-green-400 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/20 active:translate-y-0"
              >
                📥
              </Link>

              <Link
                href="/configuracoes-app"
                title="Configurações do Banco"
                className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] hover:from-[#3a3a3a] hover:to-[#2a2a2a] text-gray-400 hover:text-white rounded-xl transition-all text-2xl border border-[#3a3a3a] hover:border-[#FFD700] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
              >
                ⚙️
              </Link>

              <div className="w-px h-12 bg-[#2a2a2a] mx-1"></div>

              {/* 🎯 BOTÃO EDITAR EM MASSA */}
              <button
                onClick={ativarEdicao}
                disabled={colaboradores.length === 0}
                className="bg-gradient-to-br from-purple-500/20 to-pink-500/10 hover:from-purple-500/40 hover:to-pink-500/20 border border-purple-500/30 hover:border-purple-400 text-purple-300 font-bold px-5 py-3 rounded-xl transition-all flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Editar/excluir vários de uma vez"
              >
                <span className="text-xl">✏️</span> Editar
              </button>

              <Link
                href="/meu-time/cadastrar"
                className="bg-gradient-to-br from-[#FFD700] to-yellow-500 text-black font-bold px-6 py-3 rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all flex items-center gap-2 shadow-lg shadow-yellow-500/30 hover:shadow-xl hover:shadow-yellow-500/40 hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="text-xl">+</span> Novo
              </Link>
            </>
          ) : (
            <button
              onClick={sairEdicao}
              className="bg-gradient-to-br from-green-500 to-emerald-600 text-white font-bold px-6 py-3 rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all flex items-center gap-2 shadow-lg shadow-green-500/30"
            >
              <span className="text-xl">✅</span> Concluído
            </button>
          )}
        </div>
      </div>

      {/* Estatísticas - só no modo normal */}
      {!modoEdicao && !loading && colaboradores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">👥</span>
              <span className="text-3xl font-black text-white">{stats.total}</span>
            </div>
            <p className="text-xs text-gray-400">Total</p>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-green-700/5 border border-green-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/20" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✅</span>
              <span className="text-3xl font-black text-green-400">{stats.ativos}</span>
            </div>
            <p className="text-xs text-green-300">Ativos</p>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-blue-700/5 border border-blue-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/20" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">🌴</span>
              <span className="text-3xl font-black text-blue-400">{stats.ferias}</span>
            </div>
            <p className="text-xs text-blue-300">Em férias</p>
          </div>

          <div className="bg-gradient-to-br from-pink-500/10 to-pink-700/5 border border-pink-500/30 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-pink-500/20" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
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

      {/* 🎯 BARRA DE EDIÇÃO EM MASSA */}
      {modoEdicao && (
        <div className="sticky top-4 z-30 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-purple-500/10 border-2 border-purple-500/40 rounded-2xl p-5 shadow-2xl shadow-purple-500/20 backdrop-blur-sm space-y-4">
          {/* Linha 1: seletor + contador */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleSelecionarTodos}
              className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm transition-all"
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                todosSelecionados ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
              }`}>
                {todosSelecionados && <span className="text-white font-black text-xs">✓</span>}
              </span>
              <span className="text-white font-bold">
                {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
              </span>
              <span className="text-gray-500 text-xs">({filtrados.length})</span>
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-purple-300">
                {selecionados.size === 0 ? (
                  <span className="text-gray-400">Selecione colaboradores pra ver as ações</span>
                ) : (
                  <>
                    ✏️ <span className="text-white">{selecionados.size}</span> selecionado{selecionados.size > 1 ? 's' : ''}
                  </>
                )}
              </p>
            </div>

            {selecionados.size > 0 && (
              <button
                onClick={() => setSelecionados(new Set())}
                className="text-sm text-gray-400 hover:text-white"
              >
                ✕ Limpar seleção
              </button>
            )}
          </div>

          {/* Linha 2: ações - aparece quando tem alguém selecionado */}
          {selecionados.size > 0 && (
            <div className="space-y-3 pt-3 border-t border-purple-500/20">
              {/* Mudar processo */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-bold uppercase w-24">Processo:</span>
                <select
                  value={novoProcesso}
                  onChange={(e) => setNovoProcesso(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-purple-400 rounded-lg px-3 py-2 text-white text-sm outline-none transition-colors min-w-[140px]"
                >
                  <option value="">Escolher...</option>
                  <option value="Checkin">📦 Checkin</option>
                  <option value="P2M">🚚 P2M</option>
                  <option value="Sorting">📋 Sorting</option>
                </select>
                <button
                  onClick={aplicarMudancaProcesso}
                  disabled={!novoProcesso || aplicando}
                  className="bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>

              {/* Mudar status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-bold uppercase w-24">Status:</span>
                <select
                  value={novoStatus}
                  onChange={(e) => setNovoStatus(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-purple-400 rounded-lg px-3 py-2 text-white text-sm outline-none transition-colors min-w-[140px]"
                >
                  <option value="">Escolher...</option>
                  <option value="Ativo">✅ Ativo</option>
                  <option value="Férias">🌴 Férias</option>
                  <option value="Afastado">🏥 Afastado</option>
                  <option value="Inativo">🚪 Inativo</option>
                </select>
                <button
                  onClick={aplicarMudancaStatus}
                  disabled={!novoStatus || aplicando}
                  className="bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>

              {/* Mudar carreira */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 font-bold uppercase w-24">Carreira:</span>
                <select
                  value={novaCarreira}
                  onChange={(e) => setNovaCarreira(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] focus:border-purple-400 rounded-lg px-3 py-2 text-white text-sm outline-none transition-colors min-w-[140px]"
                >
                  <option value="">Escolher...</option>
                  <option value="REP 1">REP 1</option>
                  <option value="REP 2">REP 2</option>
                  <option value="REP 3">REP 3</option>
                  <option value="MULTIPLICADOR">MULTIPLICADOR</option>
                </select>
                <button
                  onClick={aplicarMudancaCarreira}
                  disabled={!novaCarreira || aplicando}
                  className="bg-gradient-to-br from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-bold px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>

              {/* Excluir em massa */}
              <div className="flex items-center justify-end pt-2 border-t border-purple-500/10">
                <button
                  onClick={() => setConfirmacaoExcluir(true)}
                  disabled={aplicando}
                  className="bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  🗑️ Excluir {selecionados.size}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      {!loading && colaboradores.length > 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-4 flex items-center gap-3 flex-wrap" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}>
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
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border-2 border-dashed border-[#2a2a2a] rounded-2xl p-12 text-center" style={{ boxShadow: '0 15px 35px -10px rgba(0,0,0,0.5)' }}>
          <span className="text-6xl block mb-4">📭</span>
          <h3 className="text-xl font-bold text-white mb-2">
            Nenhum colaborador cadastrado
          </h3>
          <div className="flex justify-center gap-3 flex-wrap mt-6">
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

      {/* Sem resultados */}
      {!loading && colaboradores.length > 0 && filtrados.length === 0 && (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-3">🔍</span>
          <p className="text-gray-400">Nenhum colaborador encontrado com esses filtros</p>
        </div>
      )}

      {/* Grid de cards */}
      {!loading && filtrados.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => {
            const selecionado = selecionados.has(c.id);
            return (
              <div
                key={c.id}
                className={`bg-gradient-to-br from-[#1a1a1a] to-[#141414] border rounded-2xl p-5 transition-all group ${
                  modoEdicao
                    ? selecionado
                      ? 'border-purple-500/60 ring-2 ring-purple-500/40 cursor-pointer'
                      : 'border-[#2a2a2a] hover:border-purple-500/30 cursor-pointer'
                    : 'border-[#2a2a2a] hover:-translate-y-1 hover:border-[#FFD700]/30'
                }`}
                style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)' }}
                onClick={modoEdicao ? () => toggleSelecao(c.id) : undefined}
              >
                {/* CONTEÚDO */}
                {modoEdicao ? (
                  /* MODO EDIÇÃO: sem Link, com checkbox */
                  <div>
                    <div className="flex items-start gap-3 mb-4">
                      <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 mt-2 ${
                        selecionado ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                      }`}>
                        {selecionado && <span className="text-white font-black">✓</span>}
                      </span>
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-lg flex-shrink-0 shadow-lg shadow-yellow-500/30">
                        {iniciais(c.nome)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-base truncate">
                          {c.nome}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{c.id_groot}</p>
                        {c.cargo && (
                          <p className="text-xs text-gray-400 mt-0.5">{c.cargo}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        c.status === 'Ativo'
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                          : c.status === 'Férias'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {c.status}
                      </span>
                      {c.processo && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corProcesso[c.processo] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {c.processo}
                        </span>
                      )}
                      {c.carreira && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corCarreira[c.carreira] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {c.carreira}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* MODO NORMAL: link + ações Feedback/Análise */
                  <>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          c.status === 'Ativo'
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : c.status === 'Férias'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {c.status}
                        </span>
                        {c.processo && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corProcesso[c.processo] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                            {c.processo}
                          </span>
                        )}
                        {c.carreira && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${corCarreira[c.carreira] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                            {c.carreira}
                          </span>
                        )}
                      </div>
                    </Link>

                    {/* Ações - SÓ Feedback e Análise agora */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a2a2a]">
                      <Link
                        href={`/meu-time/${c.id}/feedbacks`}
                        className="flex-1 text-center text-xs bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 font-bold py-2 rounded-lg transition-all active:scale-95"
                      >
                        💬 Feedback
                      </Link>
                      <Link
                        href={`/meu-time/${c.id}/analise`}
                        className="flex-1 text-center text-xs bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 font-bold py-2 rounded-lg transition-all active:scale-95"
                        title="Análise Comportamental"
                      >
                        🧠 Análise
                      </Link>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 🎯 MODAL CONFIRMAÇÃO EXCLUSÃO EM MASSA */}
      {confirmacaoExcluir && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !aplicando && setConfirmacaoExcluir(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border-2 border-red-500/40 rounded-3xl max-w-md w-full p-8 shadow-2xl shadow-red-500/20"
          >
            <div className="text-center mb-6">
              <span className="text-6xl block mb-3">🗑️</span>
              <h2 className="text-2xl font-black text-white mb-2">
                Excluir {selecionados.size} colaborador{selecionados.size > 1 ? 'es' : ''}?
              </h2>
              <p className="text-sm text-gray-400">
                Essa ação <strong className="text-red-400">não pode ser desfeita</strong>.
                Todos os dados desses colaboradores serão removidos.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmacaoExcluir(false)}
                disabled={aplicando}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={excluirSelecionados}
                disabled={aplicando}
                className="flex-1 bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white font-black py-3 rounded-xl shadow-lg shadow-red-500/30 transition-all disabled:opacity-50"
              >
                {aplicando ? '⏳ Excluindo...' : '🗑️ Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

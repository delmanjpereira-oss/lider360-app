'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import ApolloBadge from '../components/ApolloBadge';

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
  'REP 1': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'REP 2': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'REP 3': 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  MULTIPLICADOR: 'bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/30',
};

const corProcesso: Record<string, string> = {
  Checkin: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  P2M: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  Sorting: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
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
  const [filtroStatus, setFiltroStatus] = useState('Ativo');

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('colaboradores')
      .select('*')
      .order('nome');
    if (data) setColaboradores(data as Colaborador[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // 🎯 Filtros
  const filtrados = colaboradores.filter((c) => {
    if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
    if (filtroProcesso !== 'todos' && c.processo !== filtroProcesso) return false;
    if (busca) {
      const termo = busca.toLowerCase().trim();
      if (!c.nome.toLowerCase().includes(termo) && !String(c.id_groot).includes(termo)) return false;
    }
    return true;
  });

  // 📊 Stats
  const totalAtivos = colaboradores.filter((c) => c.status === 'Ativo').length;
  const totalCheckin = colaboradores.filter((c) => c.status === 'Ativo' && c.processo === 'Checkin').length;
  const totalP2M = colaboradores.filter((c) => c.status === 'Ativo' && c.processo === 'P2M').length;
  const aniversariantes = colaboradores.filter((c) => isAniversarioHoje(c.aniversario)).length;

  // 🤖 Apollo - análise contextual
  const apolloMsg = (() => {
    if (loading) return null;
    if (aniversariantes > 0) {
      return {
        mood: 'warning' as const,
        message: `${aniversariantes} aniversariante${aniversariantes > 1 ? 's' : ''} hoje!`,
        detail: 'Não esqueça de parabenizar seu time',
      };
    }
    if (totalAtivos === 0) {
      return {
        mood: 'alert' as const,
        message: 'Nenhum colaborador ativo',
        detail: 'Comece importando seu time',
        action: { label: 'Importar', href: '/meu-time/importar' },
      };
    }
    return {
      mood: 'info' as const,
      message: `${totalAtivos} colaboradores ativos`,
      detail: `${totalCheckin} Checkin · ${totalP2M} P2M`,
    };
  })();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* HEADER */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
            <div>
              <Link href="/configuracoes-app" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                ← Voltar
              </Link>
              <h1 className="text-3xl md:text-4xl font-black mt-2">
                Meu Time
              </h1>
              <p className="text-sm text-gray-500 mt-1">Gestão de colaboradores e dados</p>
            </div>

            {/* Ações primárias */}
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/meu-time/dpmo"
                className="bg-[#FFD700] hover:bg-yellow-400 text-black font-bold py-2.5 px-5 rounded-lg text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#FFD700]/20 flex items-center gap-2"
              >
                📸 Subir Print
              </Link>
              <Link
                href="/meu-time/importar"
                className="bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-bold py-2.5 px-5 rounded-lg text-sm transition-all flex items-center gap-2"
              >
                📥 Importar Time
              </Link>
            </div>
          </div>
        </div>

        {/* APOLLO BADGE */}
        {apolloMsg && (
          <ApolloBadge
            mood={apolloMsg.mood}
            message={apolloMsg.message}
            detail={apolloMsg.detail}
            action={apolloMsg.action}
          />
        )}

        {/* STATUS CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatusCard label="Ativos" valor={totalAtivos} accent="text-white" />
          <StatusCard label="Checkin" valor={totalCheckin} accent="text-cyan-300" />
          <StatusCard label="P2M" valor={totalP2M} accent="text-orange-300" />
          <StatusCard label="Filtrados" valor={filtrados.length} accent="text-[#FFD700]" />
        </div>

        {/* FILTROS */}
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block font-semibold">Buscar</label>
              <input
                type="text"
                placeholder="Nome ou ID..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700]/50 rounded-lg px-3 py-2 text-sm text-white transition-all outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block font-semibold">Processo</label>
              <select
                value={filtroProcesso}
                onChange={(e) => setFiltroProcesso(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700]/50 rounded-lg px-3 py-2 text-sm text-white transition-all outline-none"
              >
                <option value="todos">Todos os processos</option>
                <option value="Checkin">Checkin</option>
                <option value="P2M">P2M</option>
                <option value="Sorting">Sorting</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block font-semibold">Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#FFD700]/50 rounded-lg px-3 py-2 text-sm text-white transition-all outline-none"
              >
                <option value="todos">Todos</option>
                <option value="Ativo">Ativos</option>
                <option value="Inativo">Inativos</option>
                <option value="Afastado">Afastados</option>
              </select>
            </div>
          </div>
        </div>

        {/* AÇÕES SECUNDÁRIAS (Upload, Ocupação) - barra horizontal discreta */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <SecondaryAction icon="📤" label="Upload CSV" href="/meu-time/upload" />
          <SecondaryAction icon="📦" label="Ocupação P2M" href="/meu-time/ocupacao" />
          <SecondaryAction icon="➕" label="Adicionar Colab" href="/meu-time/novo" />
        </div>

        {/* LISTA DE COLABS */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Carregando colaboradores...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            Nenhum colaborador encontrado{busca && ` com "${busca}"`}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map((c) => {
              const aniversario = isAniversarioHoje(c.aniversario);
              return (
                <Link
                  key={c.id}
                  href={`/meu-time/${c.id}`}
                  className="bg-[#141414] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-xl p-4 transition-all hover:-translate-y-0.5 group relative"
                >
                  {aniversario && (
                    <span className="absolute -top-2 -right-2 bg-[#FFD700] text-black text-xs font-black px-2 py-1 rounded-full shadow-lg shadow-[#FFD700]/20">
                      🎉 BDay
                    </span>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border border-[#2a2a2a] group-hover:border-[#FFD700]/30 transition-all">
                      {iniciais(c.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate group-hover:text-[#FFD700] transition-colors">{c.nome}</p>
                      <p className="text-gray-500 text-[11px] font-mono">{c.id_groot}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.processo && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${corProcesso[c.processo] || 'bg-gray-500/15 text-gray-300 border-gray-500/30'}`}>
                            {c.processo}
                          </span>
                        )}
                        {c.carreira && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${corCarreira[c.carreira] || 'bg-gray-500/15 text-gray-300 border-gray-500/30'}`}>
                            {c.carreira}
                          </span>
                        )}
                        {c.status !== 'Ativo' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-gray-500/15 text-gray-400 border-gray-500/30">
                            {c.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ label, valor, accent }: { label: string; valor: number; accent: string }) {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-4 hover:border-[#3a3a3a] transition-all">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={`text-3xl font-black ${accent}`}>{valor}</p>
    </div>
  );
}

function SecondaryAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="bg-[#141414] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-2"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

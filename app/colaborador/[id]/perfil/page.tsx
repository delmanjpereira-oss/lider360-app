'use client';

/**
 * ====================================================
 * TELA: Perfil Comportamental (gerado pela IA)
 * URL: /colaborador/[id]/perfil
 *
 * Busca: GET /api/ia/perfil/[id]
 * Renderiza relatório narrativo em markdown
 * ====================================================
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface PerfilResposta {
  cadastro: any;
  relatorio: string;
  modelo: string;
  geradoEm: string;
  validoAte?: string;
  fromCache: boolean;
}

export default function PerfilColaboradorPage() {
  const params = useParams();
  const router = useRouter();
  const idGroot = (params?.id as string) || '';

  const [dados, setDados] = useState<PerfilResposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [regenerando, setRegenerando] = useState(false);

  const buscar = useCallback(
    async (force = false) => {
      if (force) setRegenerando(true);
      else setCarregando(true);
      setErro(null);

      try {
        const url = `/api/ia/perfil/${idGroot}${force ? '?force=1' : ''}`;
        const r = await fetch(url);
        const json = await r.json();
        if (!r.ok) throw new Error(json.erro || 'Falha ao buscar perfil');
        setDados(json);
      } catch (err: any) {
        setErro(err.message || 'Erro desconhecido');
      } finally {
        setCarregando(false);
        setRegenerando(false);
      }
    },
    [idGroot]
  );

  useEffect(() => {
    buscar(false);
  }, [buscar]);

  // ═══════════════════════════════════════
  // LOADING (primeira carga)
  // ═══════════════════════════════════════
  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="inline-block w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-lg font-bold">Analisando padrões...</p>
          <p className="text-gray-400 text-sm mt-2">
            A IA está cruzando produtividade, feedbacks, DPMO e tendências
            comportamentais
          </p>
          <p className="text-gray-600 text-xs mt-3 italic">
            Primeira análise pode levar 10-15s. Próximas vêm do cache.
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // ERRO
  // ═══════════════════════════════════════
  if (erro || !dados) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-red-500/40 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl text-white font-bold mb-2">
            Não foi possível gerar o perfil
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            {erro || 'Colaborador não encontrado'}
          </p>
          <p className="text-gray-500 text-xs mb-5 font-mono">
            ID Groot: {idGroot}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => router.back()}
              className="px-5 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] text-white font-bold rounded-xl hover:bg-[#2a2a2a] transition-all"
            >
              ← Voltar
            </button>
            <button
              onClick={() => buscar(true)}
              className="px-5 py-2.5 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-600 transition-all"
            >
              🔄 Tentar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RELATÓRIO CARREGADO
  // ═══════════════════════════════════════
  const corProcesso = (dados.cadastro?.processo || '')
    .toLowerCase()
    .includes('p2m')
    ? 'text-orange-400'
    : 'text-cyan-400';

  const geradoFormatado = new Date(dados.geradoEm).toLocaleString('pt-BR');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-purple-300 transition-colors text-sm flex items-center gap-2"
          >
            ← Voltar
          </button>

          <button
            onClick={() => buscar(true)}
            disabled={regenerando}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/40 text-purple-200 hover:bg-purple-500/30 hover:border-purple-400/60 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            <span className={regenerando ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{regenerando ? 'Regenerando...' : 'Regenerar análise'}</span>
          </button>
        </div>

        {/* TÍTULO */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-black flex items-center gap-3">
            <span>🧠</span>
            <span>
              Perfil <span className="text-purple-400">Comportamental</span>
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Análise gerada pela IA Especialista do Lider 360
          </p>
        </div>

        {/* CARD COLABORADOR */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-[#2a2a2a] rounded-2xl p-6 shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {dados.cadastro?.nome || '—'}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
            <span className="text-gray-400">
              ID Groot:{' '}
              <span className="font-mono text-white">{idGroot}</span>
            </span>
            {dados.cadastro?.processo && (
              <span className={`font-bold ${corProcesso}`}>
                {dados.cadastro.processo}
              </span>
            )}
            {dados.cadastro?.carreira && (
              <span className="text-gray-300 font-bold">
                {dados.cadastro.carreira}
              </span>
            )}
            {dados.cadastro?.status && (
              <span className="text-gray-500">
                Status: {dados.cadastro.status}
              </span>
            )}
          </div>
        </div>

        {/* RELATÓRIO DA IA */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#141414] border border-purple-500/20 rounded-2xl p-6 sm:p-8 shadow-xl">
          <RenderMarkdown texto={dados.relatorio} />
        </div>

        {/* FOOTER */}
        <div className="text-center text-gray-600 text-xs py-4 space-y-1">
          <p>
            🤖 Gerado por IA Especialista Lider 360 • Modelo:{' '}
            <span className="text-gray-500 font-mono">{dados.modelo}</span>
          </p>
          <p>
            Última atualização: {geradoFormatado}
            {dados.fromCache && (
              <span className="ml-2 text-purple-400">
                (do cache — clique 🔄 pra regerar)
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// RENDERIZADOR DE MARKDOWN (parser caseiro)
// Suporta: # ## ###, **bold**, listas - e 1.
// ═══════════════════════════════════════

function RenderMarkdown({ texto }: { texto: string }) {
  const blocos = texto.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {blocos.map((bloco, i) => renderizarBloco(bloco, i))}
    </div>
  );
}

function renderizarBloco(bloco: string, idx: number) {
  const linhas = bloco.split('\n').filter((l) => l.length > 0);
  if (linhas.length === 0) return null;

  const primeiraLinha = linhas[0];

  // Heading 1
  if (primeiraLinha.startsWith('# ')) {
    return (
      <h1
        key={idx}
        className="text-2xl sm:text-3xl font-black text-white mb-2 mt-2"
      >
        {renderizarInline(primeiraLinha.slice(2))}
      </h1>
    );
  }

  // Heading 2
  if (primeiraLinha.startsWith('## ')) {
    return (
      <h2
        key={idx}
        className="text-xl sm:text-2xl font-bold text-purple-300 mb-2 mt-4 flex items-center gap-2"
      >
        <span className="w-1 h-6 bg-purple-500 rounded"></span>
        {renderizarInline(primeiraLinha.slice(3))}
      </h2>
    );
  }

  // Heading 3
  if (primeiraLinha.startsWith('### ')) {
    return (
      <h3
        key={idx}
        className="text-lg font-bold text-gray-200 mb-1 mt-3"
      >
        {renderizarInline(primeiraLinha.slice(4))}
      </h3>
    );
  }

  // Lista (- ou *)
  if (linhas.every((l) => /^[-*]\s+/.test(l))) {
    return (
      <ul key={idx} className="space-y-2 pl-2">
        {linhas.map((l, j) => (
          <li
            key={j}
            className="text-gray-200 leading-relaxed flex gap-3"
          >
            <span className="text-purple-400 flex-shrink-0">▸</span>
            <span>{renderizarInline(l.replace(/^[-*]\s+/, ''))}</span>
          </li>
        ))}
      </ul>
    );
  }

  // Lista numerada (1. 2. 3.)
  if (linhas.every((l) => /^\d+\.\s+/.test(l))) {
    return (
      <ol key={idx} className="space-y-2 pl-2">
        {linhas.map((l, j) => {
          const match = l.match(/^(\d+)\.\s+(.*)/);
          const num = match?.[1] || `${j + 1}`;
          const texto = match?.[2] || l;
          return (
            <li
              key={j}
              className="text-gray-200 leading-relaxed flex gap-3"
            >
              <span className="text-purple-400 font-bold flex-shrink-0">
                {num}.
              </span>
              <span>{renderizarInline(texto)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  // Divisor
  if (primeiraLinha.trim() === '---') {
    return <hr key={idx} className="border-[#2a2a2a] my-4" />;
  }

  // Parágrafo (default)
  return (
    <p key={idx} className="text-gray-200 leading-relaxed">
      {renderizarInline(bloco)}
    </p>
  );
}

// Renderiza inline: **bold**, *italic*, `code`
function renderizarInline(texto: string): React.ReactNode {
  if (!texto) return null;

  // Quebra por **bold**
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="text-white font-bold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code
          key={i}
          className="bg-[#0a0a0a] border border-[#2a2a2a] px-1.5 py-0.5 rounded text-sm font-mono text-purple-300"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

'use client';

import Link from 'next/link';

export default function DpmoPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/meu-time"
        className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2"
      >
        ← Voltar para MEU TIME
      </Link>

      <div>
        <h1 className="text-4xl font-black mb-2">
          📊 Upload <span className="text-purple-400">DPMO</span>
        </h1>
        <p className="text-gray-400">
          Importação semanal de qualidade — CSV do Looker
        </p>
      </div>

      {/* Card "em construção" */}
      <div className="bg-purple-500/10 border-2 border-dashed border-purple-500/40 rounded-2xl p-12 text-center">
        <span className="text-6xl block mb-4">🚧</span>
        <h2 className="text-2xl font-black text-purple-300 mb-3">
          Em construção
        </h2>
        <p className="text-purple-200 max-w-lg mx-auto">
          Essa página será liberada na próxima sessão. Vai funcionar parecido
          com o Upload CSV, mas pro relatório semanal de DPMO do Looker.
        </p>
      </div>

      {/* O que vai ter quando ficar pronto */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <h3 className="text-lg font-bold text-[#FFD700] mb-4">
          🎯 Quando ficar pronto, vai ter:
        </h3>

        <ul className="space-y-3 text-sm text-gray-300">
          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">Parse automático</strong> do CSV
              exportado do painel Looker (PAINEL_DE_PRODUÇÃO_GERAL)
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">5 DPMOs por colaborador</strong>{' '}
              — Checkin (CK), P2M, TP, SH, OV (Overflow)
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">Detecção automática do mês</strong>{' '}
              — semana ISO → mês correspondente
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">Substituição inteligente</strong>{' '}
              — quando sobe CSV com dados do mês X, apaga tudo daquele mês
              e insere o novo (cobre semanas que sumiram do export)
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">IMA automático</strong> — sistema
              calcula IMA trimestral médio dos DPMOs uploaded
            </div>
          </li>

          <li className="flex items-start gap-3">
            <span className="text-purple-400 mt-0.5">✓</span>
            <div>
              <strong className="text-white">Integração com Calibração</strong>{' '}
              — IMA dos colaboradores aparece automaticamente na tabela
              trimestral
            </div>
          </li>
        </ul>
      </div>

      {/* Roadmap */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
        <h3 className="text-lg font-bold text-[#FFD700] mb-4">
          📅 Roadmap atual
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 text-green-400">
            <span>✅</span>
            <span>MEU TIME — Cadastro, edição, exclusão</span>
          </div>
          <div className="flex items-center gap-3 text-green-400">
            <span>✅</span>
            <span>Configurações de Metas</span>
          </div>
          <div className="flex items-center gap-3 text-green-400">
            <span>✅</span>
            <span>Upload CSV de Produtividade</span>
          </div>
          <div className="flex items-center gap-3 text-yellow-400">
            <span>🔄</span>
            <span>Página de detalhe do colaborador (próximo)</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>⏳</span>
            <span>Feedbacks com linha do tempo</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>⏳</span>
            <span>Upload DPMO (essa página)</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>⏳</span>
            <span>Calibração Trimestral</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <span>⏳</span>
            <span>Copiloto IA com Claude API</span>
          </div>
        </div>
      </div>
    </div>
  );
}

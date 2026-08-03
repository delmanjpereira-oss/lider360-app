'use client';
import React from 'react';

/**
 * ============================================================
 * LoadingOverlay — overlay profissional de carregamento
 * Reutilizável em TODAS as telas de upload/ação do app.
 *
 * Uso:
 *   import LoadingOverlay from '@/app/components/LoadingOverlay';
 *   // (ou caminho relativo: ../../components/LoadingOverlay)
 *
 *   const [fase, setFase] = useState<Fase>(null);
 *   ...
 *   <LoadingOverlay
 *     fase={fase}
 *     lendoTitulo="Lendo arquivo..."
 *     lendoSub="Processando os registros do CSV"
 *     salvandoTitulo="Salvando no banco..."
 *     salvandoSub={`Gravando ${qtd} registros`}
 *     sucessoTitulo="Salvo!"
 *     sucessoSub="Dados atualizados"
 *   />
 * ============================================================
 */

export type Fase = null | 'lendo' | 'salvando' | 'sucesso';

type Props = {
  fase: Fase;
  lendoTitulo?: string;
  lendoSub?: string;
  salvandoTitulo?: string;
  salvandoSub?: string;
  sucessoTitulo?: string;
  sucessoSub?: string;
};

export default function LoadingOverlay({
  fase,
  lendoTitulo = 'Lendo arquivo...',
  lendoSub = 'Processando os dados',
  salvandoTitulo = 'Salvando...',
  salvandoSub = 'Gravando no banco',
  sucessoTitulo = 'Pronto!',
  sucessoSub = 'Salvo com sucesso',
}: Props) {
  if (!fase) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md animate-[ovFadeIn_0.2s_ease-out]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes ovFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovPopIn { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes ovSlide { 0% { transform: translateX(-120%); } 100% { transform: translateX(420%); } }
      `,
        }}
      />
      <div className="bg-gradient-to-br from-[#141b2e] to-[#0a0f1c] border border-[#FFD700]/20 rounded-3xl px-10 py-9 text-center shadow-2xl shadow-black/50 max-w-sm mx-4">
        {fase === 'sucesso' ? (
          <>
            <div className="relative mx-auto mb-5 w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping"></div>
              <div className="relative w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-400 flex items-center justify-center">
                <span className="text-4xl animate-[ovPopIn_0.4s_ease-out]">✅</span>
              </div>
            </div>
            <p className="text-2xl font-black text-green-400 mb-1">{sucessoTitulo}</p>
            <p className="text-sm text-gray-400">{sucessoSub}</p>
          </>
        ) : (
          <>
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-[#FFD700]/10"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#FFD700] animate-spin"></div>
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-cyan-400 animate-spin [animation-duration:1.5s] [animation-direction:reverse]"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">{fase === 'lendo' ? '📄' : '💾'}</span>
              </div>
            </div>
            <p className="text-xl font-black text-white mb-1">
              {fase === 'lendo' ? lendoTitulo : salvandoTitulo}
            </p>
            <p className="text-sm text-gray-400">
              {fase === 'lendo' ? lendoSub : salvandoSub}
            </p>
            <div className="mt-5 h-1 w-full bg-[#0a0a0a] rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#FFD700] to-transparent animate-[ovSlide_1.2s_ease-in-out_infinite]"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

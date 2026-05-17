// app/components/MascoteApollo.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AstronautAvatar } from './AstronautAvatar';

type Humor = 'happy' | 'party' | 'surprised' | 'sad';

type MensagemHumor = {
  titulo: string;
  texto: string;
};

const MENSAGENS: Record<Humor, MensagemHumor[]> = {
  happy: [
    { titulo: 'Tudo tranquilo', texto: 'Time alinhado, poucas pendências. Continue assim! 🚀' },
    { titulo: 'Tá fluindo', texto: 'Operação rodando bem. Mantém o ritmo!' },
    { titulo: 'Bom trabalho', texto: 'Equipe está no caminho certo. Parabéns pela liderança!' },
  ],
  party: [
    { titulo: '🎉 Tudo zerado!', texto: 'Sem pendências, sem ofensores! Hora de comemorar com o time!' },
    { titulo: '🏆 Time campeão', texto: 'Todos batendo a meta! Você é referência!' },
    { titulo: '🎊 Resultados excelentes', texto: 'O time está dando show! Continue inspirando!' },
  ],
  surprised: [
    { titulo: '⚠️ Atenção, líder!', texto: 'Algumas pendências precisam de olhar. Dá uma checada quando puder.' },
    { titulo: '👀 Olho aqui', texto: 'Alguns colaboradores merecem atenção essa semana.' },
    { titulo: '🔔 Tem pendência', texto: 'Não deixa acumular! Resolva os pontos rápido.' },
  ],
  sad: [
    { titulo: '🚨 Emergência', texto: 'Muita coisa acumulada! Hora de priorizar feedbacks urgentes.' },
    { titulo: '📉 Atenção máxima', texto: 'Time precisa de você agora. Vamos colocar a casa em ordem!' },
    { titulo: '🆘 Crítico', texto: 'Vários colaboradores com indicadores ruins. Bora resolver?' },
  ],
};

export function MascoteApollo() {
  const [humor, setHumor] = useState<Humor>('happy');
  const [escondido, setEscondido] = useState(false);
  const [bolhaAberta, setBolhaAberta] = useState(false);
  const [mensagem, setMensagem] = useState<MensagemHumor>(MENSAGENS.happy[0]);
  const [montou, setMontou] = useState(false);
  const pathname = usePathname();

  // Inicializa humor (no futuro pode integrar com dados do Supabase via API)
  useEffect(() => {
    // Sorteia mensagem random ao montar
    const opcoes = MENSAGENS[humor];
    setMensagem(opcoes[Math.floor(Math.random() * opcoes.length)]);
    setMontou(true);
  }, [humor]);

  // Esconde quando mouse perto (UX inteligente)
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const el = document.getElementById('mascoteApollo');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const isNear =
        e.clientX >= rect.left - 70 &&
        e.clientX <= rect.right + 20 &&
        e.clientY >= rect.top - 70 &&
        e.clientY <= rect.bottom + 20;
      setEscondido(isNear && !bolhaAberta);
    }

    function handleFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        setEscondido(true);
      }
    }

    function handleFocusOut() {
      setTimeout(() => setEscondido(false), 200);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [bolhaAberta]);

  // Não renderiza no SSR
  if (!montou) return null;

  // Não mostra em rotas de auth/login
  if (pathname?.includes('/login')) return null;

  const corBorda =
    humor === 'sad'
      ? '#ef4444'
      : humor === 'surprised'
      ? '#f59e0b'
      : humor === 'party'
      ? '#a855f7'
      : '#FFD700';

  return (
    <div
      id="mascoteApollo"
      className={`fixed right-4 bottom-4 z-50 flex items-end gap-2 transition-all duration-200 ${
        escondido ? 'opacity-0 translate-y-4 pointer-events-none' : ''
      } ${humor === 'party' ? 'animate-party-float' : 'animate-mascot-float'}`}
    >
      {/* Bolha de mensagem */}
      {bolhaAberta && (
        <div
          className="bg-gradient-to-b from-[#fffef8] to-[#fff7db] rounded-2xl rounded-br-md p-3 border-2 shadow-2xl max-w-[280px] cursor-pointer"
          style={{ borderColor: `${corBorda}80` }}
          onClick={() => setBolhaAberta(false)}
        >
          <strong className="block text-[#8a6400] text-[10px] uppercase tracking-widest mb-1 font-black">
            🚀 Assistente Apollo
          </strong>
          <p className="text-[13px] font-bold text-[#1c1c1c] leading-snug">
            <strong className="block mb-1">{mensagem.titulo}</strong>
            {mensagem.texto}
          </p>
          <p className="text-[10px] text-gray-500 mt-2 text-right">clique pra fechar</p>
        </div>
      )}

      {/* Astronauta (sem fundo, sem badge) */}
      <button
        onClick={() => setBolhaAberta(!bolhaAberta)}
        className="relative cursor-pointer transition-transform hover:scale-110"
        style={{
          filter: `drop-shadow(0 8px 20px ${corBorda}60) drop-shadow(0 0 8px ${corBorda}40)`,
        }}
        title="Clique pra ver mensagem"
      >
        <AstronautAvatar size={90} humor={humor} />

        {/* Pulso pra alertas */}
        {(humor === 'sad' || humor === 'party') && (
          <div
            className="absolute inset-0 rounded-full animate-ping pointer-events-none"
            style={{
              background: corBorda,
              opacity: 0.15,
            }}
          />
        )}
      </button>
    </div>
  );
}

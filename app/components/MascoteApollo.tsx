// app/components/MascoteApollo.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AstronautAvatar } from './AstronautAvatar';

type Humor = 'happy' | 'party' | 'surprised' | 'sad';
type Mensagem = { titulo: string; texto: string };

// Configurações de timing
const INTERVALO_ENTRE_MSGS = 35000; // 35s entre uma mensagem e outra
const DURACAO_MSG = 9000; // 9s que a mensagem fica visível
const DELAY_INICIAL = 3000; // 3s pra primeira mensagem aparecer

export function MascoteApollo() {
  const [humor, setHumor] = useState<Humor>('happy');
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [indiceMsg, setIndiceMsg] = useState(0);
  const [bolhaVisivel, setBolhaVisivel] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const [montou, setMontou] = useState(false);
  const pathname = usePathname();
  const ciclosRef = useRef<NodeJS.Timeout[]>([]);

  // 🎯 Busca dados da API ao montar/mudar página
  useEffect(() => {
    async function buscarStatus() {
      try {
        const res = await fetch('/api/mascote-status');
        const data = await res.json();
        setHumor(data.humor || 'happy');
        setMensagens(data.mensagens || []);
      } catch (e) {
        console.error('Erro buscando mascote:', e);
        // Fallback se a API falhar
        setMensagens([
          { titulo: '👋 Olá!', texto: 'Bem-vindo ao LIDER 360!' },
        ]);
      } finally {
        setMontou(true);
      }
    }

    buscarStatus();

    // Re-busca dados a cada 5 minutos (atualização automática)
    const intervalRefresh = setInterval(buscarStatus, 5 * 60 * 1000);
    return () => clearInterval(intervalRefresh);
  }, [pathname]);

  // 🎯 Ciclo automático de mensagens
  useEffect(() => {
    if (!montou || mensagens.length === 0) return;

    // Limpa timers anteriores
    ciclosRef.current.forEach((t) => clearTimeout(t));
    ciclosRef.current = [];

    function mostrarProximaMensagem(indice: number) {
      setIndiceMsg(indice % mensagens.length);
      setBolhaVisivel(true);

      // Esconde depois de DURACAO_MSG
      const timerEsconder = setTimeout(() => {
        setBolhaVisivel(false);
      }, DURACAO_MSG);
      ciclosRef.current.push(timerEsconder);

      // Mostra próxima depois de INTERVALO_ENTRE_MSGS
      const timerProxima = setTimeout(() => {
        mostrarProximaMensagem(indice + 1);
      }, INTERVALO_ENTRE_MSGS);
      ciclosRef.current.push(timerProxima);
    }

    // Primeira mensagem com delay inicial
    const timerInicial = setTimeout(() => {
      mostrarProximaMensagem(0);
    }, DELAY_INICIAL);
    ciclosRef.current.push(timerInicial);

    // Cleanup
    return () => {
      ciclosRef.current.forEach((t) => clearTimeout(t));
      ciclosRef.current = [];
    };
  }, [mensagens, montou]);

  // 🎯 Esconde quando mouse perto (UX inteligente)
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
      setEscondido(isNear);
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
  }, []);

  if (!montou) return null;
  if (pathname?.includes('/login')) return null;

  const corBorda =
    humor === 'sad'
      ? '#ef4444'
      : humor === 'surprised'
      ? '#f59e0b'
      : humor === 'party'
      ? '#a855f7'
      : '#FFD700';

  const mensagemAtual = mensagens[indiceMsg];

  return (
    <div
      id="mascoteApollo"
      className={`fixed right-4 bottom-4 z-50 flex items-end gap-2 transition-all duration-300 ${
        escondido ? 'opacity-0 translate-y-4 pointer-events-none' : ''
      } ${humor === 'party' ? 'animate-party-float' : 'animate-mascot-float'}`}
    >
      {/* Bolha de mensagem (auto) */}
      {bolhaVisivel && mensagemAtual && (
        <div
          className="bg-gradient-to-b from-[#fffef8] to-[#fff7db] rounded-2xl rounded-br-md p-3 border-2 shadow-2xl max-w-[280px] cursor-pointer animate-fade-in-up"
          style={{ borderColor: `${corBorda}80` }}
          onClick={() => setBolhaVisivel(false)}
        >
          <strong className="block text-[#8a6400] text-[10px] uppercase tracking-widest mb-1 font-black">
            🚀 Apollo
          </strong>
          <p className="text-[13px] font-bold text-[#1c1c1c] leading-snug">
            <strong className="block mb-1">{mensagemAtual.titulo}</strong>
            {mensagemAtual.texto}
          </p>
        </div>
      )}

      {/* Astronauta */}
      <button
        onClick={() => {
          // Clique força mostrar próxima mensagem
          setBolhaVisivel(true);
          setIndiceMsg((i) => (i + 1) % mensagens.length);
        }}
        className="relative cursor-pointer transition-transform hover:scale-110"
        style={{
          filter: `drop-shadow(0 8px 20px ${corBorda}60) drop-shadow(0 0 8px ${corBorda}40)`,
        }}
        title="Clique pra ver próxima mensagem"
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

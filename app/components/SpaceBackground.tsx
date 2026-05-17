// app/components/SpaceBackground.tsx
'use client';

import { useMemo } from 'react';

type Estrela = {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  twinkle: number;
};

export function SpaceBackground() {
  // Gera estrelas aleatórias (memoizado pra não regenerar)
  const estrelas = useMemo<Estrela[]>(() => {
    const arr: Estrela[] = [];
    // 80 estrelas espalhadas
    for (let i = 0; i < 80; i++) {
      arr.push({
        cx: Math.random() * 100,           // 0-100% horizontal
        cy: Math.random() * 100,           // 0-100% vertical
        r: 0.5 + Math.random() * 1.5,      // 0.5 a 2px
        opacity: 0.2 + Math.random() * 0.6, // 0.2 a 0.8
        twinkle: 2 + Math.random() * 4,    // 2-6s animação
      });
    }
    return arr;
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Gradiente nebulosa de fundo */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 30%, rgba(76, 29, 149, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 60%, rgba(15, 23, 42, 0.4) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 90%, rgba(120, 53, 15, 0.08) 0%, transparent 50%),
            #0a0a0a
          `,
        }}
      />

      {/* SVG com estrelas e planetas */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {/* Estrelas pequenas piscando */}
        {estrelas.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r * 0.15}
            fill="#fff"
            opacity={s.opacity}
          >
            <animate
              attributeName="opacity"
              values={`${s.opacity};${s.opacity * 0.3};${s.opacity}`}
              dur={`${s.twinkle}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Estrelas amarelas (MELI) maiores */}
        <circle cx="15" cy="20" r="0.4" fill="#FFD700" opacity="0.6">
          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="85" cy="35" r="0.5" fill="#FFD700" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.1;0.5" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx="45" cy="75" r="0.3" fill="#FFD700" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Planetas estáticos (CSS) */}
      
      {/* Planeta 1 - canto superior direito (Júpiter style) */}
      <div
        className="absolute top-20 right-32 w-32 h-32 rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #d97706 0%, #92400e 40%, #1c1917 100%)',
          boxShadow: '0 0 60px rgba(217, 119, 6, 0.3), inset -10px -10px 30px rgba(0, 0, 0, 0.5)',
        }}
      />

      {/* Planeta 2 - canto inferior esquerdo (Saturno style com anel) */}
      <div className="absolute bottom-32 left-20 opacity-15">
        <div
          className="relative w-24 h-24 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #fbbf24 0%, #d97706 40%, #78350f 100%)',
            boxShadow: '0 0 40px rgba(251, 191, 36, 0.2), inset -8px -8px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Anel do planeta */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-yellow-700/40"
            style={{
              width: '160%',
              height: '40%',
              transform: 'translate(-50%, -50%) rotate(-20deg)',
            }}
          />
        </div>
      </div>

      {/* Planeta 3 - meio direito (azul/roxo distante) */}
      <div
        className="absolute top-1/2 right-10 w-16 h-16 rounded-full opacity-10"
        style={{
          background: 'radial-gradient(circle at 30% 30%, #818cf8 0%, #4338ca 40%, #1e1b4b 100%)',
          boxShadow: '0 0 30px rgba(129, 140, 248, 0.2)',
        }}
      />

      {/* Lua pequena - canto superior esquerdo */}
      <div
        className="absolute top-10 left-1/3 w-8 h-8 rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #e5e7eb 0%, #9ca3af 50%, #4b5563 100%)',
          boxShadow: '0 0 20px rgba(229, 231, 235, 0.2)',
        }}
      />

      {/* Linha de constelação sutil */}
      <svg
        className="absolute inset-0 w-full h-full opacity-5 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        <line x1="100" y1="200" x2="200" y2="180" stroke="#FFD700" strokeWidth="0.5" />
        <line x1="200" y1="180" x2="280" y2="240" stroke="#FFD700" strokeWidth="0.5" />
        <line x1="280" y1="240" x2="350" y2="200" stroke="#FFD700" strokeWidth="0.5" />
      </svg>

      {/* Overlay sutil pra escurecer o conteúdo principal */}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}

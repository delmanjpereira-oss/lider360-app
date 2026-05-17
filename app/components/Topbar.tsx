'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Topbar() {
  const [hora, setHora] = useState('');

  useEffect(() => {
    function atualizar() {
      const agora = new Date();
      setHora(agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }
    atualizar();
    const interval = setInterval(atualizar, 30000);
    return () => clearInterval(interval);
  }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  return (
    <header className="bg-gradient-to-r from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] border-b border-[#1a1a1a] px-6 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md bg-opacity-90">
      {/* Lado esquerdo - Logos + saudação */}
      <div className="flex items-center gap-4">
        {/* 🤝 Logo Mercado Livre */}
        <div
          className="flex items-center justify-center w-14 h-10 rounded-xl shadow-md"
          style={{
            background: 'linear-gradient(135deg, #FFE600 0%, #FFD700 100%)',
            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)',
          }}
          title="Mercado Livre"
        >
          {/* Handshake icon oficial MELI - 2 mãos amarelas apertando */}
          <svg
            viewBox="0 0 80 50"
            width="48"
            height="30"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Mão esquerda - aponta pra direita */}
            <path
              d="M 5 30
                 C 5 18, 18 12, 28 14
                 L 38 16
                 C 42 17, 44 20, 42 24
                 L 38 32
                 C 36 36, 32 38, 26 38
                 L 14 38
                 C 8 38, 4 35, 5 30 Z"
              fill="#FFE600"
              stroke="#1a1a1a"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            
            {/* Dedos da mão esquerda (linhas) */}
            <path d="M 18 22 L 26 22" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
            <path d="M 18 26 L 26 26" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
            <path d="M 18 30 L 26 30" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />

            {/* Mão direita - aponta pra esquerda */}
            <path
              d="M 75 30
                 C 75 18, 62 12, 52 14
                 L 42 16
                 C 38 17, 36 20, 38 24
                 L 42 32
                 C 44 36, 48 38, 54 38
                 L 66 38
                 C 72 38, 76 35, 75 30 Z"
              fill="#FFE600"
              stroke="#1a1a1a"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* Dedos da mão direita (linhas) */}
            <path d="M 62 22 L 54 22" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
            <path d="M 62 26 L 54 26" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
            <path d="M 62 30 L 54 30" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />

            {/* Ponto de aperto (centro) - faz parecer que as mãos se encontram */}
            <ellipse cx="40" cy="26" rx="3" ry="6" fill="#1a1a1a" opacity="0.15" />
          </svg>
        </div>

        {/* 🇧🇷 Bandeira do Brasil */}
        <div
          className="flex items-center justify-center w-12 h-8 rounded-lg overflow-hidden shadow-md border border-white/10"
          title="Brasil"
        >
          <svg
            viewBox="0 0 60 42"
            width="48"
            height="32"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Fundo verde */}
            <rect width="60" height="42" fill="#009C3B" />

            {/* Losango amarelo */}
            <path d="M 30 4 L 56 21 L 30 38 L 4 21 Z" fill="#FFDF00" />

            {/* Círculo azul */}
            <circle cx="30" cy="21" r="9" fill="#002776" />

            {/* Faixa branca (Ordem e Progresso) */}
            <path
              d="M 22 19 Q 30 16 38 19"
              fill="none"
              stroke="#fff"
              strokeWidth="1.5"
            />

            {/* Estrelas pequenas */}
            <circle cx="25" cy="18" r="0.5" fill="#fff" />
            <circle cx="30" cy="17" r="0.7" fill="#fff" />
            <circle cx="35" cy="18" r="0.5" fill="#fff" />
            <circle cx="27" cy="24" r="0.4" fill="#fff" />
            <circle cx="33" cy="25" r="0.4" fill="#fff" />
            <circle cx="30" cy="22" r="0.5" fill="#fff" />
          </svg>
        </div>

        {/* Saudação */}
        <div className="border-l border-[#2a2a2a] pl-4">
          <p className="text-xs text-gray-500 capitalize">{hoje}</p>
          <p className="text-sm text-white font-bold">
            Olá, <span className="text-[#FFD700]">Delman</span>! 👋
          </p>
        </div>
      </div>

      {/* Lado direito - Hora + RC + Config */}
      <div className="flex items-center gap-3">
        {/* Centro de Distribuição */}
        <div className="hidden md:flex flex-col items-center px-3 py-1.5 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/30 rounded-lg">
          <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-widest">CD</span>
          <span className="text-sm text-white font-mono font-bold">RC01 Perus</span>
        </div>

        {/* Hora */}
        <div className="text-right">
          <p className="text-xs text-gray-500">Hora atual</p>
          <p className="text-lg text-white font-mono font-bold">{hora}</p>
        </div>

        {/* Configurações */}
        <Link
          href="/configuracoes-app"
          title="Configurações do App"
          className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] hover:from-[#FFD700]/20 hover:to-yellow-600/10 text-gray-400 hover:text-[#FFD700] rounded-xl transition-all border border-[#2a2a2a] hover:border-[#FFD700]/40 hover:-translate-y-0.5 active:translate-y-0 text-xl"
        >
          ⚙️
        </Link>
      </div>
    </header>
  );
}

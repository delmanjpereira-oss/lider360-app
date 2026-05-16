'use client';

import { useState, useEffect } from 'react';

export default function Topbar() {
  const [hora, setHora] = useState('');

  useEffect(() => {
    function atualizar() {
      const agora = new Date();
      setHora(
        agora.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
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
    <header className="bg-gradient-to-r from-[#0a0a0a] to-[#0f0f0f] border-b border-[#1a1a1a] px-6 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md bg-opacity-90">
      <div>
        <p className="text-xs text-gray-500 capitalize">{hoje}</p>
        <p className="text-sm text-white font-bold">
          Olá, <span className="text-[#FFD700]">Delman</span>! 👋
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-500">RC01 Perus</p>
        <p className="text-lg text-white font-mono font-bold">{hora}</p>
      </div>
    </header>
  );
}

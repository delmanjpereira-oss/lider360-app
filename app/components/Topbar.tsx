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
    <header className="bg-gradient-to-r from-[#0a0a0a] to-[#0f0f0f] border-b border-[#1a1a1a] px-6 py-3 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md bg-opacity-90">
      <div>
        <p className="text-xs text-gray-500 capitalize">{hoje}</p>
        <p className="text-sm text-white font-bold">
          Olá, <span className="text-[#FFD700]">Delman</span>! 👋
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-gray-500">RC01 Perus</p>
          <p className="text-lg text-white font-mono font-bold">{hora}</p>
        </div>
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

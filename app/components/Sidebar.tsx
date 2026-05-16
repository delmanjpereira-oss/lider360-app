'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const items: NavItem[] = [
  { href: '/meu-time', label: 'Meu Time', icon: '👥' },
  { href: '/copiloto', label: 'Copiloto IA', icon: '🤖' },
  { href: '/calibracao', label: 'Calibração', icon: '🎯' },
  { href: '/boletim', label: 'Boletim', icon: '📈' },
  { href: '/mantra', label: 'Mantra ABS', icon: '🧘' },
  { href: '/available-time', label: 'Available Time', icon: '⏰' },
  { href: '/calculadora', label: 'Calculadora NET', icon: '🧮' },
  { href: '/presenca', label: 'Presença', icon: '✅' },
];

const SIDEBAR_KEY = 'lider360_sidebar_aberta';

export default function Sidebar() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(true);
  const [montou, setMontou] = useState(false);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(SIDEBAR_KEY);
      if (salvo !== null) {
        setAberta(salvo === 'true');
      }
    } catch {}
    setMontou(true);
  }, []);

  function toggle() {
    const nova = !aberta;
    setAberta(nova);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(nova));
    } catch {}
  }

  if (!montou) {
    return <aside className="w-60 bg-[#0a0a0a] border-r border-[#1a1a1a]"></aside>;
  }

  return (
    <aside
      className={`
        ${aberta ? 'w-60' : 'w-20'}
        bg-gradient-to-b from-[#0d0d0d] to-[#070707]
        border-r border-[#1a1a1a]
        flex flex-col
        sticky top-0 h-screen
        transition-all duration-300 ease-out
        flex-shrink-0
        relative
      `}
      style={{
        boxShadow: '4px 0 20px -8px rgba(0,0,0,0.5)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-[#1a1a1a]">
        {aberta ? (
          <Link href="/meu-time" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-yellow-500/20">
              L
            </div>
            <span className="text-white font-black text-lg">LIDER 360</span>
          </Link>
        ) : (
          <Link
            href="/meu-time"
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD700] to-yellow-600 flex items-center justify-center text-black font-black text-xl shadow-lg shadow-yellow-500/20 mx-auto"
          >
            L
          </Link>
        )}
      </div>

      {/* Botão flutuante de toggle */}
      <button
        onClick={toggle}
        title={aberta ? 'Recolher menu' : 'Expandir menu'}
        className="absolute -right-3 top-7 z-50 w-6 h-6 rounded-full bg-gradient-to-br from-[#FFD700] to-yellow-600 text-black font-black text-xs flex items-center justify-center shadow-lg shadow-yellow-500/30 hover:scale-110 active:scale-95 transition-all"
      >
        {aberta ? '◀' : '▶'}
      </button>

      {/* Itens de navegação */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const ativo =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!aberta ? item.label : ''}
              className={`
                flex items-center gap-3 px-3 py-3 rounded-xl
                transition-all duration-200
                ${
                  ativo
                    ? 'bg-gradient-to-r from-[#FFD700]/15 to-transparent text-[#FFD700] border border-[#FFD700]/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }
                ${!aberta ? 'justify-center' : ''}
              `}
            >
              <span className="text-xl flex-shrink-0">{item.icon}</span>
              {aberta && (
                <span className="font-bold text-sm whitespace-nowrap">
                  {item.label}
                </span>
              )}
              {ativo && aberta && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD700] shadow-lg shadow-yellow-400"></span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé */}
      {aberta && (
        <div className="p-4 border-t border-[#1a1a1a] text-xs text-gray-600">
          <p className="font-mono">v2.0</p>
          <p>RC01 Perus</p>
        </div>
      )}
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { icon: '🚀', label: 'Início', path: '/' },
  { icon: '📊', label: 'Mantra ABS', path: '/mantra' },
  { icon: '⏱️', label: 'Available Time', path: '/available-time' },
  { icon: '🧮', label: 'Calculadora NET', path: '/calculadora' },
  { icon: '✅', label: 'Registro Presença', path: '/presenca' },
  { icon: '👥', label: 'MEU TIME', path: '/meu-time' },
  { icon: '📋', label: 'Calibração', path: '/calibracao' },
  { icon: '🤖', label: 'Copiloto IA', path: '/copiloto' },
  { icon: '📰', label: 'Boletim Produção', path: '/boletim' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-[#0f0f0f] border-r border-[#2a2a2a] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🚀</span>
          <div>
            <h1 className="text-xl font-black text-white">
              LÍDER <span className="text-[#FFD700]">360</span>
            </h1>
            <p className="text-xs text-gray-500">Painel do Líder</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-[#FFD700] text-black font-bold'
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <p className="text-xs text-gray-500">
          Dev: <strong className="text-gray-400">Delman Pereira</strong>
        </p>
        <p className="text-xs text-gray-600 mt-1">RC01 Perus • v2.0</p>
      </div>
    </aside>
  );
}

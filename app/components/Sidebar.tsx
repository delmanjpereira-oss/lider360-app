'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/mantra', label: 'Mantra ABS', icon: '📋' },
  { href: '/available-time', label: 'Available Time', icon: '⏱️' },
  { href: '/calculadora', label: 'Calculadora NET', icon: '🧮' },
  { href: '/presenca', label: 'Registro Presença', icon: '✅' },
  { href: '/meu-time', label: 'MEU TIME', icon: '👥' },
  { href: '/calibracao', label: 'Calibração', icon: '🎯' },
  { href: '/copiloto', label: 'Copiloto IA', icon: '🤖' },
  { href: '/boletim', label: 'Boletim', icon: '📊' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0a0a0a] border-r border-[#2a2a2a] min-h-screen p-4 flex flex-col">
      {/* Logo */}
      <div className="mb-6 px-2">
        <h1 className="text-2xl font-black text-[#FFD700]">LIDER 360</h1>
        <p className="text-xs text-gray-500">RC01 PERUS</p>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-[#FFD700] text-black font-bold'
                  : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Rodapé */}
      <div className="mt-4 pt-4 border-t border-[#2a2a2a] text-xs text-gray-500">
        <p>
          Dev: <span className="text-[#FFD700] font-bold">Delman Pereira</span>
        </p>
        <p>Líder | Mercado Livre</p>
      </div>
    </aside>
  );
}

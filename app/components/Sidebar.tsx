'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU = [
  {
    titulo: 'OPERAÇÃO DIÁRIA',
    items: [
      { nome: 'Calculadora NET', href: '/calculadora', icon: '🎯' },
      { nome: 'Lista de Presença', href: '/presenca', icon: '📋' },
      { nome: 'Mapeamento Linha', href: '/linha', icon: '🏭', destaque: true },  // 🆕
      { nome: 'Copiloto IA', href: '/copiloto', icon: '🤖' },
    ],
  },
  {
    titulo: 'GESTÃO DE TIME',
    items: [
      { nome: 'Meu Time', href: '/meu-time', icon: '👥' },
      { nome: 'Calibração', href: '/calibracao', icon: '⚖️' },
      { nome: 'Boletim', href: '/boletim', icon: '📊' },
    ],
  },
  {
    titulo: 'CONFIGURAÇÕES',
    items: [
      { nome: 'Configurações', href: '/configuracoes', icon: '⚙️' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0a0a0a] border-r border-[#2a2a2a] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-5 border-b border-[#2a2a2a]">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🦅</span>
          <div>
            <h1 className="text-lg font-black text-white">
              LIDER <span className="text-[#FFD700]">360</span>
            </h1>
            <p className="text-[10px] text-gray-500">RC01 Perus · MELI</p>
          </div>
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        {MENU.map((secao) => (
          <div key={secao.titulo} className="mb-6">
            <p className="px-5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              {secao.titulo}
            </p>
            <ul>
              {secao.items.map((item) => {
                const ativo = pathname === item.href || 
                              (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-all relative ${
                        ativo
                          ? 'bg-[#FFD700]/10 text-[#FFD700] border-l-4 border-[#FFD700]'
                          : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border-l-4 border-transparent'
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="font-bold">{item.nome}</span>
                      {item.destaque && !ativo && (
                        <span className="ml-auto text-[9px] bg-gradient-to-br from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                          NOVO
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <div className="text-[10px] text-gray-500">
          <p>Delman Pereira</p>
          <p>TL P2M · RC01</p>
        </div>
      </div>
    </aside>
  );
}

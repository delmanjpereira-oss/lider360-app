'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// ============================================
// MENU ORGANIZADO POR GRUPOS
// Available Time REMOVIDO
// ============================================
const menuGroups = [
  {
    titulo: 'Operação Diária',
    items: [
      { icon: '🧮', label: 'Calculadora NET', path: '/calculadora' },
      { icon: '📋', label: 'Lista de Presença', path: '/presenca' },
    ],
  },
  {
    titulo: 'Gestão do Time',
    items: [
      { icon: '👥', label: 'Meu Time', path: '/meu-time' },
      { icon: '🎯', label: 'Calibração', path: '/calibracao' },
      { icon: '📰', label: 'Boletim', path: '/boletim' },
    ],
  },
  {
    titulo: 'Inteligência',
    items: [
      { icon: '🤖', label: 'Copiloto IA', path: '/copiloto' },
    ],
  },
  {
    titulo: 'Configurações',
    items: [
      { icon: '⚙️', label: 'Configurações', path: '/configuracoes-app' },
    ],
  },
];
export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 min-h-screen bg-[#0f0f0f] border-r border-[#2a2a2a] flex flex-col">
      {/* Logo - clicável vai pra Início */}
      <Link href="/" className="p-6 border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors group">
        <div className="flex items-center gap-3">
          <span className="text-3xl group-hover:scale-110 transition-transform">🚀</span>
          <div>
            <h1 className="text-xl font-black text-white group-hover:text-[#FFD700] transition-colors">
              LÍDER <span className="text-[#FFD700]">360</span>
            </h1>
            <p className="text-xs text-gray-500">Painel do Líder</p>
          </div>
        </div>
      </Link>
      {/* Menu agrupado */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {menuGroups.map((grupo, idx) => (
          <div key={grupo.titulo} className={idx > 0 ? 'mt-6' : ''}>
            <h3 className="text-[10px] uppercase tracking-wider font-bold text-gray-600 px-4 mb-2">
              {grupo.titulo}
            </h3>
            <div className="space-y-1">
              {grupo.items.map((item) => {
                const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
                      isActive
                        ? 'bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 font-bold shadow-sm shadow-[#FFD700]/10'
                        : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <div className="bg-gradient-to-br from-[#FFD700]/10 to-yellow-600/5 border border-[#FFD700]/20 rounded-xl p-3">
          <p className="text-xs text-gray-400">Versão</p>
          <p className="text-sm font-black text-[#FFD700]">v2.0 — Maio 2026</p>
        </div>
      </div>
    </aside>
  );
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

// ============================================
// 🎯 LAYOUT MOBILE - APP DE BOLSO
// ============================================
// Em vez de sidebar lateral, usa bottom navigation
// Otimizado pra touchscreen
// ============================================

const NAV_ITEMS = [
  { 
    href: '/mobile', 
    icon: '🏠', 
    label: 'Home',
    descricao: 'Próxima tarefa + ações'
  },
  { 
    href: '/mobile/agenda', 
    icon: '📅', 
    label: 'Agenda',
    descricao: 'Tarefas + alarmes'
  },
  { 
    href: '/mobile/feedback', 
    icon: '✍️', 
    label: 'Feedback',
    descricao: 'Registrar feedback'
  },
  { 
    href: '/mobile/time', 
    icon: '👥', 
    label: 'Time',
    descricao: 'Meus colabs'
  },
  { 
    href: '/mobile/copiloto', 
    icon: '🤖', 
    label: 'IA',
    descricao: 'Copiloto Vivo'
  },
];

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  
  // Identifica item ativo
  const isAtivo = (href: string) => {
    if (href === '/mobile') {
      return pathname === '/mobile';
    }
    return pathname.startsWith(href);
  };
  
  // Botão voltar pra web (canto superior)
  const ehHome = pathname === '/mobile';

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      {/* TOPBAR FIXO - Logo + ações */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-[#2a2a2a] safe-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            <div>
              <h1 className="text-base font-black text-white leading-tight">
                LIDER <span className="text-[#FFD700]">360</span>
              </h1>
              <p className="text-[10px] text-gray-500 leading-none">Mobile</p>
            </div>
          </div>
          
          {/* Botão voltar pra versão web */}
          <Link
            href="/"
            className="text-gray-400 hover:text-white text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]"
          >
            💻 Web
          </Link>
        </div>
      </header>
      
      {/* CONTEÚDO - com padding bottom pra não ficar atrás do nav */}
      <main className="flex-1 px-4 pt-4 pb-24 overflow-y-auto">
        {children}
      </main>
      
      {/* BOTTOM NAVIGATION - sempre visível */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-lg border-t border-[#2a2a2a] safe-bottom">
        <div className="grid grid-cols-5 px-1 py-2">
          {NAV_ITEMS.map((item) => {
            const ativo = isAtivo(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${
                  ativo 
                    ? 'bg-[#FFD700]/10 scale-105'
                    : 'hover:bg-[#1a1a1a]'
                }`}
              >
                <span className={`text-xl transition-all ${
                  ativo ? 'scale-110' : ''
                }`}>
                  {item.icon}
                </span>
                <span className={`text-[10px] font-bold ${
                  ativo ? 'text-[#FFD700]' : 'text-gray-400'
                }`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

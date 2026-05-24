'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ============================================
// 🎯 LAYOUT MOBILE - 100% ISOLADO
// ============================================
// Usa overlay fixo cobrindo tudo
// Esconde sidebar + topbar + mascote do layout pai
// ============================================

const NAV_ITEMS = [
  { href: '/mobile', icon: '🏠', label: 'Home' },
  { href: '/mobile/agenda', icon: '📅', label: 'Agenda' },
  { href: '/mobile/feedback', icon: '✍️', label: 'Feedback' },
  { href: '/mobile/time', icon: '👥', label: 'Time' },
  { href: '/mobile/copiloto', icon: '🤖', label: 'IA' },
];

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  const isAtivo = (href: string) => {
    if (href === '/mobile') return pathname === '/mobile';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* 🎯 CSS PRA ESCONDER ELEMENTOS DO LAYOUT PAI */}
      <style jsx global>{`
        /* Esconde sidebar, topbar, mascote, fundo espacial */
        body > div > div > aside,
        body > div > div > div > header,
        body > div > div > div > main,
        body > .fixed,
        body > div[class*="SpaceBackground"],
        body > div[class*="mascote"],
        [data-mascote],
        nav[class*="sidebar"] {
          display: none !important;
        }
        
        /* Body em tela cheia */
        html, body {
          overflow-x: hidden;
          background: #0a0a0a;
        }
        
        body {
          padding: 0 !important;
          margin: 0 !important;
        }
      `}</style>
      
      {/* OVERLAY MOBILE - cobre tudo */}
      <div 
        className="fixed inset-0 bg-[#0a0a0a] text-white z-[9999] flex flex-col h-screen"
      >
        {/* TOPBAR FIXO */}
        <header className="flex-shrink-0 bg-[#0a0a0a] border-b border-[#2a2a2a]">
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
            
            <Link
              href="/"
              className="text-gray-400 hover:text-white text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]"
            >
              💻 Web
            </Link>
          </div>
        </header>
        
        {/* CONTEÚDO */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
          {children}
        </main>
        
        {/* BOTTOM NAVIGATION */}
        <nav className="flex-shrink-0 bg-[#0a0a0a] border-t border-[#2a2a2a]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5 px-1 py-2">
            {NAV_ITEMS.map((item) => {
              const ativo = isAtivo(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg transition-all ${
                    ativo ? 'bg-[#FFD700]/10 scale-105' : 'hover:bg-[#1a1a1a]'
                  }`}
                >
                  <span className={`text-xl transition-all ${ativo ? 'scale-110' : ''}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-bold ${ativo ? 'text-[#FFD700]' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}

import './globals.css';
import type { Metadata } from 'next';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

export const metadata: Metadata = {
  title: 'LÍDER 360 — Painel do Líder Operacional',
  description: 'Sistema de gestão para Team Leaders do Mercado Livre',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0a0a0a] text-white">
        <div className="flex min-h-screen">
          {/* Sidebar fixa à esquerda */}
          <Sidebar />

          {/* Área principal */}
          <div className="flex-1 flex flex-col">
            <Topbar />

            {/* Conteúdo da página atual */}
            <main className="flex-1 p-8 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}

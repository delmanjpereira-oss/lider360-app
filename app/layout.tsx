import './globals.css';
import type { Metadata } from 'next';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Toaster from './components/Toaster';
import ConfirmModal from './components/ConfirmModal';

export const metadata: Metadata = {
  title: 'LIDER 360',
  description: 'Sistema completo de gestão do time MELI',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0a0a0a] text-white min-h-screen">
        <div className="flex">
          <Sidebar />
          <div className="flex-1 flex flex-col min-h-screen">
            <Topbar />
            <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
              {children}
            </main>
          </div>
        </div>
        <Toaster />
        <ConfirmModal />
      </body>
    </html>
  );
}

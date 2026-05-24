import './globals.css';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Toaster from './components/Toaster';
import ConfirmModal from './components/ConfirmModal';
import { MascoteApollo } from './components/MascoteApollo';
import { SpaceBackground } from './components/SpaceBackground';

// ============================================
// 📱 META DADOS DA PWA
// ============================================
export const metadata: Metadata = {
  title: 'LIDER 360',
  description: 'Sistema completo de gestão do time MELI',
  manifest: '/manifest.json',
  applicationName: 'LIDER 360',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LIDER 360',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  formatDetection: {
    telephone: false,
  },
};

// ============================================
// 📱 VIEWPORT PRA MOBILE
// ============================================
export const viewport: Viewport = {
  themeColor: '#FFD700',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* 📱 PWA META TAGS EXTRAS */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LIDER 360" />
      </head>
      <body className="bg-[#0a0a0a] text-white min-h-screen relative overflow-x-hidden">
        {/* 🌌 Fundo espacial fixo */}
        <SpaceBackground />

        {/* Conteúdo do app */}
        <div className="flex relative z-10">
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
        <MascoteApollo />

        {/* 🚀 PWA - Registra Service Worker */}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                  .then((reg) => {
                    console.log('✅ PWA: Service Worker registrado', reg.scope);
                  })
                  .catch((err) => {
                    console.warn('⚠️ PWA: Falha no Service Worker', err);
                  });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}

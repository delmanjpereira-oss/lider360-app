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
  description: 'Sistema completo de gestão do time MELI - LIDER 360',
  manifest: '/manifest.json',
  applicationName: 'LIDER 360',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LIDER 360',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/icon-192.png',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    title: 'LIDER 360',
    description: 'Sistema completo de gestão do time MELI',
    images: [
      {
        url: '/icon-512.png',
        width: 512,
        height: 512,
        alt: 'LIDER 360',
      },
    ],
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
        
        {/* 🎨 Splash Screen iOS */}
        <link rel="apple-touch-startup-image" href="/icon-512.png" />
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

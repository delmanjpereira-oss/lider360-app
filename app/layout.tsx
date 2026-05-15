import './globals.css';
import type { Metadata } from 'next';

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
      <body>{children}</body>
    </html>
  );
}

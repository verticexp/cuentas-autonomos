import { Suspense } from 'react';
import './globals.css';
import './cuentas.css';
import './movil.css';
import TabBar from '@/components/TabBar';

export const metadata = {
  title: 'Cuentas',
  appleWebApp: { capable: true, title: 'Cuentas', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDF0F5' },
    { media: '(prefers-color-scheme: dark)', color: '#121A2E' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Suspense><TabBar /></Suspense>
      </body>
    </html>
  );
}

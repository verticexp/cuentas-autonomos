import { Suspense } from 'react';
import './globals.css';
import './cuentas.css';
import './movil.css';
import './diseno.css';
import TabBar from '@/components/TabBar';
import { usuarioActual } from '@/lib/auth';
import { COLOR_BASE } from '@/lib/marca';
import { permisosDe } from '@/lib/permisos';
import Bloqueo from '@/components/Bloqueo';

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

export default async function RootLayout({ children }) {
  // El color de la empresa tiñe la app (botones, barra, gráficas).
  const u = await usuarioActual().catch(() => null);
  const propio = u?.marca?.color;
  const color = propio || COLOR_BASE;
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ '--acento': color }} data-marca={propio ? 'propia' : 'base'}>
        {children}
        <Suspense><TabBar permisos={permisosDe(u)} /></Suspense>
        {u && <Bloqueo usuario={u.id} />}
      </body>
    </html>
  );
}

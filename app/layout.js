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
import Llegada from '@/components/Llegada';

export const metadata = {
  title: 'Netto',
  appleWebApp: { capable: true, title: 'Netto', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
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
      </head>
      <body style={{ '--acento': color }} data-marca={propio ? 'propia' : 'base'}>
        {children}
        <Suspense><TabBar permisos={permisosDe(u)} /><Llegada /></Suspense>
        {u && <Bloqueo usuario={u.id} />}
      </body>
    </html>
  );
}

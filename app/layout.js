import { Suspense } from 'react';
import './globals.css';
import './cuentas.css';
import './movil.css';
import './diseno.css';
import './pulido.css';
import TabBar from '@/components/TabBar';
import { desbloqueada, modoBloqueo, usuarioActual } from '@/lib/auth';
import { COLOR_BASE } from '@/lib/marca';
import { permisosDe } from '@/lib/permisos';
import Bloqueo from '@/components/Bloqueo';
import Llegada from '@/components/Llegada';
import Arranque from '@/components/Arranque';
import BarraEstado from '@/components/BarraEstado';

// Si ya se vio en esta sesión (o es una página pública/PDF), la pantalla de inicio no llega a pintarse.
// Si la app ya se desbloqueó en esta sesión, el bloqueo tampoco (components/Bloqueo.js).
const YA_VISTO = "try{if(sessionStorage.getItem('netto-abierta')||document.cookie.indexOf('recien=1')>-1)document.documentElement.dataset.abierta='1';var p=location.pathname;if(sessionStorage.getItem('netto-arranque')||p.startsWith('/p/')||p.startsWith('/portal/')||p.startsWith('/pagar/')||p.endsWith('/pdf')||p.startsWith('/invitacion')||p==='/privacidad'||p==='/condiciones')document.documentElement.dataset.arranque='visto'}catch(e){}";

export const metadata = {
  title: 'Netto',
  // App a pantalla completa sin estilo de barra de estado: así iOS pinta la barra con theme-color
  // (components/BarraEstado.js) y pone la hora en blanco o negro según toque.
  other: { 'apple-mobile-web-app-capable': 'yes', 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-title': 'Netto' },
};

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#0F1F1B', // verde de la pantalla de inicio; luego lo cambia components/BarraEstado.js
};

export default async function RootLayout({ children }) {
  // El color de la empresa tiñe la app (botones, barra, gráficas).
  const u = await usuarioActual().catch(() => null);
  const propio = u?.marca?.color;
  const color = propio || COLOR_BASE;
  // Con el bloqueo del servidor activo y sin desbloquear, la pantalla de bloqueo sale aunque el navegador la diera por abierta.
  const abierta = !u || modoBloqueo() !== 'activo' || (await desbloqueada().catch(() => false));
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: YA_VISTO }} />
      </head>
      <body style={{ '--acento': color }} data-marca={propio ? 'propia' : 'base'}>
        <Arranque />
        <script dangerouslySetInnerHTML={{ __html: 'window.__arranque=performance.now()' }} />
        {children}
        <Suspense><TabBar permisos={permisosDe(u)} empresas={u?.misEmpresas} empresa={u?.empresa} admin={Boolean(u?.admin)} /><Llegada /><BarraEstado /></Suspense>
        {u && <Bloqueo email={u.email} servidor={abierta} />}
      </body>
    </html>
  );
}

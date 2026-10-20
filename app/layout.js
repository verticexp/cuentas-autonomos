import { Suspense } from 'react';
import './globals.css';
import './cuentas.css';
import './movil.css';
import './diseno.css';
import './pulido.css';
import './v2.css';
import TabBar from '@/components/TabBar';
import { planesQueFaltan } from '@/lib/modulos';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { bloqueoDe, desbloqueada, usuarioActual } from '@/lib/auth';
import { SOLO_LECTURA_APP, soloLectura } from '@/lib/planes';
import { esApp } from '@/lib/app';
import { COLOR_BASE } from '@/lib/marca';
import { fuente } from '@/components/fuente';
import { permisosDe } from '@/lib/permisos';
import Bloqueo from '@/components/Bloqueo';
import Llegada from '@/components/Llegada';
import Arranque from '@/components/Arranque';
import BarraEstado from '@/components/BarraEstado';
import { WEB } from '@/lib/web';

// Si ya se vio en esta sesión (o es una página pública/PDF), la pantalla de inicio no llega a pintarse.
// Si la app ya se desbloqueó en esta sesión, el bloqueo tampoco (components/Bloqueo.js).
const YA_VISTO = "try{if(sessionStorage.getItem('fisquo-abierta')||document.cookie.indexOf('recien=1')>-1)document.documentElement.dataset.abierta='1';var p=location.pathname;if(sessionStorage.getItem('fisquo-arranque')||p.startsWith('/p/')||p.startsWith('/portal/')||p.startsWith('/pagar/')||p.endsWith('/pdf')||p.startsWith('/invitacion')||p==='/privacidad'||p==='/condiciones'||p==='/login'||p==='/registro')document.documentElement.dataset.arranque='visto'}catch(e){}";

export const metadata = {
  metadataBase: new URL(WEB),
  title: 'Fisquo',
  description: 'Facturación, gastos, impuestos y contabilidad para autónomos y pymes.',
  openGraph: { siteName: 'Fisquo', type: 'website', locale: 'es_ES' },
  // App a pantalla completa sin estilo de barra de estado: así iOS pinta la barra con theme-color
  // (components/BarraEstado.js) y pone la hora en blanco o negro según toque.
  other: { 'apple-mobile-web-app-capable': 'yes', 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-title': 'Fisquo' },
};

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  // Como una app: sin zoom por pellizco (WKWebView lo respeta; Safari, con touch-action en globals.css).
  maximumScale: 1, userScalable: false,
  themeColor: '#0F1F1B', // verde de la pantalla de inicio; luego lo cambia components/BarraEstado.js
};

// Se ven sin desbloquear (las demás piden desbloqueo en lib/auth.js requerir).
const LIBRE = /^\/(bloqueo|login|registro|confirmar-email|privacidad|condiciones|declaracion-responsable|invitacion|p\/|portal\/|pagar\/|sw|manifest|favicon|icon|apple-icon)/;

export default async function RootLayout({ children }) {
  // La app va siempre con el color de Fisquo: el de cada empresa solo sale en sus facturas, presupuestos y páginas
  // de cobro (con algunos colores, en modo oscuro los botones parecían desactivados).
  const u = await usuarioActual().catch(() => null);
  // Con el bloqueo del servidor activo y sin desbloquear, la pantalla de bloqueo sale aunque el navegador la diera por abierta.
  const abierta = !u || bloqueoDe(u) !== 'activo' || (await desbloqueada().catch(() => false));
  // Al abrir una página de la app sin desbloquear: redirección de verdad (307) antes de pintar nada. Desde la página, la
  // redirección ya va dentro del HTML (app/loading.js) y el navegador recarga: dos documentos, fundido lento y barra «fantasma».
  const temaCookie = (await cookies()).get('tema')?.value;
  const tema = temaCookie === 'claro' || temaCookie === 'oscuro' ? temaCookie : undefined;
  const cab = await headers();
  const app = esApp(cab.get('user-agent'));
  const ruta = cab.get('x-ruta') || '/';
  const nonce = cab.get('x-nonce') || undefined;
  if (!abierta && !LIBRE.test(ruta)) redirect(`/bloqueo?a=${encodeURIComponent(ruta)}`);
  return (
    <html lang="es" data-tema={tema} data-app={app ? 'ios' : undefined} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: YA_VISTO }} />
      </head>
      <body className={fuente.variable} style={{ '--acento': COLOR_BASE }} data-marca="base">
        <Arranque />
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: 'window.__arranque=performance.now()' }} />
        {u && soloLectura(u.plan) && !ruta.startsWith('/ajustes/plan') && (
          <p className="aviso-lectura" role="status"><span>{app ? SOLO_LECTURA_APP : 'Tu prueba ha terminado: puedes ver y exportar todo, pero no crear ni editar.'}</span>{!app && <a href="/ajustes/plan">Elegir plan</a>}</p>
        )}
        {children}
        <Suspense>{u && <TabBar permisos={permisosDe(u)} empresas={u.misEmpresas} empresa={u.empresa} admin={Boolean(u.admin)} inventario={Boolean(u.fiscal?.inventario)} fiscal={{ tipo: u.fiscal?.tipo, iva: u.fiscal?.iva }} faltan={planesQueFaltan(u.plan)} />}<Llegada /><BarraEstado /></Suspense>
        {u?.bloqueoPantalla && <Bloqueo email={u.email} servidor={abierta} />}
      </body>
    </html>
  );
}

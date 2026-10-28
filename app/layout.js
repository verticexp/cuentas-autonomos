import { Suspense } from 'react';
import './globals.css';
import './cuentas.css';
import './movil.css';
import './diseno.css';
import './hoja-ajustes.css';
import './pulido.css';
import './v2.css';
import { planesQueFaltan } from '@/lib/modulos';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { bloqueoDe, desbloqueada, usuarioActual } from '@/lib/auth';
import { SOLO_LECTURA_APP, soloLectura } from '@/lib/planes';
import { esApp } from '@/lib/app';
import { COLOR_BASE } from '@/lib/marca';
import { fuente, titulos } from '@/components/fuente';
import { permisosDe, puede } from '@/lib/permisos';
import { conEquipo } from '@/lib/empresa';
import { leer } from '@/lib/redis';
import { resumen as resumenBandeja } from '@/lib/bandeja';
import Bloqueo from '@/components/Bloqueo';
import Llegada from '@/components/Llegada';
import Arranque from '@/components/Arranque';
import RegistrarSw from '@/components/RegistrarSw';
import GestoAtras from '@/components/GestoAtras';
import ToqueSeguro from '@/components/ToqueSeguro';
import BarraEstado from '@/components/BarraEstado';
import TituloCompacto from '@/components/TituloCompacto';
import { WEB } from '@/lib/web';
import Barra from '@/components/Barra';
import BarraDespacho from '@/components/SelectorCuenta';
import SinRed from '@/components/SinRed';
import Hecho from '@/components/Hecho';
import { despachoDe, rolEn, usaEmpresaPropia } from '@/lib/despachos';
import { noLeidosDespacho } from '@/lib/mensajesDespacho';
import { idiomaActual, textos } from '@/lib/idiomaServidor';
import { diccionario } from '@/lib/textos';
import { ProveedorIdioma } from '@/components/Idioma';

// Pantalla de arranque de la web guardada en la pantalla de inicio del iPhone: el mismo verde que la animación de inicio,
// así no hay destello blanco al abrirla. iOS elige la de su tamaño (ancho y alto en puntos, escala); public/inicio-ios/.
const INICIO_IOS = [[440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [428, 926, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [360, 780, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2]];

// Si ya se vio en esta sesión (o es una página pública/PDF), la pantalla de inicio no llega a pintarse. Entrar y registrarse
// tampoco la llevan en la web, pero sí en la app de iOS y en la web guardada en la pantalla de inicio: al abrirlas sin sesión
// es lo primero que se ve tras el verde de lanzamiento.
// Si la app ya se desbloqueó en esta sesión, el bloqueo tampoco (components/Bloqueo.js).
const YA_VISTO = "try{if(sessionStorage.getItem('fisquo-abierta')||document.cookie.indexOf('recien=1')>-1)document.documentElement.dataset.abierta='1';var p=location.pathname;if(sessionStorage.getItem('fisquo-arranque')||p.startsWith('/p/')||p.startsWith('/portal/')||p.startsWith('/pagar/')||p.endsWith('/pdf')||p.startsWith('/invitacion')||p==='/privacidad'||p==='/condiciones'||((p==='/login'||p==='/registro')&&!/FisquoApp\\//.test(navigator.userAgent)&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches))document.documentElement.dataset.arranque='visto'}catch(e){}";

const metadata = {
  metadataBase: new URL(WEB),
  title: { default: 'Fisquo', template: '%s · Fisquo' },
  description: 'Facturación, gastos, impuestos y contabilidad para autónomos y pymes.',
  openGraph: { siteName: 'Fisquo', type: 'website', locale: 'es_ES' },
  // App a pantalla completa sin estilo de barra de estado: así iOS pinta la barra con theme-color
  // (components/BarraEstado.js) y pone la hora en blanco o negro según toque.
  other: { 'apple-mobile-web-app-capable': 'yes', 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-title': 'Fisquo' },
};

// La web pública ya tiene títulos completos; no añade otra vez el nombre de la app.
export async function generateMetadata() {
  const ruta = (await headers()).get('x-ruta')?.split('?')[0] || '/';
  const web = /^\/(precios|pymes|grandes-empresas|autonomos|gestorias|funciones|verificado|business|contacto|seguridad)(?:\/|$)/.test(ruta);
  return web ? { ...metadata, title: { default: 'Fisquo', template: '%s' } } : metadata;
}

export async function generateViewport() {
  const app = esApp((await headers()).get('user-agent'));
  return {
    width: 'device-width', initialScale: 1, viewportFit: 'cover',
    ...(app ? { maximumScale: 1, userScalable: false } : {}),
    themeColor: '#0F1F1B', // Arranque; BarraEstado lo actualiza después.
  };
}

// Se ven sin desbloquear (las demás piden desbloqueo en lib/auth.js requerir).
const LIBRE = /^\/(bloqueo|login|registro|confirmar-email|privacidad|condiciones|declaracion-responsable|invitacion|p\/|portal\/|pagar\/|sw|manifest|favicon|icon|apple-icon)/;

export default async function RootLayout({ children }) {
  // La app va siempre con el color de Fisquo: el de cada empresa solo sale en sus facturas, presupuestos y páginas
  // de cobro (con algunos colores, en modo oscuro los botones parecían desactivados).
  const u = await usuarioActual().catch(() => null);
  // Facturas por revisar (lib/bandeja.js): su número va en la pestaña Gastos, para que se vean desde cualquier pantalla.
  const porRevisar = u && puede(u, 'gastos') ? resumenBandeja((await leer(u, 'bandeja').catch(() => [])) || []).pendientes : 0;
  // «Equipo» en el menú solo con trabajadores (lib/empresa.js conEquipo); los empleados se leen solo si no lo dijo al empezar.
  const equipo = u && puede(u, 'nominas') && (u.fiscal?.trabajadores || conEquipo(u, (await leer(u, 'empleados').catch(() => [])) || []));
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
  // Mi despacho (app/despacho): su propia barra en lugar de la de la empresa.
  const despacho = u?.despacho && (await despachoDe(u.despacho).catch(() => null));
  const rolDespacho = despacho ? rolEn(despacho, u.id) : null;
  const enDespacho = Boolean(rolDespacho && /^\/despacho(\/|$)/.test(ruta.split('?')[0]));
  // La barra la elige components/Barra.js con la ruta del navegador: aquí van las dos (la del despacho, si es de uno).
  const mensajesNuevos = rolDespacho ? await noLeidosDespacho(despacho, u.id).catch(() => 0) : 0;
  // Idioma de la app (lib/i18n.js): los componentes cliente lo leen de ProveedorIdioma; los del servidor, de lib/idiomaServidor.js.
  const idioma = await idiomaActual();
  const tr = await textos();
  return (
    <html lang={idioma} data-tema={tema} data-app={app ? 'ios' : undefined} suppressHydrationWarning>
      <head>
        {INICIO_IOS.map(([an, al, e]) => (
          <link key={`${an}x${al}x${e}`} rel="apple-touch-startup-image" href={`/inicio-ios/${an * e}x${al * e}.png`}
            media={`(device-width: ${an}px) and (device-height: ${al}px) and (-webkit-device-pixel-ratio: ${e}) and (orientation: portrait)`} />
        ))}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: YA_VISTO }} />
      </head>
      <body className={`${fuente.variable} ${titulos.variable}`} style={{ '--acento': COLOR_BASE }} data-marca="base">
        <ProveedorIdioma idioma={idioma} dic={diccionario(idioma)}>
        <Arranque />
        <RegistrarSw />
        <GestoAtras />
        <SinRed />
        <Hecho />
        <ToqueSeguro />
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: 'window.__arranque=performance.now()' }} />
        {/* En Mi despacho no: el panel trabaja con su propio plan, no con el del cliente que tenga abierto (lib/planes.js LIBRES). */}
        {u && soloLectura(u.plan) && !ruta.startsWith('/ajustes/plan') && !/^\/despacho([/?]|$)/.test(ruta) && (
          <p className="aviso-lectura" role="status"><span>{tr(u.viaDespacho ? 'La prueba de este cliente ha terminado: puedes ver y exportar todo, pero no crear ni editar hasta que elija un plan o le des una licencia.' : app ? SOLO_LECTURA_APP : puede(u, 'empresa') ? 'Tu prueba ha terminado: puedes ver y exportar todo, pero no crear ni editar.' : 'La prueba de tu empresa ha terminado: puedes ver y exportar todo. Para crear o editar, pídele al administrador que elija un plan.')}</span>{!app && puede(u, 'empresa') && <a href="/ajustes/plan">{tr('Elegir plan')}</a>}</p>
        )}
        {/* La gente de un despacho, fuera del panel: «‹ Mi despacho» y el selector de cuenta (se esconde sola en el panel). */}
        {rolDespacho && <BarraDespacho actual={u.viaDespacho ? 'cliente' : 'empresa'} despacho={despacho.nombre} noLeidos={mensajesNuevos} usuario={u.id}
          cliente={u.viaDespacho ? { id: u.empresa, nombre: u.empresaNombre || u.emisor?.nombre || 'Cliente' } : null}
          empresas={rolDespacho === 'titular' && usaEmpresaPropia(despacho) ? (u.misEmpresas || []).filter((x) => !x.cliente) : []}
          empresa={u.viaDespacho ? null : u.empresa} empresaNombre={u.viaDespacho ? '' : u.empresaNombre} />}
        {children}
        <Suspense><Barra despacho={rolDespacho ? { nombre: despacho.nombre, noLeidos: mensajesNuevos, titular: rolDespacho === 'titular' && usaEmpresaPropia(despacho) } : null} tabbar={u ? { despacho: rolDespacho ? (u.viaDespacho ? 'cliente' : usaEmpresaPropia(despacho) ? 'empresa' : 'cliente') : null, porRevisar, permisos: permisosDe(u), empresas: u.misEmpresas, empresa: u.empresa, admin: Boolean(u.admin), inventario: Boolean(u.fiscal?.inventario), equipo: Boolean(equipo), fiscal: { tipo: u.fiscal?.tipo, iva: u.fiscal?.iva }, faltan: planesQueFaltan(u.plan) } : null} /><Llegada /><BarraEstado /><TituloCompacto /></Suspense>
        {u?.bloqueoPantalla && <Bloqueo email={u.email} servidor={abierta} />}
        </ProveedorIdioma>
      </body>
    </html>
  );
}

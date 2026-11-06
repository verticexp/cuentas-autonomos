// Las apps de iOS y Android (mobile/, Capacitor) cargan esta misma web y añaden «FisquoApp/<versión>» a su user agent.
// Dentro de la app no se enseña la web pública (precios de la web, planes, «pedir acceso»): las normas de las tiendas
// (3.1.1 de Apple) no permiten anunciar ni enlazar una compra fuera de la app. En la de iOS los planes se contratan con
// compras dentro de la app (lib/compraApple.js, components/PlanesApple.js), así que allí sí se puede llevar a
// Ajustes › Tu plan; en la de Android, que aún no tiene compras, no se habla de planes.
export const esApp = (ua) => /(^|\s)FisquoApp\/\d/.test(ua || '');
// La de Android (mobile/android) añade lo mismo; su WebView ya dice «Android». 'ios' | 'android' | null.
export const plataformaApp = (ua) => (!esApp(ua) ? null : /Android/.test(ua) ? 'android' : 'ios');
// En el navegador, desde <html data-app> (app/layout.js).
export const enAndroid = () => typeof document !== 'undefined' && document.documentElement.dataset.app === 'android';

// Páginas de app/(web). «/» es la portada sin sesión; con sesión es el panel y no se toca.
const WEB_PUBLICA = /^\/(funciones|precios|autonomos|pymes|business|grandes-empresas|seguridad|verificado|contacto|gestorias|demo|guias|comparativa|aviso-legal)(\/|$)/;

// Adónde mandar una petición de la app que pide la web pública, o null si puede seguir.
export function desvioApp({ ua, ruta, conSesion }) {
  if (!esApp(ua)) return null;
  ruta = ruta.split('?')[0];
  if (/^\/registro\/?$/.test(ruta)) return conSesion ? '/' : '/login';
  // «Tu plan» (solo el plan y su estado, components/ElegirPlan.js) y los avisos (nativos, lib/avisosNativos.js) sí se ven;
  // recomendar, no.
  if (conSesion && /^\/ajustes\/recomienda\/?$/.test(ruta)) return '/ajustes';
  if (ruta === '/' ? !conSesion : WEB_PUBLICA.test(ruta)) return conSesion ? '/' : '/login';
  return null;
}

// Los errores de capacidad o de herramientas no anuncian cambios de plan dentro de la app de Android (sin compras).
export const sinCompras = (ua) => plataformaApp(ua) === 'android';
export const mensajePlan = (texto, ua) => texto && sinCompras(ua) ? 'Esta acción no está disponible en tu cuenta.' : texto;

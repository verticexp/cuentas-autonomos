// La app de iOS (mobile/, Capacitor) carga esta misma web y añade «FisquoApp/<versión>» a su user agent.
// Dentro de la app no se enseña la web pública (precios, planes, «pedir acceso»): la suscripción solo se
// contrata en la web, y las normas de Apple (3.1.1) no permiten anunciar ni enlazar la compra desde la app.
export const esApp = (ua) => /(^|\s)FisquoApp\/\d/.test(ua || '');

// Páginas de app/(web). «/» es la portada sin sesión; con sesión es el panel y no se toca.
const WEB_PUBLICA = /^\/(funciones|precios|autonomos|pymes|business|grandes-empresas|seguridad|verificado|contacto|gestorias)(\/|$)/;

// Adónde mandar una petición de la app que pide la web pública, o null si puede seguir.
export function desvioApp({ ua, ruta, conSesion }) {
  if (!esApp(ua)) return null;
  ruta = ruta.split('?')[0];
  if (/^\/registro\/?$/.test(ruta)) return conSesion ? '/' : '/login';
  if (conSesion && /^\/ajustes\/(plan|recomienda|avisos)\/?$/.test(ruta)) return '/ajustes';
  if (ruta === '/' ? !conSesion : WEB_PUBLICA.test(ruta)) return conSesion ? '/' : '/login';
  return null;
}

// Los errores de capacidad o de herramientas no anuncian cambios de plan dentro de la app.
export const mensajePlan = (texto, ua) => texto && esApp(ua) ? 'Esta acción no está disponible en tu cuenta.' : texto;

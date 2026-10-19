// La app de iOS (mobile/, Capacitor) carga esta misma web y añade «NettoApp/<versión>» a su user agent.
// Dentro de la app no se enseña la web pública (precios, planes, «pedir acceso»): la suscripción solo se
// contrata en la web, y las normas de Apple (3.1.1) no permiten anunciar ni enlazar la compra desde la app.
export const esApp = (ua) => /(^|\s)NettoApp\/\d/.test(ua || '');

// Páginas de app/(web). «/» es la portada sin sesión; con sesión es el panel y no se toca.
const WEB_PUBLICA = /^\/(funciones|precios|autonomos|pymes|business|grandes-empresas|seguridad|contacto|gestorias)(\/|$)/;

// Adónde mandar una petición de la app que pide la web pública, o null si puede seguir.
export function desvioApp({ ua, ruta, conSesion }) {
  if (!esApp(ua)) return null;
  if (ruta === '/' ? !conSesion : WEB_PUBLICA.test(ruta)) return conSesion ? '/' : '/login';
  return null;
}

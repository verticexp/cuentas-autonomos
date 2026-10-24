// La app recuerda 30 s las pantallas ya vistas (next.config.mjs, staleTimes.dynamic): volver a una pestaña es instantáneo y
// no repite sus consultas a la base de datos. Para no enseñar datos viejos después de guardar algo, se vigila cada petición
// a /api/ que cambia datos (todo lo que no es GET): tras una, la siguiente navegación vacía antes esa memoria
// (router.refresh, en lib/transicion.js navegar y en components/Llegada.js para los enlaces sin transición).
let cambiados = false;

export function vigilarCambios() {
  if (typeof window === 'undefined' || window.__vigilaCambios) return;
  window.__vigilaCambios = true;
  const original = window.fetch;
  window.fetch = async (entrada, opciones) => {
    const r = await original(entrada, opciones);
    try {
      const metodo = String(opciones?.method || entrada?.method || 'GET').toUpperCase();
      const url = new URL(typeof entrada === 'string' || entrada instanceof URL ? entrada : entrada.url, location.href);
      if (r.ok && metodo !== 'GET' && metodo !== 'HEAD' && url.origin === location.origin && url.pathname.startsWith('/api/')) cambiados = true;
    } catch { /* una dirección rara no impide la respuesta */ }
    return r;
  };
}

// ¿Ha cambiado algo desde la última vez? Lo dice una sola vez.
export function tomarCambios() {
  const c = cambiados;
  cambiados = false;
  return c;
}

// Destino tras desbloquear (?a=): solo rutas del propio origen. Lo comparten el servidor (app/bloqueo/page.js) y el cliente
// (components/Bloqueo.js). El navegador quita tabuladores y saltos de línea al leer una URL («/\t/otra.web» acabaría en
// //otra.web): se rechazan los caracteres de control, los espacios y las barras invertidas, y se compara el origen
// resultante. Devuelve ruta + búsqueda + ancla, o «/» si no vale.
const BASE = 'https://destino.invalid';
const SALE = /^\/(?![/\\])/;

export function destinoInterno(a) {
  if (typeof a !== 'string' || !SALE.test(a) || /[\u0000- \u007f-\u009f\\]/.test(a)) return '/';
  try {
    const u = new URL(a, BASE);
    const destino = `${u.pathname}${u.search}${u.hash}`;
    // «/..//otra.web» se normaliza a «//otra.web»: tampoco vale.
    if (u.origin !== BASE || u.pathname.startsWith('/bloqueo') || !SALE.test(destino)) return '/';
    return destino;
  } catch { return '/'; }
}

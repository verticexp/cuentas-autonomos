// Solo para las pruebas: Node no resuelve «next/headers» ni «next/navigation» sin la extensión (Next sí), ni el alias
// «@/» de las rutas (jsconfig). Así se pueden cargar fuera de Next los módulos de lib/ que los importan (auth,
// auditoría…) y los route.js. Uso: import './apoyo/cargador.mjs';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
let raiz;
export async function initialize(datos) { raiz = datos.raiz; }
export async function resolve(especificador, contexto, siguiente) {
  if (/^next\\/(headers|navigation|server)$/.test(especificador)) return siguiente(especificador + '.js', contexto);
  if (especificador.startsWith('@/')) {
    const ruta = especificador.slice(2);
    return siguiente(new URL(/\\.[cm]?js$/.test(ruta) ? ruta : ruta + '.js', raiz).href, contexto);
  }
  return siguiente(especificador, contexto);
}`), import.meta.url, { data: { raiz: new URL('../../', import.meta.url).href } });

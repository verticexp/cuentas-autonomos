// Solo para las pruebas: Node no resuelve «next/headers» ni «next/navigation» sin la extensión (Next sí). Así se pueden
// cargar fuera de Next los módulos de lib/ que los importan (auth, auditoría…). Uso: import './apoyo/cargador.mjs';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(especificador, contexto, siguiente) {
  if (/^next\\/(headers|navigation|server)$/.test(especificador)) return siguiente(especificador + '.js', contexto);
  return siguiente(especificador, contexto);
}`), import.meta.url);

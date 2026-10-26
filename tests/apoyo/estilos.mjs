// Lector sencillo de CSS para las pruebas de estilos (tests/estilos-coherentes.test.mjs): devuelve cada declaración con su
// selector, las reglas @ que la envuelven (media, supports, keyframes…) y su línea. No valida el CSS: solo lo recorre con
// la precisión justa para saber qué hay dentro de qué.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function declaraciones(css) {
  const out = [];
  const pila = []; // { tipo: 'at' | 'regla', texto }
  let linea = 1, prelude = '', preludeLinea = 1, i = 0, paren = 0;
  const n = css.length;
  const cierraDecl = (texto, ln) => {
    const t = texto.trim();
    if (!t || !pila.length || pila.at(-1).tipo !== 'regla') return;
    const k = t.indexOf(':');
    if (k < 0) return;
    out.push({
      prop: t.slice(0, k).trim().toLowerCase(), valor: t.slice(k + 1).trim(), linea: ln,
      selector: pila.at(-1).texto, ats: pila.filter((p) => p.tipo === 'at').map((p) => p.texto),
    });
  };
  while (i < n) {
    const c = css[i];
    if (c === '\n') linea += 1;
    if (c === '/' && css[i + 1] === '*') { const f = css.indexOf('*/', i + 2); const fin = f < 0 ? n : f + 2; linea += (css.slice(i, fin).match(/\n/g) || []).length; i = fin; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && css[j] !== c) { if (css[j] === '\\') j += 1; j += 1; } prelude += css.slice(i, j + 1); i = j + 1; continue; }
    if (c === '(') paren += 1;
    if (c === ')') paren -= 1;
    if (paren > 0) { prelude += c; i += 1; continue; }
    if (c === '{') {
      const texto = prelude.trim();
      pila.push({ tipo: texto.startsWith('@') ? 'at' : 'regla', texto: texto.replace(/\s+/g, ' ') });
      prelude = ''; preludeLinea = linea; i += 1; continue;
    }
    if (c === '}') { cierraDecl(prelude, preludeLinea); pila.pop(); prelude = ''; preludeLinea = linea; i += 1; continue; }
    if (c === ';') { cierraDecl(prelude, preludeLinea); prelude = ''; preludeLinea = linea; i += 1; continue; }
    if (!prelude.trim()) preludeLinea = linea;
    prelude += c; i += 1;
  }
  return out;
}

// Los CSS propios de la app (no la web pública): app/*.css y components/*.css / *.module.css.
export function archivosCss(raiz) {
  const lista = [];
  for (const dir of ['app', 'components']) {
    for (const f of readdirSync(join(raiz, dir))) if (f.endsWith('.css')) lista.push(`${dir}/${f}`);
  }
  return lista.sort();
}

export const leerCss = (raiz, ruta) => readFileSync(join(raiz, ruta), 'utf8');

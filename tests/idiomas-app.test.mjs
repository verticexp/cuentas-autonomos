// Idioma de la app (lib/i18n.js y lib/textos): el castellano sale exactamente igual, cada texto del diccionario existe en el
// código (si alguien cambia el castellano, la traducción vieja no se queda colgada sin avisar) y las traducciones conservan
// sus huecos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { idiomaDe, traductor } from '../lib/i18n.js';
import { ZONAS, diccionario } from '../lib/textos/index.js';

const raiz = new URL('..', import.meta.url).pathname;
const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const r = join(dir, n);
  return statSync(r).isDirectory() ? archivos(r) : /\.(js|mjs)$/.test(n) ? [r] : [];
});
const codigo = ['app', 'components', 'lib'].flatMap((d) => archivos(join(raiz, d)))
  .filter((r) => !r.includes('/lib/textos/'))
  .map((r) => readFileSync(r, 'utf8')).join('\n');
const huecos = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();

test('idiomaDe: la cookie manda; si no, el primer idioma de la app que pide el aparato', () => {
  assert.equal(idiomaDe({ cookie: 'en', aceptados: 'ca-ES,ca;q=0.9' }), 'en');
  assert.equal(idiomaDe({ cookie: 'fr', aceptados: 'ca-ES,ca;q=0.9' }), 'ca');
  assert.equal(idiomaDe({ aceptados: 'ca-ES-valencia' }), 'ca');
  assert.equal(idiomaDe({ aceptados: 'fr-FR,en;q=0.8,es;q=0.5' }), 'en');
  assert.equal(idiomaDe({ aceptados: 'gl-ES,es;q=0.9' }), 'es');
  assert.equal(idiomaDe({ aceptados: 'en;q=0.4,es;q=0.9' }), 'es');
  assert.equal(idiomaDe({ aceptados: 'de-DE' }), 'es');
  assert.equal(idiomaDe({}), 'es');
});

test('en castellano el texto sale tal cual, también con huecos', () => {
  const tr = traductor(diccionario('es'));
  assert.equal(tr('Facturas'), 'Facturas');
  assert.equal(tr('Plazo en 5 días'), 'Plazo en 5 días');
  assert.equal(tr('{n} días', { n: 30 }), '30 días');
  assert.equal(tr(undefined), undefined);
});

test('traduce textos exactos, con huecos y ya compuestos; lo desconocido sale en castellano', () => {
  const ca = traductor(diccionario('ca')), en = traductor(diccionario('en'));
  assert.equal(ca('Facturas'), 'Factures');
  assert.equal(en('Gastos'), 'Expenses');
  assert.equal(en('{n} días', { n: 30 }), '30 days');
  assert.equal(en('Plazo en 5 días'), 'Due in 5 days');
  assert.equal(ca('Prueba: 12 días'), 'Prova: queden 12 dies');
  assert.equal(en('Un texto que no está'), 'Un texto que no está');
  // Una plantilla corta («{perfil} en {empresa}») no se usa para reconocer frases: estropearía cualquiera con «en».
  assert.equal(en('Pagado en efectivo'), 'Pagado en efectivo');
});

test('diccionarios: cada texto existe en el código, con traducción a los dos idiomas y los mismos huecos', () => {
  for (const [zona, textos] of Object.entries(ZONAS)) {
    for (const [es, par] of Object.entries(textos)) {
      assert.ok(Array.isArray(par) && par.length === 2, `${zona}: «${es}» necesita [catalán, inglés]`);
      for (const tr of par) {
        assert.equal(typeof tr, 'string', `${zona}: «${es}»`);
        if (tr) assert.equal(huecos(tr), huecos(es), `${zona}: huecos distintos en «${tr}»`);
        assert.equal(tr, tr.trim(), `${zona}: espacios sobrantes en «${tr}»`);
      }
      // Los textos con huecos se escriben en el código con ${…}: basta con que estén sus trozos fijos.
      const trozos = es.split(/\{\w+\}/).map((x) => x.trim()).filter((x) => x.length >= 3);
      const esta = huecos(es) ? (codigo.includes(es) || trozos.every((x) => codigo.includes(x))) : codigo.includes(es);
      assert.ok(esta, `${zona}: «${es}» no aparece en el código (¿ha cambiado el texto en castellano?)`);
    }
  }
});

test('un texto no tiene dos traducciones distintas en dos zonas', () => {
  const visto = {};
  for (const [zona, textos] of Object.entries(ZONAS)) {
    for (const [es, par] of Object.entries(textos)) {
      if (visto[es]) assert.deepEqual(par, visto[es].par, `«${es}» en ${zona} y en ${visto[es].zona}`);
      else visto[es] = { zona, par };
    }
  }
});

test('las fechas en texto de lib/formato.js salen en el idioma, también dentro de un hueco', () => {
  const ca = traductor(diccionario('ca'), 'ca'), en = traductor(diccionario('en'), 'en'), es = traductor(diccionario('es'), 'es');
  assert.equal(es('20 de octubre'), '20 de octubre');
  assert.equal(ca('20 de octubre'), '20 d’octubre');
  assert.equal(ca('lunes, 26 de octubre'), 'dilluns, 26 d’octubre');
  assert.equal(en('lunes, 26 de octubre'), 'Monday 26 October');
  assert.equal(en('3 de marzo de 2026'), '3 March 2026');
  assert.equal(en('Plazo en 20 de octubre'), 'Plazo en 20 de octubre');
});

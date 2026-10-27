import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ESCANEOS_MES } from '../lib/cuotasIAConfig.js';
import { PLANES, SEGMENTOS, COMPARATIVA, DESCUENTO, FAQ_PRECIOS } from '../components/web/datos.js';

const valores = (seg, fila) => COMPARATIVA[seg].flatMap(([, filas]) => filas).find(([nombre]) => nombre === fila)?.[1];

test('oferta pública: seis planes, dos segmentos y Business sin precio', () => {
  assert.deepEqual(SEGMENTOS.map(({ id }) => id), ['aut', 'pym', 'business']);
  assert.equal(SEGMENTOS[2].ruta, '/business');
  assert.equal(SEGMENTOS[2].desde, undefined);
  assert.equal(PLANES.business, undefined);
  assert.deepEqual(PLANES.aut.map(({ p }) => p), [9, 12, 20]);
  assert.deepEqual(PLANES.pym.map(({ p }) => p), [25, 32, 55]);
  for (const seg of ['aut', 'pym']) {
    assert.equal(PLANES[seg].length, 3);
    for (const plan of PLANES[seg]) {
      assert.ok(plan.l.length <= 6);
      assert.doesNotMatch(plan.l.join(' '), /[235] empresas|IA ampliados|IA sin límite|Autónomos Pro/);
    }
    assert.deepEqual(valores(seg, 'Empresas por suscripción'), ['1', '1', '1']);
    assert.deepEqual(valores(seg, 'Acceso separado de gestoría (no consume usuarios)'), ['1', '1', '1']);
    assert.deepEqual(valores(seg, 'Páginas al mes'), PLANES[seg].map(p => ESCANEOS_MES[seg][p.n].toLocaleString('es-ES', { useGrouping: 'always' })));
    for (const [, filas] of COMPARATIVA[seg]) for (const [, celdas] of filas) assert.equal(celdas.length, 3);
  }
});

test('capacidad y funciones de cada segmento sin heredar Autónomos Pro en Pymes', () => {
  assert.deepEqual(valores('aut', 'Usuarios internos'), ['1', '1', '2']);
  assert.deepEqual(valores('pym', 'Usuarios internos con permisos'), ['2', '8', '15']);
  assert.deepEqual(valores('aut', 'Nóminas y jornada'), [false, false, '1 empleado']);
  assert.deepEqual(valores('pym', 'Nóminas y jornada'), ['3 empleados', '15 empleados', '30 empleados']);
  assert.deepEqual(valores('aut', 'Conciliación bancaria'), [false, true, true]);
  assert.deepEqual(valores('pym', 'Conciliación bancaria'), [true, true, true]);
  assert.deepEqual(valores('aut', 'Rentabilidad por proyecto'), [false, false, true]);
  assert.deepEqual(valores('pym', 'Rentabilidad por proyecto'), [false, true, true]);
  assert.deepEqual(valores('pym', 'Cartera de cobros y remesas SEPA'), [false, true, true]);
  assert.equal(valores('aut', 'Cartera de cobros y remesas SEPA'), undefined);
  for (const seg of ['aut', 'pym']) {
    for (const fila of ['Inventario, pedidos y albaranes', 'Previsión de caja', 'Asistente IA']) {
      assert.deepEqual(valores(seg, fila), [false, true, true]);
    }
    assert.deepEqual(valores(seg, 'Portal del cliente y avisos push'), [true, true, true]);
  }
});

test('importes anuales exactos de los seis planes con 30 % de descuento', () => {
  assert.equal(DESCUENTO, 30);
  const centimosAnuales = ['aut', 'pym'].flatMap((seg) => PLANES[seg].map(({ p }) => Math.round(p * 12 * (100 - DESCUENTO))));
  assert.deepEqual(centimosAnuales, [7560, 10080, 16800, 21000, 26880, 46200]);
});

test('catálogo histórico gra conserva precios y capacidad existentes', () => {
  assert.deepEqual(PLANES.gra.map(({ n, p }) => [n, p]), [['Esencial', 45], ['Pro', 75], ['Plus', 110]]);
  assert.equal(PLANES.gra[0].l[1], '5 empresas · 20 usuarios');
  assert.equal(PLANES.gra[1].l[0], '15 empresas · 50 usuarios');
  assert.equal(PLANES.gra[2].l[0], '40 empresas · usuarios ilimitados');
});

test('ruta histórica redirige permanentemente a Business y CTA anual conserva periodo', async () => {
  const antigua = await readFile(new URL('../app/(web)/grandes-empresas/page.js', import.meta.url), 'utf8');
  assert.match(antigua, /permanentRedirect\('\/business'\)/);
  const precios = await readFile(new URL('../components/web/Precios.js', import.meta.url), 'utf8');
  assert.match(precios, /&periodo=anio/);
  assert.match(precios, /Recomendado/);
  assert.match(precios, /CONTRATABLES\.map/);
  assert.doesNotMatch(precios, /SEGMENTOS\.map|El más elegido/);
  assert.match(FAQ_PRECIOS.flat().join(' '), /30 días sin tarjeta/);
});

test('lo que la web promete sobre la prueba y los datos coincide con el código', async () => {
  const { ESCANEOS_PRUEBA } = await import('../lib/cuotasIAConfig.js');
  const { CONFIANZA, FAQ_GENERAL } = await import('../components/web/datos.js');
  const gestorias = await readFile(new URL('../lib/gestorias.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const pagina = await readFile(new URL('../app/(web)/precios/page.js', import.meta.url), 'utf8');
  // «3 meses» con el código de una gestoría y «50 páginas» en la prueba.
  assert.match(gestorias, /PRUEBA_GESTORIA_DIAS = 90;/);
  assert.match(FAQ_PRECIOS.flat().join(' '), /con su código la prueba dura 3 meses/);
  assert.match(pagina, new RegExp(`${ESCANEOS_PRUEBA} páginas de lectura IA`));
  // «Servidores en Fráncfort»: la región de Vercel.
  assert.deepEqual(vercel.regions, ['fra1']);
  assert.match(CONFIANZA.map((c) => c.t).join(' '), /Fráncfort/);
  assert.match(FAQ_GENERAL.flat().join(' '), /Fráncfort/);
});

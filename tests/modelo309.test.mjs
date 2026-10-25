// 309: sin 303 (exento, recargo de equivalencia, agricultura), el IVA de las compras a la UE o con inversión del sujeto
// pasivo (diseño de registro DR309 v1.4 de la AEAT; arts. 84.Uno.2.º y 156 LIVA). Esperados calculados a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelo309, modelo347 } from '../lib/modelos.js';
import { casillas303, costeGasto, resumenAnual } from '../lib/calculos.js';

const gas = (id, fecha, base, x = {}) => ({ id, fecha, actividad: 'a', concepto: id, proveedor: 'Proveedor', base, ivaPct: 0, ...x });
const anuncios = gas('ads', '2026-02-10', 100, { proveedorNif: 'IE6388047V' }); // servicio de Irlanda: inversión del sujeto pasivo
const genero = gas('genero', '2026-02-11', 1000, { proveedorNif: 'FR12345678901', categoria: '600', ivaAuto: 10 }); // bienes de Francia

test('médico exento: Google Ads de Irlanda, 21 € en el 309 (hecho 3, situación 3) y coste de 121 €', () => {
  const m = modelo309([anuncios], 2026, 1, { regimen: 'exento' });
  assert.deepEqual(m.declaraciones.map((d) => [d.hecho, d.situacion, d.c['01'], d.c['02'], d.c['03'], d.c['24']]), [[3, 3, 100, 21, 21, 21]]);
  assert.equal(costeGasto(anuncios, { ivaCoste: true }), 121);
  assert.equal(resumenAnual([], [anuncios], 2026, {}, ['a'], { ivaCoste: true }).trimestres[0].gastos, 121);
  assert.deepEqual(modelo309([anuncios], 2026, 2).declaraciones, []);
});

test('tienda en recargo: bienes de Francia al 10 % con su recargo del 1,4 % (hecho 1, situación 2)', () => {
  const m = modelo309([anuncios, genero], 2026, 1, { regimen: 'recargo' });
  const aib = m.declaraciones.find((d) => d.hecho === 1);
  assert.deepEqual([aib.situacion, aib.c['01'], aib.c['02'], aib.c['03'], aib.c['10'], aib.c['11'], aib.c['12'], aib.c['22'], aib.c['24']], [2, 1000, 10, 100, 1000, 1.4, 14, 114, 114]);
  assert.equal(m.ingresar, 135);
});

test('compra de España con inversión del sujeto pasivo: 12-13 y 28-29 del 303, y 347 con su marca', () => {
  const obra = gas('obra', '2026-05-10', 4000, { origen: 'isp', proveedor: 'Construcciones Ruiz', proveedorNif: 'B11111119' });
  const c = casillas303([], [obra], 2026, 2);
  assert.deepEqual([c['12'], c['13'], c['28'], c['29'], c['46']], [4000, 840, 4000, 840, 0]);
  const r = modelo347([], [obra], 2026);
  assert.deepEqual(r.compras.map((o) => [o.nif, o.total, Boolean(o.isp)]), [['B11111119', 4000, true]]);
  // Sin 303: va al 309 como inversión del sujeto pasivo.
  assert.deepEqual(modelo309([obra], 2026, 2, { regimen: 'exento' }).declaraciones.map((d) => [d.hecho, d.c['03']]), [[3, 840]]);
});

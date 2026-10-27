// Caja, fase 1 (lib/caja.js, lib/ticket.js, lib/asientos.js): foto del informe Z, arqueo y días sin cierre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cuentasArqueo, diasSinCerrar, fondoInicial, limpiarCierre } from '../lib/caja.js';
import { limpiarZ } from '../lib/ticket.js';
import { generarAsientos } from '../lib/asientos.js';
import { festivoNacional } from '../lib/festivos.js';

const HOY = '2026-10-27'; // martes

test('informe Z: suma los tipos, respeta el cobro y avisa de lo que no cuadra', () => {
  const z = limpiarZ({ fecha: '2026-10-26', porIva: [{ pct: 10, total: '312,40' }, { pct: 21, total: 45.6 }, { pct: 10, total: 10 }], total: 368, efectivo: 120, tarjeta: '248,00', otros: null, desde: '0451', hasta: 'null' }, HOY);
  assert.deepEqual(z.porIva, [{ pct: 10, total: 322.4 }, { pct: 21, total: 45.6 }]);
  assert.equal(z.fecha, '2026-10-26');
  assert.deepEqual([z.efectivo, z.tarjeta, z.otros, z.desde, z.hasta], [120, 248, null, '0451', '']);
  assert.deepEqual(z.avisos, []);
  const mal = limpiarZ({ fecha: '2027-01-01', porIva: [], total: 50, efectivo: 10, tarjeta: 10 }, HOY);
  assert.deepEqual(mal.porIva, [{ pct: 21, total: 50 }]);
  assert.equal(mal.fecha, HOY);
  assert.equal(mal.avisos.length, 3); // sin desglose, cobro que no cuadra y fecha dudosa
  assert.deepEqual(limpiarZ({ porIva: [{ pct: 7, total: 20 }] }, HOY, { igic: true }).porIva, [{ pct: 7, total: 20 }]);
  assert.deepEqual(limpiarZ({ porIva: [{ pct: 7, total: 20 }] }, HOY).porIva, []);
});

test('arqueo: debería haber = fondo + efectivo − salidas; lo contado da el descuadre', () => {
  const c = limpiarCierre({ fecha: '2026-10-26', porIva: [{ pct: 10, total: 300 }], efectivo: 120, arqueo: { fondo: '100', contado: '168,50', salidas: [{ tipo: 'banco', importe: 50 }, { tipo: 'nada', importe: '0' }] } });
  assert.deepEqual(c.caja.arqueo, { fondo: 100, contado: 168.5, salidas: [{ tipo: 'banco', importe: 50 }] });
  assert.deepEqual(cuentasArqueo(c), { fondo: 100, efectivo: 120, salidas: 50, esperado: 170, contado: 168.5, descuadre: -1.5 });
  // Sin contar el cajón no hay arqueo; negativos, no.
  assert.equal(limpiarCierre({ fecha: '2026-10-26', porIva: [{ pct: 10, total: 30 }], arqueo: { fondo: 100, contado: '' } }).caja.arqueo, undefined);
  assert.ok(limpiarCierre({ fecha: '2026-10-26', porIva: [{ pct: 10, total: 30 }], arqueo: { fondo: -1, contado: 3 } }).error);
  assert.equal(cuentasArqueo({ caja: { efectivo: 1 } }), null);
  assert.match(limpiarCierre({ fecha: '2026-10-26', porIva: [{ pct: 10, total: 30 }], efectivo: 30, arqueo: { fondo: 10, contado: 0, salidas: [{ tipo: 'banco', importe: 41 }] } }).error, /solo había 40,00/);
});

test('fondo al abrir: lo contado en el último arqueo anterior', () => {
  const cierres = [{ fecha: '2026-10-24', caja: { arqueo: { contado: 80 } } }, { fecha: '2026-10-25', caja: {} }, { fecha: '2026-10-26', caja: { arqueo: { contado: 150 } } }];
  assert.equal(fondoInicial(cierres, '2026-10-26'), 80);
  assert.equal(fondoInicial(cierres, '2026-10-27'), 150);
  assert.equal(fondoInicial([], '2026-10-27'), null);
});

test('arqueo en la contabilidad: salidas de la 570 y descuadre a la 678/778, siempre cuadrado', () => {
  const datos = limpiarCierre({ fecha: '2026-10-26', porIva: [{ pct: 10, total: 300 }], efectivo: 120,
    arqueo: { fondo: 100, contado: 160, salidas: [{ tipo: 'banco', importe: 50 }, { tipo: 'retirada', importe: 5 }, { tipo: 'gasto', importe: 2, concepto: 'Hielo' }] } });
  const f = { ...datos, id: 'z1', serie: 'Z', numero: 1, anio: 2026 };
  const A = generarAsientos({ facturas: [f], fiscal: { tipo: 'autonomo', iva: 'general' } }, HOY);
  const saldo = (c) => Math.round(A.flatMap((a) => a.lineas).filter((l) => l.cuenta === c).reduce((s, l) => s + l.debe - l.haber, 0) * 100) / 100;
  for (const a of A) assert.equal(Math.abs(Math.round(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0) * 100)), 0, a.concepto);
  // 120 cobrados − 57 de salidas − 3 que faltan (esperado 163, contado 160).
  assert.equal(saldo('570'), 60);
  assert.equal(saldo('678'), 3);
  assert.equal(saldo('550'), 5);
  assert.ok(A.some((a) => a.concepto === 'Pago en efectivo · Hielo'));
  const S = generarAsientos({ facturas: [f], fiscal: { tipo: 'sociedad', iva: 'general' } }, HOY);
  assert.ok(S.some((a) => a.lineas.some((l) => l.cuenta === '551' && l.debe === 5)));
});

test('días sin cierre: los que se suelen abrir, sin domingos, festivos ni los marcados como cerrados', () => {
  // Abre de lunes a sábado desde hace 8 semanas; faltan el sábado 24 y el lunes 26.
  const fechas = [];
  for (let d = new Date('2026-09-01T12:00:00Z'); d < new Date(`${HOY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const f = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !['2026-10-24', '2026-10-26', '2026-10-12'].includes(f)) fechas.push(f);
  }
  assert.deepEqual(diasSinCerrar(fechas, HOY, { festivo: festivoNacional }), ['2026-10-24', '2026-10-26']);
  assert.deepEqual(diasSinCerrar(fechas, HOY, { festivo: festivoNacional, cerrados: ['2026-10-24'] }), ['2026-10-26']);
  // El 12 de octubre (festivo) queda fuera aunque esté en el rango de 30 días.
  assert.deepEqual(diasSinCerrar(fechas, HOY, { festivo: festivoNacional, dias: 30 }), ['2026-10-24', '2026-10-26']);
  // Sin cierres recientes, nada que avisar; hoy nunca cuenta.
  assert.deepEqual(diasSinCerrar(['2026-08-01'], HOY), []);
  // Recién empezado: solo los días de la semana en que ya ha cerrado alguna vez.
  assert.deepEqual(diasSinCerrar(['2026-10-22'], HOY), []);
  assert.deepEqual(diasSinCerrar(['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'], HOY), ['2026-10-24', '2026-10-26']);
  // Un cierre de hace meses no cuenta como historial.
  assert.deepEqual(diasSinCerrar(['2026-07-04', '2026-10-17', '2026-10-19', '2026-10-24'], HOY), ['2026-10-26']);
  // Un negocio que solo abre fines de semana no recibe avisos entre semana.
  const finde = [];
  for (let d = new Date('2026-09-05T12:00:00Z'); d < new Date(`${HOY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) finde.push(d.toISOString().slice(0, 10));
  assert.deepEqual(diasSinCerrar(finde.filter((f) => f !== '2026-10-24'), HOY), ['2026-10-24']);
});

test('pantallas: foto del Z, arqueo, días sin cierre y la colección en las copias', () => {
  const form = readFileSync(new URL('../components/FormCierre.js', import.meta.url), 'utf8');
  assert.match(form, /\/api\/caja\/z/);
  assert.match(form, /Contar el efectivo del cajón/);
  const caja = readFileSync(new URL('../app/facturas/caja/page.js', import.meta.url), 'utf8');
  assert.match(caja, /diasSinCerrar/);
  const resumen = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  assert.match(resumen, /días sin cierre/);
  assert.match(readFileSync(new URL('../lib/redis.js', import.meta.url), 'utf8'), /'cajaCerrados'/);
});

// Auditoría de modelos del 19/10/2026 (revisión de Codex, comprobada y corregida por Claude).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303 } from '../lib/calculos.js';
import { fichero303 } from '../lib/ficheroAeat.js';
import { borradorSociedades, modelo202, modelo349, modelo390 } from '../lib/modelos.js';
import { datosPaquete } from '../lib/paquete.js';

const fac = (id, fecha, base, extra = {}) => ({ id, fecha, numero: Number(id.slice(1)) || 1, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base, ivaPct: 21, irpfPct: 0, ...extra });

test('303: las rectificativas van a las casillas 14 y 15 con su signo (art. 80 LIVA), no restan en las 07 y 09', () => {
  const c = casillas303([fac('f1', '2026-02-01', 5000), fac('r1', '2026-02-10', -1000, { serie: 'R', rectifica: { numero: '07-2025' } })], [], 2026, 1);
  assert.deepEqual([c['07'], c['09'], c['14'], c['15'], c['27']], [5000, 1050, -1000, -210, 840]);
  assert.equal(modelo390([fac('f1', '2026-02-01', 5000), fac('r1', '2026-02-10', -1000, { rectifica: { numero: '07-2025' } })], [], 2026).cuotaRect, -210);
});

test('fichero del 303: un trimestre con solo un abono ya se puede descargar (antes, «importe negativo en un campo sin signo»)', () => {
  const c = casillas303([fac('r1', '2026-02-10', -1000, { rectifica: { numero: '07-2025' } })], [], 2026, 1);
  const f = fichero303({ nif: '12345678Z', nombre: 'Prueba' }, 2026, 1, c, { ingresar: 0 });
  assert.ok(String(f.contenido ?? f).includes('N'));
});

test('303: un bien de inversión de menos de 3.005,06 € no lo es para el IVA (art. 108 LIVA); uno de la UE de más, en las 38 y 39', () => {
  const g = [{ id: 'g1', fecha: '2026-02-01', actividad: 'a', concepto: 'Portátil', base: 1000, ivaPct: 21, inversion: { tipo: 'informatica' } },
    { id: 'g2', fecha: '2026-02-01', actividad: 'a', concepto: 'Máquina', base: 5000, ivaPct: 0, origen: 'ue', proveedorNif: 'DE123456789', inversion: { tipo: 'maquinaria' } }];
  const c = casillas303([], g, 2026, 1);
  assert.deepEqual([c['28'], c['29'], c['30'], c['31'], c['36'], c['38'], c['39'], c['10']], [1000, 210, 0, 0, 0, 5000, 1050, 5000]);
  assert.equal(c['45'], 1260);
});

test('349: compras de bienes a la UE con clave A y servicios con I; servicios con Irlanda del Norte (XI) fuera', () => {
  const gastos = [
    { id: 'g1', fecha: '2026-02-01', concepto: 'Ordenador', proveedor: 'Hardware GmbH', proveedorNif: 'DE123456789', base: 1000, ivaPct: 0, inversion: { tipo: 'informatica' } },
    { id: 'g2', fecha: '2026-02-01', concepto: 'Licencia SaaS', proveedor: 'Soft Ltd', proveedorNif: 'IE6388047V', base: 200, ivaPct: 0 },
    { id: 'g3', fecha: '2026-02-01', concepto: 'Consultoría', proveedor: 'Belfast Ltd', proveedorNif: 'XI123456789', base: 300, ivaPct: 0 },
  ];
  const facturas = [fac('f1', '2026-02-02', 5000, { ivaPct: 0, operacion: 'servicios-ue', cliente: { nombre: 'Belfast Ltd', nif: 'XI123456789' } })];
  const m = modelo349(facturas, 2026, 1, gastos);
  assert.deepEqual(m.operadores.map((o) => [o.nif, o.clave, o.base]).sort(), [['DE123456789', 'A', 1000], ['IE6388047V', 'I', 200]]);
});

test('202: si el 20 cae en domingo, el plazo es el lunes (20-12-2026 → 21-12-2026)', () => {
  assert.equal(modelo202({ 2025: 1000 }, 2026)[2].fecha, '2026-12-21');
});

test('Sociedades: con datos del año anterior a cero, el tipo es el de microempresa aunque este año pase de 1 M (art. 29 LIS)', () => {
  const facturas = [fac('f1', '2026-03-01', 1100000)];
  const gastos = [{ id: 'g0', fecha: '2025-06-01', actividad: 'a', concepto: 'Alta', base: 100, ivaPct: 0 }, { id: 'g1', fecha: '2026-03-02', actividad: 'a', concepto: 'Compras', base: 1000000, ivaPct: 0 }];
  const b = borradorSociedades(facturas, gastos, 2026);
  assert.equal(b.tamano, 'micro');
  // Base 100.000 € menos los 100 € de pérdida de 2025 (art. 26 LIS): 50.000 × 19 % + 49.900 × 21 %.
  assert.equal(b.cuota, 9500 + 10479);
  // Sin nada del año anterior en la app, se usa la de este año.
  assert.equal(borradorSociedades(facturas, gastos.slice(1), 2026).tamano, 'reducida');
});

test('paquete: el 130 con minoración da su resultado negativo y, sin 303, el IVA de los gastos resta del rendimiento', () => {
  const u = { emisor: { nombre: 'Ana López', nif: '12345678Z' }, fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'a', nombre: 'Diseño', serie: '' }], rend130: { 2025: 5000 } };
  const d = datosPaquete(u, { facturas: [], gastos: [] }, 2026, 1);
  assert.equal(d.modelos.find((m) => m.id === '130').resultado, -100);
  const exenta = { ...u, fiscal: { tipo: 'autonomo', iva: 'exento' } };
  const e = datosPaquete(exenta, { facturas: [fac('f1', '2026-02-01', 1000, { ivaPct: 0 })], gastos: [{ id: 'g1', fecha: '2026-02-02', actividad: 'a', concepto: 'Material', base: 100, ivaPct: 21 }] }, 2026, 1);
  assert.equal(e.totales.rendimiento, 879);
});

test('libros registro: un único .xlsx con un libro por hoja (T para autónomos, C para sociedades), como pide la AEAT', async () => {
  const { librosRegistro, librosXlsx } = await import('../lib/librosRegistro.js');
  const { abrirZip } = await import('../lib/hoja.js');
  const datos = { facturas: [fac('f1', '2026-02-01', 1000)], gastos: [{ id: 'g1', fecha: '2026-02-02', actividad: 'a', concepto: 'Luz', proveedor: 'Iberdrola', proveedorNif: 'A48010615', base: 100, ivaPct: 21 }],
    actividades: [{ id: 'a', iae: '844' }], empresa: { nombre: 'Ana', nif: '12345678Z' } };
  const aut = librosRegistro({ ...datos, fiscal: { tipo: 'autonomo', iva: 'general' } }, 2026, '2026-12-31');
  assert.equal(aut.fichero, '202612345678ZTAna.xlsx');
  assert.deepEqual(aut.hojas.map((h) => h.hoja), ['EXPEDIDAS_INGRESOS', 'RECIBIDAS_GASTOS']);
  const libro = abrirZip(librosXlsx(aut))['xl/workbook.xml']().toString();
  assert.deepEqual([...libro.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ['EXPEDIDAS_INGRESOS', 'RECIBIDAS_GASTOS']);
  const soc = librosRegistro({ ...datos, fiscal: { tipo: 'sociedad', iva: 'general' } }, 2026, '2026-12-31');
  assert.equal(soc.fichero, '202612345678ZCAna.xlsx');
  assert.deepEqual(soc.hojas.map((h) => h.hoja), ['EXPEDIDAS', 'RECIBIDAS']);
});

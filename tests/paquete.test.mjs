import test from 'node:test';
import assert from 'node:assert/strict';
import { leerZip, zip } from '../lib/zip.js';
import { datosPaquete, paqueteXlsx } from '../lib/paquete.js';
import { paquetePdf } from '../lib/paquetePdf.js';

const u = { emisor: { nombre: 'Ana López', nif: '12345678Z' }, fiscal: { tipo: 'autonomo', iva: 'general', trabajadores: true }, actividades: [{ id: 'a', nombre: 'Diseño', serie: '' }] };
const facturas = [
  { id: '1', numero: 1, anio: 2026, fecha: '2026-07-10', actividad: 'a', cliente: { nombre: 'Cliente & Co', nif: 'B1' }, concepto: 'Web', base: 1000, ivaPct: 21, irpfPct: 15, cobrada: true },
  { id: '2', numero: 2, anio: 2026, fecha: '2026-09-30', actividad: 'a', cliente: { nombre: 'Bea' }, concepto: 'Logo', base: 500, ivaPct: 21, irpfPct: 0 },
  { id: '3', numero: 3, anio: 2026, fecha: '2026-10-01', actividad: 'a', cliente: { nombre: 'Fuera' }, concepto: 'x', base: 999, ivaPct: 21, irpfPct: 0 },
];
const gastos = [{ id: 'g', fecha: '2026-08-02', actividad: 'a', concepto: 'Cables', base: 200, ivaPct: 21, proveedor: 'Ferretería Sol', proveedorNif: 'B2' }];
const nominas = [{ id: 'n', empleado: 'e', mes: '2026-08', bruto: 2000, irpfPct: 10, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }];

test('zip: lo que se escribe se vuelve a leer igual', () => {
  const z = leerZip(zip([{ nombre: 'a.txt', datos: 'hola ñ' }, { nombre: 'b/c.bin', datos: new Uint8Array([0, 255]) }]));
  assert.equal(z['a.txt'].toString(), 'hola ñ');
  assert.deepEqual([...z['b/c.bin']], [0, 255]);
});

test('paquete: solo el trimestre, con totales y modelos', () => {
  const d = datosPaquete(u, { facturas, gastos, nominas }, 2026, 3);
  assert.deepEqual(d.facturas.map((f) => f.numero), ['01-2026', '02-2026']);
  assert.deepEqual(d.totales.facturas, { n: 2, base: 1500, iva: 315, irpf: 150, total: 1665 });
  assert.deepEqual(d.totales.gastos, { n: 1, base: 200, iva: 42, total: 242 });
  assert.equal(d.gastos[0].proveedor, 'Ferretería Sol');
  assert.deepEqual(d.modelos.map((m) => [m.id, m.resultado]), [['303', 273], ['130', 97], ['111', 200]]);
});

test('paquete: Excel con sus 4 hojas y texto escapado; PDF válido', async () => {
  const d = datosPaquete(u, { facturas, gastos, nominas }, 2026, 3);
  const x = leerZip(paqueteXlsx(d));
  assert.ok(x['xl/workbook.xml'].toString().includes('name="Modelos"'));
  assert.ok(x['xl/worksheets/sheet2.xml'].toString().includes('Cliente &amp; Co'));
  assert.ok(x['xl/worksheets/sheet2.xml'].toString().includes('<v>1665</v>'));
  const pdf = await paquetePdf(d);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

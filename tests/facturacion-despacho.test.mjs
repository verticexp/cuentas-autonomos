import test from 'node:test';
import assert from 'node:assert/strict';
import { facturacionPorCliente } from '../lib/facturacionDespacho.js';

const hoy = '2026-10-24';
const cliente = (mas = {}) => ({ id: 'a', nombre: 'Ána López', nif: '12345678A', licencia: null, ...mas });
const factura = (mas = {}) => ({ fecha: '2026-10-01', cliente: 'Otro nombre', nif: '12345678A', base: 100, ivaPct: 21, cobrada: false, ...mas });
// Como las guarda la app: el cliente dentro de la factura.
const facturaApp = (mas = {}) => { const { cliente, nif, ...resto } = factura(mas); return { ...resto, cliente: { nombre: cliente, nif } }; };
const calcular = (facturas, clientes = [cliente()]) => facturacionPorCliente({ clientes, facturas, hoy });

test('Empareja NIF con y sin ES, espacios y guiones; por nombre solo sin NIF', () => {
  const r = calcular([
    factura({ nif: 'es 1234-5678 a' }), factura(),
    factura({ nif: '', cliente: '  ANA   lopez ' }),
    factura({ nif: '99999999Z', cliente: 'Ána López' }),
    factura({ nif: '', cliente: '' }),
  ]);
  assert.equal(r.filas[0].facturas, 3);
  assert.equal(r.filas[0].facturado12m, 363);
  assert.deepEqual(r.sinEmparejar, { numero: 2, total: 242 });
  assert.equal(calcular([factura()], [cliente({ nif: 'ES12345678A' })]).filas[0].facturas, 1);
});

test('Pendientes y vencidos: vence hoy no vence; sin plazo, 30 días naturales', () => {
  const r = calcular([
    factura({ fecha: '2026-09-01', vence: '2026-10-23' }),
    factura({ fecha: '2026-09-24' }),
    factura({ fecha: '2026-09-23' }),
    factura({ vence: hoy }),
    factura({ fecha: '2026-01-01', cobrada: true }),
  ]);
  assert.equal(r.filas[0].pendiente, 484);
  assert.equal(r.filas[0].vencido, 242);
  assert.equal(r.filas[0].ultima, '2026-10-01');
});

test('Coste anual y margen sobre bases: respeta el signo de las rectificativas', () => {
  const r = calcular([factura({ irpfPct: 15 }), factura({ base: -20, serie: 'R', cobrada: true })], [cliente({ licencia: { cent: 700 } })]);
  assert.equal(r.filas[0].facturado12m, 81.8);
  assert.equal(r.filas[0].costeFisquo12m, 84);
  assert.equal(r.filas[0].margen12m, -4);
  assert.equal(r.filas[0].facturas, 2);
  assert.deepEqual(r.totales, { facturado12m: 81.8, pendiente: 106, vencido: 0, costeFisquo12m: 84 });
  assert.equal(calcular([], [cliente({ licencia: { cent: 0 } })]).filas[0].costeFisquo12m, 0);
});

test('Ordena primero los clientes con deuda vencida y después por facturado', () => {
  const clientes = [cliente(), cliente({ id: 'b', nif: 'B' }), cliente({ id: 'c', nif: 'C' }), cliente({ id: 'd', nif: 'D' })];
  const r = calcular([factura({ base: 500, cobrada: true }), factura({ nif: 'B', base: 50, vence: '2026-01-01' }), factura({ nif: 'C', base: 100, vence: '2026-01-01' })], clientes);
  assert.deepEqual(r.filas.map((c) => c.id), ['c', 'b', 'a', 'd']);
});

test('Sin facturar: límite inclusivo de 90 días y cliente sin facturas', () => {
  assert.equal(calcular([factura({ fecha: '2026-07-26' })]).filas[0].sinFacturar3m, false);
  assert.equal(calcular([factura({ fecha: '2026-07-25' })]).filas[0].sinFacturar3m, true);
  assert.equal(calcular([]).filas[0].sinFacturar3m, true);
});

test('No atribuye identidades ambiguas ni modifica las entradas; admite listas vacías', () => {
  const clientes = Object.freeze([Object.freeze(cliente()), Object.freeze(cliente({ id: 'b' }))]);
  const facturas = Object.freeze([Object.freeze(factura())]);
  const r = calcular(facturas, clientes);
  assert.deepEqual(r.sinEmparejar, { numero: 1, total: 121 });
  assert.ok(r.filas.every((c) => c.facturas === 0));
  assert.deepEqual(calcular([], []), { filas: [], totales: { facturado12m: 0, pendiente: 0, vencido: 0, costeFisquo12m: 0 }, sinEmparejar: { numero: 0, total: 0 } });
});

test('facturación del despacho: empareja las facturas tal como las guarda la app (cliente dentro)', () => {
  const r = facturacionPorCliente({ clientes: [cliente()], facturas: [facturaApp({ nif: 'ES12345678A' }), facturaApp({ nif: '', cliente: 'ana lopez' })], hoy: '2026-10-20' });
  assert.equal(r.filas[0].facturas, 2);
  assert.equal(r.sinEmparejar.numero, 0);
});

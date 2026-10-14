import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { sugerencias, opciones, cobradoSinBanco } from '../lib/banco.js';
import { importes, numeroFactura, saldoDe } from '../lib/calculos.js';
import { totalDe } from '../lib/proveedores.js';

// Referencia exhaustiva anterior al índice de E02: mantiene el recorrido sin índices.
// Se actualizan deliberadamente las expectativas de la auditoría: céntimos enteros,
// identidad fuerte, referencias delimitadas, parciales, retenciones, ventanas y conflictos.
// Así se sigue contrastando el motor indexado con una implementación independiente.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const VACIAS = new Set(['transferencia', 'transf', 'recibo', 'pago', 'cobro', 'bizum', 'tarjeta', 'compra', 'desde', 'para', 'factura', 'concepto', 'favor', 'cuenta', 'adeudo', 'abono', 'ingreso', 'sepa', 'domiciliacion', 'eventos', 'servicios']);
const palabras = (s) => norm(s).split(' ').filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w));
const cts = (x) => Math.round(x * 100);
const porReferencia = (m, numero) => Boolean(norm(numero)) && ` ${norm(m.concepto)} `.includes(` ${norm(numero)} `);
const palabrasNombre = (nombre) => [...new Set(norm(nombre).split(' ').filter((w) =>
  w.length >= 3 && !VACIAS.has(w) && !['del', 'las', 'los', 'con', 'por', 'sociedad', 'limitada', 'anonima'].includes(w) && !/^\d+$/.test(w)))];
const nombreEn = (nombre, texto) => { const t = ` ${norm(texto)} `; return palabrasNombre(nombre).some((w) => t.includes(` ${w} `)); };
const conceptoEn = (concepto, texto) => { const t = ` ${norm(texto)} `; return palabras(concepto).some((w) => t.includes(` ${w} `)); };
const fuerte = (nombre, texto) => {
  const ws = palabrasNombre(nombre), t = ` ${norm(texto)} `;
  const n = ws.filter((w) => t.includes(` ${w} `)).length;
  return ws.length === 1 ? ws[0].length >= 5 && n === 1 : ws.length > 1 && (n === ws.length || n >= 2);
};

function candidatasFactura(m, facturas) {
  const texto = `${m.concepto} ${m.contraparte || ''}`;
  return facturas.filter((f) => !f.cobrada && !(f.cobro && cobradoSinBanco(f) > 0) && cts(saldoDe(f)) > 0).flatMap((f) => {
    const importe = saldoDe(f), porNumero = porReferencia(m, numeroFactura(f));
    const exacta = Math.abs(cts(importe) - cts(m.importe)) <= 1 && cts(m.importe) <= cts(importe);
    if ((!exacta && !porNumero) || dias(f.fecha, m.fecha) < (porNumero ? -15 : -3)) return [];
    let puntos = exacta ? 50 : 0;
    if (porNumero) puntos += 35;
    if (nombreEn(f.cliente?.nombre, texto)) puntos += 25;
    if (dias(f.fecha, m.fecha) <= 120) puntos += 5;
    return [{ tipo: 'factura', id: f.id, puntos, importe, porNumero, porNombre: fuerte(f.cliente?.nombre, texto),
      ...(!exacta ? { motivo: cts(m.importe) < cts(importe) ? 'parcial' : 'importe-distinto' } : {}) }];
  });
}

// Un gasto sin proveedor se identifica por su concepto entero (al menos dos palabras distintivas, todas presentes).
const sinProveedorPorConcepto = (g, texto) => {
  const ws = palabrasNombre(g.proveedor), cs = palabras(g.concepto), t = ` ${norm(texto)} `;
  return !ws.length && cs.length > 1 && cs.every((w) => t.includes(` ${w} `));
};

// Facturas ya cobradas por otra vía (remesa, Stripe, caja o a mano) que el banco ingresa después: solo se enlazan.
function candidatasCobradas(m, facturas, enlazadas) {
  const texto = `${m.concepto} ${m.contraparte || ''}`;
  return facturas.filter((f) => !enlazadas.has(f.id) && cts(cobradoSinBanco(f)) > 0).flatMap((f) => {
    const importe = cobradoSinBanco(f), porNumero = porReferencia(m, numeroFactura(f));
    if (Math.abs(cts(importe) - cts(m.importe)) > 1 || Math.abs(dias(f.fecha, m.fecha)) > 45) return [];
    let puntos = 50;
    if (porNumero) puntos += 35;
    if (nombreEn(f.cliente?.nombre, texto)) puntos += 25;
    if (dias(f.fecha, m.fecha) <= 120) puntos += 5;
    return [{ tipo: 'factura', id: f.id, puntos, importe, porNumero, porNombre: fuerte(f.cliente?.nombre, texto), yaCobrada: true }];
  });
}

function candidatosGasto(m, gastos, enlazados) {
  const texto = `${m.concepto} ${m.contraparte || ''}`;
  return gastos.filter((g) => !g.banco && !enlazados.has(g.id)).flatMap((g) => {
    const bruto = totalDe(g), neto = importes(g).total, cantidad = cts(-m.importe);
    const importe = Math.abs(cts(neto) - cantidad) < Math.abs(cts(bruto) - cantidad) ? neto : bruto;
    const porNumero = porReferencia(m, g.numero), d = dias(g.fecha, m.fecha);
    const enFecha = g.pendiente ? d >= (porNumero ? -120 : -5) : Math.abs(d) <= (porNumero ? 120 : 60);
    const exacta = Math.abs(cts(importe) - cantidad) <= 1;
    if ((!exacta && !porNumero) || !enFecha) return [];
    let puntos = exacta ? 50 : 0;
    if (porNumero) puntos += 35;
    if (g.pendiente) puntos += 15;
    if (nombreEn(g.proveedor, texto) || conceptoEn(g.concepto, texto)) puntos += 25;
    if (Math.abs(d) <= 3) puntos += 10;
    return [{ tipo: 'gasto', id: g.id, puntos, importe, porNumero, porNombre: fuerte(g.proveedor, texto) || sinProveedorPorConcepto(g, texto),
      ...(!exacta ? { motivo: cantidad < cts(importe) ? 'parcial' : 'importe-distinto' } : {}) }];
  });
}

// Para cada movimiento pendiente, la mejor pareja (cada factura o gasto, para un solo movimiento) y si es segura.
// Segura: el importe cuadra y además el número de factura, el cliente o el proveedor aparecen en el concepto.
function sugerenciasRef(movimientos, facturas, gastos) {
  const enlazados = new Set(movimientos.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'gasto').map((m) => m.enlace.id));
  const facturasEnlazadas = new Set(movimientos.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'factura').map((m) => m.enlace.id));
  const pendientes = movimientos.filter((m) => (!m.estado || m.estado === 'pendiente') && cts(Math.abs(m.importe)) > 0);
  const todas = new Map(pendientes.map((m) => [m.id,
    (m.importe > 0 ? (() => {
      const cobradas = candidatasCobradas(m, facturas, facturasEnlazadas), ids = new Set(cobradas.map((x) => x.id));
      return [...candidatasFactura(m, facturas).filter((x) => !ids.has(x.id)), ...cobradas];
    })() : candidatosGasto(m, gastos, enlazados)).sort((a, b) => b.puntos - a.puntos)]));
  // Referencia exhaustiva para las disputas: compara cada par de movimientos.
  const conflictos = new Set();
  const clave = (p) => `${p.tipo}:${p.id}`;
  const listas = [...todas];
  for (let i = 0; i < listas.length; i++) {
    const [id, c] = listas[i], reclamadas = new Set(c.filter((x, n) => n === 0 || x.porNumero).map(clave));
    for (const [otro, xs] of listas.slice(i + 1)) {
      if (xs.some((x, n) => (n === 0 || x.porNumero) && reclamadas.has(clave(x)))) {
        conflictos.add(id); conflictos.add(otro);
      }
    }
  }
  const resultado = (p, m, forzar = false) => {
    const xs = todas.get(m), alternativa = p.puntos < xs[0].puntos;
    const motivo = alternativa ? 'alternativa' : forzar || conflictos.has(m) ? 'conflicto' : p.motivo;
    const empate = xs.filter((x) => x.puntos === xs[0].puntos).length > 1;
    return { tipo: p.tipo, id: p.id, puntos: p.puntos,
      segura: p.puntos >= 75 && (p.porNumero || p.porNombre) && !motivo && !empate,
      ...(motivo ? { motivo } : {}), ...(p.yaCobrada ? { yaCobrada: true } : {}), importe: p.importe, porNumero: p.porNumero, porNombre: p.porNombre };
  };
  const pares = [...todas].flatMap(([m, xs]) => xs.map((x) => ({ m, ...x }))).sort((a, b) => b.puntos - a.puntos);
  const usados = new Set(), out = {};
  for (const p of pares) {
    if (out[p.m] || usados.has(clave(p))) continue;
    out[p.m] = resultado(p, p.m);
    usados.add(clave(p));
  }
  for (const [m, xs] of todas) if (!out[m] && xs.length) out[m] = resultado(xs[0], m, true);
  return out;
}

// Para elegir a mano: facturas sin cobrar (para un ingreso) o gastos sin enlazar de fechas cercanas (para un cargo),
// los de importe más parecido primero.
function opcionesRef(m, facturas, gastos, movimientos = []) {
  if (m.importe > 0) {
    return facturas.filter((f) => !f.cobrada && saldoDe(f) > 0)
      .sort((a, b) => Math.abs(saldoDe(a) - m.importe) - Math.abs(saldoDe(b) - m.importe)).slice(0, 20)
      .map((f) => ({ tipo: 'factura', id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe: saldoDe(f), total: importes(f).total, saldo: saldoDe(f), fecha: f.fecha }));
  }
  const enlazados = new Set(movimientos.filter((x) => x.estado === 'emparejado' && x.enlace?.tipo === 'gasto').map((x) => x.enlace.id));
  return gastos.filter((g) => !g.banco && !enlazados.has(g.id) && (g.pendiente || Math.abs(dias(g.fecha, m.fecha)) <= 60))
    .sort((a, b) => Math.abs(totalDe(a) + m.importe) - Math.abs(totalDe(b) + m.importe)).slice(0, 20)
    .map((g) => ({ tipo: 'gasto', id: g.id, texto: `${g.proveedor || g.concepto}${g.pendiente ? ' · sin pagar' : ''}`, importe: totalDe(g), total: totalDe(g), saldo: totalDe(g), fecha: g.fecha }));
}

const factura = (id, base, extra = {}) => ({
  id, numero: 7, anio: 2026, fecha: '2026-06-01', cliente: { nombre: 'Hotel Mirador' },
  base, ivaPct: 0, irpfPct: 0, cobrada: false, ...extra,
});
const gasto = (id, base, extra = {}) => ({
  id, base, ivaPct: 0, fecha: '2026-06-01', proveedor: 'Ferretería Sol', concepto: 'Material', ...extra,
});
const movimiento = (id, importe, extra = {}) => ({
  id, importe, fecha: '2026-06-02', concepto: 'Transferencia', estado: 'pendiente', ...extra,
});
const fechaMas = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function comprobar(movimientos, facturas, gastos) {
  const esperado = sugerenciasRef(movimientos, facturas, gastos);
  const actual = sugerencias(movimientos, facturas, gastos);
  assert.deepStrictEqual(actual, esperado);
  // deepStrictEqual de objetos no comprueba el orden de sus claves.
  assert.deepStrictEqual(Object.keys(actual), Object.keys(esperado));
  for (const m of movimientos) assert.deepStrictEqual(opciones(m, facturas, gastos, movimientos), opcionesRef(m, facturas, gastos, movimientos));
  return actual;
}

test('E02: orden estable entre los tres céntimos, empates y asignación global por puntos', () => {
  const facturas = [factura('f+1', 5.01), factura('f-1', 4.99), factura('f0', 5)];
  const gastos = [gasto('g+1', 5.01), gasto('g-1', 4.99), gasto('g0', 5)];
  const movimientos = [
    movimiento('f-a', 5, { concepto: 'Hotel Mirador' }), movimiento('f-b', 5, { concepto: 'Hotel Mirador' }),
    movimiento('g-a', -5, { concepto: 'Ferretería Sol' }), movimiento('g-b', -5, { concepto: 'Ferretería Sol' }),
  ];
  const s = comprobar(movimientos, facturas, gastos);
  assert.deepStrictEqual(Object.values(s).map((x) => [x.id, x.segura]), [['g+1', false], ['g-1', false], ['f+1', false], ['f0', false]]);
  const global = comprobar([movimiento('primero', 5), movimiento('despues', 5, { concepto: 'Hotel Mirador' })], facturas, []);
  assert.deepStrictEqual(Object.keys(global), ['despues', 'primero']);
  assert.equal(global.despues.id, 'f+1');
  // El ingreso de 5 supera el saldo 4,99: solo queda f0 como alternativa.
  assert.equal(global.primero.id, 'f0');
});

test('E02: cobros parciales, gastos pendientes y enlazados, y tolerancia en céntimos (cambio intencionado de la auditoría)', () => {
  const parcial = factura('parcial', 100, { pagos: [{ importe: 20, metodo: 'stripe' }, { importe: 20, metodo: 'banco' }] });
  const s = comprobar([movimiento('saldo', 60), movimiento('total', 100)], [parcial], []);
  assert.equal(s.saldo.id, 'parcial');
  assert.equal(s.total, undefined);

  const facturas = [parcial, factura('cobrada', 60, { cobrada: true }), factura('cero', 10, { pagos: [{ importe: 10 }] })];
  const gastos = [
    gasto('pendiente', 60, { pendiente: true, fecha: '2025-01-01' }),
    gasto('antiguo', 60, { fecha: '2025-01-01' }), gasto('reciente', 60),
    gasto('banco', 60, { banco: 'otro' }), gasto('enlazado', 60, { pendiente: true }),
  ];
  const movimientos = [
    movimiento('entrada', 60), movimiento('salida', -60, { concepto: 'Ferretería Sol' }),
    movimiento('enlace', -60, { estado: 'emparejado', enlace: { tipo: 'gasto', id: 'enlazado' } }),
    movimiento('ignorado', 60, { estado: 'ignorado' }),
  ];
  comprobar(movimientos, facturas, gastos);
  assert.deepStrictEqual(opciones(movimientos[1], facturas, gastos, movimientos).map((x) => x.id), ['pendiente', 'reciente']);

  for (const base of [0.01, 1, 5, 50, 121, 1000.01]) {
    for (const delta of [-0.010000001, -0.01, -0.009999999, -0.005, 0, 0.005, 0.009999999, 0.01, 0.010000001]) {
      const importe = base + delta;
      const a = comprobar([movimiento('m', importe)], [factura('f', base)], []);
      assert.equal(Boolean(a.m), cts(importe) > 0 && Math.abs(cts(base) - cts(importe)) <= 1 && cts(importe) <= cts(base));
      const b = comprobar([movimiento('m', -importe)], [], [gasto('g', base)]);
      assert.equal(Boolean(b.m), cts(importe) > 0 && Math.abs(cts(base) - cts(importe)) <= 1);
    }
  }
  comprobar([], [], []);
});

function aleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => { estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0; return estado / 2 ** 32; };
}

function conjunto(semilla) {
  const azar = aleatorio(semilla);
  const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
  const importes = [0, 0.01, 1, 1.01, 5, 5.01, 50, 50.01, 121, 121.01, 1000.01];
  const nombres = ['Hotel Mirador', 'Ángela López S.L.', 'SONORA EVENTOS', 'Ferretería Sol', '', undefined];
  const facturas = Array.from({ length: 48 }, (_, i) => {
    const base = elegir(importes), parcial = i % 3 === 0;
    return factura(`f${i}`, parcial ? base + 40 : base, {
      numero: i + 1, serie: elegir(['', 'V', 'R']), importada: i % 7 === 0 ? `EXT-${i}` : undefined,
      fecha: fechaMas('2026-04-01', Math.floor(azar() * 100)), cliente: { nombre: elegir(nombres) },
      ivaPct: elegir([0, 0, 21]), irpfPct: elegir([0, 0, 15]), cobrada: i % 11 === 0,
      pagos: parcial ? [{ importe: 20, metodo: 'stripe' }, { importe: 20, metodo: 'banco' }] : [],
      ...(i % 5 === 0 ? { lineas: [{ cantidad: 2, precio: base / 2, dto: 0, ivaPct: 21 }] } : {}),
    });
  });
  const gastos = Array.from({ length: 48 }, (_, i) => gasto(`g${i}`, elegir(importes), {
    fecha: fechaMas('2026-04-01', Math.floor(azar() * 100)), proveedor: elegir(nombres),
    concepto: elegir(['Material escenario', 'Alquiler luces', 'Recibo', '', undefined]),
    pendiente: elegir([true, false, undefined]), banco: i % 13 === 0 ? `viejo${i}` : undefined,
    ivaPct: elegir([0, 0, 21]), irpfPct: elegir([0, 15]),
  }));
  const movimientos = Array.from({ length: 80 }, (_, i) => {
    const ingreso = i % 2 === 0, doc = elegir(ingreso ? facturas : gastos);
    const delta = elegir([-0.010000001, -0.01, -0.009999999, -0.0049, 0, 0, 0, 0.0049, 0.009999999, 0.01, 0.010000001, 20]);
    return movimiento(`m${i}`, (ingreso ? 1 : -1) * ((ingreso ? saldoDe(doc) : totalDe(doc)) + delta), {
      fecha: fechaMas(doc.fecha, elegir([-6, -5, -4, -3, -2, 0, 3, 4, 59, 60, 61, 120, 121, 200])),
      concepto: elegir(['Transferencia', `FRA ${numeroFactura(doc)}`, doc.cliente?.nombre, doc.proveedor, doc.concepto, 'SONORA EVENTOS']),
      contraparte: elegir(nombres), estado: elegir([undefined, 'pendiente', 'pendiente', 'ignorado']),
    });
  });
  movimientos.push(movimiento('ya-gasto', -50, { estado: 'emparejado', enlace: { tipo: 'gasto', id: 'g1' } }));
  movimientos.push(movimiento('ya-factura', 50, { estado: 'emparejado', enlace: { tipo: 'factura', id: 'f1' } }));
  return { movimientos, facturas, gastos };
}

test('E02: sugerencias y opciones equivalen a la referencia en 32 conjuntos de semilla fija', () => {
  for (let i = 0; i < 32; i++) {
    const { movimientos, facturas, gastos } = conjunto(0xe02 + i);
    comprobar(movimientos, facturas, gastos);
  }
});

test('E02: 2.000 movimientos × (2.000 facturas + 2.000 gastos) sin coincidencias en < 1 s', (t) => {
  const facturas = Array.from({ length: 2000 }, (_, i) => factura(`f${i}`, 100 + i));
  const gastos = Array.from({ length: 2000 }, (_, i) => gasto(`g${i}`, 100 + i, { pendiente: true }));
  const movimientos = Array.from({ length: 2000 }, (_, i) => movimiento(`m${i}`, (i % 2 ? -1 : 1) * (10000 + i)));
  const inicio = performance.now();
  const actual = sugerencias(movimientos, facturas, gastos);
  const ms = performance.now() - inicio;
  t.diagnostic(`Sin coincidencias: ${ms.toFixed(1)} ms`);
  assert.deepStrictEqual(actual, {});
  assert.ok(ms < 1000, `La conciliación tardó ${ms.toFixed(1)} ms (límite 1000 ms)`);
});

test('E02: 500 movimientos × 500 facturas del mismo importe en < 2 s y equivalentes', (t) => {
  const facturas = Array.from({ length: 500 }, (_, i) => factura(`f${i}`, 121, { numero: i + 1 }));
  const movimientos = Array.from({ length: 500 }, (_, i) => movimiento(`m${i}`, 121, {
    concepto: i % 3 === 0 ? `Hotel Mirador FRA ${numeroFactura(facturas[i])}` : 'Hotel Mirador',
  }));
  const inicio = performance.now();
  const actual = sugerencias(movimientos, facturas, []);
  const ms = performance.now() - inicio;
  t.diagnostic(`Con 250.000 coincidencias posibles: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 2000, `La conciliación tardó ${ms.toFixed(1)} ms (límite 2000 ms)`);
  const esperado = sugerenciasRef(movimientos, facturas, []);
  assert.deepStrictEqual(actual, esperado);
  assert.deepStrictEqual(Object.keys(actual), Object.keys(esperado));
  assert.equal(Object.keys(actual).length, 500);
});

// Auditoría independiente de la simulación; solo lee datos y abre una sesión local.
// BASE=http://localhost:3002 UPSTASH=http://127.0.0.1:8089 node tests/e2e/numeros-aurora.mjs
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { importes, casillas303, resumenAnual } from '../../lib/calculos.js';
import { calculoNomina, modelo111 } from '../../lib/nominas.js';
import { generarAsientos, mayor, balanceContable, pygContable } from '../../lib/asientos.js';
import { panelResumen } from '../../lib/panel.js';
import { inventario } from '../../lib/inventario.js';
import { borradorSociedades, modelo115, modelo180, modelo190, modelo202, modelo349, modelo390 } from '../../lib/modelos.js';
import { hoy as fechaHoy } from '../../lib/formato.js';
import { leerZip } from '../../lib/zip.js';
import { centimos as ct, porcentaje, importesIndependientes as doc, nominaIndependiente as nom, amortizacionIndependiente as amort } from '../apoyo/oraculo-numeros.mjs';

const BASE = process.env.BASE || 'http://localhost:3002';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:8089';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo contra simulación en localhost');
const email = 'direccion@aurora-eventos.example', hoy = fechaHoy(), actual = Number(hoy.slice(0, 4));
const cmd = async (...c) => { const r = await fetch(UPSTASH, { method: 'POST', body: JSON.stringify(c) }); const d = await r.json(); if (d.error) throw new Error(d.error); return d.result; };
const hash = async (k) => { const a = await cmd('hgetall', `cuentas:${k}`); return Object.fromEntries(Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2], JSON.parse(a[i * 2 + 1])])); };
const id = await cmd('hget', 'cuentas:emails', email);
assert.ok(id, 'Primero ejecuta scripts/cuenta-simulada.mjs');
const empresa = (await hash('empresas'))[id];
const datos = {};
for (const [k, col] of Object.entries({ facturas: 'facturas', gastos: 'gastos', nominas: 'nominas', manuales: 'asientos', productos: 'productos', ajustes: 'stock', albaranes: 'albaranes', empleados: 'empleados' })) datos[k] = Object.values(await hash(`${col}:${id}`));
Object.assign(datos, { fiscal: empresa.fiscal, pagos130: empresa.pagos130, pagos202: empresa.pagos202, cuotaIS: empresa.cuotaIS });
const saldo = JSON.parse(await cmd('get', `cuentas:saldo:${id}`));
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const trimestre = (f) => Math.ceil(Number(f.slice(5, 7)) / 3);
const finMes = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const pagoNom = (n) => n.pagado || finMes(n.mes);
const finSS = (n) => { const d = new Date(`${n.mes}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return finMes(d.toISOString().slice(0, 7)); };
const del = (xs, y, t, fecha = (x) => x.fecha) => xs.filter((x) => fecha(x)?.startsWith(`${y}-`) && (!t || trimestre(fecha(x)) === t));
const porFecha = (y, t, dia = 30) => t === 4 ? `${y + 1}-01-${dia}` : `${y}-${['04', '07', '10'][t - 1]}-20`;
const retGasto = (g) => g.alquiler ? porcentaje(doc(g).base, 19) : doc(g).irpf;
const pagados = datos.gastos.filter((g) => !g.pendiente);
const resultados = [];
let fallos = 0;
async function comprobar(nombre, fn) { try { await fn(); resultados.push({ nombre, ok: true }); } catch (e) { fallos++; resultados.push({ nombre, ok: false, error: e.message }); console.log('✗', nombre, e.message.split('\n')[0]); } }

for (const col of ['facturas', 'gastos']) for (const d of datos[col]) await comprobar(`${col}/${d.id}: base, IVA, retención y total exactos`, () => {
  const esperado = doc(d);
  assert.equal(ct(d.base), esperado.base, 'Base guardada frente a suma independiente de líneas');
  assert.deepEqual(Object.fromEntries(Object.entries(importes(d)).map(([k, v]) => [k, ct(v)])), esperado);
});
for (const n of datos.nominas) await comprobar(`nomina/${n.id}: siete importes y coste guardado`, () => {
  const esperado = nom(n);
  assert.deepEqual(Object.fromEntries(Object.entries(calculoNomina(n)).map(([k, v]) => [k, ct(v)])), esperado);
  assert.equal(ct(datos.gastos.find((g) => g.nomina === n.id)?.base), esperado.coste);
});

// Referencia física y valoración independiente a coste medio. La demo no contiene devoluciones
// con cambios de coste; esos casos se prueban aparte en auditoria-numeros-aux.test.mjs.
function stockHasta(fecha) {
  const p = new Map(datos.productos.filter((p) => !p.servicio).map((p) => [p.id, { cantidad: 0, valor: 0, medio: ct(p.coste || 0) }]));
  const m = [];
  const lineas = (d, esFactura) => {
    for (const l of d.lineas || []) {
      const devuelve = l.cantidad < 0 || l.precio < 0;
      if (l.producto && (!esFactura || !l.albaran || devuelve)) m.push({ fecha: d.fecha, producto: l.producto, q: Math.abs(l.cantidad) * (devuelve ? 1 : -1) });
    }
    for (const u of d.unidades || []) m.push({ fecha: d.fecha, producto: u.producto, q: -u.cantidad });
  };
  for (const f of datos.facturas) lineas(f, true);
  for (const a of datos.albaranes.filter((a) => a.tipo === 'albaran')) lineas(a, false);
  for (const g of datos.gastos) for (const l of g.stock || []) m.push({ fecha: g.fecha, producto: l.producto, q: l.cantidad, coste: l.coste === undefined ? undefined : ct(l.coste) });
  for (const a of datos.ajustes) m.push({ fecha: a.fecha, producto: a.producto, q: a.cantidad, coste: a.coste === undefined ? undefined : ct(a.coste) });
  for (const x of m.filter((x) => x.fecha <= fecha).sort((a, b) => a.fecha.localeCompare(b.fecha) || b.q - a.q)) {
    const v = p.get(x.producto); if (!v) continue;
    const coste = x.coste ?? v.medio;
    v.valor += x.q * coste;
    v.cantidad = Math.round((v.cantidad + x.q) * 1000) / 1000;
    if (v.cantidad > 0) v.medio = v.valor / v.cantidad;
  }
  return { productos: p, valor: Math.round(sum([...p.values()], (v) => Math.max(0, v.cantidad) * v.medio)) };
}

const A = generarAsientos(datos, hoy);
for (const a of A) await comprobar(`asiento/${a.fecha}/${a.concepto}: debe = haber`, () => assert.equal(sum(a.lineas, (l) => ct(l.debe) - ct(l.haber)), 0));
const resumen = [];
let banco = sum(datos.manuales.filter((m) => m.fecha <= hoy), (m) => sum(m.lineas.filter((l) => l.cuenta.startsWith('572')), (l) => ct(l.debe) - ct(l.haber)));
for (const f of datos.facturas.filter((f) => f.fecha <= hoy)) {
  const i = doc(f);
  if (f.caja) banco += i.total - ct(f.caja.efectivo || 0);
  else {
    const pagos = f.pagos || [];
    banco += sum(pagos.filter((p) => (p.fecha || f.fecha) <= hoy), (p) => ct(p.importe));
    const resto = i.total - sum(pagos, (p) => ct(p.importe));
    if (f.cobrada && (f.cobro?.fecha || f.fecha) <= hoy && (!pagos.length || resto > 0)) banco += resto;
  }
}
for (const g of pagados.filter((g) => !g.nomina && (g.pagado || g.fecha) <= hoy)) banco -= doc(g).base + doc(g).iva - retGasto(g);
for (const n of datos.nominas) {
  if (n.pagada !== false && pagoNom(n) <= hoy) banco -= nom(n).neto;
  if (finSS(n) <= hoy) banco -= nom(n).seguros;
}
let credito = 0;
for (let y = actual - 2; y <= actual; y++) {
  const fin = `${y}-12-31` < hoy ? `${y}-12-31` : hoy;
  const F = del(datos.facturas, y).filter((f) => f.fecha <= fin), G = del(datos.gastos, y).filter((g) => g.fecha <= fin);
  const ingresos = sum(F, (f) => doc(f).base), corriente = sum(G.filter((g) => !(g.inversion && g.base > 0)), (g) => doc(g).base);
  const am = sum(datos.gastos.filter((g) => g.inversion && g.base > 0), (g) => amort(g, `${y}-01-01`, fin));
  const P = panelResumen({ ...datos, emisor: empresa.emisor, actividades: empresa.actividades, anio: y, hoy });
  await comprobar(`${y}: ingresos, gastos y beneficio del panel con amortización diaria`, () => assert.deepEqual([ct(P.facturado), ct(P.gastado), ct(P.beneficio)], [ingresos, corriente + am, ingresos - corriente - am]));
  const amContable = -sum(A.filter((a) => a.fecha.startsWith(`${y}-`) && a.origen?.tipo === 'amortizacion'), (a) => sum(a.lineas.filter((l) => ['680', '681'].includes(l.cuenta)), (l) => ct(l.haber) - ct(l.debe)));
  await comprobar(`${y}: amortización contable contra días y coeficientes independientes`, () => assert.equal(amContable, am));
  const variacion = stockHasta(fin).valor - stockHasta(`${y - 1}-12-31`).valor;
  const base = Math.max(0, ingresos - corriente - am + variacion);
  const cuota = porcentaje(Math.min(base, 5000000), y === 2024 ? 23 : y === 2025 ? 21 : 19) + porcentaje(Math.max(0, base - 5000000), y === 2024 ? 23 : y === 2025 ? 22 : 21);
  const is = borradorSociedades(datos.facturas, datos.gastos, y, { productos: datos.productos, ajustes: datos.ajustes, albaranes: datos.albaranes, hasta: fin });
  await comprobar(`${y}: base y cuota del IS con existencias y amortización`, () => assert.deepEqual([ct(is.base), ct(is.cuota)], [base, cuota]));
  await comprobar(`${y}: PyG antes de impuestos contra ingresos, gastos, amortización y cierre de existencias`, () => {
    const cerrado = `${y}-12-31` < hoy;
    assert.equal(ct(pygContable(A, { desde: `${y}-01-01`, hasta: fin }).antes), ingresos - corriente - am + (cerrado ? variacion : 0));
  });
  await comprobar(`${y}: pagos fraccionados del 202 contra el 18 % de la cuota guardada`, () => {
    for (const x of modelo202(empresa.cuotaIS, y)) assert.equal(ct(x.pago), porcentaje(ct(empresa.cuotaIS?.[x.de] || 0), 18));
  });
  const pagos202 = sum(Object.values(empresa.pagos202?.[y] || {}), ct);
  for (const [p, valor] of Object.entries(empresa.pagos202?.[y] || {})) if (`${y}-${{ 1: '04', 2: '10', 3: '12' }[p]}-20` <= hoy) banco -= ct(valor);
  if (empresa.cuotaIS?.[y] !== undefined && `${y + 1}-07-25` <= hoy) banco -= Math.max(0, cuota - sum(F, (f) => doc(f).irpf) - pagos202);
  for (let t = 1; t <= 4; t++) {
    const iva = sum(del(F, y, t), (f) => doc(f).iva) - sum(del(G, y, t), (g) => doc(g).iva);
    const compensado = Math.min(Math.max(0, iva), credito);
    const ingresoIva = Math.max(0, iva - compensado);
    credito += Math.max(0, -iva) - compensado;
    await comprobar(`${y}/${t}T: bases, IVA devengado/deducible e inversión del sujeto pasivo`, () => {
      const c = casillas303(datos.facturas, datos.gastos, y, t);
      const exterior = del(G, y, t).filter((g) => ['ue', 'fuera'].includes(g.origen) && !g.ivaPct);
      const auto = sum(exterior, (g) => porcentaje(doc(g).base, 21));
      assert.equal(ct(c['27']), sum(del(F, y, t), (f) => doc(f).iva) + auto);
      assert.equal(ct(c['45']), sum(del(G, y, t), (g) => doc(g).iva) + auto);
      assert.equal(ct(c['46']), iva);
      const q = resumenAnual(datos.facturas, datos.gastos, y, {}, undefined, { regimen: 'sociedad', hasta: fin }).trimestres[t - 1];
      assert.deepEqual([ct(q.ivaCompensado), ct(q.ivaIngresar)], [compensado, ingresoIva]);
    });
    const N = del(datos.nominas.filter((n) => n.pagada !== false), y, t, pagoNom);
    await comprobar(`${y}/${t}T: nóminas y 111 sumados por perceptor pagado`, () => assert.equal(ct(modelo111(datos.nominas, y, t).retenciones), sum(N, (n) => nom(n).irpf)));
    const renta = del(pagados.filter((g) => g.alquiler), y, t, (g) => g.pagado || g.fecha);
    await comprobar(`${y}/${t}T: 115 por fechas de pago y redondeo por renta`, () => assert.equal(ct(modelo115(datos.gastos, y, t).retenciones), sum(renta, retGasto)));
    const presentado = empresa.pagos130?.[y]?.[t] !== undefined && empresa.pagos130?.[y]?.[t] !== null;
    if (presentado && porFecha(y, t) <= hoy) banco -= ingresoIva;
    if (presentado && porFecha(y, t, 20) <= hoy) banco -= sum(del(pagados, y, t, (g) => g.pagado || g.fecha), retGasto) + sum(N, (n) => nom(n).irpf);
  }
  await comprobar(`${y}: 180 y 190 cuadran con los cuatro trimestres`, () => {
    assert.equal(ct(modelo180(datos.gastos, y).retenciones), sum([1, 2, 3, 4], (t) => ct(modelo115(datos.gastos, y, t).retenciones)));
    assert.equal(ct(modelo190(datos.nominas, datos.empleados, y, datos.gastos).retenciones), sum(del(datos.nominas.filter((n) => n.pagada !== false), y, 0, pagoNom), (n) => nom(n).irpf) + sum(del(pagados.filter((g) => !g.alquiler), y, 0, (g) => g.pagado || g.fecha), retGasto));
  });
  await comprobar(`${y}: 349 y 390 con compras y servicios a la UE`, () => {
    const ueFact = F.filter((f) => f.operacion === 'servicios-ue');
    const ueGasto = G.filter((g) => g.origen === 'ue' && !g.ivaPct);
    assert.equal(ct(modelo349(datos.facturas, y, undefined, datos.gastos).total), sum(ueFact, (f) => doc(f).base) + sum(ueGasto, (g) => doc(g).base));
    const m = modelo390(datos.facturas, datos.gastos, y);
    assert.equal(ct(m.resultado), sum(F, (f) => doc(f).iva) - sum(G, (g) => doc(g).iva));
    assert.equal(ct(m.baseDed), sum(G.filter((g) => g.ivaPct > 0 || ['ue', 'fuera'].includes(g.origen)), (g) => doc(g).base));
  });
  resumen.push({ anio: y, ingresos: ingresos / 100, gastos: (corriente + am) / 100, beneficio: (ingresos - corriente - am) / 100, amortizacion: am / 100, variacionExistencias: variacion / 100, baseIS: base / 100, cuotaIS: cuota / 100 });
}
await comprobar('Banco: saldo guardado y mayor 572 contra todos los flujos independientes', () => assert.deepEqual([ct(saldo.importe), ct(mayor(A, '572', actual).final)], [banco, banco]));
const bal = balanceContable(A, hoy, { sociedad: true });
await comprobar('Balance: activo = patrimonio neto + pasivo', () => assert.equal(ct(bal.total), ct(bal.totalPasivo)));
const stock = inventario(datos, { hoy }), oracleStock = stockHasta(hoy);
await comprobar('Inventario: unidades físicas de todos los productos y valoración de entradas/salidas', () => {
  for (const p of stock.productos) assert.equal(p.stock, oracleStock.productos.get(p.id).cantidad, p.id);
  assert.equal(ct(stock.valor), oracleStock.valor);
});

// HTTP: login real y rutas/exportaciones con la sesión, sin acceder a producción.
const form = new FormData(); form.set('email', email); form.set('password', 'Aurora-Simulada-2026!');
const login = await fetch(`${BASE}/api/login`, { method: 'POST', body: form, redirect: 'manual', headers: { Origin: BASE } });
const cookie = login.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
await comprobar('HTTP: login real de Aurora', () => assert.match(cookie, /(?:^|; )t=/));
for (const ruta of ['/', '/modelos', '/contabilidad', '/tesoreria', '/inventario', '/nominas', '/presupuestos']) await comprobar(`HTTP: ${ruta} carga sin error de cálculo`, async () => {
  const r = await fetch(BASE + ruta, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(!/Application error|NaN(?:\s|<)|Infinity(?:\s|<)/.test(html));
});
await comprobar('HTTP: exportación CSV de facturas coincide documento a documento con el oráculo', async () => {
  const r = await fetch(`${BASE}/api/exportar?tipo=facturas&anio=${actual}`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  const csv = await r.text();
  for (const f of del(datos.facturas, actual)) {
    const d = doc(f);
    const num = (n) => (n / 100).toFixed(2).replace('.', ',');
    const fila = `${num(d.base)};${f.ivaPct};${num(d.iva)};${f.irpfPct};${num(d.irpf)};${num(d.total)}`;
    assert.ok(csv.includes(fila), f.id);
  }
});
await comprobar('HTTP: exportación CSV de gastos conserva las retenciones y el neto', async () => {
  const r = await fetch(`${BASE}/api/exportar?tipo=gastos&anio=${actual}`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  const csv = await r.text();
  assert.ok(csv.includes('Retención'));
  for (const g of del(datos.gastos, actual)) {
    const d = doc(g), num = (n) => (n / 100).toFixed(2).replace('.', ',');
    // Tras la cuota, el % de IVA deducible (100 si no se indica, lib/ivaDeducible.js).
    assert.ok(csv.includes(`${num(d.base)};${g.ivaPct};${num(d.iva)};${g.deduciblePct ?? 100};${num(d.total)};${num(d.irpf)}`), g.id);
  }
});
await comprobar('HTTP: Excel contable mantiene el saldo bancario del mayor', async () => {
  const r = await fetch(`${BASE}/api/contabilidad?anio=${actual}`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  const archivos = leerZip(Buffer.from(await r.arrayBuffer()));
  const xml = archivos['xl/worksheets/sheet4.xml'].toString();
  assert.ok(xml.includes(`<v>${banco / 100}</v>`), 'Saldo del banco ausente del libro de sumas y saldos');
});
const informe = { fecha: hoy, empresa: empresa.nombre, documentos: { facturas: datos.facturas.length, gastos: datos.gastos.length, nominas: datos.nominas.length, asientos: A.length }, resumen, saldoBancario: banco / 100, balance: { activo: bal.total, pasivo: bal.totalPasivo }, inventario: stock.valor, verificaciones: resultados.length, correctas: resultados.length - fallos, fallos, resultados };
await writeFile('/private/tmp/netto-auditoria-numerica.json', JSON.stringify(informe, null, 2));
console.log(JSON.stringify({ ...informe, resultados: undefined }, null, 2));
if (fallos) process.exitCode = 1;

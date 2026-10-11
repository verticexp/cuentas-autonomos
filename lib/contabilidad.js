// Contabilidad: categorías de gasto (plan general contable de pymes), cuenta de pérdidas y ganancias y balance de situación.
// Se calcula todo con lo que hay en Netto (facturas, gastos, nóminas y bienes de inversión). Es orientativo.
import { casillas303, importes, r2, trimestre } from './calculos.js';
import { bienes, cuotaEntre, libroBienes } from './amortizaciones.js';
import { modelo111 } from './nominas.js';
import { borradorSociedades, modelo115, retencionesProfesionales } from './modelos.js';
import { xlsx } from './xlsx.js';
import { fechaCorta } from './formato.js';
import { usa303 } from './empresa.js';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from './categorias.js';

export { CATEGORIAS, categoria, categoriaDe, pareceBien };

export const PARTIDAS = [
  { id: 'cifra', nombre: '1. Importe neto de la cifra de negocios', signo: 1 },
  { id: 'aprovisionamientos', nombre: '4. Aprovisionamientos', signo: -1 },
  { id: 'personal', nombre: '6. Gastos de personal', signo: -1 },
  { id: 'explotacion', nombre: '7. Otros gastos de explotación', signo: -1 },
  { id: 'amortizacion', nombre: '8. Amortización del inmovilizado', signo: -1 },
  { id: 'financieros', nombre: '15. Gastos financieros', signo: -1 },
];

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));
const entre = (desde, hasta) => (x) => x.fecha >= desde && x.fecha <= hasta;

// Periodo: el año entero, un trimestre (1-4) o un mes ('2026-03').
export function periodo(anio, p = '') {
  if (/^[1-4]$/.test(String(p))) {
    const t = Number(p);
    const fin = new Date(Date.UTC(anio, t * 3, 0)).toISOString().slice(0, 10);
    return { desde: `${anio}-${String(t * 3 - 2).padStart(2, '0')}-01`, hasta: fin, nombre: `${t}T ${anio}` };
  }
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, nombre: String(anio) };
}

// Cuenta de pérdidas y ganancias entre dos fechas.
// op: { regimen: 'autonomo' | 'sociedad', ivaCoste (el IVA de los gastos es coste si no se presenta el 303), impuesto, nombres (actividades) }
export function pyg(facturas, gastos, { desde, hasta }, op = {}) {
  const { ivaCoste = false, impuesto = 0, nombres = {} } = op;
  const coste = (g) => { const i = importes(g); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const F = facturas.filter(entre(desde, hasta));
  const G = gastos.filter(entre(desde, hasta)).filter((g) => !(g.inversion && g.base > 0));
  const det = {};
  for (const p of PARTIDAS) det[p.id] = new Map();
  const add = (partida, id, nombre, v) => { const m = det[partida]; const x = m.get(id) || { id, nombre, importe: 0 }; x.importe = r2(x.importe + v); m.set(id, x); };

  for (const f of F) add('cifra', f.actividad || '', nombres[f.actividad] || 'Ventas y servicios', f.base);
  for (const g of G) { const c = categoria(categoriaDe(g)); add(c.linea, c.id, `${c.id} · ${c.nombre}`, coste(g)); }
  for (const b of bienes(gastos).filter((g) => g.fecha <= hasta)) {
    const v = cuotaEntre(b, desde, hasta, op);
    if (v > 0) add('amortizacion', b.id, b.concepto, v);
  }

  const partidas = PARTIDAS.map((p) => {
    const detalle = [...det[p.id].values()].filter((x) => x.importe).sort((a, b) => b.importe - a.importe);
    return { ...p, importe: r2(p.signo * suma(detalle, (x) => x.importe)), detalle };
  });
  const v = (id) => partidas.find((p) => p.id === id).importe;
  const explotacion = r2(v('cifra') + v('aprovisionamientos') + v('personal') + v('explotacion') + v('amortizacion'));
  const financiero = v('financieros');
  const antes = r2(explotacion + financiero);
  return { partidas, explotacion, financiero, antes, impuesto: r2(-impuesto), resultado: r2(antes - impuesto), margen: v('cifra') ? r2((antes / v('cifra')) * 100) : 0 };
}

// Balance de situación a una fecha. Sin contabilidad por partida doble, lo que no se sabe (capital, préstamos, el banco
// si no está conectado) queda en «Fondos propios y otros», por diferencia: así siempre cuadra, pero hay que revisarlo.
// saldo: lo que hay en el banco ({ importe, fecha }), solo si es de esa fecha o antes.
export function balance({ facturas, gastos, nominas = [], fiscal = {}, saldo = null, resultado = 0, impuestoPendiente = 0 }, fecha, op = {}) {
  const hasta = (x) => x.fecha <= fecha;
  const libro = bienes(gastos).filter(hasta);
  const bruto = suma(libro, (g) => (op.ivaCoste ? r2(g.base * (1 + (Number(g.ivaPct) || 0) / 100)) : g.base));
  const amort = suma(libro, (g) => cuotaEntre(g, g.fecha, fecha, op));
  const clientes = suma(facturas.filter(hasta).filter((f) => !f.cobrada), (f) => importes(f).total);
  const tesoreria = saldo && saldo.fecha && saldo.fecha.slice(0, 10) <= fecha ? r2(Number(saldo.importe) || 0) : null;

  const proveedores = suma(gastos.filter(hasta).filter((g) => g.pendiente), (g) => importes(g).total);
  // Hacienda: lo del último trimestre cerrado a esa fecha (o el que está en curso): IVA a ingresar y retenciones.
  const anio = Number(fecha.slice(0, 4));
  const t = trimestre(fecha);
  const iva = !usa303(fiscal) ? 0 : Math.max(0, casillas303(facturas, gastos, anio, t)['46']);
  const ret = r2(modelo111(nominas, anio, t).retenciones + retencionesProfesionales(gastos, anio, t).retenciones + modelo115(gastos, anio, t).retenciones);
  const hacienda = r2(iva + ret + Math.max(0, impuestoPendiente));

  const activo = [
    { id: 'inmovilizado', nombre: 'A) Activo no corriente · Inmovilizado', importe: r2(bruto - amort), detalle: [{ nombre: 'Bienes de inversión (lo que costaron)', importe: bruto }, { nombre: 'Amortización acumulada', importe: -amort }] },
    { id: 'corriente', nombre: 'B) Activo corriente', importe: r2(clientes + (tesoreria || 0)), detalle: [{ nombre: 'Clientes (facturas sin cobrar)', importe: clientes }, { nombre: tesoreria === null ? 'Tesorería (sin dato del banco)' : 'Tesorería (saldo del banco)', importe: tesoreria || 0 }] },
  ];
  const totalActivo = suma(activo, (x) => x.importe);
  const pasivoCorriente = r2(proveedores + hacienda);
  const fondos = r2(totalActivo - pasivoCorriente);
  const pasivo = [
    { id: 'patrimonio', nombre: 'A) Patrimonio neto', importe: fondos, detalle: [{ nombre: 'Resultado del ejercicio', importe: resultado }, { nombre: 'Fondos propios y otros (por diferencia)', importe: r2(fondos - resultado) }] },
    { id: 'corriente', nombre: 'C) Pasivo corriente', importe: pasivoCorriente, detalle: [{ nombre: 'Proveedores (gastos sin pagar)', importe: proveedores }, { nombre: 'Hacienda (IVA, retenciones e impuesto)', importe: hacienda }] },
  ];
  return { fecha, activo, pasivo, total: totalActivo, sinBanco: tesoreria === null };
}

// Todo lo de la pantalla Contabilidad (y su Excel) para un año y, si se pide, un trimestre (p: 1-4).
export function informe({ facturas, gastos, nominas = [], saldo = null, fiscal = {}, pagos202 = {}, nombres = {} }, anio, p, hoy) {
  const regimen = fiscal.tipo === 'sociedad' ? 'sociedad' : 'autonomo';
  const op = { regimen, ivaCoste: !usa303(fiscal), nombres };
  // Sociedades: el impuesto del año (borrador con lo que hay en Netto). Los autónomos pagan IRPF, que no es gasto de la actividad.
  const is = (y) => (regimen === 'sociedad' ? borradorSociedades(facturas, gastos, y, { pagos202, ivaCoste: op.ivaCoste }) : null);
  const impuesto = (y) => (p ? 0 : is(y)?.cuota || 0);
  const per = periodo(anio, p);
  const actual = pyg(facturas, gastos, per, { ...op, impuesto: impuesto(anio) });
  const conAnterior = facturas.some((f) => f.fecha.startsWith(`${anio - 1}-`));
  // Con el periodo aún abierto, el anterior solo hasta el mismo día (si no, se compara medio año con uno entero).
  const perAnt = periodo(anio - 1, p);
  const parcial = per.hasta > hoy && per.desde <= hoy;
  if (parcial) perAnt.hasta = `${anio - 1}-${hoy.slice(5)}`;
  let anterior = null;
  if (conAnterior) {
    const sinImp = pyg(facturas, gastos, perAnt, op);
    // Del año anterior hasta ese día, el impuesto con su tipo medio.
    const imp = parcial ? (p ? 0 : r2((Math.max(0, sinImp.antes) * (is(anio - 1)?.tipoMedio || 0)) / 100)) : impuesto(anio - 1);
    anterior = imp ? pyg(facturas, gastos, perAnt, { ...op, impuesto: imp }) : sinImp;
  }
  const libro = libroBienes(gastos, anio, op);
  const fecha = anio < Number(hoy.slice(0, 4)) ? `${anio}-12-31` : hoy;
  const isAnio = is(anio);
  const resultado = pyg(facturas, gastos, { desde: `${anio}-01-01`, hasta: fecha }, { ...op, impuesto: isAnio?.cuota || 0 }).resultado;
  const bal = balance({ facturas, gastos, nominas, fiscal, saldo, resultado, impuestoPendiente: isAnio ? isAnio.resultado : 0 }, fecha, op);
  return { regimen, per, actual, anterior, parcial, libro, bal, nombre: { actual: per.nombre, anterior: conAnterior ? perAnt.nombre : '' } };
}

// Excel con las tres cosas: cuenta de resultados (con el año anterior al lado), bienes de inversión y balance.
export function contabilidadXlsx({ empresa, nombre, actual, anterior, libro, bal }) {
  const filasPyg = [];
  for (const p of actual.partidas) {
    const a = anterior?.partidas.find((x) => x.id === p.id);
    filasPyg.push([{ b: p.nombre }, { b: p.importe }, a ? { b: a.importe } : '']);
    for (const d of p.detalle) filasPyg.push([`    ${d.nombre}`, p.signo * d.importe, '']);
    if (p.id === 'amortizacion') filasPyg.push([{ b: 'A.1) Resultado de explotación' }, { b: actual.explotacion }, anterior ? { b: anterior.explotacion } : '']);
  }
  filasPyg.push([{ b: 'A.2) Resultado financiero' }, { b: actual.financiero }, anterior ? { b: anterior.financiero } : '']);
  filasPyg.push([{ b: 'A.3) Resultado antes de impuestos' }, { b: actual.antes }, anterior ? { b: anterior.antes } : '']);
  if (actual.impuesto) filasPyg.push(['17. Impuesto sobre beneficios', actual.impuesto, anterior ? anterior.impuesto : '']);
  filasPyg.push([{ b: 'A.4) Resultado del ejercicio' }, { b: actual.resultado }, anterior ? { b: anterior.resultado } : '']);
  const lado = (l) => l.flatMap((x) => [[{ b: x.nombre }, { b: x.importe }], ...x.detalle.map((d) => [`    ${d.nombre}`, d.importe])]);
  return xlsx([
    { nombre: 'Pérdidas y ganancias', anchos: [52, 16, 16], filas: [[`${empresa} · ${nombre.actual}`, nombre.actual, nombre.anterior || ''], ...filasPyg, [], ['Orientativo: calculado con los datos de Netto.']] },
    { nombre: 'Bienes de inversión', anchos: [11, 34, 30, 12, 8, 12, 12, 12, 11], filas: [
      ['Fecha', 'Bien', 'Tipo', 'Valor', '% anual', 'Amortización del año', 'Acumulada', 'Pendiente', 'Amortizado el'],
      ...libro.map((b) => [fechaCorta(b.fecha), b.concepto, b.tipo.nombre, b.valor, { n: b.coef }, b.anio, b.acumulada, b.pendiente, fechaCorta(b.fin)]),
      ['Total', '', '', { b: suma(libro, (b) => b.valor) }, '', { b: suma(libro, (b) => b.anio) }, { b: suma(libro, (b) => b.acumulada) }, { b: suma(libro, (b) => b.pendiente) }],
    ] },
    { nombre: 'Balance', anchos: [52, 16], filas: [[`Balance a ${fechaCorta(bal.fecha)}`, ''], [{ b: 'ACTIVO' }, { b: bal.total }], ...lado(bal.activo), [], [{ b: 'PATRIMONIO NETO Y PASIVO' }, { b: bal.total }], ...lado(bal.pasivo), [], ['Orientativo: los fondos propios salen por diferencia.']] },
  ]);
}

export { libroBienes };

// Modelos 115, 180, 349, 390, 190 y borrador de la renta (100). Orientativos: los confirma la gestoría.
import { casillas303, importes, nifUE, origenGasto, r2, resumenAnual, trimestre } from './calculos.js';
import { calculoNomina } from './nominas.js';
import { claveProveedor } from './proveedores.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));
const delT = (l, anio, t) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && (!t || trimestre(x.fecha) === t));
export const RET_ALQUILER = 19;

// 115 (trimestral) y 180 (anual): retenciones del alquiler del local. Los gastos marcados «alquiler».
export function modelo115(gastos, anio, t) {
  const A = delT(gastos.filter((g) => g.alquiler), anio, t);
  const base = suma(A, (g) => g.base);
  return { perceptores: new Set(A.map((g) => claveProveedor(g) || 'sin nombre')).size, base, retenciones: r2((base * RET_ALQUILER) / 100) };
}
export function modelo180(gastos, anio) {
  const m = new Map();
  for (const g of delT(gastos.filter((x) => x.alquiler), anio)) {
    const k = claveProveedor(g) || 'sin nombre';
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', base: 0 };
    p.base = r2(p.base + g.base);
    m.set(k, p);
  }
  const arrendadores = [...m.values()].map((p) => ({ ...p, retenciones: r2((p.base * RET_ALQUILER) / 100) }));
  return { arrendadores, base: suma(arrendadores, (p) => p.base), retenciones: suma(arrendadores, (p) => p.retenciones) };
}

// 349: clientes de otros países de la UE (NIF-IVA con prefijo del país), clave S (servicios prestados), y proveedores
// de la UE con su NIF-IVA, clave I (servicios recibidos).
export { nifUE };
export function modelo349(facturas, anio, t, gastos = []) {
  const m = new Map();
  const sumar = (nif, nombre, clave, base) => {
    const c = m.get(nif + clave) || { nif, nombre, clave, base: 0 };
    c.base = r2(c.base + base);
    m.set(nif + clave, c);
  };
  for (const f of delT(facturas, anio, t)) { const nif = nifUE(f.cliente?.nif); if (nif) sumar(nif, f.cliente.nombre, 'S', f.base); }
  for (const g of delT(gastos, anio, t)) { const nif = nifUE(g.proveedorNif); if (nif && origenGasto(g) === 'ue') sumar(nif, g.proveedor || 'Sin nombre', 'I', g.base); }
  const operadores = [...m.values()].sort((a, b) => b.base - a.base);
  return { operadores, total: suma(operadores, (c) => c.base) };
}

// 390: resumen anual del IVA (suma de los cuatro 303).
export function modelo390(facturas, gastos, anio) {
  const q = [1, 2, 3, 4].map((t) => casillas303(facturas, gastos, anio, t));
  const s = (k) => suma(q, (c) => c[k]);
  const c = { base4: s('01'), cuota4: s('03'), base10: s('04'), cuota10: s('06'), base21: s('07'), cuota21: s('09'), baseUE: s('10'), cuotaUE: s('11'), baseFuera: s('12'), cuotaFuera: s('13'), devengado: s('27'), baseDed: s('28'), deducible: s('45'), sinIva: s('sinIva') };
  c.resultado = r2(c.devengado - c.deducible);
  c.volumen = suma(delT(facturas, anio), (f) => f.base);
  c.trimestres = q.map((x) => x['46']);
  return c;
}

// Retenciones a profesionales (gastos con irpfPct, por ejemplo la gestoría): casillas 07 a 09 del 111 y clave G del 190.
export function retencionesProfesionales(gastos, anio, t) {
  const R = delT(gastos.filter((g) => Number(g.irpfPct) > 0), anio, t);
  return { perceptores: new Set(R.map((g) => claveProveedor(g) || 'sin nombre')).size, base: suma(R, (g) => g.base), retenciones: suma(R, (g) => importes(g).irpf) };
}

// 190: resumen anual de retenciones de los trabajadores (clave A) y de los profesionales (clave G), por perceptor.
export function modelo190(nominas, empleados, anio, gastos = []) {
  const m = new Map();
  for (const n of nominas.filter((x) => x.mes.startsWith(`${anio}-`))) {
    const e = empleados.find((x) => x.id === n.empleado) || {};
    const c = calculoNomina(n);
    const p = m.get(n.empleado) || { nombre: e.nombre || n.empleadoNombre, nif: e.nif || '', clave: 'A', percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + c.bruto); p.retenciones = r2(p.retenciones + c.irpf);
    m.set(n.empleado, p);
  }
  for (const g of delT(gastos.filter((x) => Number(x.irpfPct) > 0), anio)) {
    const k = `prof:${claveProveedor(g) || 'sin nombre'}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', clave: 'G', percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + g.base); p.retenciones = r2(p.retenciones + importes(g).irpf);
    m.set(k, p);
  }
  const perceptores = [...m.values()];
  return { perceptores, percepciones: suma(perceptores, (p) => p.percepciones), retenciones: suma(perceptores, (p) => p.retenciones) };
}

// 347: clientes (clave B) y proveedores (clave A) con los que se pasa de 3.005,06 € en el año, IVA incluido, con lo de
// cada trimestre. Fuera: lo que ya va en el 349 (empresas de la UE), lo de fuera de la UE (ventas sin IVA a un NIF que
// no es español y compras de fuera), lo que lleva retención (va en el 190 o el 180: facturas con retención, alquiler del
// local y profesionales) y los tickets sin proveedor.
export const LIMITE_347 = 3005.06;
const NIF_ES = /^(ES)?([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
export function modelo347(facturas, gastos, anio) {
  const m = new Map();
  const sumar = (clave, nif, nombre, fecha, total) => {
    const k = `${clave}:${nif || String(nombre || '').trim().toUpperCase()}`;
    const o = m.get(k) || { clave, nif: nif || '', nombre: nombre || 'Sin nombre', total: 0, trimestres: [0, 0, 0, 0] };
    o.total = r2(o.total + total);
    o.trimestres[trimestre(fecha) - 1] = r2(o.trimestres[trimestre(fecha) - 1] + total);
    m.set(k, o);
  };
  const nifDe = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '');
  for (const f of delT(facturas, anio)) {
    const i = importes(f);
    const nif = nifDe(f.cliente?.nif);
    if (Number(f.irpfPct) > 0 || nifUE(nif) || (!i.iva && nif && !NIF_ES.test(nif))) continue;
    sumar('B', nif.replace(/^ES/, ''), f.cliente?.nombre, f.fecha, r2(i.base + i.iva));
  }
  for (const g of delT(gastos, anio)) {
    if (g.alquiler || Number(g.irpfPct) > 0 || origenGasto(g) || !String(g.proveedor || '').trim()) continue;
    const i = importes(g);
    sumar('A', nifDe(g.proveedorNif).replace(/^ES/, ''), g.proveedor, g.fecha, r2(i.base + i.iva));
  }
  const declarados = [...m.values()].filter((o) => Math.abs(o.total) > LIMITE_347).sort((a, b) => b.total - a.total);
  return { ventas: declarados.filter((o) => o.clave === 'B'), compras: declarados.filter((o) => o.clave === 'A'), sinNif: declarados.filter((o) => !o.nif) };
}

// 202 (sociedades, art. 40.2 de la Ley del Impuesto sobre Sociedades): el 18 % de la cuota del último Impuesto sobre
// Sociedades ya presentado (menos deducciones, bonificaciones y retenciones). En abril, el de hace dos años (el del
// año pasado aún no se ha presentado); en octubre y diciembre, el del año pasado. Sin cuota (o a cero), no se presenta.
export function modelo202(cuotaIS = {}, anio) {
  return [[1, 'abril', anio - 2], [2, 'octubre', anio - 1], [3, 'diciembre', anio - 1]].map(([p, mes, de]) => {
    const cuota = cuotaIS[de] ?? null;
    return { p, mes, de, cuota, pago: cuota > 0 ? r2(cuota * 0.18) : 0, fecha: `${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20` };
  });
}

// Borrador del Impuesto sobre Sociedades (modelo 200), solo con lo que hay en la app: base = ingresos − gastos, sin
// ajustes. El tipo depende de la facturación del año anterior (Ley 27/2014, art. 29, con la Ley 7/2024): menos de 1 M
// (microempresa, dos tramos: los primeros 50.000 € y el resto), menos de 10 M (reducida dimensión) o general (25 %).
const TIPO_MICRO = { 2025: [21, 22], 2026: [19, 21] }; // antes de 2025, 23 %; desde 2027, 17 % y 20 %
const TIPO_REDUCIDA = { 2025: 24, 2026: 23, 2027: 22, 2028: 21 }; // antes de 2025, 25 %; desde 2029, 20 %
export function tiposIS(anio, tamano) {
  if (tamano === 'micro') return anio < 2025 ? [23, 23] : TIPO_MICRO[anio] || [17, 20];
  if (tamano === 'reducida') { const t = anio < 2025 ? 25 : TIPO_REDUCIDA[anio] || 20; return [t, t]; }
  return [25, 25];
}
export function borradorSociedades(facturas, gastos, anio, { pagos202 = {}, ivaCoste = false } = {}) {
  const neto = (x) => { const i = importes(x); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const ingresos = suma(delT(facturas, anio), neto);
  const gastosAnio = suma(delT(gastos, anio), neto);
  const base = r2(Math.max(0, ingresos - gastosAnio));
  const previo = suma(delT(facturas, anio - 1), (f) => f.base);
  const incn = previo || suma(delT(facturas, anio), (f) => f.base); // sin datos del año anterior, el de este
  const tamano = incn < 1e6 ? 'micro' : incn < 1e7 ? 'reducida' : 'general';
  const [t1, t2] = tiposIS(anio, tamano);
  const tramos = t1 === t2 ? [{ base, pct: t1 }] : [{ base: Math.min(base, 50000), pct: t1 }, { base: r2(Math.max(0, base - 50000)), pct: t2 }];
  for (const x of tramos) x.cuota = r2((x.base * x.pct) / 100);
  const cuota = suma(tramos, (x) => x.cuota);
  const pagos = r2(Object.values(pagos202[anio] || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return { ingresos, gastos: gastosAnio, base, incn, conAnterior: previo > 0, tamano, tramos: tramos.filter((x) => x.base > 0), cuota, pagos, resultado: r2(cuota - pagos), tipoMedio: base ? r2((cuota / base) * 100) : 0 };
}

// Borrador de la renta de un autónomo (estimación directa simplificada), solo con lo que hay en la app.
// Escala general orientativa (estatal + autonómica media) y mínimo personal de 5.550 €.
const ESCALA = [[12450, 19], [20200, 24], [35200, 30], [60000, 37], [300000, 45], [Infinity, 47]];
export function cuotaEscala(base) {
  let cuota = 0, desde = 0;
  for (const [hasta, pct] of ESCALA) {
    if (base <= desde) break;
    cuota += ((Math.min(base, hasta) - desde) * pct) / 100;
    desde = hasta;
  }
  return r2(cuota);
}
export const MINIMO_PERSONAL = 5550;
export function borradorRenta(facturas, gastos, anio, pagos = {}, { ivaCoste = false } = {}) {
  const q4 = resumenAnual(facturas, gastos, anio, pagos, undefined, { ivaCoste }).trimestres[3];
  const ingresos = q4.ingAcum;
  const gastosAnio = r2(q4.gasAcum - q4.difJust);
  const rendimiento = r2(Math.max(0, q4.rendAcum));
  const cuota = r2(Math.max(0, cuotaEscala(rendimiento) - cuotaEscala(Math.min(rendimiento, MINIMO_PERSONAL))));
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos).reduce((s, v) => s + (Number(v) || 0), 0));
  return { ingresos, gastos: gastosAnio, difJust: q4.difJust, rendimiento, cuota, retenciones, pagos130, resultado: r2(cuota - retenciones - pagos130), tipoMedio: rendimiento ? r2((cuota / rendimiento) * 100) : 0 };
}

export { importes };

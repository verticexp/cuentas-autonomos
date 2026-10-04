// Paquete trimestral para la gestoría: facturas, gastos e impuestos de un trimestre, en Excel (y en PDF, lib/paquetePdf.js).
import { casillas303, importes, numeroFactura, r2, resumenAnual, trimestre } from './calculos.js';
import { fiscalDe, actividadesDe, nombresActividad, usa130, usa303 } from './empresa.js';
import { modelo111 } from './nominas.js';
import { fechaCorta } from './formato.js';
import { xlsx } from './xlsx.js';

const suma = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));

// u: usuario con su empresa (emisor, fiscal, actividades, pagos130).
export function datosPaquete(u, { facturas, gastos, nominas = [] }, anio, t) {
  const fiscal = fiscalDe(u);
  const acts = actividadesDe(u);
  const ACT = nombresActividad(acts);
  const delT = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const F = delT(facturas).map((f) => ({ ...importes(f), numero: numeroFactura(f), fecha: f.fecha, cliente: f.cliente.nombre, nif: f.cliente.nif || '', actividad: ACT[f.actividad] || '', concepto: f.concepto, ivaPct: f.ivaPct, irpfPct: f.irpfPct || 0, cobrada: Boolean(f.cobrada), rectifica: f.rectifica?.numero || '' }));
  const G = delT(gastos).map((g) => { const i = importes(g); return { ...i, total: r2(i.base + i.iva), fecha: g.fecha, proveedor: g.proveedor || '', nif: g.proveedorNif || '', concepto: g.concepto, actividad: ACT[g.actividad] || '', ivaPct: g.ivaPct }; });
  const totales = {
    facturas: { n: F.length, base: suma(F, 'base'), iva: suma(F, 'iva'), irpf: suma(F, 'irpf'), total: suma(F, 'total') },
    gastos: { n: G.length, base: suma(G, 'base'), iva: suma(G, 'iva'), total: suma(G, 'total') },
  };
  totales.rendimiento = r2(totales.facturas.base - totales.gastos.base);

  const modelos = [];
  if (usa303(fiscal)) {
    const c = casillas303(facturas, gastos, anio, t);
    modelos.push({ id: '303', nombre: 'IVA trimestral', resultado: c['46'], casillas: [
      ['01', 'Base al 4 %', c['01']], ['03', 'Cuota al 4 %', c['03']], ['04', 'Base al 10 %', c['04']], ['06', 'Cuota al 10 %', c['06']],
      ['07', 'Base al 21 %', c['07']], ['09', 'Cuota al 21 %', c['09']], ['27', 'Total cuota devengada', c['27']],
      ['28', 'Base IVA soportado', c['28']], ['29', 'Cuota IVA soportado', c['29']], ['45', 'Total a deducir', c['45']], ['46', 'Resultado', c['46']],
      ...(c.sinIva ? [['—', 'Facturado sin IVA (revisar casilla)', c.sinIva]] : []),
    ].filter(([, , v], i, l) => v !== 0 || ['27', '45', '46'].includes(l[i][0])) });
  }
  if (usa130(fiscal)) {
    const q = resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, acts.map((a) => a.id)).trimestres[t - 1];
    modelos.push({ id: '130', nombre: 'Pago a cuenta del IRPF (acumulado desde enero)', resultado: q.m130, casillas: [
      ['01', 'Ingresos', q.ingAcum], ['02', 'Gastos (incluye el 5 %)', q.gasAcum], ['03', 'Rendimiento neto', q.rendAcum],
      ['04', '20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum))], ['05', 'Pagos de trimestres anteriores', q.pagosPrev], ['06', 'Retenciones', q.retAcum], ['07', 'Resultado', q.m130],
    ] });
  }
  if (fiscal.trabajadores) {
    const m = modelo111(nominas, anio, t);
    modelos.push({ id: '111', nombre: 'Retenciones de trabajadores', resultado: m.retenciones, casillas: [
      ['01', 'Perceptores', m.perceptores], ['02', 'Percepciones dinerarias', m.percepciones], ['03', 'Retenciones', m.retenciones], ['28', 'Resultado a ingresar', m.retenciones],
    ] });
  }
  return { anio, t, empresa: u.emisor?.nombre || u.empresaNombre || '', nif: u.emisor?.nif || '', fiscal, facturas: F, gastos: G, totales, modelos };
}

export const nombrePaquete = (d) => `gestoria-${d.t}T-${d.anio}`;

export function paqueteXlsx(d) {
  const T = d.totales;
  return xlsx([
    { nombre: 'Resumen', anchos: [34, 18], filas: [
      [`Paquete ${d.t}T ${d.anio}`, ''],
      ['Empresa', d.empresa], ['NIF', d.nif], ['Régimen', d.fiscal.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'], [],
      [{ b: 'Facturas emitidas' }, { b: { n: T.facturas.n } }], ['Base imponible', T.facturas.base], ['IVA repercutido', T.facturas.iva], ['Retenciones IRPF', T.facturas.irpf], ['Total facturado', T.facturas.total], [],
      [{ b: 'Gastos' }, { b: { n: T.gastos.n } }], ['Base imponible', T.gastos.base], ['IVA soportado', T.gastos.iva], ['Total gastos', T.gastos.total], [],
      [{ b: 'Rendimiento del trimestre' }, { b: T.rendimiento }], [],
      ...d.modelos.map((m) => [`Modelo ${m.id} · ${m.nombre}`, m.resultado]),
      [], ['Orientativo: calculado con los datos de Netto.'],
    ] },
    { nombre: 'Facturas', anchos: [12, 11, 28, 12, 16, 34, 12, 7, 11, 7, 11, 12, 9, 11], filas: [
      ['Número', 'Fecha', 'Cliente', 'NIF', 'Actividad', 'Concepto', 'Base', 'IVA %', 'Cuota IVA', 'IRPF %', 'Retención', 'Total', 'Cobrada', 'Rectifica'],
      ...d.facturas.map((f) => [f.numero, fechaCorta(f.fecha), f.cliente, f.nif, f.actividad, f.concepto, f.base, { n: f.ivaPct }, f.iva, { n: f.irpfPct }, f.irpf, f.total, f.cobrada ? 'Sí' : 'No', f.rectifica]),
      ['Total', '', '', '', '', '', { b: T.facturas.base }, '', { b: T.facturas.iva }, '', { b: T.facturas.irpf }, { b: T.facturas.total }],
    ] },
    { nombre: 'Gastos', anchos: [11, 26, 12, 34, 16, 12, 7, 11, 12], filas: [
      ['Fecha', 'Proveedor', 'NIF', 'Concepto', 'Actividad', 'Base', 'IVA %', 'Cuota IVA', 'Total'],
      ...d.gastos.map((g) => [fechaCorta(g.fecha), g.proveedor, g.nif, g.concepto, g.actividad, g.base, { n: g.ivaPct }, g.iva, g.total]),
      ['Total', '', '', '', '', { b: T.gastos.base }, '', { b: T.gastos.iva }, { b: T.gastos.total }],
    ] },
    { nombre: 'Modelos', anchos: [10, 9, 40, 14], filas: [
      ['Modelo', 'Casilla', 'Concepto', 'Importe'],
      ...d.modelos.flatMap((m) => m.casillas.map(([c, txt, v]) => [m.id, c, txt, v])),
    ] },
  ]);
}

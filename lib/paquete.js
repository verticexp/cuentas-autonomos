// Paquete trimestral para la gestoría: facturas, gastos e impuestos de un trimestre, en Excel (y en PDF, lib/paquetePdf.js).
import { casillas303, importes, ivaGasto, liquidaciones303, minoracion130, numeroFactura, r2, resumenAnual, tipoIvaTexto, trimestre } from './calculos.js';
import { fiscalDe, actividadesDe, ajustesIva, nombresActividad, usa130, usa303 } from './empresa.js';
import { modelo111 } from './nominas.js';
import { fechaCorta } from './formato.js';
import { xlsx } from './xlsx.js';
import { modelo115, modelo349, retencionesProfesionales } from './modelos.js';
import { amortizacionesAnio } from './amortizaciones.js';

const suma = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));

// u: usuario con su empresa (emisor, fiscal, actividades, pagos130).
export function datosPaquete(u, { facturas, gastos, nominas = [] }, anio, t) {
  const fiscal = fiscalDe(u);
  const acts = actividadesDe(u);
  const ACT = nombresActividad(acts);
  const delT = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const F = delT(facturas).map((f) => ({ ...importes(f), numero: numeroFactura(f), fecha: f.fecha, cliente: f.cliente.nombre, nif: f.cliente.nif || '', actividad: ACT[f.actividad] || '', concepto: f.concepto, ivaPct: f.ivaPct, irpfPct: f.irpfPct || 0, cobrada: Boolean(f.cobrada), rectifica: f.rectifica?.numero || '' }));
  const G = delT(gastos).map((g) => {
    // IVA de la factura que se deduce (lib/ivaDeducible.js); el autoliquidado de un proveedor de fuera no está en la factura.
    const i = importes(g), v = ivaGasto(g);
    return { ...i, ivaDeducible: !usa303(fiscal) || v.auto ? 0 : v.deducible, noDeducible: g.inversion && g.base > 0 ? 0 : usa303(fiscal) ? v.noDeducible : i.iva, fecha: g.fecha, proveedor: g.proveedor || '', nif: g.proveedorNif || '', concepto: g.concepto, actividad: ACT[g.actividad] || '', ivaPct: tipoIvaTexto(g) };
  });
  const totales = {
    facturas: { n: F.length, base: suma(F, 'base'), iva: suma(F, 'iva'), irpf: suma(F, 'irpf'), total: suma(F, 'total') },
    gastos: { n: G.length, base: suma(G, 'base'), iva: suma(G, 'iva'), ivaDeducible: suma(G, 'ivaDeducible'), irpf: suma(G, 'irpf'), total: suma(G, 'total') },
  };
  // Los bienes de inversión no restan enteros: solo su amortización del trimestre.
  const inversiones = suma(delT(gastos).filter((g) => g.inversion && g.base > 0), 'base');
  totales.amortizacion = r2(amortizacionesAnio(gastos, anio, { regimen: fiscal.tipo, ivaCoste: !usa303(fiscal) }).filter((x) => x.t === t).reduce((s, x) => s + x.cuota, 0));
  // El IVA no deducible de un gasto (lib/ivaDeducible.js) también resta; el de un bien va en su amortización.
  totales.rendimiento = r2(totales.facturas.base - totales.gastos.base - suma(G, 'noDeducible') + inversiones - totales.amortizacion);

  const modelos = [];
  if (usa303(fiscal)) {
    const c = casillas303(facturas, gastos, anio, t, ajustesIva(u));
    const liquidacion = liquidaciones303(facturas, gastos, anio, undefined, ajustesIva(u))[t - 1];
    modelos.push({ id: '303', nombre: 'IVA trimestral', resultado: c['46'] < 0 ? c['46'] : liquidacion.ingresar, casillas: [
      ['01', 'Base al 4 %', c['01']], ['03', 'Cuota al 4 %', c['03']], ['04', 'Base al 10 %', c['04']], ['06', 'Cuota al 10 %', c['06']],
      ['07', 'Base al 21 %', c['07']], ['09', 'Cuota al 21 %', c['09']],
      ...c.otros.flatMap((o) => [['—', `Base al ${o.pct} % (revisar casilla)`, o.base], ['—', `Cuota al ${o.pct} % (revisar casilla)`, o.iva]]),
      ...(c['14'] || c['15'] ? [['14', 'Rectificativas: base', c['14']], ['15', 'Rectificativas: cuota', c['15']]] : []),
      ['10', 'Compras a la UE: base', c['10']], ['11', 'Compras a la UE: cuota', c['11']], ['12', 'Compras de fuera de la UE: base', c['12']], ['13', 'Compras de fuera de la UE: cuota', c['13']],
      ['27', 'Total cuota devengada', c['27']], ['28', 'Base IVA soportado', c['28']], ['29', 'Cuota IVA soportado', c['29']],
      ['30', 'Bienes de inversión: base', c['30']], ['31', 'Bienes de inversión: cuota', c['31']],
      ['36', 'Compras a la UE: base deducible', c['36']], ['37', 'Compras a la UE: cuota deducible', c['37']], ['38', 'Bienes de inversión de la UE: base', c['38']], ['39', 'Bienes de inversión de la UE: cuota', c['39']],
      ['40', 'Abonos de proveedores: base', c['40']], ['41', 'Abonos de proveedores: cuota', c['41']], ['44', 'Regularización de la prorrata', c['44']],
      ['45', 'Total a deducir', c['45']], ['46', 'Resultado', c['46']],
      ...(liquidacion.compensado ? [['—', 'Cuotas anteriores compensadas', -liquidacion.compensado], ['—', 'A ingresar tras compensación', liquidacion.ingresar]] : []),
      ...(liquidacion.devolucion ? [['—', 'A devolver (devolución pedida en el 4T)', liquidacion.devolucion]] : []),
      ...(c['59'] ? [['59', 'Empresas de otros países de la UE', c['59']]] : []),
      ...(c['60'] ? [['60', 'Exportaciones', c['60']]] : []),
      ...(c['120'] ? [['120', 'No sujetas por localización', c['120']]] : []),
      ...(c['122'] ? [['122', 'Inversión del sujeto pasivo', c['122']]] : []),
      ...(r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122']) ? [['—', 'Otro facturado sin IVA (revisar casilla)', r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122'])]] : []),
    ].filter(([, , v], i, l) => v !== 0 || ['27', '45', '46'].includes(l[i][0])) });
  }
  if (usa130(fiscal)) {
    const q = resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, acts.map((a) => a.id), { ivaCoste: !usa303(fiscal), minoracion: minoracion130(u.rend130?.[anio - 1]), iva: ajustesIva(u) }).trimestres[t - 1];
    // Resultado con su signo (casilla 19, como el fichero de la Sede): negativo si la minoración no cabe.
    modelos.push({ id: '130', nombre: 'Pago a cuenta del IRPF (acumulado desde enero)', resultado: r2(Math.max(0, q.c07) - q.minoracion - q.negPrev), casillas: [
      ['01', 'Ingresos', q.ingAcum], ['02', 'Gastos (incluye el 5 %)', q.gasAcum], ['03', 'Rendimiento neto', q.rendAcum],
      ['04', '20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum))], ['05', 'Pagos de trimestres anteriores', q.pagosPrev], ['06', 'Retenciones', q.retAcum], ['07', 'Resultado', q.c07],
      ...(q.minoracion ? [['13', 'Minoración (art. 110.3.c)', q.minoracion]] : []), ...(q.negPrev ? [['15', 'Negativos de trimestres anteriores', q.negPrev]] : []),
      ['19', 'A ingresar', q.m130],
    ] });
  }
  const prof = retencionesProfesionales(gastos, anio, t);
  if (fiscal.trabajadores || prof.retenciones) {
    const m = modelo111(nominas, anio, t);
    const total = r2(m.retenciones + prof.retenciones);
    modelos.push({ id: '111', nombre: 'Retenciones de trabajadores y profesionales', resultado: total, casillas: [
      ['01', 'Trabajadores', m.perceptores], ['02', 'Sueldos', m.percepciones], ['03', 'Retenciones', m.retenciones],
      ['07', 'Profesionales', prof.perceptores], ['08', 'Facturas de profesionales', prof.base], ['09', 'Retenciones', prof.retenciones], ['28', 'Resultado a ingresar', total],
    ] });
  }
  if (fiscal.alquiler || gastos.some((g) => g.alquiler)) {
    const m = modelo115(gastos, anio, t);
    modelos.push({ id: '115', nombre: 'Retenciones del alquiler', resultado: m.retenciones, casillas: [['01', 'Perceptores', m.perceptores], ['02', 'Base de las retenciones', m.base], ['03', 'Retenciones a ingresar', m.retenciones]] });
  }
  const m349 = modelo349(facturas, anio, t, gastos);
  if (fiscal.intracom || m349.total) {
    modelos.push({ id: '349', nombre: 'Operaciones con empresas de la UE', resultado: m349.total, casillas: [...m349.operadores.map((c) => [c.clave, `${c.nif} ${c.nombre}`, c.base]), ['Total', 'Importe total', m349.total]] });
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
      [{ b: 'Gastos' }, { b: { n: T.gastos.n } }], ['Base imponible', T.gastos.base], ['IVA soportado', T.gastos.iva], ...(T.gastos.ivaDeducible !== T.gastos.iva ? [['IVA soportado deducible', T.gastos.ivaDeducible]] : []), ['Retenciones practicadas', T.gastos.irpf], ['Total gastos', T.gastos.total], [],
      ...(T.amortizacion ? [['Amortización de bienes de inversión', T.amortizacion]] : []), [{ b: 'Rendimiento del trimestre' }, { b: T.rendimiento }], [],
      ...d.modelos.map((m) => [`Modelo ${m.id} · ${m.nombre}`, m.resultado]),
      [], ['Orientativo: calculado con los datos de Fisquo.'],
    ] },
    { nombre: 'Facturas', anchos: [12, 11, 28, 12, 16, 34, 12, 7, 11, 7, 11, 12, 9, 11], filas: [
      ['Número', 'Fecha', 'Cliente', 'NIF', 'Actividad', 'Concepto', 'Base', 'IVA %', 'Cuota IVA', 'IRPF %', 'Retención', 'Total', 'Cobrada', 'Rectifica'],
      ...d.facturas.map((f) => [f.numero, fechaCorta(f.fecha), f.cliente, f.nif, f.actividad, f.concepto, f.base, { n: f.ivaPct }, f.iva, { n: f.irpfPct }, f.irpf, f.total, f.cobrada ? 'Sí' : 'No', f.rectifica]),
      ['Total', '', '', '', '', '', { b: T.facturas.base }, '', { b: T.facturas.iva }, '', { b: T.facturas.irpf }, { b: T.facturas.total }],
    ] },
    { nombre: 'Gastos', anchos: [11, 26, 12, 34, 16, 12, 7, 11, 12, 12, 12], filas: [
      ['Fecha', 'Proveedor', 'NIF', 'Concepto', 'Actividad', 'Base', 'IVA %', 'Cuota IVA', 'IVA deducible', 'Total', 'Retención'],
      ...d.gastos.map((g) => [fechaCorta(g.fecha), g.proveedor, g.nif, g.concepto, g.actividad, g.base, typeof g.ivaPct === 'string' ? g.ivaPct : { n: g.ivaPct }, g.iva, g.ivaDeducible, g.total, g.irpf]),
      ['Total', '', '', '', '', { b: T.gastos.base }, '', { b: T.gastos.iva }, { b: T.gastos.ivaDeducible }, { b: T.gastos.total }, { b: T.gastos.irpf }],
    ] },
    { nombre: 'Modelos', anchos: [10, 9, 40, 14], filas: [
      ['Modelo', 'Casilla', 'Concepto', 'Importe'],
      ...d.modelos.flatMap((m) => m.casillas.map(([c, txt, v]) => [m.id, c, txt, v])),
    ] },
  ]);
}

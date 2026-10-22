// Cálculos fiscales. Sin dependencias, para poder probarlos.
import { parseImporte } from './importe.js';
import { festivoNacional } from './festivos.js';
import { amortizacionesAnio } from './amortizaciones.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { baseDeducible, costeAfecto, nifUE, origenGasto, partirIva, pctDeducible } from './ivaDeducible.js';

export { r2, r3 } from './redondeo.js';
import { r2 } from './redondeo.js';
export const trimestre = (fecha) => Math.ceil(Number(fecha.slice(5, 7)) / 3);
// Series: sin letra → 07-2026 · Rectificativas 'R' → R01-2026 · cualquier otra letra (V, A…) → V2026-001
// Las importadas (Holded…) conservan su número original.
export const numeroFactura = (f) => f.importada || (f.serie && f.serie !== 'R'
  ? `${f.serie}${f.anio}-${String(f.numero).padStart(3, '0')}`
  : `${f.serie || ''}${String(f.numero).padStart(2, '0')}-${f.anio}`);
export const serieDe = (actividad) => (actividad === 'vertice' ? 'V' : '');
export const ACTIVIDADES = { dj: 'DJ', vertice: 'Vértice' };

// Como parseImporte pero respetando el signo (facturas rectificativas).
export const leerImporte = (v) => (/^\s*-/.test(String(v)) ? -1 : 1) * parseImporte(v);

// Facturas de varias líneas: cada línea con cantidad, precio, descuento (%) e IVA propio.
// Las facturas antiguas no tienen líneas: una sola base con un solo tipo de IVA.
export const baseLinea = (l) => r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0) * (1 - (Number(l.dto) || 0) / 100));

export const pctValido = (v) => Math.min(100, Math.max(0, Number(v) || 0));
const ID_DOC = /^[A-Za-z0-9-]{1,40}$/;

// Líneas que llegan de un formulario (factura, pedido o albarán). Del catálogo: el producto, para su stock
// (lib/inventario.js); de un albarán: su id, porque ese stock ya salió al entregarlo.
export function limpiarLineas(lineas) {
  if (!Array.isArray(lineas)) return null;
  const l = lineas.slice(0, 100).map((x) => ({
    concepto: String(x.concepto || '').trim().slice(0, 200),
    cantidad: Math.round((leerImporte(x.cantidad ?? 1) || 0) * 1000) / 1000,
    precio: r2(leerImporte(x.precio) || 0),
    dto: pctValido(x.dto),
    ivaPct: pctValido(x.ivaPct),
    // Coste por unidad, en los regímenes de margen (REBU y REAV): solo cuenta si la factura lleva `margen`.
    ...(x.coste !== undefined && x.coste !== '' && Number.isFinite(leerImporte(x.coste)) && leerImporte(x.coste) >= 0 ? { coste: r2(leerImporte(x.coste)) } : {}),
    ...(/^[a-f0-9]{12}$/.test(x.producto || '') ? { producto: x.producto } : {}),
    ...(ID_DOC.test(x.albaran || '') ? { albaran: x.albaran } : {}),
  })).filter((x) => x.concepto || x.precio);
  return l.length ? l : null;
}

// Columnas que hacen falta al imprimir una factura con líneas (las antiguas se imprimen como antes).
export const columnasLineas = (x) => ({ dto: x.lineas.some((l) => l.dto), iva: !x.margen && desglose(x).length > 1 });

// Recargo de equivalencia (art. 161 de la Ley del IVA): lo que se cobra, además del IVA, a un cliente comerciante minorista
// en ese régimen. Va con cada tipo de IVA; al 0 % no hay. Una factura con `recargo: true` lo lleva en todas sus líneas.
export const RECARGO = { 21: 5.2, 10: 1.4, 5: 0.62, 4: 0.5, 2: 0.26 };
const conRecargo = (x, l) => (x.recargo && RECARGO[l.pct] ? { ...l, re: RECARGO[l.pct], recargo: r2((l.base * RECARGO[l.pct]) / 100) } : l);

// Regímenes especiales de margen (arts. 135-139 y 141-147 de la Ley del IVA): bienes usados, objetos de arte y
// antigüedades (REBU) y agencias de viajes (REAV). La factura (margen: 'rebu' | 'reav') no desglosa el IVA: cada línea
// lleva su precio final y su coste por unidad (lo que costó el bien o los servicios del viaje). El IVA va dentro del margen
// de cada operación (venta − coste); con margen negativo no hay IVA, y no se compensa con otras. Lo que no es margen va
// aparte, fuera de la base (fueraBase): no es una operación exenta ni va en ninguna casilla del 303.
export const MARGEN = { rebu: 'Régimen especial de los bienes usados', reav: 'Régimen especial de las agencias de viajes' };
function desgloseMargen(x) {
  const m = new Map();
  let fuera = 0;
  for (const l of x.lineas) {
    const venta = baseLinea(l);
    const signo = venta < 0 ? -1 : 1;
    const margen = r2(Math.abs(venta) - Math.abs((Number(l.coste) || 0) * (Number(l.cantidad) || 0)));
    const base = margen > 0 ? r2(margen / (1 + (Number(l.ivaPct) || 0) / 100)) : 0;
    const iva = margen > 0 ? r2(margen - base) : 0;
    const g = m.get(l.ivaPct) || { base: 0, iva: 0 };
    g.base += signo * base; g.iva += signo * iva;
    m.set(l.ivaPct, g);
    fuera += venta - signo * (base + iva);
  }
  const out = [...m].map(([pct, g]) => ({ pct, base: r2(g.base), iva: r2(g.iva), margen: true })).filter((g) => g.base || g.iva);
  if (r2(fuera)) out.push({ pct: 0, base: r2(fuera), iva: 0, fueraBase: true });
  return out;
}

// Base e IVA por tipo de IVA, de mayor a menor base (y el recargo de equivalencia de cada tipo, si lo lleva).
export function desglose(x) {
  if (x.margen && x.lineas?.length) return desgloseMargen(x);
  // Gasto con varios tipos de IVA (una factura recibida con productos al 21 y al 10 %): base por tipo; base es su suma.
  if (!x.lineas?.length && x.porTipo?.length) return x.porTipo.map((t) => ({ pct: Number(t.ivaPct) || 0, base: r2(Number(t.base) || 0), iva: r2(((Number(t.base) || 0) * (Number(t.ivaPct) || 0)) / 100) })).sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
  if (!x.lineas?.length) return [conRecargo(x, { pct: x.ivaPct, base: x.base, iva: r2((x.base * x.ivaPct) / 100) })];
  const m = new Map();
  for (const l of x.lineas) m.set(l.ivaPct, r2((m.get(l.ivaPct) || 0) + baseLinea(l)));
  // Un cierre de caja guarda la cuota real de sus tiques por tipo (caja.cuotas): a veces no hay una base de dos decimales
  // cuya cuota por fórmula dé el total cobrado (100 € al 21 %), y el total del TPV manda (auditoría P05).
  const out = [...m].map(([pct, base]) => ({ pct, base, iva: x.caja?.cuotas?.[pct] ?? r2((base * pct) / 100) })).sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
  // Cierres guardados antes de esto (sin cuotas): el céntimo de redondeo que falte o sobre respecto a lo cobrado se carga
  // en el tipo de más base, para que el documento sume lo que de verdad se cobró.
  if (x.caja && !x.caja.cuotas && out.length) {
    const cobrado = r2((x.caja.efectivo || 0) + (x.caja.tarjeta || 0) + (x.caja.otros || 0));
    const d = r2(cobrado - r2(out.reduce((s, g) => s + g.base + g.iva, 0)));
    if (d && Math.abs(d) <= 0.01 * out.length) out[0].iva = r2(out[0].iva + d);
  }
  return out.map((l) => conRecargo(x, l));
}

// Compensación del régimen especial de la agricultura, ganadería y pesca (REAGP, art. 130 de la Ley del IVA): quien está
// en él no repercute IVA, sino que cobra a las empresas que le compran el 12 % (agricultura y forestal) o el 10,5 %
// (ganadería y pesca) sobre el precio. Va en sus ventas (compensacion) y en los gastos de quien le compra, que se la
// deduce en el 303 (casilla 42).
export const COMPENSACION = [12, 10.5];

// recargo: el de equivalencia (solo si lo lleva). Es cuota repercutida como el IVA: suma en el total, no en la base.
export function importes(x) {
  const d = desglose(x);
  const iva = r2(d.reduce((s, l) => s + l.iva, 0));
  const recargo = r2(d.reduce((s, l) => s + (l.recargo || 0), 0));
  const compensacion = COMPENSACION.includes(Number(x.compensacion)) ? r2((x.base * Number(x.compensacion)) / 100) : 0;
  const irpf = r2((x.base * (x.alquiler ? 19 : x.irpfPct || 0)) / 100);
  return { base: x.base, iva, ...(recargo ? { recargo } : {}), ...(compensacion ? { compensacion } : {}), irpf, total: r2(x.base + iva + recargo + compensacion - irpf) };
}

// Cada serie ('', 'V', 'R') tiene su numeración correlativa.
export const siguienteNumero = (facturas, anio, serie = '') =>
  Math.max(0, ...facturas.filter((f) => f.anio === anio && (f.serie || '') === serie).map((f) => f.numero)) + 1;

const masDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// Cobros de una factura (auditoría F04): lo pagado sale de sus pagos; las marcadas a mano como cobradas, enteras.
// Lista única de cobros: los apuntados y, si la factura está marcada como cobrada (a mano, por el banco o por una remesa)
// sin que sus pagos cubran el total, el resto como un cobro implícito en la fecha de su cobro. Así el saldo, la tesorería
// y los asientos hablan de lo mismo y las facturas antiguas (cobrada sin pagos) siguen valiendo.
export function pagosDe(f) {
  const lista = (f.pagos || []).map((p) => ({ ...p, importe: Number(p.importe) || 0 }));
  const suma = r2(lista.reduce((s, p) => s + p.importe, 0));
  if (!f.cobrada) return lista;
  const total = importes(f).total;
  if (lista.length && suma >= total) return lista;
  const resto = r2(total - suma);
  if (!resto) return lista;
  return [...lista, { fecha: f.cobro?.fecha || f.fecha, importe: resto, metodo: f.cobro?.metodo || 'manual', ...(f.cobro?.banco ? { banco: f.cobro.banco } : {}), implicito: true }];
}
export const pagadoDe = (f) => r2(pagosDe(f).reduce((s, p) => s + p.importe, 0));
export const saldoDe = (f) => Math.max(0, r2(importes(f).total - pagadoDe(f)));
// Lo que falta por cobrar (con signo: una rectificativa sin cobrar resta). 0 si está cobrada.
export const pendienteDe = (f) => (f.cobrada ? 0 : r2(importes(f).total - pagadoDe(f)));
// El vencimiento guardado al emitir manda (auditoría F05): cambiar el plazo en Ajustes solo afecta a las nuevas.
export const vencimiento = (f, plazo) => f.vence || masDias(f.fecha, Number(plazo) || 0);
// Emisor de un documento: el del momento de emitirlo; las facturas de antes de guardarlo, el actual.
export const emisorDe = (f, u) => (f?.emisor && Object.keys(f.emisor).length ? f.emisor : u?.emisor || {});
export const vencida = (f, plazo, hoy) => !f.cobrada && importes(f).total > 0 && hoy > vencimiento(f, plazo);

// Plazos de 303 y 130: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→30 ene del año siguiente; se avanza hasta un día
// hábil, contando los festivos nacionales (no los autonómicos ni locales).
export const habil = (f) => {
  while ([0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay()) || festivoNacional(f)) f = masDias(f, 1);
  return f;
};
// diaEnero: el último día del plazo del 4T (30 en 303, 130 y 349; 20 en 111, 115 y 123).
export const limiteTrimestre = (t, anio, diaEnero = 30) => habil(t === 4 ? `${anio + 1}-01-${diaEnero}` : `${anio}-${['04', '07', '10'][t - 1]}-20`);
export function proximoPlazo(hoy, diaEnero = 30) {
  const y = Number(hoy.slice(0, 4));
  const plazos = [[4, y - 1], [1, y], [2, y], [3, y], [4, y]].map(([t, anio]) => ({ t, anio, fecha: limiteTrimestre(t, anio, diaEnero) }));
  const p = plazos.find((x) => x.fecha >= hoy);
  return { ...p, dias: diasEntre(hoy, p.fecha) };
}

// Situación de un trimestre del 303/130 según la fecha (sin contar si está marcado como presentado):
// «curso» mientras no ha terminado, «listo» del día siguiente al cierre hasta el límite (incluido) y «fuera» después.
const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];
export function situacionTrimestre(t, anio, hoy, diaEnero = 30) {
  const limite = limiteTrimestre(t, anio, diaEnero);
  const estado = hoy <= `${anio}-${FIN_TRIMESTRE[t - 1]}` ? 'curso' : hoy <= limite ? 'listo' : 'fuera';
  return { estado, limite, dias: diasEntre(hoy, limite) };
}

// Lo que conviene apartar de una factura para Hacienda: su IVA más lo que faltará de IRPF en el 130: el 20 % de lo que
// de verdad queda de beneficio de esa factura, menos la retención que ya te hacen. margen: rendimiento ÷ ingresos del año
// hasta su trimestre (margenIrpf); sin datos, el 95 % (solo la difícil justificación), que es lo más prudente.
export function apartar(f, { margen = 0.95 } = {}) {
  const i = importes(f);
  const m = Math.min(1, Math.max(0, Number(margen) || 0));
  const irpf = Math.max(0, r2(0.2 * m * f.base - i.irpf));
  return { iva: i.iva, irpf, total: r2(i.iva + irpf), margen: m };
}
// Parte de lo facturado que es beneficio para el 130 (resumenAnual, acumulado hasta el trimestre t): con pérdidas, 0;
// sin facturas aún, null (apartar usa entonces el 95 %).
export function margenIrpf(resumen, t) {
  const q = resumen?.trimestres?.[t - 1];
  if (!q || !(q.ingAcum > 0)) return null;
  return Math.min(1, Math.max(0, q.rendAcum / q.ingAcum));
}

// nifUE y origenGasto viven en lib/ivaDeducible.js (sin dependencias, para la amortización); se exportan desde aquí.
export { nifUE, origenGasto };
const autoliquidado = (l) => l.map((g) => ({ base: g.base, iva: r2(g.base * 0.21) }));

// IVA soportado de un gasto (lib/ivaDeducible.js): el de su factura más el autoliquidado (proveedor de fuera), y qué parte
// se deduce. noDeducible es más coste del gasto (IRPF, Sociedades, amortización y contabilidad).
export function ivaGasto(g) {
  const auto = origenGasto(g) ? r2(g.base * 0.21) : 0;
  const soportado = r2(importes(g).iva + auto);
  return { soportado, auto, ...partirIva(g, soportado) };
}
// Lo que cuesta un gasto para el IRPF, Sociedades y la rentabilidad: su base más el IVA que no se recupera (todo, para
// quien no presenta el 303; si no, la parte no deducible).
export const costeGasto = (g, { ivaCoste = false } = {}) => {
  const i = importes(g);
  return r2(i.base + (ivaCoste ? i.iva : ivaGasto(g).noDeducible));
};
// Bien de inversión a efectos del IVA (art. 108 LIVA): para varios años y de 3.005,06 € o más. Lo de menos es inmovilizado
// para la contabilidad y la amortización, pero en el 303 va con el IVA soportado corriente (28-29, 36-37).
export const bienInversionIva = (g) => Boolean(g.inversion) && g.base >= 3005.06;
// Base y cuota que van a las casillas de IVA deducible (28-31, 36-37): la parte deducible.
const deducibleDe = (g) => ({ base: baseDeducible(g, g.base), iva: ivaGasto(g).deducible });

// Motivos de una rectificativa (lib/verifactu.js) que corrigen un error al facturar.
export const RECT_ERROR = ['errorFactura', 'errorDerecho'];
const cuotaDe = (f) => { const i = importes(f); return r2(i.iva + (i.recargo || 0)); };
// Rectificativa que sube el IVA por un error que no es fundado de derecho ni de las causas del art. 80 (un tipo mal
// aplicado, una cuota que faltaba): según el art. 89.Cinco LIVA no va en el trimestre en que se emite, sino en una
// autoliquidación rectificativa del periodo de la factura original, con recargo (art. 27 LGT) e intereses si procede.
export const alzaPorError = (f) => f.rectifica?.motivo === 'errorFactura' && /^\d{4}-\d{2}-\d{2}$/.test(f.rectifica.fecha || '') && f.rectifica.fecha < f.fecha && cuotaDe(f) > 0;
// Fecha con la que una factura cuenta en el 303: la suya o, si es una de esas rectificativas, la de la original.
export const fechaIva = (f) => (alzaPorError(f) ? f.rectifica.fecha : f.fecha);
// Fecha con la que cuenta en el IRPF: una rectificativa que corrige un error de una factura de otro año va a ese año
// (su renta), no al de la rectificativa; las devoluciones, descuentos e impagados se quedan en el año en que pasan.
export const fechaIrpf = (f) => (RECT_ERROR.includes(f.rectifica?.motivo) && /^\d{4}-/.test(f.rectifica.fecha || '') && f.rectifica.fecha.slice(0, 4) !== f.fecha.slice(0, 4) && f.rectifica.fecha < f.fecha ? f.rectifica.fecha : f.fecha);

// Régimen especial del criterio de caja (RECC, arts. 163 decies a sexiesdecies LIVA). iva.recc: { desde, hasta? } de la
// empresa (lib/empresa.js). Sus facturas de ese periodo devengan el IVA al cobrarse, en proporción a lo cobrado, y lo que
// siga sin cobrar el 31 de diciembre del año siguiente, ese día; sus gastos se deducen al pagarse (o ese mismo día). Un
// gasto con g.recc (el proveedor está en el régimen y su factura lo dice) también espera al pago, aunque la empresa no esté
// en él (art. 163 terdecies). Por la regla general siempre: lo autoliquidado (proveedores de fuera), las ventas de la
// ventanilla única y los cierres de caja (cobrados en el acto).
export const enRecc = (recc, fecha) => Boolean(recc?.desde) && fecha >= recc.desde && (!recc.hasta || fecha <= recc.hasta);
const esOss = (f) => Boolean(f?.oss?.pais);
const limiteCaja = (fecha) => `${Number(fecha.slice(0, 4)) + 1}-12-31`;
export const gastoEnCaja = (g, recc) => (Boolean(g.recc) || enRecc(recc, g.fecha)) && !origenGasto(g) && g.ivaPct > 0;
// Fecha en que se deduce un gasto del criterio de caja: la de su pago (nunca antes de la factura) o, si para el 31 de
// diciembre del año siguiente sigue sin pagar, esa.
export function fechaDeduccion(g) {
  const limite = limiteCaja(g.fecha);
  if (g.pendiente) return limite;
  const pago = (g.pagado || g.fecha) < g.fecha ? g.fecha : g.pagado || g.fecha;
  return pago < limite ? pago : limite;
}
// Operaciones del criterio de caja: cada factura del periodo con sus rectificativas, que cambian lo que se devenga. Una
// rectificativa sin su original a mano, o una factura en negativo suelta, va por la regla general.
export function operacionesCaja(facturas, recc) {
  if (!recc?.desde) return [];
  const grupos = new Map();
  for (const f of facturas) if (!f.rectifica && !f.caja && !esOss(f) && enRecc(recc, f.fecha) && importes(f).base >= 0) grupos.set(f.id, [f]);
  for (const f of facturas) if (f.rectifica?.id && grupos.has(f.rectifica.id)) grupos.get(f.rectifica.id).push(f);
  return [...grupos.values()];
}
// IVA devengado de una operación del criterio de caja hasta una fecha, por tipo: la parte cobrada de lo que hay que cobrar
// (el total, ya sin la retención; las rectificativas emitidas hasta ese día cambian las dos cosas), o todo desde el 31 de
// diciembre del año siguiente al de la factura.
export function devengadoCaja(grupo, fecha) {
  const vivas = grupo.filter((f) => f.fecha <= fecha);
  if (!vivas.length) return [];
  const total = r2(vivas.reduce((s, f) => s + importes(f).total, 0));
  const cobrado = r2(vivas.reduce((s, f) => s + pagosDe(f).reduce((x, p) => (String(p.fecha || f.fecha).slice(0, 10) <= fecha ? x + p.importe : x), 0), 0));
  const parte = fecha >= limiteCaja(grupo[0].fecha) || total <= 0 ? 1 : Math.min(1, Math.max(0, cobrado / total));
  const m = new Map();
  for (const f of vivas) for (const d of desglose(f)) {
    if (!d.pct) continue;
    const x = m.get(d.pct) || { pct: d.pct, base: 0, iva: 0, recargo: 0 };
    x.base += d.base; x.iva += d.iva; x.recargo += d.recargo || 0;
    if (d.re) x.re = d.re;
    m.set(d.pct, x);
  }
  return [...m.values()].map((x) => ({ pct: x.pct, base: r2(x.base * parte), iva: r2(x.iva * parte), ...(x.re ? { re: x.re, recargo: r2(x.recargo * parte) } : {}) }));
}
// Lo que devenga cada operación del criterio de caja en un trimestre (lo devengado al acabarlo menos lo devengado al
// empezarlo), por tipo. Lo que baja (una rectificativa de algo ya devengado) es una modificación: casillas 14 y 15.
export function devengoCajaTrimestre(grupos, anio, t) {
  const fin = `${anio}-${FIN_TRIMESTRE[t - 1]}`;
  const antes = t === 1 ? `${anio - 1}-12-31` : `${anio}-${FIN_TRIMESTRE[t - 2]}`;
  const sube = [], baja = [];
  for (const g of grupos) {
    if (g[0].fecha > fin) continue;
    // Ya devengada entera: solo cambia si se rectifica en el trimestre.
    if (limiteCaja(g[0].fecha) <= antes && !g.some((f) => f.fecha > antes && f.fecha <= fin)) continue;
    const previo = new Map(devengadoCaja(g, antes).map((x) => [x.pct, x]));
    for (const x of devengadoCaja(g, fin)) {
      const y = previo.get(x.pct) || { base: 0, iva: 0, recargo: 0 };
      const d = { pct: x.pct, base: r2(x.base - y.base), iva: r2(x.iva - y.iva), ...(x.re ? { re: x.re, recargo: r2((x.recargo || 0) - (y.recargo || 0)) } : {}) };
      if (d.base || d.iva) (d.base < 0 || d.iva < 0 ? baja : sube).push(d);
    }
  }
  return { sube, baja };
}
// IVA de las facturas del criterio de caja que aún no se ha devengado en una fecha (para enseñarlo en Impuestos).
export function pendienteCaja(facturas, recc, fecha) {
  let iva = 0;
  for (const g of operacionesCaja(facturas, recc)) {
    if (g[0].fecha > fecha) continue;
    const total = g.filter((f) => f.fecha <= fecha).flatMap(desglose).reduce((s, d) => s + (d.pct ? d.iva : 0), 0);
    iva += total - devengadoCaja(g, fecha).reduce((s, d) => s + d.iva, 0);
  }
  return r2(iva);
}

// Casillas del modelo 303 (régimen general) de un trimestre, antes de la prorrata. iva.recc: criterio de caja (arriba).
function casillasSinProrrata(facturas, gastos, anio, t, iva = {}) {
  const enT = (d) => d.startsWith(`${anio}-`) && trimestre(d) === t;
  const recc = iva.recc;
  const grupos = operacionesCaja(facturas, recc);
  const deCaja = new Set(grupos.flatMap((g) => g.map((f) => f.id)));
  // Las ventas de la ventanilla única (lib/oss.js) llevan el IVA del país del cliente: van al 369 y aquí solo su base, en la 123.
  const todasT = facturas.filter((f) => enT(fechaIva(f)));
  const FT = todasT.filter((f) => !esOss(f));
  const FTg = FT.filter((f) => !deCaja.has(f.id)), FTc = FT.filter((f) => deCaja.has(f.id));
  const GT = gastos.filter((g) => enT(gastoEnCaja(g, recc) ? fechaDeduccion(g) : g.fecha));
  // Rectificativas (y facturas en negativo): casillas 14 y 15, modificación de bases y cuotas (art. 80 LIVA), con su signo,
  // en vez de restarse dentro de las 01-09 (que no admiten negativos en el fichero de la Sede). Lo exento sigue aparte.
  // Las que corrigen un error al alza van con la factura original, como parte de su autoliquidación rectificativa.
  // Del criterio de caja, lo que se devenga en el trimestre por los cobros (y su parte sin IVA, por la fecha).
  const esMod = (f) => (Boolean(f.rectifica) && !alzaPorError(f)) || importes(f).base < 0;
  const caja = devengoCajaTrimestre(grupos, anio, t);
  // Lo que queda fuera de la base en los regímenes de margen (el coste de lo vendido) no va en ninguna casilla.
  const F = [...FTg.flatMap((f) => (esMod(f) ? desglose(f).filter((x) => !x.pct) : desglose(f))), ...FTc.flatMap((f) => desglose(f).filter((x) => !x.pct)), ...caja.sube].filter((x) => !x.fueraBase);
  const MOD = [...FTg.filter(esMod).flatMap(desglose).filter((x) => x.pct), ...caja.baja];
  // Abonos de proveedores (gastos en negativo): rectificación de deducciones, casillas 40 y 41, no restados en las 28-39.
  const abono = (g) => g.base < 0;
  const deUE = GT.filter((g) => origenGasto(g) === 'ue'), deFuera = GT.filter((g) => origenGasto(g) === 'fuera');
  // Lo autoliquidado se devenga entero (10-13) y se deduce solo la parte deducible del gasto (lib/ivaDeducible.js). El de
  // un abono de un proveedor de fuera modifica lo devengado: con las rectificativas, en la 14 y la 15.
  const UEg = autoliquidado(deUE.filter((g) => !abono(g))), FUERA = autoliquidado(deFuera.filter((g) => !abono(g)));
  const AUTOMOD = autoliquidado([...deUE, ...deFuera].filter(abono));
  const UEded = deUE.filter((g) => !abono(g) && !bienInversionIva(g)).map(deducibleDe), UEinv = deUE.filter((g) => !abono(g) && bienInversionIva(g)).map(deducibleDe);
  // Lo de fuera de la UE se deduce con el resto del IVA soportado (28 y 29); lo de la UE, en las 36 y 37.
  // Los bienes de inversión van aparte (30 y 31); el resto del IVA soportado, en las 28 y 29.
  const esBien = bienInversionIva;
  const G = [...GT.filter((g) => g.ivaPct > 0 && !abono(g) && !esBien(g)), ...deFuera.filter((g) => !abono(g))].map(deducibleDe);
  const INV = GT.filter((g) => g.ivaPct > 0 && !abono(g) && esBien(g)).map(deducibleDe);
  const RECT = [...GT.filter((g) => g.ivaPct > 0 && abono(g)), ...deUE.filter(abono), ...deFuera.filter(abono)].map(deducibleDe);
  const COMP = GT.filter((g) => COMPENSACION.includes(Number(g.compensacion))).map((g) => { const i = importes(g); const pct = pctDeducible(g); return { base: r2((g.base * pct) / 100), iva: r2(((i.compensacion || 0) * pct) / 100) }; });
  const tipo = (p) => F.filter((x) => x.pct === p);
  // Recargo de equivalencia repercutido (16-24 y 156-158), por su tipo; el de las rectificativas, en la 25 y la 26.
  const RE = F.filter((x) => x.recargo), reMod = MOD.filter((x) => x.recargo);
  const re = (r) => RE.filter((x) => x.re === r);
  const sum = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));
  // Cualquier otro tipo admitido (2 %, 5 %…, auditoría P04) no se pierde: va aparte, por tipo, y su cuota entra en la 27.
  // Las casillas oficiales de esos tipos (temporales) cambian de un año a otro: se enseñan como «revisar casilla».
  const otros = [...new Set(F.map((x) => x.pct).filter((p) => ![0, 4, 10, 21].includes(p)))].sort((a, b) => a - b)
    .map((pct) => ({ pct, base: sum(tipo(pct), 'base'), iva: sum(tipo(pct), 'iva') }));
  const c = {
    '01': sum(tipo(4), 'base'), '03': sum(tipo(4), 'iva'),
    '04': sum(tipo(10), 'base'), '06': sum(tipo(10), 'iva'),
    '07': sum(tipo(21), 'base'), '09': sum(tipo(21), 'iva'),
    '10': sum(UEg, 'base'), '11': sum(UEg, 'iva'), '12': sum(FUERA, 'base'), '13': sum(FUERA, 'iva'),
    '28': sum(G, 'base'), '29': sum(G, 'iva'), '30': sum(INV, 'base'), '31': sum(INV, 'iva'), '36': sum(UEded, 'base'), '37': sum(UEded, 'iva'), '38': sum(UEinv, 'base'), '39': sum(UEinv, 'iva'),
    '40': sum(RECT, 'base'), '41': sum(RECT, 'iva'), '44': 0,
    // Compensaciones pagadas a agricultores, ganaderos y pescadores en el REAGP (casilla 42), en la parte deducible.
    base42: sum(COMP, 'base'), '42': sum(COMP, 'iva'),
    sinIva: sum(tipo(0), 'base'),
    '16': sum(re(0.5), 'base'), '18': sum(re(0.5), 'recargo'), '19': sum(re(1.4), 'base'), '21': sum(re(1.4), 'recargo'),
    '22': sum(re(5.2), 'base'), '24': sum(re(5.2), 'recargo'), '25': sum(reMod, 'base'), '26': sum(reMod, 'recargo'),
    reOtros: [0.62, 0.26].map((r) => ({ re: r, base: sum(re(r), 'base'), recargo: sum(re(r), 'recargo') })).filter((x) => x.base || x.recargo),
    otros, cuotaOtros: r2(otros.reduce((s, x) => s + x.iva, 0)), baseOtros: r2(otros.reduce((s, x) => s + x.base, 0)),
  };
  // Información adicional (casillas de 2026), con la parte sin IVA de cada factura según su operación (lib/operaciones.js):
  // 59 entregas y servicios intracomunitarios, 60 exportaciones, 120 no sujetas por localización, 122 inversión del sujeto pasivo.
  for (const k of ['59', '60', '120', '122']) c[k] = 0;
  for (const f of FT) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    // La 59 recoge exactamente lo que va al 349 (lib/modelos.js): sin NIF-IVA de la UE no es intracomunitaria y se queda
    // fuera (sale en el aviso de «facturas sin IVA sin motivo claro») en vez de descuadrar los dos modelos.
    const casilla = op?.ue && !nifUE(f.cliente?.nif) ? null : op?.casilla303;
    if (casilla) c[casilla] = r2(c[casilla] + desglose(f).filter((x) => x.pct === 0 && !x.fueraBase).reduce((s, x) => s + x.base, 0));
  }
  // Criterio de caja, información adicional: lo que por la regla general se habría devengado (62-63) y deducido (74-75) en
  // el trimestre, se haya cobrado o pagado o no. criterioCaja: la empresa está en el régimen en el trimestre;
  // destinatarioCaja: tiene gastos de proveedores que lo están (las dos marcas de la cabecera del 303).
  const cajaF = FTc.flatMap(desglose).filter((x) => x.pct);
  const cajaG = gastos.filter((g) => gastoEnCaja(g, recc) && enT(g.fecha));
  c['62'] = sum(cajaF, 'base'); c['63'] = sum(cajaF, 'iva');
  c['74'] = r2(cajaG.reduce((s, g) => s + g.base, 0)); c['75'] = r2(cajaG.reduce((s, g) => s + importes(g).iva, 0));
  c.criterioCaja = Boolean(recc?.desde) && recc.desde <= `${anio}-${FIN_TRIMESTRE[t - 1]}` && (!recc.hasta || recc.hasta >= `${anio}-${['01-01', '04-01', '07-01', '10-01'][t - 1]}`);
  c.destinatarioCaja = cajaG.some((g) => g.recc);
  c['123'] = r2(todasT.filter(esOss).reduce((s, f) => s + importes(f).base, 0));
  c['14'] = r2(sum(MOD, 'base') + sum(AUTOMOD, 'base')); c['15'] = r2(sum(MOD, 'iva') + sum(AUTOMOD, 'iva'));
  // Un tipo que aun así quedara en negativo (líneas de descuento mayores que la venta) también es una modificación.
  for (const [b, q] of [['01', '03'], ['04', '06'], ['07', '09']]) if (c[b] < 0) { c['14'] = r2(c['14'] + c[b]); c['15'] = r2(c['15'] + c[q]); c[b] = 0; c[q] = 0; }
  // Un recargo que aun así quedara en negativo (descuentos mayores que la venta) también es una modificación (25-26).
  for (const [b, q] of [['16', '18'], ['19', '21'], ['22', '24']]) if (c[b] < 0) { c['25'] = r2(c['25'] + c[b]); c['26'] = r2(c['26'] + c[q]); c[b] = 0; c[q] = 0; }
  c.recargo = r2(c['18'] + c['21'] + c['24'] + c.reOtros.reduce((s, x) => s + x.recargo, 0) + c['26']);
  c['27'] = r2(c['03'] + c['06'] + c['09'] + c.cuotaOtros + c['11'] + c['13'] + c['15'] + c.recargo);
  return totales303(c);
}
// Cuotas deducibles (antes de la regularización de la prorrata) y resultado.
const DEDUCCIONES = [['28', '29'], ['30', '31'], ['36', '37'], ['38', '39'], ['40', '41'], ['base42', '42']];
const deducido = (c) => r2(DEDUCCIONES.reduce((s, [, q]) => s + c[q], 0));
function totales303(c) {
  c['45'] = r2(deducido(c) + c['44']);
  c['46'] = r2(c['27'] - c['45']);
  return c;
}

// Prorrata general (arts. 102-106 LIVA): quien hace a la vez operaciones exentas del art. 20 (sanidad, enseñanza,
// seguros, alquiler de vivienda…), que no dan derecho a deducir, y operaciones que sí lo dan (con IVA, exportaciones,
// entregas y servicios a la UE, inversión del sujeto pasivo, servicios localizados fuera), solo deduce el porcentaje
// de su IVA soportado que corresponde a las segundas, redondeado a la unidad superior (art. 104.Dos). Sin operaciones
// exentas en el año, null (no hay prorrata). hasta: con lo facturado hasta ese día.
// Solo cuentan como exentas las facturas marcadas así a mano (operacion 'exenta'): una factura sin IVA a un cliente
// español sin motivo elegido puede ser otra cosa (un suplido, un error) y no debe recortar las deducciones sin avisar;
// esas salen en los avisos de Impuestos (lib/revisionFiscal.js) para que se clasifiquen.
// No conoce lo que el art. 104.Tres deja fuera del cálculo (venta de bienes de inversión, operaciones financieras o
// inmobiliarias accesorias): esas facturas hay que revisarlas con la asesoría.
export function prorrataAnio(facturas, anio, hasta = `${anio}-12-31`) {
  let total = 0, exentas = 0;
  for (const f of facturas) {
    if (!f.fecha.startsWith(`${anio}-`) || f.fecha > hasta) continue;
    const d = desglose(f);
    total += d.reduce((s, x) => s + x.base, 0);
    if (f.operacion === 'exenta' && operacionDe(f) === 'exenta') exentas += d.filter((x) => !x.pct).reduce((s, x) => s + x.base, 0);
  }
  if (!(r2(exentas) > 0) || !(r2(total) > 0)) return null;
  return Math.min(100, Math.max(0, Math.ceil((100 * (total - exentas)) / total - 1e-9)));
}
// Porcentaje provisional de un trimestre (art. 105): el que se haya guardado para el año (iva.prorrata[anio]); si no, el
// definitivo del año anterior; si ese año no tuvo prorrata (inicio de actividad o primeras operaciones exentas, art.
// 105.Dos), el del año con lo facturado hasta el final del trimestre. null: no hay prorrata.
export function prorrataProvisional(facturas, anio, t, iva = {}) {
  const manual = iva.prorrata?.[anio];
  if (manual !== undefined && manual !== null && manual !== '' && Number.isFinite(Number(manual))) return Math.min(100, Math.max(0, Math.round(Number(manual))));
  return prorrataAnio(facturas, anio - 1) ?? prorrataAnio(facturas, anio, `${anio}-${FIN_TRIMESTRE[t - 1]}`);
}
const conProrrata = (c, pct) => {
  const out = { ...c };
  for (const [b, q] of DEDUCCIONES) { out[b] = r2((c[b] * pct) / 100); out[q] = r2((c[q] * pct) / 100); }
  return out;
};

// Casillas del modelo 303 (régimen general) de un trimestre. iva: ajustes de la empresa (ajustesIva de lib/empresa.js):
// prorrata provisional guardada por año y marcas de presentado (con la devolución pedida en el 4T).
// Con prorrata, las deducciones van ya con el porcentaje provisional y el 4T lleva la regularización con el definitivo
// del año (casilla 44, art. 105.Tres). c.prorrata: { provisional, definitiva (4T), perdido: IVA que no se deduce y es
// gasto en el IRPF (con la regularización restada en el 4T) }.
export function casillas303(facturas, gastos, anio, t, iva = {}) {
  const c = casillasSinProrrata(facturas, gastos, anio, t, iva);
  const pct = prorrataProvisional(facturas, anio, t, iva);
  const definitiva = t === 4 ? prorrataAnio(facturas, anio) : null;
  if (pct === null && definitiva === null) return c;
  const provisional = pct ?? 100;
  const out = conProrrata(c, provisional);
  let perdido = r2(deducido(c) - deducido(out));
  if (t === 4) {
    // Regularización: lo que da el porcentaje definitivo sobre todo el IVA deducible del año, menos lo ya deducido.
    let antes = deducido(c), hecho = deducido(out);
    for (const q of [1, 2, 3]) {
      const sin = casillasSinProrrata(facturas, gastos, anio, q, iva);
      antes += deducido(sin);
      hecho += deducido(conProrrata(sin, prorrataProvisional(facturas, anio, q, iva) ?? 100));
    }
    out['44'] = r2(r2((antes * (definitiva ?? 100)) / 100) - hecho);
    perdido = r2(perdido - out['44']);
  }
  out.prorrata = { provisional, ...(t === 4 ? { definitiva: definitiva ?? 100 } : {}), perdido };
  return totales303(out);
}

const suma = (lista, k) => r2(lista.reduce((s, x) => s + x[k], 0));

// Compensación automática del IVA con el histórico registrado. El resultado bruto del trimestre
// sigue siendo m303; a ingresar solo queda lo que no cubren cuotas negativas anteriores.
// Saldo a favor (art. 99.Cinco y 115 LIVA): se compensa en los trimestres siguientes durante cuatro años desde la
// autoliquidación en que nace, o se pide su devolución en el 4T. Si el 4T está marcado como «devolución pedida»
// (iva.pres303[año][4] === 'devolucion'), en ese 4T se aplica todo el saldo anterior (casilla 78 = 110) y lo que quede a
// favor se devuelve: no pasa al año siguiente. caduca: el último día para compensar el saldo pendiente más antiguo
// (cuatro años desde el plazo de su trimestre); perdidoProrrata: IVA no deducible por la prorrata (gasto en el IRPF).
export function liquidaciones303(facturas, gastos, anio, hasta = `${anio}-12-31`, iva = {}) {
  const fechas = [...facturas, ...gastos].map((x) => Number(x.fecha.slice(0, 4))).filter(Number.isFinite);
  const primero = fechas.reduce((min, y) => Math.min(min, y), anio);
  let pendiente = 0;
  let saldos = []; // lo pendiente, por el trimestre en que nació (se gasta primero lo más antiguo)
  const out = [];
  // Una rectificativa que va al periodo de su original (fechaIva) cuenta aunque se emita después de `hasta`.
  const F = facturas.filter((f) => fechaIva(f) <= hasta), G = gastos.filter((g) => g.fecha <= hasta);
  for (let y = primero; y <= anio; y++) for (let t = 1; t <= 4; t++) {
    const c = casillas303(F, G, y, t, iva);
    const bruto = c['46'];
    const anterior = pendiente;
    let compensado = bruto > 0 ? Math.min(bruto, pendiente) : 0;
    const ingresar = Math.max(0, r2(bruto - compensado));
    let gastar = compensado;
    while (gastar > 0 && saldos.length) {
      const usar = Math.min(gastar, saldos[0].importe);
      saldos[0].importe = r2(saldos[0].importe - usar); gastar = r2(gastar - usar);
      if (saldos[0].importe <= 0) saldos.shift();
    }
    if (bruto < 0) saldos.push({ anio: y, t, importe: -bruto, caduca: `${Number(limiteTrimestre(t, y).slice(0, 4)) + 4}${limiteTrimestre(t, y).slice(4)}` });
    pendiente = r2(pendiente - compensado + Math.max(0, -bruto));
    let devolucion = 0;
    if (t === 4 && iva.pres303?.[y]?.[4] === 'devolucion' && pendiente > 0) {
      devolucion = pendiente; compensado = anterior; pendiente = 0; saldos = [];
    }
    if (y === anio) out.push({ t, bruto, anterior, compensado, ingresar, pendiente, devolucion, caduca: saldos[0]?.caduca || null, origen: saldos[0] ? { anio: saldos[0].anio, t: saldos[0].t } : null, perdidoProrrata: c.prorrata?.perdido || 0 });
  }
  return out;
}

// Casilla 13 del 130 (art. 110.3.c del Reglamento del IRPF): lo que se resta cada trimestre según el rendimiento neto
// de la actividad del año anterior. Sin ese dato (null), nada.
export function minoracion130(rendAnterior) {
  if (rendAnterior === null || rendAnterior === undefined || rendAnterior === '') return 0;
  const r = Number(rendAnterior);
  if (r <= 9000) return 100;
  if (r <= 10000) return 75;
  if (r <= 11000) return 50;
  if (r <= 12000) return 25;
  return 0;
}

// 303: IVA repercutido − IVA soportado del trimestre.
// 130: 20 % del rendimiento acumulado del año − retenciones acumuladas − pagos 130 realmente hechos antes.
// Si un trimestre no se presentó, no resta nada y lo pendiente se arrastra al siguiente que se presente.
// actividades: ids de las actividades de la empresa (en su orden). Si hay facturas o gastos de una que ya no está,
// se cuentan igual (como una actividad más): ningún euro se queda fuera.
// ivaCoste: quien no presenta el 303 (actividad exenta o recargo de equivalencia) no recupera el IVA, así que para el
// IRPF el de sus gastos es gasto y, en recargo de equivalencia, el que cobra es ingreso.
// minoracion: lo de la casilla 13 de cada trimestre (minoracion130). Lo que no cabe en un trimestre (casilla 14 negativa)
// se resta en los siguientes (casilla 15). Para la casilla 05 de los siguientes cuenta el 07 de los presentados.
// Bienes de inversión (lib/amortizaciones.js): su IVA se deduce entero al comprarlos, pero como gasto solo cuenta la
// amortización de cada trimestre (regimen: 'autonomo' o 'sociedad', para la tabla de coeficientes).
export function resumenAnual(facturas, gastos, anio, pagos = {}, actividades = Object.keys(ACTIVIDADES), { ivaCoste = false, minoracion = 0, regimen = 'autonomo', hasta = `${anio}-12-31`, iva: ajustesIva = {} } = {}) {
  const delAnio = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && x.fecha <= hasta);
  // Sin 303, el IVA (y la compensación del REAGP) es ingreso o coste; con él, no.
  const irpf = (x) => (ivaCoste ? { ...x, base: r2(x.base + x.iva + (x.compensacion || 0)) } : x);
  // Gastos: con 303, el IVA que no se deduce (lib/ivaDeducible.js) es gasto; iva es lo deducible neto de lo autoliquidado.
  // Un autónomo solo resta en el IRPF la parte afecta a la actividad (afectoPct, costeAfecto); una sociedad, todo.
  const afecta = regimen !== 'sociedad';
  const deGasto = (x) => {
    const i = importes(x);
    if (ivaCoste) return afecta ? { ...irpf(i), base: costeAfecto(x, { ivaCoste: true }) } : irpf(i);
    const v = ivaGasto(x);
    return { ...i, base: afecta ? costeAfecto(x) : r2(i.base + v.noDeducible), iva: r2(v.deducible - v.auto) };
  };
  const corriente = (x) => { const i = deGasto(x); return x.inversion && x.base > 0 ? { ...i, base: 0 } : i; };
  // Las rectificativas que corrigen un error de una factura de otro año cuentan en el año de la original (fechaIrpf).
  const F = delAnio(facturas.map((f) => { const d = fechaIrpf(f); return d === f.fecha ? f : { ...f, fecha: d }; }));
  const G = delAnio(gastos);
  const A = amortizacionesAnio(gastos, anio, { regimen, ivaCoste, hasta, irpf: afecta });
  const iva = liquidaciones303(facturas, gastos, anio, hasta, ajustesIva);
  let acIng = 0, acGas = 0, acRet = 0, pagados = 0, negativos = 0;

  const trimestres = [1, 2, 3, 4].map((t) => {
    const f = F.filter((x) => trimestre(x.fecha) === t).map(importes).map(irpf);
    const g = G.filter((x) => trimestre(x.fecha) === t).map(corriente);
    const amortizacion = suma(A.filter((x) => x.t === t), 'cuota');
    // El IVA que la prorrata no deja deducir también es gasto (con la regularización del 4T).
    const prorrata = ivaCoste ? 0 : iva[t - 1].perdidoProrrata;
    const q = { t, ingresos: suma(f, 'base'), ivaRep: suma(f, 'iva'), retenciones: suma(f, 'irpf'), gastos: r2(suma(g, 'base') + amortizacion + prorrata), amortizacion, ivaDed: suma(g, 'iva'), ...(prorrata ? { prorrata } : {}) };
    acIng += q.ingresos; acGas += q.gastos; acRet += q.retenciones;
    q.m303 = iva[t - 1].bruto; // la casilla 46: lo mismo que Impuestos (también con IVA autoliquidado o no deducible)
    q.ivaIngresar = iva[t - 1].ingresar;
    q.ivaCompensado = iva[t - 1].compensado;
    q.ivaPendiente = iva[t - 1].pendiente;
    // Estimación directa simplificada: 5 % de gastos de difícil justificación (máx. 2.000 €/año).
    const previo = acIng - acGas;
    q.difJust = r2(Math.min(0.05 * Math.max(0, previo), 2000));
    q.rendAcum = r2(previo - q.difJust);
    q.ingAcum = r2(acIng);
    q.gasAcum = r2(acGas + q.difJust);
    q.retAcum = r2(acRet);
    q.pagosPrev = r2(pagados);
    q.c07 = r2(0.2 * Math.max(0, q.rendAcum) - q.retAcum - q.pagosPrev);
    q.minoracion = minoracion;
    const c14 = r2(Math.max(0, q.c07) - minoracion);
    q.negPrev = c14 > 0 ? Math.min(c14, negativos) : 0;
    q.m130 = Math.max(0, r2(c14 - q.negPrev));
    q.presentado = pagos[t] !== undefined && pagos[t] !== null;
    // La casilla 15 usa declaraciones anteriores efectivamente presentadas. Una vista previa
    // no genera un crédito nuevo ni consume el ya declarado para los trimestres siguientes.
    if (q.presentado) negativos = r2(negativos - q.negPrev + Math.max(0, -c14));
    pagados += (Number(pagos[t]) || 0) + (q.presentado ? r2(Math.max(0, q.c07) - q.m130) : 0);
    return q;
  });

  const ids = [...new Set([...actividades, ...F.map((x) => x.actividad), ...G.map((x) => x.actividad), ...A.map((x) => x.actividad)])];
  const porActividad = ids.map((a) => {
    const ingresos = suma(F.filter((x) => x.actividad === a).map((x) => irpf(importes(x))), 'base');
    const gastosA = r2(suma(G.filter((x) => x.actividad === a).map(corriente), 'base') + suma(A.filter((x) => x.actividad === a), 'cuota'));
    return { actividad: a, ingresos, gastos: gastosA, rendimiento: r2(ingresos - gastosA) };
  });

  const pendiente = r2(delAnio(facturas).reduce((s, f) => s + pendienteDe(f), 0));
  return { trimestres, porActividad, pendiente };
}

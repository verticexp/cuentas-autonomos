// Cálculos fiscales. Sin dependencias, para poder probarlos.
import { parseImporte } from './importe.js';
import { amortizacionesAnio } from './amortizaciones.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { baseDeducible, nifUE, origenGasto, partirIva } from './ivaDeducible.js';

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
    ...(/^[a-f0-9]{12}$/.test(x.producto || '') ? { producto: x.producto } : {}),
    ...(ID_DOC.test(x.albaran || '') ? { albaran: x.albaran } : {}),
  })).filter((x) => x.concepto || x.precio);
  return l.length ? l : null;
}

// Columnas que hacen falta al imprimir una factura con líneas (las antiguas se imprimen como antes).
export const columnasLineas = (x) => ({ dto: x.lineas.some((l) => l.dto), iva: desglose(x).length > 1 });

// Base e IVA por tipo de IVA, de mayor a menor base.
export function desglose(x) {
  if (!x.lineas?.length) return [{ pct: x.ivaPct, base: x.base, iva: r2((x.base * x.ivaPct) / 100) }];
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
  return out;
}

export function importes(x) {
  const iva = r2(desglose(x).reduce((s, d) => s + d.iva, 0));
  const irpf = r2((x.base * (x.alquiler ? 19 : x.irpfPct || 0)) / 100);
  return { base: x.base, iva, irpf, total: r2(x.base + iva - irpf) };
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

// Plazos de 303 y 130: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→30 ene del año siguiente; si ese día cae en sábado
// o domingo, el plazo acaba el lunes siguiente (no tiene en cuenta festivos).
export const habil = (f) => ({ 6: masDias(f, 2), 0: masDias(f, 1) })[new Date(`${f}T12:00:00Z`).getUTCDay()] || f;
// diaEnero: el último día del plazo del 4T (30 en 303, 130 y 349; 20 en 111, 115 y 123).
export const limiteTrimestre = (t, anio, diaEnero = 30) => habil(t === 4 ? `${anio + 1}-01-${diaEnero}` : `${anio}-${['04', '07', '10'][t - 1]}-20`);
export function proximoPlazo(hoy) {
  const y = Number(hoy.slice(0, 4));
  const plazos = [[4, y - 1], [1, y], [2, y], [3, y], [4, y]].map(([t, anio]) => ({ t, anio, fecha: limiteTrimestre(t, anio) }));
  const p = plazos.find((x) => x.fecha >= hoy);
  return { ...p, dias: diasEntre(hoy, p.fecha) };
}

// Situación de un trimestre del 303/130 según la fecha (sin contar si está marcado como presentado):
// «curso» mientras no ha terminado, «listo» del día siguiente al cierre hasta el límite (incluido) y «fuera» después.
const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];
export function situacionTrimestre(t, anio, hoy) {
  const limite = limiteTrimestre(t, anio);
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

// Casillas del modelo 303 (régimen general) de un trimestre.
export function casillas303(facturas, gastos, anio, t) {
  const delT = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t);
  // Rectificativas (y facturas en negativo): casillas 14 y 15, modificación de bases y cuotas (art. 80 LIVA), con su signo,
  // en vez de restarse dentro de las 01-09 (que no admiten negativos en el fichero de la Sede). Lo exento sigue aparte.
  const esMod = (f) => Boolean(f.rectifica) || importes(f).base < 0;
  const F = delT(facturas).flatMap((f) => (esMod(f) ? desglose(f).filter((x) => !x.pct) : desglose(f)));
  const MOD = delT(facturas).filter(esMod).flatMap(desglose).filter((x) => x.pct);
  const deUE = delT(gastos).filter((g) => origenGasto(g) === 'ue'), deFuera = delT(gastos).filter((g) => origenGasto(g) === 'fuera');
  // Lo autoliquidado se devenga entero (10-13) y se deduce solo la parte deducible del gasto (lib/ivaDeducible.js).
  const UEg = autoliquidado(deUE), FUERA = autoliquidado(deFuera);
  const UEded = deUE.filter((g) => !bienInversionIva(g)).map(deducibleDe), UEinv = deUE.filter(bienInversionIva).map(deducibleDe);
  // Lo de fuera de la UE se deduce con el resto del IVA soportado (28 y 29); lo de la UE, en las 36 y 37.
  // Los bienes de inversión van aparte (30 y 31); el resto del IVA soportado, en las 28 y 29.
  const esBien = bienInversionIva;
  const G = [...delT(gastos).filter((g) => g.ivaPct > 0 && !esBien(g)), ...deFuera].map(deducibleDe);
  const INV = delT(gastos).filter((g) => g.ivaPct > 0 && esBien(g)).map(deducibleDe);
  const tipo = (p) => F.filter((x) => x.pct === p);
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
    sinIva: sum(tipo(0), 'base'),
    otros, cuotaOtros: r2(otros.reduce((s, x) => s + x.iva, 0)), baseOtros: r2(otros.reduce((s, x) => s + x.base, 0)),
  };
  // Información adicional (casillas de 2026), con la parte sin IVA de cada factura según su operación (lib/operaciones.js):
  // 59 entregas y servicios intracomunitarios, 60 exportaciones, 120 no sujetas por localización, 122 inversión del sujeto pasivo.
  for (const k of ['59', '60', '120', '122']) c[k] = 0;
  for (const f of delT(facturas)) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    // La 59 recoge exactamente lo que va al 349 (lib/modelos.js): sin NIF-IVA de la UE no es intracomunitaria y se queda
    // fuera (sale en el aviso de «facturas sin IVA sin motivo claro») en vez de descuadrar los dos modelos.
    const casilla = op?.ue && !nifUE(f.cliente?.nif) ? null : op?.casilla303;
    if (casilla) c[casilla] = r2(c[casilla] + desglose(f).filter((x) => x.pct === 0).reduce((s, x) => s + x.base, 0));
  }
  c['14'] = sum(MOD, 'base'); c['15'] = sum(MOD, 'iva');
  // Un tipo que aun así quedara en negativo (líneas de descuento mayores que la venta) también es una modificación.
  for (const [b, q] of [['01', '03'], ['04', '06'], ['07', '09']]) if (c[b] < 0) { c['14'] = r2(c['14'] + c[b]); c['15'] = r2(c['15'] + c[q]); c[b] = 0; c[q] = 0; }
  c['27'] = r2(c['03'] + c['06'] + c['09'] + c.cuotaOtros + c['11'] + c['13'] + c['15']);
  c['45'] = r2(c['29'] + c['31'] + c['37'] + c['39']);
  c['46'] = r2(c['27'] - c['45']);
  return c;
}

const suma = (lista, k) => r2(lista.reduce((s, x) => s + x[k], 0));

// Compensación automática del IVA con el histórico registrado. El resultado bruto del trimestre
// sigue siendo m303; a ingresar solo queda lo que no cubren cuotas negativas anteriores.
export function liquidaciones303(facturas, gastos, anio, hasta = `${anio}-12-31`) {
  const fechas = [...facturas, ...gastos].map((x) => Number(x.fecha.slice(0, 4))).filter(Number.isFinite);
  const primero = fechas.reduce((min, y) => Math.min(min, y), anio);
  let pendiente = 0;
  const out = [];
  const F = facturas.filter((f) => f.fecha <= hasta), G = gastos.filter((g) => g.fecha <= hasta);
  for (let y = primero; y <= anio; y++) for (let t = 1; t <= 4; t++) {
    const bruto = casillas303(F, G, y, t)['46'];
    const anterior = pendiente;
    const compensado = bruto > 0 ? Math.min(bruto, pendiente) : 0;
    const ingresar = Math.max(0, r2(bruto - compensado));
    pendiente = r2(pendiente - compensado + Math.max(0, -bruto));
    if (y === anio) out.push({ t, bruto, anterior, compensado, ingresar, pendiente });
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
export function resumenAnual(facturas, gastos, anio, pagos = {}, actividades = Object.keys(ACTIVIDADES), { ivaCoste = false, minoracion = 0, regimen = 'autonomo', hasta = `${anio}-12-31` } = {}) {
  const delAnio = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && x.fecha <= hasta);
  const irpf = (x) => (ivaCoste ? { ...x, base: r2(x.base + x.iva) } : x);
  // Gastos: con 303, el IVA que no se deduce (lib/ivaDeducible.js) es gasto; iva es lo deducible neto de lo autoliquidado.
  const deGasto = (x) => {
    const i = importes(x);
    if (ivaCoste) return irpf(i);
    const v = ivaGasto(x);
    return { ...i, base: r2(i.base + v.noDeducible), iva: r2(v.deducible - v.auto) };
  };
  const corriente = (x) => { const i = deGasto(x); return x.inversion && x.base > 0 ? { ...i, base: 0 } : i; };
  const F = delAnio(facturas);
  const G = delAnio(gastos);
  const A = amortizacionesAnio(gastos, anio, { regimen, ivaCoste, hasta });
  const iva = liquidaciones303(facturas, gastos, anio, hasta);
  let acIng = 0, acGas = 0, acRet = 0, pagados = 0, negativos = 0;

  const trimestres = [1, 2, 3, 4].map((t) => {
    const f = F.filter((x) => trimestre(x.fecha) === t).map(importes).map(irpf);
    const g = G.filter((x) => trimestre(x.fecha) === t).map(corriente);
    const amortizacion = suma(A.filter((x) => x.t === t), 'cuota');
    const q = { t, ingresos: suma(f, 'base'), ivaRep: suma(f, 'iva'), retenciones: suma(f, 'irpf'), gastos: r2(suma(g, 'base') + amortizacion), amortizacion, ivaDed: suma(g, 'iva') };
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

  const pendiente = r2(F.reduce((s, f) => s + pendienteDe(f), 0));
  return { trimestres, porActividad, pendiente };
}

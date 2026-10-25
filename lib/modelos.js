// Modelos 115, 180, 349, 390, 190, 202, borrador del Impuesto sobre Sociedades (200) y de la renta (100). Orientativos: los confirma la gestoría.
import { tipoISForal } from './territorios.js';
import { categoriaDe, noDeducibleIS } from './categorias.js';
import { casillas303, costeGasto, desglose, fechaIva, habil, importes, nifUE, origenGasto, r2, resumenAnual, trimestre } from './calculos.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { calculoNomina, nominasPagadasEn } from './nominas.js';
import { amortizacionesAnio } from './amortizaciones.js';
import { claveProveedor } from './proveedores.js';
import { valorInventario } from './inventario.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));
const delT = (l, anio, t) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && (!t || trimestre(x.fecha) === t));
export const RET_ALQUILER = 19;
// Sin fecha de pago explícita, los gastos históricos se consideran pagados al emitirlos.
const pagadosEn = (gastos, anio, t) => delT(gastos.filter((g) => !g.pendiente).map((g) => ({ ...g, fecha: g.pagado || g.fecha })), anio, t);

// 115 (trimestral) y 180 (anual): retenciones del alquiler del local. Los gastos marcados «alquiler».
export function modelo115(gastos, anio, t) {
  const A = pagadosEn(gastos.filter((g) => g.alquiler), anio, t);
  const base = suma(A, (g) => g.base);
  return { perceptores: new Set(A.map((g) => claveProveedor(g) || 'sin nombre')).size, base, retenciones: suma(A, (g) => r2((g.base * RET_ALQUILER) / 100)) };
}
export function modelo180(gastos, anio) {
  const m = new Map();
  for (const g of pagadosEn(gastos.filter((x) => x.alquiler), anio)) {
    const k = claveProveedor(g) || 'sin nombre';
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', base: 0, retenciones: 0 };
    p.base = r2(p.base + g.base);
    p.retenciones = r2(p.retenciones + r2((g.base * RET_ALQUILER) / 100));
    m.set(k, p);
  }
  const arrendadores = [...m.values()];
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
  // Solo la parte sin IVA de las operaciones intracomunitarias (lib/operaciones.js): con IVA español no es intracomunitaria.
  // Por la fecha de devengo, como la casilla 59 del 303 (fechaIva de lib/calculos.js), para que los dos cuadren.
  for (const f of delT(facturas.map((x) => (fechaIva(x) === x.fecha ? x : { ...x, fecha: fechaIva(x) })), anio, t)) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    const nif = nifUE(f.cliente?.nif);
    // Irlanda del Norte (XI) solo cuenta como UE para bienes: sus servicios no van al 349.
    if (op?.clave349 && nif && !(nif.startsWith('XI') && op.clave349 === 'S')) sumar(nif, f.cliente.nombre, op.clave349, desglose(f).filter((x) => x.pct === 0).reduce((s, x) => s + x.base, 0));
  }
  // Compras a la UE: A las de bienes (un bien de inversión, mercaderías o con stock) e I las de servicios.
  for (const g of delT(gastos, anio, t)) {
    const nif = nifUE(g.proveedorNif);
    const bienes = Boolean(g.inversion || g.stock?.length) || ['600', '601', '602'].includes(categoriaDe(g));
    if (nif && origenGasto(g) === 'ue' && (bienes || !nif.startsWith('XI'))) sumar(nif, g.proveedor || 'Sin nombre', bienes ? 'A' : 'I', g.base);
  }
  const operadores = [...m.values()].sort((a, b) => b.base - a.base);
  return { operadores, total: suma(operadores, (c) => c.base) };
}

// 390: resumen anual del IVA (suma de los cuatro 303).
export function modelo390(facturas, gastos, anio, iva = {}) {
  const q = [1, 2, 3, 4].map((t) => casillas303(facturas, gastos, anio, t, iva));
  const s = (k) => suma(q, (c) => c[k]);
  const c = { base4: s('01'), cuota4: s('03'), base10: s('04'), cuota10: s('06'), base21: s('07'), cuota21: s('09'), baseUE: s('10'), cuotaUE: s('11'), baseFuera: s('12'), cuotaFuera: s('13'), baseRect: s('14'), cuotaRect: s('15'), otros: [...new Map(q.flatMap((x) => x.otros).map((o) => [o.pct, o])).keys()].sort((a, b) => a - b).map((pct) => ({ pct, base: suma(q.flatMap((x) => x.otros).filter((o) => o.pct === pct), (o) => o.base), iva: suma(q.flatMap((x) => x.otros).filter((o) => o.pct === pct), (o) => o.iva) })), recargo: s('recargo'), devengado: s('27'), baseDed: r2(s('28') + s('30') + s('36')), baseRectDed: s('40'), cuotaRectDed: s('41'), regProrrata: s('44'), deducible: s('45'), sinIva: s('sinIva') };
  c.resultado = r2(c.devengado - c.deducible);
  c.volumen = suma(delT(facturas, anio), (f) => f.base);
  c.trimestres = q.map((x) => x['46']);
  return c;
}

// Retenciones a profesionales (gastos con irpfPct, por ejemplo la gestoría): casillas 07 a 09 del 111 y clave G del 190.
export function retencionesProfesionales(gastos, anio, t) {
  const R = pagadosEn(gastos.filter((g) => !g.alquiler && Number(g.irpfPct) > 0), anio, t);
  return { perceptores: new Set(R.map((g) => claveProveedor(g) || 'sin nombre')).size, base: suma(R, (g) => g.base), retenciones: suma(R, (g) => importes(g).irpf) };
}

// 190: resumen anual de retenciones de los trabajadores (clave A), de los profesionales (clave G) y de los empresarios en
// módulos y agricultores con el 1 o el 2 % (clave H), por perceptor.
export function modelo190(nominas, empleados, anio, gastos = []) {
  const m = new Map();
  for (const n of nominasPagadasEn(nominas, anio)) {
    const e = empleados.find((x) => x.id === n.empleado) || {};
    const c = calculoNomina(n);
    const p = m.get(n.empleado) || { nombre: e.nombre || n.empleadoNombre, nif: e.nif || '', clave: 'A', percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + c.bruto); p.retenciones = r2(p.retenciones + c.irpf);
    m.set(n.empleado, p);
  }
  for (const g of pagadosEn(gastos.filter((x) => !x.alquiler && Number(x.irpfPct) > 0), anio)) {
    const clave = Number(g.irpfPct) <= 2 ? 'H' : 'G';
    const k = `prof:${clave}:${claveProveedor(g) || 'sin nombre'}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', clave, percepciones: 0, retenciones: 0 };
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
    // Las ventas a consumidores finales (cierres de caja, tiques) no se declaran.
    if (f.simplificada || Number(f.irpfPct) > 0 || (nifUE(nif) && !i.iva) || (!i.iva && nif && !NIF_ES.test(nif))) continue;
    sumar('B', nif.replace(/^ES/, ''), f.cliente?.nombre, f.fecha, r2(i.base + i.iva + (i.recargo || 0)));
  }
  for (const g of delT(gastos, anio)) {
    // Las importaciones tampoco (art. 33.2 RGAT: van en el DUA).
    if (g.alquiler || g.importacion || Number(g.irpfPct) > 0 || origenGasto(g) || !String(g.proveedor || '').trim()) continue;
    const i = importes(g);
    sumar('A', nifDe(g.proveedorNif).replace(/^ES/, ''), g.proveedor, g.fecha, r2(i.base + i.iva));
  }
  const declarados = [...m.values()].filter((o) => Math.abs(o.total) > LIMITE_347).sort((a, b) => b.total - a.total);
  return { ventas: declarados.filter((o) => o.clave === 'B'), compras: declarados.filter((o) => o.clave === 'A'), sinNif: declarados.filter((o) => !o.nif) };
}

// 202 (sociedades), modalidad del art. 40.2 de la Ley del Impuesto sobre Sociedades: el 18 % de la «cuota del ejercicio a
// ingresar o devolver» del último Impuesto sobre Sociedades cuyo plazo ya venció, es decir, la cuota íntegra menos
// deducciones, bonificaciones y retenciones e ingresos a cuenta, sin restar los pagos fraccionados (casilla «Resultado» del
// 200; Manual de Sociedades 2025, págs. 821 y 827-829). En abril, el de hace dos años (el del año pasado aún no se ha
// presentado); en octubre y diciembre, el del año pasado. Sin cuota (o a cero), no se presenta.
export function modelo202(cuotaIS = {}, anio) {
  return [[1, 'abril', anio - 2], [2, 'octubre', anio - 1], [3, 'diciembre', anio - 1]].map(([p, mes, de]) => {
    const cuota = cuotaIS[de] ?? null;
    return { p, mes, de, cuota, pago: cuota > 0 ? r2(cuota * 0.18) : 0, fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) };
  });
}

// Borrador del Impuesto sobre Sociedades (modelo 200), solo con lo que hay en la app: resultado (ingresos − gastos), más
// los gastos no deducibles (art. 15 LIS), menos la reserva de capitalización (art. 25) y las bases negativas de años
// anteriores (art. 26). El tipo depende de la facturación del año anterior (Ley 27/2014, art. 29, con la Ley 7/2024):
// menos de 1 M (microempresa, dos tramos: los primeros 50.000 € y el resto), menos de 10 M (reducida dimensión) o general.
// Manual de Sociedades 2025, págs. 10-12: micro 21/22 % en 2025, 19/21 % en 2026 y 17/20 % desde 2027; reducida dimensión
// 24 % en 2025, 23 % en 2026, 22 % en 2027, 21 % en 2028 y 20 % desde 2029. Antes de 2025: micro 23 % en 2023 y 2024 (Ley
// 38/2022) y 25 % antes (no había tipo de micro); reducida dimensión, 25 %.
const TIPO_MICRO = { 2025: [21, 22], 2026: [19, 21] };
const TIPO_REDUCIDA = { 2025: 24, 2026: 23, 2027: 22, 2028: 21 };
export function tiposIS(anio, tamano) {
  if (tamano === 'micro') return anio < 2023 ? [25, 25] : anio < 2025 ? [23, 23] : TIPO_MICRO[anio] || [17, 20];
  if (tamano === 'reducida') { const t = anio < 2025 ? 25 : TIPO_REDUCIDA[anio] || 20; return [t, t]; }
  return [25, 25];
}
// Resultado de un año (ingresos − gastos, con amortizaciones, existencias y asientos manuales) y los gastos no deducibles
// (art. 15 LIS, lib/categorias.js noDeducibleIS): se suman al resultado como ajuste positivo.
function baseSociedades(facturas, gastos, anio, { ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31` } = {}) {
  const neto = (x) => { const i = importes(x); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const F = delT(facturas, anio).filter((f) => f.fecha <= hasta);
  const ingresos = suma(F, neto);
  // Los bienes de inversión no cuentan enteros: solo su amortización del año.
  const amortizacion = suma(amortizacionesAnio(gastos, anio, { regimen: 'sociedad', ivaCoste, hasta }), (x) => x.cuota);
  const datosStock = { productos, facturas, gastos, ajustes, albaranes };
  const variacionExistencias = productos.length ? r2(valorInventario(datosStock, hasta) - valorInventario(datosStock, `${anio - 1}-12-31`)) : 0;
  const delAnio = delT(gastos, anio).filter((g) => g.fecha <= hasta && !(g.inversion && g.base > 0));
  const gastosAnio = r2(suma(delAnio, (g) => costeGasto(g, { ivaCoste })) + amortizacion - variacionExistencias);
  const ajustesContables = r2(manuales.filter((a) => !a.apertura && a.fecha.startsWith(`${anio}-`) && a.fecha <= hasta).reduce((s, a) => s + a.lineas.filter((l) => /^[67]/.test(l.cuenta) && !/^(630|633|638)/.test(l.cuenta)).reduce((v, l) => v + Number(l.haber || 0) - Number(l.debe || 0), 0), 0));
  const noDeducibles = delAnio.map((g) => ({ g, nd: noDeducibleIS(g) })).filter((x) => x.nd).map(({ g, nd }) => ({ id: g.id, fecha: g.fecha, concepto: g.concepto || g.proveedor || 'Sin concepto', importe: costeGasto(g, { ivaCoste }), ...nd }));
  const resultado = r2(ingresos - gastosAnio + ajustesContables);
  const ajusteNoDeducible = suma(noDeducibles, (x) => x.importe);
  return { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, resultado, noDeducibles, ajusteNoDeducible, basePrevia: r2(resultado + ajusteNoDeducible) };
}

// Cifra de negocios (INCN) del año anterior, que decide el tipo y los límites. Sin datos del año anterior en la app, la de
// este; con datos, la del año anterior aunque fuera cero (art. 29 LIS). Para la reducida dimensión, si el año anterior fue
// el de la constitución y duró menos de un año, se eleva al año: INCN / días × 365 (art. 101.1 LIS; Manual de Sociedades
// 2025, pág. 621). Para la microempresa (art. 29.1: «del período impositivo inmediato anterior») el manual no prevé
// elevarla (págs. 10-11 y 85): no se eleva. Los 6 M del 202 y los 20/60 M de las bases negativas tampoco («los 12 meses
// anteriores»).
function cifraNegocios(facturas, gastos, anio, constitucion = '') {
  const conAnterior = [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${anio - 1}-`));
  const incn = suma(delT(facturas, conAnterior ? anio - 1 : anio), (f) => f.base);
  let incnAnual = incn;
  if (conAnterior && /^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') && Number(constitucion.slice(0, 4)) === anio - 1) {
    const dias = Math.round((Date.parse(`${anio - 1}-12-31T12:00:00Z`) - Date.parse(`${constitucion}T12:00:00Z`)) / 864e5) + 1;
    if (dias > 0 && dias < 365) incnAnual = r2((incn / dias) * 365);
  }
  return { incn, incnAnual, conAnterior };
}

// Reserva de capitalización (art. 25 LIS; Manual de Sociedades 2025, págs. 351-356): desde 2025, el 20 % del incremento de
// los fondos propios del año, sin pasar del 20 % de la base previa (el 25 % con una cifra de negocios de menos de 1 M en los
// 12 meses anteriores); en 2024, 15 % con el límite del 10 %; antes, 10 % y 10 %. El incremento lo apunta la empresa
// (fondosPropios[año]): sale de los fondos propios al cierre sin el resultado del año menos los del inicio sin el del
// anterior, y sin las aportaciones de los socios ni las reservas legales o estatutarias, algo que los asientos de Fisquo
// no distinguen. No mira el porcentaje mayor por aumentar la plantilla (23/26,5/30 %) ni aplica lo pendiente de años
// anteriores (se puede aplicar en los 2 años siguientes): devuelve lo que queda sin aplicar.
function reservaCapitalizacion(anio, basePrevia, incremento, incn) {
  const inc = Math.max(0, Number(incremento) || 0);
  if (!inc || basePrevia <= 0) return { incremento: inc, aplicada: 0, pendiente: inc ? r2((inc * (anio >= 2025 ? 20 : anio === 2024 ? 15 : 10)) / 100) : 0 };
  const [pct, lim] = anio >= 2025 ? [20, incn < 1e6 ? 25 : 20] : anio === 2024 ? [15, 10] : [10, 10];
  const derecho = r2((inc * pct) / 100);
  const aplicada = Math.min(derecho, r2((basePrevia * lim) / 100));
  return { incremento: inc, pct, limitePct: lim, derecho, aplicada, pendiente: r2(derecho - aplicada) };
}

// Las liquidaciones de los años de la app hasta `anio`, en orden, para arrastrar las bases imponibles negativas (art. 26
// LIS; Manual de Sociedades 2025, págs. 363-369): cada año con base previa positiva compensa las pendientes, de la más
// antigua a la más reciente, hasta el 70 % de la base previa a la reserva de capitalización y a la compensación (el 50 % con
// 20 M o más de cifra de negocios y el 25 % con 60 M o más) y, en todo caso, hasta 1 M; sin límite del 70 % en los 3
// primeros años con base previa positiva de una entidad de nueva creación (art. 26.3). Nunca deja la base en negativo.
// Las pendientes: las pérdidas de los años con datos en la app y las que apunta la empresa en binsPrevias ({ año: lo que
// quedaba por compensar de ese año }), que mandan sobre lo que sale de la app. Nada de antes del año de constitución.
// comun: false en Navarra y el País Vasco (sus normas forales tienen otros límites): sin reserva ni compensación.
// Solo se calculan los años con datos de los cinco últimos (las facturas que carga Impuestos, lib/datosImpuestos.js): los
// de antes, con solo los gastos, saldrían en pérdidas; sus bases pendientes las apunta la empresa.
const ANIOS_DATOS = 5;
function liquidacionesIS(facturas, gastos, anio, { op = {}, hasta = `${anio}-12-31`, binsPrevias = {}, fondosPropios = {}, constitucion = '', cuotaIS = {}, comun = true } = {}) {
  const hay = (y) => y > anio - ANIOS_DATOS && [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`));
  // Una constitución posterior al año no cuenta.
  const c = (Number(/^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') ? constitucion.slice(0, 4) : 0)) || 0;
  const c0 = c && c <= anio ? c : 0;
  const tecleadas = new Map(Object.entries(binsPrevias || {}).map(([y, v]) => [Number(y), Number(v)]).filter(([y, v]) => Number.isInteger(y) && y < anio && (!c0 || y >= c0) && Number.isFinite(v) && v >= 0));
  const anios = [...facturas, ...gastos].map((x) => Number(String(x.fecha || '').slice(0, 4))).filter((y) => y > anio - ANIOS_DATOS && y < anio);
  const desde = c0 || Math.min(anio, ...anios, ...tecleadas.keys());
  const pendientes = new Map(); // año de origen → lo que queda por compensar
  const res = {};
  // Art. 26.3: años con base previa positiva desde la constitución; sin datos ni cuota apuntada no se sabe (se aplica el 70 %).
  let positivas = 0, seSabe = Boolean(c0);
  for (let y = desde; y <= anio; y++) {
    if (y !== anio && !hay(y)) {
      if (tecleadas.has(y)) pendientes.set(y, tecleadas.get(y));
      if (Number(cuotaIS?.[y]) > 0) positivas++; else if (y !== c0) seSabe = false;
      continue;
    }
    const b = baseSociedades(facturas, gastos, y, { ...op, hasta: y === anio ? hasta : `${y}-12-31` });
    const { incn } = cifraNegocios(facturas, gastos, y, constitucion);
    const pendientesInicio = [...pendientes].filter(([, v]) => v > 0).map(([de, importe]) => ({ de, importe }));
    const reserva = comun ? reservaCapitalizacion(y, b.basePrevia, fondosPropios?.[y], incn) : { incremento: 0, aplicada: 0, pendiente: 0 };
    let compensacion = 0, limiteBIN = 0;
    const sinLimiteBIN = comun && seSabe && positivas < 3;
    if (comun && b.basePrevia > 0) {
      limiteBIN = sinLimiteBIN ? Infinity : Math.max(1e6, r2((b.basePrevia * (incn >= 6e7 ? 25 : incn >= 2e7 ? 50 : 70)) / 100));
      let queda = Math.min(limiteBIN, r2(b.basePrevia - reserva.aplicada));
      for (const [de, v] of pendientes) {
        const usa = r2(Math.min(v, queda));
        if (usa <= 0) continue;
        pendientes.set(de, r2(v - usa));
        compensacion = r2(compensacion + usa);
        queda = r2(queda - usa);
      }
    }
    if (b.basePrevia > 0) positivas++;
    const perdida = Math.max(0, -b.basePrevia);
    if (y !== anio && tecleadas.has(y)) pendientes.set(y, tecleadas.get(y));
    else if (perdida > 0 && comun) pendientes.set(y, perdida);
    res[y] = { ...b, incn, reserva, compensacion, limiteBIN, sinLimiteBIN, pendientesInicio, base: Math.max(0, r2(b.basePrevia - reserva.aplicada - compensacion)), perdida };
  }
  res[anio].pendientesFin = [...pendientes].filter(([, v]) => v > 0).map(([de, importe]) => ({ de, importe }));
  return res;
}

// Entidades de nueva creación (art. 29.1 LIS): 15 % en el primer periodo impositivo con base positiva y en el siguiente,
// salvo que le toque un tipo menor. Cada año desde la constitución cuenta como «con beneficio» si la cuota del IS
// apuntada en Impuestos (cuotaIS) es positiva o, con datos en Fisquo, si su base sale positiva. El año de constitución
// sin datos cuenta como sin beneficio; otro año sin datos ni cuota apuntada no se sabe y se queda en el tipo normal.
// Devuelve { aplica, primero } (primero: el primer año con beneficio) o { aplica: false, falta } (el año que no se sabe).
// No mira las excepciones (grupo de sociedades, actividad que ya ejercía otra persona vinculada, sociedad patrimonial).
export const TIPO_NUEVA_CREACION = 15;
export function nuevaCreacion(anio, { constitucion, cuotaIS = {}, base = 0, baseDe = () => 0, hayDatos = () => false } = {}) {
  const c = Number(/^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') ? constitucion.slice(0, 4) : 0);
  if (!c || anio < c) return null;
  for (let y = c; y < anio; y++) {
    const cuota = cuotaIS?.[y];
    const conCuota = cuota !== undefined && cuota !== null;
    let positiva;
    if (hayDatos(y)) positiva = Number(cuota) > 0 || baseDe(y) > 0;
    else if (conCuota) positiva = Number(cuota) > 0;
    else if (y === c) positiva = false;
    else return { aplica: false, falta: y };
    if (positiva) return { aplica: y === anio - 1, primero: y };
  }
  return { aplica: base > 0, primero: base > 0 ? anio : null };
}

// territorio: en Navarra y el País Vasco (lib/territorios.js), el tipo foral según la cifra de negocios, sin tramos ni el
// 15 % de las entidades de nueva creación (que es de la ley estatal), y sin la reserva de capitalización ni la compensación
// de bases negativas de la ley estatal (cada norma foral tiene las suyas).
// binsPrevias: { año: base negativa pendiente } de antes de Fisquo (o la real de un año que no está entero en Fisquo);
// fondosPropios: { año: incremento de los fondos propios } para la reserva de capitalización.
export function borradorSociedades(facturas, gastos, anio, { pagos202 = {}, ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31`, constitucion = '', cuotaIS = {}, territorio, binsPrevias = {}, fondosPropios = {} } = {}) {
  const op = { ivaCoste, productos, ajustes, albaranes, manuales };
  const { incn, incnAnual, conAnterior } = cifraNegocios(facturas, gastos, anio, constitucion);
  const tamano = incn < 1e6 ? 'micro' : incnAnual < 1e7 ? 'reducida' : 'general';
  const foral = tipoISForal(territorio, incn);
  const L = liquidacionesIS(facturas, gastos, anio, { op, hasta, binsPrevias, fondosPropios, constitucion, cuotaIS, comun: foral === null });
  const { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, resultado, noDeducibles, ajusteNoDeducible, basePrevia, reserva, compensacion, limiteBIN, sinLimiteBIN, pendientesInicio, pendientesFin, base, perdida } = L[anio];
  const nueva = foral !== null ? null : nuevaCreacion(anio, {
    constitucion, cuotaIS, base,
    hayDatos: (y) => [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`)),
    baseDe: (y) => L[y]?.base ?? 0,
  });
  // El 15 % sustituye al tipo del tramo solo donde es menor.
  const [t1, t2] = foral !== null ? [foral, foral] : tiposIS(anio, tamano).map((t) => (nueva?.aplica ? Math.min(t, TIPO_NUEVA_CREACION) : t));
  const tramos = t1 === t2 ? [{ base, pct: t1 }] : [{ base: Math.min(base, 50000), pct: t1 }, { base: r2(Math.max(0, base - 50000)), pct: t2 }];
  for (const x of tramos) x.cuota = r2((x.base * x.pct) / 100);
  const cuota = suma(tramos, (x) => x.cuota);
  const pagos = r2(Object.values(pagos202[anio] || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  const retenciones = suma(F, (f) => importes(f).irpf);
  return {
    ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, resultadoContable: resultado, noDeducibles, ajusteNoDeducible, basePrevia,
    reserva, compensacion, limiteBIN, sinLimiteBIN, binsPendientes: pendientesInicio, binsQuedan: pendientesFin,
    base, perdida, incn, incnAnual, conAnterior, tamano, tipos: [t1, t2], nuevaCreacion: nueva, ...(foral !== null ? { foral: territorio } : {}),
    // Con más de 6 M de cifra de negocios, el 202 es obligatoriamente el del art. 40.3 (modelo202Art403).
    obligado403: foral === null && incn > 6e6,
    tramos: tramos.filter((x) => x.base > 0), cuota, pagos, retenciones,
    // «Cuota del ejercicio a ingresar o devolver» (sin los pagos del 202): la base del 202 del año siguiente (art. 40.2).
    cuotaEjercicio: r2(cuota - retenciones),
    resultado: r2(cuota - pagos - retenciones), tipoMedio: base ? r2((cuota / base) * 100) : 0,
  };
}

// 202, modalidad del art. 40.3 LIS (obligatoria con más de 6 M de cifra de negocios en los 12 meses anteriores; Manual de
// Sociedades 2025, págs. 821-824 y 830-843): sobre la base imponible de los 3, 9 y 11 primeros meses del año (casilla 16:
// base previa menos las bases negativas compensadas, sin la reserva de capitalización del año), los 5/7 del tipo del año
// redondeados por defecto (con 10 M o más, los 19/20 redondeados por exceso), menos las retenciones del periodo (casilla
// 28) y los pagos fraccionados anteriores del año (casilla 30). Con 10 M o más, nunca menos del 23 % del resultado
// contable del periodo menos esos pagos (casilla 33, DA 14.ª LIS). La microempresa (dos tipos) parte la base en los
// primeros 50.000 € y el resto, como en el 200. opciones: las de borradorSociedades.
export function modelo202Art403(facturas, gastos, anio, opciones = {}) {
  const is = borradorSociedades(facturas, gastos, anio, opciones);
  const grande = is.incn >= 1e7;
  const pctPago = (t) => (grande ? Math.ceil((19 * t) / 20) : Math.floor((5 * t) / 7));
  const op = { ivaCoste: opciones.ivaCoste, productos: opciones.productos || [], ajustes: opciones.ajustes || [], albaranes: opciones.albaranes || [], manuales: opciones.manuales || [] };
  const hechos = [];
  for (const [p, mes, fin] of [[1, 'abril', '03-31'], [2, 'octubre', '09-30'], [3, 'diciembre', '11-30']]) {
    const hasta = `${anio}-${fin}`;
    const L = liquidacionesIS(facturas, gastos, anio, { op, hasta, binsPrevias: opciones.binsPrevias, fondosPropios: { ...(opciones.fondosPropios || {}), [anio]: 0 }, constitucion: opciones.constitucion, cuotaIS: opciones.cuotaIS, comun: !is.foral })[anio];
    const [t1, t2] = is.tipos;
    const tramos = (t1 === t2 ? [{ base: L.base, pct: pctPago(t1) }] : [{ base: Math.min(L.base, 50000), pct: pctPago(t1) }, { base: r2(Math.max(0, L.base - 50000)), pct: pctPago(t2) }]).map((x) => ({ ...x, cuota: r2((x.base * x.pct) / 100) }));
    const previo = suma(tramos, (x) => x.cuota);
    const retenciones = suma(L.F, (f) => importes(f).irpf);
    const anteriores = suma(hechos, (x) => Number(opciones.pagos202?.[anio]?.[x.p] ?? x.pago) || 0);
    const resultado = r2(Math.max(0, previo - retenciones) - anteriores);
    const minimo = grande ? Math.max(0, r2(Math.max(0, L.resultado) * 0.23 - anteriores)) : 0;
    // de y cuota, como en modelo202 (lib/presentar.js): el año a cuenta del que se paga y lo que sale antes de restar.
    hechos.push({ p, mes, de: anio, cuota: previo, modalidad: '40.3', basePrevia: L.basePrevia, compensacion: L.compensacion, base: L.base, tramos: tramos.filter((x) => x.base > 0), previo, retenciones, anteriores, resultado, minimo, resultadoContable: L.resultado, pago: Math.max(0, resultado, minimo), fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) });
  }
  return hechos;
}

// Borrador de la renta de un autónomo (estimación directa simplificada), solo con lo que hay en la app.
// Escalas del IRPF de 2025 (Manual práctico de Renta 2025, parte 1, cap. 15, págs. 1120-1131). Para 2026 se usan las de
// 2025 (aún no hay manual de 2026): la tarjeta lo dice («escala de 2025»). Cada tramo: [hasta, % del tramo].
// Escala general estatal (art. 63.1 LIRPF), pág. 1120.
const ESCALA_ESTATAL = [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [300000, 22.5], [Infinity, 24.5]];
// Escala del art. 65 LIRPF: la autonómica de Ceuta y Melilla (DA 32.ª LIRPF), págs. 1130-1131.
const ESCALA_ART65 = [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]];
// Orientativa, sin comunidad elegida: la estatal más la del art. 65 (19/24/30/37/45/47 %).
const ESCALA = [[12450, 19], [20200, 24], [35200, 30], [60000, 37], [300000, 45], [Infinity, 47]];
export function cuotaEscala(base, escala = ESCALA) {
  let cuota = 0, desde = 0;
  for (const [hasta, pct] of escala) {
    if (base <= desde) break;
    cuota += ((Math.min(base, hasta) - desde) * pct) / 100;
    desde = hasta;
  }
  return r2(cuota);
}
export const MINIMO_PERSONAL = 5550;
// Mínimos personales y familiares estatales (arts. 57-59 LIRPF; Manual de Renta 2025, parte 1, págs. 1068-1083): del
// contribuyente (y más de 65 y de 75 años), por descendientes (1.º, 2.º, 3.º y 4.º y siguientes, menores de 25 que conviven,
// y más por los menores de 3) y por ascendientes mayores de 65 (y de 75) que conviven.
const MINIMOS_ESTATALES = { personal: MINIMO_PERSONAL, mas65: 1150, mas75: 1400, descendientes: [2400, 2700, 4000, 4500], menor3: 2800, ascendiente: 1150, ascendiente75: 1400 };
// Las 15 comunidades de régimen común, Ceuta y Melilla: su escala autonómica de 2025 (cap. 15, págs. 1121-1131) y, si la
// tienen, sus mínimos para el gravamen autonómico (cap. 14, págs. 1084-1093; las demás usan los estatales). Navarra y el
// País Vasco tienen su propio impuesto: no están (en territorio foral, la renta no se calcula aquí).
// Illes Balears solo cambia el del contribuyente y los del 2.º y siguientes descendientes y ascendientes (pág. 1086-1087).
export const CCAA = {
  andalucia: { nombre: 'Andalucía', escala: [[13000, 9.5], [21100, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]], // pág. 1121
    minimos: { personal: 5790, mas65: 1200, mas75: 1460, descendientes: [2510, 2820, 4170, 4700], menor3: 2920, ascendiente: 1200, ascendiente75: 1460 } }, // págs. 1084-1085
  aragon: { nombre: 'Aragón', escala: [[13072.5, 9.5], [21210, 12], [36960, 15], [52500, 18.5], [60000, 20.5], [80000, 23], [90000, 24], [130000, 25], [Infinity, 25.5]] }, // pág. 1122
  asturias: { nombre: 'Principado de Asturias', escala: [[12450, 9], [17707.2, 12], [33007.2, 14], [53407.2, 19.2], [70000, 21.5], [90000, 22.5], [175000, 25], [Infinity, 26]], // págs. 1122-1123
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2640, 2970, 4400, 4950], menor3: 3080, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1085-1086
  baleares: { nombre: 'Illes Balears', escala: [[10000, 9], [18000, 11.25], [30000, 14.25], [48000, 17.5], [70000, 19], [90000, 21.75], [120000, 22.75], [175000, 23.75], [Infinity, 24.75]], // pág. 1123
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2400, 2970, 4400, 4950], menor3: 2800, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1086-1087
  canarias: { nombre: 'Canarias', escala: [[13748, 9], [19422, 11.5], [35924, 14], [57566, 18.5], [93268, 23.5], [123745, 25], [Infinity, 26]], // pág. 1124
    minimos: { personal: 5606, mas65: 1162, mas75: 1414, descendientes: [2424, 2727, 4040, 4545], menor3: 2828, ascendiente: 1162, ascendiente75: 1414 } }, // págs. 1087-1088
  cantabria: { nombre: 'Cantabria', escala: [[13000, 8.5], [21000, 11], [35200, 14.5], [60000, 18], [90000, 22.5], [Infinity, 24.5]] }, // págs. 1124-1125
  'castilla-la-mancha': { nombre: 'Castilla-La Mancha', escala: [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]] }, // pág. 1125
  'castilla-y-leon': { nombre: 'Castilla y León', escala: [[12450, 9], [20200, 12], [35200, 14], [53407.2, 18.5], [Infinity, 21.5]] }, // págs. 1125-1126 (mínimos estatales, pág. 1089)
  cataluna: { nombre: 'Cataluña', escala: [[12500, 9.5], [22000, 12.5], [33000, 16], [53000, 19], [90000, 21.5], [120000, 23.5], [175000, 24.5], [Infinity, 25.5]] }, // pág. 1126 (mínimos estatales, pág. 1089)
  extremadura: { nombre: 'Extremadura', escala: [[12450, 8], [20200, 10], [24200, 16], [35200, 17.5], [60000, 21], [80200, 23.5], [99200, 24], [120200, 24.5], [Infinity, 25]] }, // pág. 1127
  galicia: { nombre: 'Galicia', escala: [[12985.35, 9], [21068.6, 11.65], [35200, 14.9], [60000, 18.4], [Infinity, 22.5]], // pág. 1127
    minimos: { personal: 5789, mas65: 1199, mas75: 1460, descendientes: [2503, 2816, 4172, 4694], menor3: 2920, ascendiente: 1199, ascendiente75: 1460 } }, // págs. 1089-1090
  madrid: { nombre: 'Comunidad de Madrid', escala: [[13362.22, 8.5], [19004.63, 10.7], [35425.68, 12.8], [57320.4, 17.4], [Infinity, 20.5]], // pág. 1128
    minimos: { personal: 5956.65, mas65: 1234.26, mas75: 1502.58, descendientes: [2575.85, 2897.83, 4400, 4950], menor3: 3005.16, ascendiente: 1234.26, ascendiente75: 1502.58 } }, // págs. 1090-1091
  murcia: { nombre: 'Región de Murcia', escala: [[12450, 9.5], [20200, 11.2], [34000, 13.3], [60000, 17.9], [Infinity, 22.5]] }, // pág. 1128
  'la-rioja': { nombre: 'La Rioja', escala: [[12450, 8], [20200, 10.6], [35200, 13.6], [40000, 17.8], [50000, 18.3], [60000, 19], [120000, 24.5], [Infinity, 27]] }, // pág. 1129 (solo cambia el mínimo por discapacidad, pág. 1091)
  valencia: { nombre: 'Comunitat Valenciana', escala: [[12000, 9], [22000, 12], [32000, 15], [42000, 17.5], [52000, 20], [62000, 22.5], [72000, 25], [100000, 26.5], [150000, 27.5], [200000, 28.5], [Infinity, 29.5]], // págs. 1129-1130
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2640, 2970, 4400, 4950], menor3: 3080, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1092-1093
  ceuta: { nombre: 'Ceuta', escala: ESCALA_ART65, ceutaMelilla: true },
  melilla: { nombre: 'Melilla', escala: ESCALA_ART65, ceutaMelilla: true },
};
// Por edad a 31 de diciembre del año. tabla: la estatal o la de la comunidad (CCAA[…].minimos).
export function minimosRenta(anio, { nacimiento, hijos = [], compartidos = true, ascendientes = [] } = {}, tabla = MINIMOS_ESTATALES) {
  const edad = (y) => anio - Number(y);
  // Edad cumplida a 31 de diciembre: el incremento es para quien tiene 65 (o 75) años o más, como en Renta WEB y en el
  // algoritmo de retenciones (lib/retencionIrpf.js).
  const personal = r2(tabla.personal + (nacimiento && edad(nacimiento) >= 65 ? tabla.mas65 : 0) + (nacimiento && edad(nacimiento) >= 75 ? tabla.mas75 : 0));
  const H = hijos.map(Number).filter((y) => y && edad(y) >= 0 && edad(y) < 25).sort((a, b) => a - b);
  // Con los dos progenitores declarando por separado, cada uno aplica la mitad.
  const parte = compartidos ? 0.5 : 1;
  const descendientes = r2(H.reduce((s, y, i) => s + (tabla.descendientes[Math.min(i, 3)] + (edad(y) < 3 ? tabla.menor3 : 0)) * parte, 0));
  const A = ascendientes.map(Number).filter((y) => y && edad(y) >= 65);
  const ascend = r2(A.reduce((s, y) => s + tabla.ascendiente + (edad(y) >= 75 ? tabla.ascendiente75 : 0), 0));
  return { personal, descendientes, ascendientes: ascend, total: r2(personal + descendientes + ascend) };
}

// Reducciones del rendimiento neto de la actividad (art. 32.2 LIRPF, manual de Renta 2025 de la AEAT):
//  · Autónomo económicamente dependiente o con un único cliente no vinculado (32.2.1.º, y requisitos del art. 26 RIRPF):
//    2.000 € y, con rendimientos de menos de 19.747,50 € y no más de 6.500 € de otras rentas, 6.498 € (hasta 14.047,50 €)
//    o 6.498 − 1,14 × (RN − 14.047,50). En estimación directa simplificada no es compatible con el 5 % de difícil
//    justificación: se aplica lo que más reduce.
//  · Si no: con rentas (incluida la actividad) de menos de 12.000 €, 1.620 € hasta 8.000 € y 1.620 − 0,405 × (rentas − 8.000)
//    hasta 12.000 € (32.2.3.º), compatible con la difícil justificación.
// Nunca deja el rendimiento en negativo.
export function reduccionActividad(rn, { dependiente = false, otrasRentas = 0 } = {}) {
  if (rn <= 0) return 0;
  if (dependiente) {
    const adicional = rn < 19747.5 && otrasRentas <= 6500 ? (rn <= 14047.5 ? 6498 : 6498 - 1.14 * (rn - 14047.5)) : 0;
    return r2(Math.min(rn, 2000 + Math.max(0, adicional)));
  }
  const rentas = rn + otrasRentas;
  if (rentas >= 12000) return 0;
  return r2(Math.min(rn, rentas <= 8000 ? 1620 : 1620 - 0.405 * (rentas - 8000)));
}

// Deducción por maternidad (art. 81 LIRPF; Manual de Renta 2025, parte 1, págs. 1381-1389): para la madre (dada de alta en
// la Seguridad Social: una autónoma lo está), 100 € por cada mes del año en que el hijo tiene menos de 3 años, desde el mes
// de nacimiento hasta el anterior al que los cumple, hasta 1.200 € por hijo. Más el gasto de guardería o centro de
// educación infantil autorizado, hasta 1.000 € por hijo (1.000/12 por mes con derecho, 83,33 €) y sin pasar de lo pagado.
// Resta del resultado aunque salga a devolver. Sin el mes de nacimiento, el año en que nace y el que cumple 3 no se cuentan
// (sinMes); no mira el abono anticipado (modelo 140) ni los meses de guardería tras cumplir los 3.
export function deduccionMaternidad(anio, { madre = false, hijos = [], hijosMes = [], guarderia = 0 } = {}) {
  if (!madre) return { importe: 0, maternidad: 0, guarderia: 0, sinMes: 0 };
  let maternidad = 0, topeGuarderia = 0, sinMes = 0;
  hijos.forEach((y, i) => {
    const edad = anio - Number(y), m = Number(hijosMes[i]) || 0;
    let meses = 0;
    if (edad === 1 || edad === 2) meses = 12;
    else if (edad === 0 || edad === 3) {
      if (m >= 1 && m <= 12) for (let mes = 1; mes <= 12; mes++) { const k = edad * 12 + mes - m; if (k >= 0 && k <= 35) meses++; }
      else sinMes++;
    }
    maternidad += Math.min(1200, 100 * meses);
    topeGuarderia += Math.min(1000, r2((1000 * meses) / 12));
  });
  const g = r2(Math.min(Math.max(0, Number(guarderia) || 0), topeGuarderia));
  return { importe: r2(maternidad + g), maternidad: r2(maternidad), guarderia: g, sinMes };
}

// Rendimiento de la actividad de un año, con la difícil justificación y las reducciones del art. 32.2 (lo que deje menos).
function rendimientoActividad(facturas, gastos, anio, pagos, { ivaCoste, iva, personal }) {
  const q4 = resumenAnual(facturas, gastos, anio, pagos, undefined, { ivaCoste, iva }).trimestres[3];
  const ingresos = q4.ingAcum;
  const gastosAnio = r2(q4.gasAcum - q4.difJust);
  const previo = r2(ingresos - gastosAnio); // antes de la difícil justificación
  const otrasRentas = Math.max(0, Number(personal.otrasRentas) || 0);
  // La difícil justificación y la reducción general, o la de dependiente sin difícil justificación: lo que deje menos.
  const general = (() => { const rn = r2(Math.max(0, previo - q4.difJust)); return { difJust: q4.difJust, reduccion: reduccionActividad(rn, { otrasRentas }), rn }; })();
  const dep = personal.dependiente ? (() => { const rn = r2(Math.max(0, previo)); return { difJust: 0, reduccion: reduccionActividad(rn, { dependiente: true, otrasRentas }), rn }; })() : null;
  const elegida = dep && dep.rn - dep.reduccion < general.rn - general.reduccion ? { ...dep, tipo: 'dependiente' } : { ...general, tipo: general.reduccion ? 'general' : null };
  return { q4, ingresos, gastosAnio, otrasRentas, elegida, neto: r2(previo - q4.difJust), reducido: r2(Math.max(0, elegida.rn - elegida.reduccion)) };
}

// personal: { nacimiento, hijos: [año de nacimiento…], hijosMes: [mes de nacimiento o 0…], compartidos, ascendientes: [año…],
// dependiente, otrasRentas, inicio, exEmpleador, ccaa, madre, guarderia } (fiscal.renta).
// rendimientos: { año: rendimiento neto de la actividad } apuntado para el 130 (u.rend130), para los años sin datos.
export function borradorRenta(facturas, gastos, anio, pagos = {}, { ivaCoste = false, personal = {}, iva = {}, rendimientos = {} } = {}) {
  const act = rendimientoActividad(facturas, gastos, anio, pagos, { ivaCoste, iva, personal });
  const { q4, ingresos, gastosAnio, otrasRentas, elegida, reducido } = act;
  // Inicio de actividad (art. 32.3 LIRPF; Manual de Renta 2025, parte 1, págs. 482-483): un 20 % del rendimiento neto
  // positivo, ya reducido por el 32.2, hasta 100.000 €, el primer año con rendimiento positivo desde el inicio y el
  // siguiente. Toca este año si es positivo y ninguno de los años desde el inicio hasta el antepasado lo fue (este año o
  // el anterior es entonces el primero). Cada año se mira con lo que hay en Fisquo o, sin datos, con el rendimiento
  // apuntado para el 130; si alguno no se sabe, no se aplica (falta). No se aplica si más de la mitad de los ingresos vienen
  // de quien le pagó una nómina el año anterior.
  const inicio = Number(personal.inicio) || 0;
  const hay = (y) => y > anio - ANIOS_DATOS && [...facturas, ...gastos].some((x) => String(x.fecha || '').startsWith(`${y}-`));
  let falta = null, yaPositivo = null;
  if (inicio && anio >= inicio) {
    for (let y = inicio; y <= anio - 2 && !falta && !yaPositivo; y++) {
      const rn = hay(y) ? rendimientoActividad(facturas, gastos, y, {}, { ivaCoste, iva, personal }).neto : rendimientos?.[y] !== undefined && rendimientos?.[y] !== null && Number.isFinite(Number(rendimientos[y])) ? Number(rendimientos[y]) : null;
      if (rn === null) falta = y; else if (rn > 0) yaPositivo = y;
    }
  }
  const aplicaInicio = Boolean(inicio) && anio >= inicio && !falta && !yaPositivo && !personal.exEmpleador;
  const reduccionInicio = aplicaInicio ? r2(0.2 * Math.min(reducido, 100000)) : 0;
  const rendimiento = r2(reducido - reduccionInicio);
  const base = r2(rendimiento + otrasRentas);
  // Cuota íntegra (Manual de Renta 2025, parte 1, págs. 1118-1121): la escala estatal sobre la base menos la misma escala
  // sobre el mínimo personal y familiar estatal, más la escala de la comunidad sobre la base menos esa escala sobre el
  // mínimo autonómico. Sin comunidad elegida, la estatal y la del art. 65 con los mínimos estatales (aproximada).
  const ccaa = CCAA[personal.ccaa] || null;
  const minimos = minimosRenta(anio, personal);
  const minimosAut = ccaa?.minimos ? minimosRenta(anio, personal, ccaa.minimos) : minimos;
  const parcial = (escala, minimo) => r2(Math.max(0, cuotaEscala(base, escala) - cuotaEscala(Math.min(base, minimo), escala)));
  const estatalTotal = parcial(ESCALA_ESTATAL, minimos.total);
  const autonomicaTotal = parcial(ccaa ? ccaa.escala : ESCALA_ART65, minimosAut.total);
  // Solo la parte de la cuota que corresponde a la actividad (las otras rentas tienen sus propias retenciones, fuera de Fisquo).
  const parte = (c) => (base ? r2((c * rendimiento) / base) : 0);
  const cuotaEstatal = parte(estatalTotal), cuotaAutonomica = parte(autonomicaTotal);
  const cuota = r2(cuotaEstatal + cuotaAutonomica);
  // Ceuta y Melilla (art. 68.4 LIRPF; Manual de Renta 2025, parte 1, págs. 1290-1293): el 60 % de la parte de las cuotas
  // íntegras estatal y autonómica de las rentas obtenidas allí. Se da por hecho que la actividad se ejerce allí.
  const deduccionCeuta = ccaa?.ceutaMelilla ? r2(cuota * 0.6) : 0;
  const maternidad = deduccionMaternidad(anio, personal);
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return {
    ingresos, gastos: gastosAnio, difJust: elegida.difJust, reduccion: elegida.reduccion, tipoReduccion: elegida.tipo, reduccionInicio,
    inicioActividad: inicio ? { aplica: aplicaInicio, ...(falta ? { falta } : {}), ...(yaPositivo ? { primero: yaPositivo } : {}) } : null,
    rendimiento, minimos, minimosAutonomicos: minimosAut, otrasRentas,
    ccaa: ccaa ? personal.ccaa : null, nombreCcaa: ccaa?.nombre || null, aproximada: !ccaa, escalaDe: 2025,
    cuotaEstatal, cuotaAutonomica, cuota, deduccionCeuta, maternidad, retenciones, pagos130,
    resultado: r2(cuota - deduccionCeuta - retenciones - pagos130 - maternidad.importe), tipoMedio: rendimiento ? r2((cuota / rendimiento) * 100) : 0,
  };
}

export { importes };

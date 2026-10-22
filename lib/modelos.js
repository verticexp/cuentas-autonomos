// Modelos 115, 180, 349, 390, 190 y borrador de la renta (100). Orientativos: los confirma la gestoría.
import { tipoISForal } from './territorios.js';
import { categoriaDe } from './categorias.js';
import { casillas303, costeGasto, desglose, habil, importes, nifUE, origenGasto, r2, resumenAnual, trimestre } from './calculos.js';
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
  for (const f of delT(facturas, anio, t)) {
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

// 190: resumen anual de retenciones de los trabajadores (clave A) y de los profesionales (clave G), por perceptor.
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
    // Las ventas a consumidores finales (cierres de caja, tiques) no se declaran.
    if (f.simplificada || Number(f.irpfPct) > 0 || (nifUE(nif) && !i.iva) || (!i.iva && nif && !NIF_ES.test(nif))) continue;
    sumar('B', nif.replace(/^ES/, ''), f.cliente?.nombre, f.fecha, r2(i.base + i.iva + (i.recargo || 0)));
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
    return { p, mes, de, cuota, pago: cuota > 0 ? r2(cuota * 0.18) : 0, fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) };
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
// Base imponible de un año (ingresos − gastos, con amortizaciones, existencias y asientos manuales), sin ajustes.
function baseSociedades(facturas, gastos, anio, { ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31` } = {}) {
  const neto = (x) => { const i = importes(x); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const F = delT(facturas, anio).filter((f) => f.fecha <= hasta);
  const ingresos = suma(F, neto);
  // Los bienes de inversión no cuentan enteros: solo su amortización del año.
  const amortizacion = suma(amortizacionesAnio(gastos, anio, { regimen: 'sociedad', ivaCoste, hasta }), (x) => x.cuota);
  const datosStock = { productos, facturas, gastos, ajustes, albaranes };
  const variacionExistencias = productos.length ? r2(valorInventario(datosStock, hasta) - valorInventario(datosStock, `${anio - 1}-12-31`)) : 0;
  const gastosAnio = r2(suma(delT(gastos, anio).filter((g) => g.fecha <= hasta && !(g.inversion && g.base > 0)), (g) => costeGasto(g, { ivaCoste })) + amortizacion - variacionExistencias);
  const ajustesContables = r2(manuales.filter((a) => !a.apertura && a.fecha.startsWith(`${anio}-`) && a.fecha <= hasta).reduce((s, a) => s + a.lineas.filter((l) => /^[67]/.test(l.cuenta) && !/^(630|633|638)/.test(l.cuenta)).reduce((v, l) => v + Number(l.haber || 0) - Number(l.debe || 0), 0), 0));
  return { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base: r2(Math.max(0, ingresos - gastosAnio + ajustesContables)) };
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
// 15 % de las entidades de nueva creación (que es de la ley estatal).
export function borradorSociedades(facturas, gastos, anio, { pagos202 = {}, ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31`, constitucion = '', cuotaIS = {}, territorio } = {}) {
  const op = { ivaCoste, productos, ajustes, albaranes, manuales };
  const { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base } = baseSociedades(facturas, gastos, anio, { ...op, hasta });
  const previo = suma(delT(facturas, anio - 1), (f) => f.base);
  // Sin datos del año anterior en la app, el de este; con datos, el del año anterior aunque fuera cero (art. 29 LIS).
  const conAnterior = [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${anio - 1}-`));
  const incn = conAnterior ? previo : suma(delT(facturas, anio), (f) => f.base);
  const tamano = incn < 1e6 ? 'micro' : incn < 1e7 ? 'reducida' : 'general';
  const foral = tipoISForal(territorio, incn);
  const nueva = foral !== null ? null : nuevaCreacion(anio, {
    constitucion, cuotaIS, base,
    hayDatos: (y) => [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`)),
    baseDe: (y) => baseSociedades(facturas, gastos, y, op).base,
  });
  // El 15 % sustituye al tipo del tramo solo donde es menor.
  const [t1, t2] = foral !== null ? [foral, foral] : tiposIS(anio, tamano).map((t) => (nueva?.aplica ? Math.min(t, TIPO_NUEVA_CREACION) : t));
  const tramos = t1 === t2 ? [{ base, pct: t1 }] : [{ base: Math.min(base, 50000), pct: t1 }, { base: r2(Math.max(0, base - 50000)), pct: t2 }];
  for (const x of tramos) x.cuota = r2((x.base * x.pct) / 100);
  const cuota = suma(tramos, (x) => x.cuota);
  const pagos = r2(Object.values(pagos202[anio] || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  const retenciones = suma(F, (f) => importes(f).irpf);
  return { ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base, incn, conAnterior, tamano, nuevaCreacion: nueva, ...(foral !== null ? { foral: territorio } : {}), tramos: tramos.filter((x) => x.base > 0), cuota, pagos, retenciones, resultado: r2(cuota - pagos - retenciones), tipoMedio: base ? r2((cuota / base) * 100) : 0 };
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
// Mínimos personales y familiares (arts. 57-59 LIRPF), por edad a 31 de diciembre del año.
const MINIMO_DESCENDIENTE = [2400, 2700, 4000, 4500]; // 1.º, 2.º, 3.º y 4.º y siguientes (menores de 25 que conviven)
export function minimosRenta(anio, { nacimiento, hijos = [], compartidos = true, ascendientes = [] } = {}) {
  const edad = (y) => anio - Number(y);
  const personal = MINIMO_PERSONAL + (nacimiento && edad(nacimiento) > 65 ? 1150 : 0) + (nacimiento && edad(nacimiento) > 75 ? 1400 : 0);
  const H = hijos.map(Number).filter((y) => y && edad(y) >= 0 && edad(y) < 25).sort((a, b) => a - b);
  // Con los dos progenitores declarando por separado, cada uno aplica la mitad.
  const parte = compartidos ? 0.5 : 1;
  const descendientes = r2(H.reduce((s, y, i) => s + (MINIMO_DESCENDIENTE[Math.min(i, 3)] + (edad(y) < 3 ? 2800 : 0)) * parte, 0));
  const A = ascendientes.map(Number).filter((y) => y && edad(y) > 65);
  const ascend = A.reduce((s, y) => s + 1150 + (edad(y) > 75 ? 1400 : 0), 0);
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

// personal: { nacimiento, hijos: [año de nacimiento…], compartidos, ascendientes: [año…], dependiente, otrasRentas } (fiscal.renta).
export function borradorRenta(facturas, gastos, anio, pagos = {}, { ivaCoste = false, personal = {}, iva = {} } = {}) {
  const q4 = resumenAnual(facturas, gastos, anio, pagos, undefined, { ivaCoste, iva }).trimestres[3];
  const ingresos = q4.ingAcum;
  const gastosAnio = r2(q4.gasAcum - q4.difJust);
  const previo = r2(ingresos - gastosAnio); // antes de la difícil justificación
  const otrasRentas = Math.max(0, Number(personal.otrasRentas) || 0);
  // La difícil justificación y la reducción general, o la de dependiente sin difícil justificación: lo que deje menos.
  const general = (() => { const rn = r2(Math.max(0, previo - q4.difJust)); return { difJust: q4.difJust, reduccion: reduccionActividad(rn, { otrasRentas }), rn }; })();
  const dep = personal.dependiente ? (() => { const rn = r2(Math.max(0, previo)); return { difJust: 0, reduccion: reduccionActividad(rn, { dependiente: true, otrasRentas }), rn }; })() : null;
  const elegida = dep && dep.rn - dep.reduccion < general.rn - general.reduccion ? { ...dep, tipo: 'dependiente' } : { ...general, tipo: general.reduccion ? 'general' : null };
  const rendimiento = r2(Math.max(0, elegida.rn - elegida.reduccion));
  const minimos = minimosRenta(anio, personal);
  const base = r2(rendimiento + otrasRentas);
  const cuotaTotal = r2(Math.max(0, cuotaEscala(base) - cuotaEscala(Math.min(base, minimos.total))));
  // Solo la parte de la cuota que corresponde a la actividad (las otras rentas tienen sus propias retenciones, fuera de Fisquo).
  const cuota = base ? r2((cuotaTotal * rendimiento) / base) : 0;
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return { ingresos, gastos: gastosAnio, difJust: elegida.difJust, reduccion: elegida.reduccion, tipoReduccion: elegida.tipo, rendimiento, minimos, otrasRentas, cuota, retenciones, pagos130, resultado: r2(cuota - retenciones - pagos130), tipoMedio: rendimiento ? r2((cuota / rendimiento) * 100) : 0 };
}

export { importes };

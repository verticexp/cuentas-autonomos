// Modelos 115, 180, 349, 390, 190 y borrador de la renta (100). Orientativos: los confirma la gestoría.
import { tipoISForal } from './territorios.js';
import { categoriaDe } from './categorias.js';
import { casillas303, costeGasto, desglose, devengadoCaja, fechaDeduccion, fechaDevengo, fechaIva, gastoEnCaja, habil, importes, nifUE, operacionesCaja, origenGasto, pagosDe, r2, resumenAnual, trimestre } from './calculos.js';
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
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const dos = (n) => String(n).padStart(2, '0');
const finDeMes = (anio, mes) => `${anio}-${dos(mes)}-${dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;
// Primer y último día de un trimestre (o del año, sin trimestre).
const rangoT = (anio, t) => (t ? [`${anio}-${dos(3 * t - 2)}-01`, finDeMes(anio, 3 * t)] : [`${anio}-01-01`, `${anio}-12-31`]);

// Operaciones del 349, una por factura o gasto: { nif, nombre, clave, base, fecha, original? }. Solo la parte sin IVA de
// las operaciones intracomunitarias (lib/operaciones.js): con IVA español no es intracomunitaria; y sin lo que en el REBU y
// el REAV queda fuera de la base (fueraBase), que tampoco va en la casilla 59 del 303. fecha: la de devengo, como en la 59
// (fechaDevengo de lib/calculos.js). original: en una rectificativa, la fecha de la operación que corrige (la de su factura
// original o, sin ella a mano, rectifica.fecha). Los abonos de proveedores no dicen qué gasto corrigen: no la llevan.
function operaciones349(facturas, gastos) {
  const out = [];
  for (const f of facturas) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    const nif = nifUE(f.cliente?.nif);
    // Irlanda del Norte (XI) solo cuenta como UE para bienes: sus servicios no van al 349.
    if (!op?.clave349 || !nif || (nif.startsWith('XI') && op.clave349 === 'S')) continue;
    const orig = f.rectifica?.id && facturas.find((x) => x.id === f.rectifica.id);
    const original = orig ? fechaDevengo(orig) : FECHA.test(f.rectifica?.fecha || '') ? f.rectifica.fecha : '';
    const base = r2(desglose(f).filter((x) => x.pct === 0 && !x.fueraBase).reduce((s, x) => s + x.base, 0));
    out.push({ nif, nombre: f.cliente.nombre, clave: op.clave349, base, fecha: fechaDevengo(f), ...(original ? { original } : {}) });
  }
  // Compras a la UE: A las de bienes (un bien de inversión, mercaderías o con stock) e I las de servicios.
  for (const g of gastos) {
    const nif = nifUE(g.proveedorNif);
    const bienes = Boolean(g.inversion || g.stock?.length) || ['600', '601', '602'].includes(categoriaDe(g));
    if (nif && origenGasto(g) === 'ue' && (bienes || !nif.startsWith('XI'))) out.push({ nif, nombre: g.proveedor || 'Sin nombre', clave: bienes ? 'A' : 'I', base: g.base, fecha: g.fecha });
  }
  return out;
}

// Entregas de bienes y servicios prestados (claves E y S; no las compras A e I) de un periodo, sin IVA y sin las
// rectificaciones de operaciones de antes del periodo (van aparte).
const entregas349 = (ops, desde, hasta) => r2(ops.filter((o) => ['E', 'S'].includes(o.clave) && o.fecha >= desde && o.fecha <= hasta && !(o.original && o.original < desde)).reduce((s, o) => s + o.base, 0));
// Periodicidad (art. 81 RIVA; instrucciones del 349): mensual si las entregas y servicios pasan de 50.000 € en el trimestre
// o en cualquiera de los cuatro anteriores. Devuelve el mes (AAAA-MM) desde el que es mensual (el primero del trimestre si
// fue en uno anterior, o el mes en cuyo final se pasa) o null si es trimestral. Superado a final de un mes, se presenta
// en los 20 días siguientes por los meses que van de trimestre (diseño de registro del 349, posición 186).
export const LIMITE_349_MENSUAL = 50000;
function mensual349(ops, anio, t) {
  for (let i = 1; i <= 4; i++) {
    const q = (anio * 4 + t - 1) - i;
    if (entregas349(ops, ...rangoT(Math.floor(q / 4), (q % 4) + 1)) > LIMITE_349_MENSUAL) return `${anio}-${dos(3 * t - 2)}`;
  }
  const [desde] = rangoT(anio, t);
  for (let mes = 3 * t - 2; mes <= 3 * t; mes++) if (entregas349(ops, desde, finDeMes(anio, mes)) > LIMITE_349_MENSUAL) return `${anio}-${dos(mes)}`;
  return null;
}
// Declaración en la que fue una operación: { ejercicio, periodo ('1T'…'4T' o el mes '01'…'12'), desde, hasta }. En un
// trimestre que pasó a mensual, la primera declaración mensual recoge los meses del trimestre hasta el que lo supera.
function periodo349(ops, fecha) {
  const anio = Number(fecha.slice(0, 4)), t = trimestre(fecha), mes = Number(fecha.slice(5, 7));
  const desdeMes = mensual349(ops, anio, t);
  if (!desdeMes) { const [desde, hasta] = rangoT(anio, t); return { ejercicio: anio, periodo: `${t}T`, desde, hasta }; }
  const corte = Number(desdeMes.slice(5, 7));
  return mes <= corte
    ? { ejercicio: anio, periodo: dos(corte), desde: rangoT(anio, t)[0], hasta: finDeMes(anio, corte) }
    : { ejercicio: anio, periodo: dos(mes), desde: `${anio}-${dos(mes)}-01`, hasta: finDeMes(anio, mes) };
}

// operadores: un registro por operador y clave, con las operaciones del periodo (las rectificativas del mismo periodo
// restan). Una rectificativa de una operación de un periodo anterior (ya declarado) no resta aquí: va en rectificaciones
// (diseño de registro del 349, posiciones 147-178) con la clave, el ejercicio y el periodo que corrige, la nueva base de
// ese periodo (base) y la que se declaró entonces (anterior). Ninguna base puede ser negativa: lo que un abono sin su
// operación resta de más queda en negativos, para revisarlo. mensual: el mes desde el que el 349 es mensual, o null.
export function modelo349(facturas, anio, t, gastos = []) {
  const ops = operaciones349(facturas, gastos);
  const [desde, hasta] = rangoT(anio, t);
  const en = (o, d, h) => o.fecha >= d && o.fecha <= h;
  const previa = (o, d) => Boolean(o.original) && o.original < d;
  const m = new Map();
  for (const o of ops) {
    if (!en(o, desde, hasta) || previa(o, desde)) continue;
    const c = m.get(o.nif + o.clave) || { nif: o.nif, nombre: o.nombre, clave: o.clave, base: 0 };
    c.base = r2(c.base + o.base);
    m.set(o.nif + o.clave, c);
  }
  const R = new Map();
  for (const o of ops) {
    if (!en(o, desde, hasta) || !previa(o, desde)) continue;
    const p = periodo349(ops, o.original);
    const k = [o.nif, o.clave, p.ejercicio, p.periodo].join('|');
    const r = R.get(k) || { nif: o.nif, nombre: o.nombre, clave: o.clave, ejercicio: p.ejercicio, periodo: p.periodo, p, ahora: 0 };
    r.ahora = r2(r.ahora + o.base);
    R.set(k, r);
  }
  const rectificaciones = [...R.values()].map(({ p, ahora, ...r }) => {
    const mismo = (o) => o.nif === r.nif && o.clave === r.clave;
    // Lo declarado en ese periodo y lo que ya lo corrigieron las declaraciones posteriores, anteriores a esta.
    const declarado = Math.max(0, r2(ops.filter((o) => mismo(o) && en(o, p.desde, p.hasta) && !previa(o, p.desde)).reduce((s, o) => s + o.base, 0)));
    const corregido = r2(ops.filter((o) => mismo(o) && o.original >= p.desde && o.original <= p.hasta && o.fecha > p.hasta && o.fecha < desde).reduce((s, o) => s + o.base, 0));
    const anterior = Math.max(0, r2(declarado + corregido));
    return { ...r, base: Math.max(0, r2(anterior + ahora)), anterior };
  });
  const operadores = [...m.values()].filter((c) => c.base > 0).sort((a, b) => b.base - a.base);
  return {
    operadores, total: suma(operadores, (c) => c.base),
    rectificaciones, totalRectificaciones: suma(rectificaciones, (r) => r.base),
    negativos: [...m.values()].filter((c) => c.base < 0),
    mensual: t ? mensual349(ops, anio, t) : null,
  };
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

// 190: resumen anual de retenciones de los trabajadores (clave A), los consejeros y administradores (clave E), los
// profesionales (clave G), los empresarios en módulos y agricultores con el 1 o el 2 % (clave H) y otras rentas (I), por
// perceptor, clave y subclave (diseño de registro del 190, posiciones 78-80).
// Subclaves de los gastos con retención (clave190 del gasto; sin ella, la que toca a su %): pct es la retención que les
// corresponde (art. 95 y 101 RIRPF).
export const SUBCLAVES_190 = {
  G01: { pct: 15, nombre: 'Profesional (retención general del 15 %)' },
  G02: { pct: 7, nombre: 'Recaudador municipal, mediador de seguros o delegado de Loterías (7 %)' },
  G03: { pct: 7, nombre: 'Profesional en sus tres primeros años (7 %)' },
  H01: { pct: 2, nombre: 'Agricultura o ganadería (2 %)' },
  H02: { pct: 1, nombre: 'Engorde de porcino o avicultura (1 %)' },
  H03: { pct: 2, nombre: 'Actividad forestal (2 %)' },
  H04: { pct: 1, nombre: 'Empresario en módulos (1 %)' },
  I03: { pct: 19, nombre: 'Arrendamiento de negocios o bienes muebles y otras del art. 75.2.b RIRPF (19 %)' },
};
const SUBCLAVE_DEFECTO = { 15: 'G01', 7: 'G03', 2: 'H01', 1: 'H04', 19: 'I03' };
export const clave190De = (g) => (SUBCLAVES_190[g.clave190]?.pct === Number(g.irpfPct) ? g.clave190 : SUBCLAVE_DEFECTO[Number(g.irpfPct)] || (Number(g.irpfPct) <= 2 ? 'H01' : 'G01'));
// Clave E (consejeros y administradores, lib/nominas.js cotizacion.administrador): 01 asimilado, 02 asimilado de una
// sociedad que facturó menos de 100.000 € (pequena), 03 autónomo de una pequeña y 04 el resto.
const subclaveE = (adm, pequena) => (adm === 'asimilado' ? (pequena ? '02' : '01') : pequena ? '03' : '04');
// Datos adicionales de la clave A (posiciones 153-254), de lo que el trabajador comunicó en el 145 (empleado.datos145):
// año de nacimiento, situación familiar (con el NIF del cónyuge en la 2), discapacidad (0, 1 del 33 al 65 %, 2 con
// movilidad reducida, 3 del 65 % o más), contrato (1 general, 2 de menos de un año, 3 relación laboral especial, 4
// peonadas), movilidad geográfica e hijos con derecho al mínimo (menores de 25 a 31 de diciembre o con discapacidad): los
// menores de 3 años (o adoptados en el año o los dos anteriores) y el resto, con cuántos se computan por entero.
const CONTRATO_190 = { general: 1, inferiorAnio: 2, especial: 3, manuales: 4 };
function datos190(d, anio) {
  if (!d) return { contrato: 1 };
  const hijos = (d.descendientes || []).filter((h) => h.nacimiento <= anio && (anio - h.nacimiento < 25 || (h.discapacidad && h.discapacidad !== 'no')));
  const menor3 = (h) => anio - h.nacimiento < 3 || (h.adopcion !== undefined && anio - h.adopcion < 3);
  const cuenta = (l) => ({ total: l.length, porEntero: l.filter((h) => h.porEntero).length });
  return {
    nacimiento: d.nacimiento, situacionFamiliar: d.situacionFamiliar, ...(d.situacionFamiliar === 2 && d.nifConyuge ? { nifConyuge: d.nifConyuge } : {}),
    discapacidad: d.discapacidad === '65' ? 3 : d.discapacidad === '33a65' ? (d.movilidadReducida ? 2 : 1) : 0,
    contrato: CONTRATO_190[d.contrato] || 1, movilidad: d.movilidadGeografica ? 1 : 0,
    hijos: { menores3: cuenta(hijos.filter(menor3)), resto: cuenta(hijos.filter((h) => !menor3(h))) },
  };
}
// gastosDeducibles (posiciones 184-196): en la clave A y la E.01 y E.02, la Seguridad Social del trabajador de sus nóminas.
export function modelo190(nominas, empleados, anio, gastos = []) {
  const m = new Map();
  for (const n of nominasPagadasEn(nominas, anio)) {
    const e = empleados.find((x) => x.id === n.empleado) || {};
    const c = calculoNomina(n);
    const adm = n.detalle?.administrador || e.cotizacion?.administrador;
    const clave = adm ? 'E' : 'A', subclave = adm ? subclaveE(adm, e.cotizacion?.pequena) : '';
    const k = `${n.empleado}:${clave}${subclave}`;
    const conGastos = clave === 'A' || ['01', '02'].includes(subclave);
    const p = m.get(k) || { nombre: e.nombre || n.empleadoNombre, nif: e.nif || '', clave, subclave, percepciones: 0, retenciones: 0, ...(conGastos ? { gastosDeducibles: 0 } : {}), ...(clave === 'A' ? datos190(e.datos145, anio) : {}) };
    p.percepciones = r2(p.percepciones + c.bruto); p.retenciones = r2(p.retenciones + c.irpf);
    if (conGastos) p.gastosDeducibles = r2(p.gastosDeducibles + c.ssTrabajador);
    m.set(k, p);
  }
  for (const g of pagadosEn(gastos.filter((x) => !x.alquiler && Number(x.irpfPct) > 0), anio)) {
    const sc = clave190De(g);
    const k = `prof:${sc}:${claveProveedor(g) || 'sin nombre'}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', clave: sc[0], subclave: sc.slice(1), percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + g.base); p.retenciones = r2(p.retenciones + importes(g).irpf);
    m.set(k, p);
  }
  const perceptores = [...m.values()];
  return { perceptores, percepciones: suma(perceptores, (p) => p.percepciones), retenciones: suma(perceptores, (p) => p.retenciones) };
}

// 347: clientes (clave B) y proveedores (clave A) con los que se pasa de 3.005,06 € en el año, con lo de cada trimestre.
// Fuera: lo que ya va en el 349 (empresas de la UE), lo de fuera de la UE (ventas sin IVA a un NIF que no es español y
// compras de fuera), lo que lleva retención (va en el 190 o el 180: facturas con retención, alquiler del local y
// profesionales) y los tickets sin proveedor.
// Importe (instrucciones del 347, «Importe de las operaciones»): la base más el IVA, el recargo de equivalencia y la
// compensación del régimen de la agricultura (REAGP). Ventas por la fecha con la que cuentan en el 303 (fechaIva).
// Registros aparte (diseño de registro del 347, tipo 2 de declarado), con la misma clave:
//  · isp: compras con inversión del sujeto pasivo (posición 282). Solo las marcadas (g.isp, de momento solo en IGIC): la
//    app no recoge la inversión del sujeto pasivo en los gastos de proveedores españoles con IVA.
//  · caja: operaciones del criterio de caja (posiciones 281 y 284-299): las facturas de la empresa en el régimen
//    (iva.recc, lib/calculos.js operacionesCaja) y los gastos que esperan al pago para deducirse (gastoEnCaja), con solo
//    importes anuales: total, lo devengado por la regla general (la factura), e importeCaja, lo devengado al cobrar o pagar
//    (o el 31 de diciembre del año siguiente). Con la empresa en el régimen durante el año, toda su declaración es anual
//    (soloAnual): ningún registro lleva trimestres.
//  · metalico: cobros en efectivo de más de 6.000 € de un cliente (posiciones 101-115), con el ejercicio de las operaciones
//    (132-135); los de facturas de años anteriores, en un registro con total 0. Cuenta como efectivo el cobro apuntado así
//    (metodo 'efectivo' o 'metalico') o el cobro a mano de una factura con la forma de cobro «Efectivo» (formaCobro).
// nifComunitario: el NIF-IVA de un cliente de otro país de la UE (posiciones 264-280), en lugar del NIF español.
// Se declara a quien pasa de 3.005,06 € sumando todos sus registros (o con más de eso devengado por caja o con cobros en
// metálico de más de 6.000 €), con todos sus registros.
export const LIMITE_347 = 3005.06;
export const LIMITE_METALICO = 6000;
const NIF_ES = /^(ES)?([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
// Gastos que no son entregas de bienes ni servicios con factura (art. 33.2.a RGAT): tributos (631), sueldos (640) y
// Seguridad Social o cuota de autónomos (642). Y las nóminas.
const SIN_FACTURA_347 = ['631', '640', '642'];
const EFECTIVO = ['efectivo', 'metalico'];
const enEfectivo = (f, p) => EFECTIVO.includes(p.metodo) || (p.metodo === 'manual' && f.formaCobro === 'efectivo');
export function modelo347(facturas, gastos, anio, { recc } = {}) {
  const m = new Map();
  const registro = (k, datos) => {
    if (!m.has(k)) m.set(k, { ...datos, total: 0, trimestres: [0, 0, 0, 0] });
    return m.get(k);
  };
  const sumar = (o, fecha, total) => {
    o.total = r2(o.total + total);
    if (fecha) o.trimestres[trimestre(fecha) - 1] = r2(o.trimestres[trimestre(fecha) - 1] + total);
  };
  const nifDe = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '');
  // Quién: su NIF español, su NIF-IVA de otro país de la UE o, sin ninguno, su nombre (id: con lo que se agrupa).
  const quien = (n, nombre) => {
    const nif = nifDe(n), ue = nifUE(nif), es = ue ? '' : nif.replace(/^ES/, '');
    return { nif: es, ...(ue ? { nifComunitario: ue } : {}), nombre: nombre || 'Sin nombre', id: ue || es || String(nombre || '').trim().toUpperCase() };
  };
  const importe = (x) => { const i = importes(x); return r2(i.base + i.iva + (i.recargo || 0) + (i.compensacion || 0)); };
  const delAnio = (fecha) => fecha.startsWith(`${anio}-`);
  // Las ventas a consumidores finales (cierres de caja, tiques sin NIF del cliente) no se declaran; una simplificada con el
  // NIF del cliente, sí (art. 7.2 del Reglamento de facturación).
  const fuera = (f) => {
    const i = importes(f), nif = nifDe(f.cliente?.nif);
    return (f.simplificada && !nif) || Number(f.irpfPct) > 0 || (nifUE(nif) && !i.iva) || (!i.iva && nif && !NIF_ES.test(nif));
  };
  // Lo que de una factura con IVA a un cliente de la UE va en el 349 (sus líneas sin IVA intracomunitarias).
  const parte349 = (f) => {
    const nif = nifUE(f.cliente?.nif), op = TIPOS_OPERACION[operacionDe(f)];
    return nif && op?.clave349 && !(nif.startsWith('XI') && op.clave349 === 'S') ? r2(desglose(f).filter((x) => x.pct === 0 && !x.fueraBase).reduce((s, x) => s + x.base, 0)) : 0;
  };
  const grupos = operacionesCaja(facturas, recc);
  const enCaja = new Set(grupos.flat());
  for (const f of facturas) {
    if (enCaja.has(f) || !delAnio(fechaIva(f)) || fuera(f)) continue;
    const q = quien(f.cliente?.nif, f.cliente?.nombre);
    sumar(registro(`B:${q.id}`, { clave: 'B', ...q }), fechaIva(f), r2(importe(f) - parte349(f)));
  }
  // Lo cobrado o pagado este año de operaciones de caja de otro año se declara si con esa persona se pasó del límite en
  // el año de la factura (instrucciones del 347, ejemplo de una factura de 4.000 € cobrada en dos años): origen, por año.
  const origen = new Map();
  const deOrigen = (o, fecha, total) => {
    const k = `${o.clave}${o.id}|${fecha.slice(0, 4)}`;
    origen.set(k, r2((origen.get(k) || 0) + total));
  };
  const devengado = (g, fecha) => r2(devengadoCaja(g, fecha).reduce((s, d) => s + d.base + d.iva + (d.recargo || 0), 0));
  for (const g of grupos) {
    if (fuera(g[0])) continue;
    const general = r2(g.filter((f) => delAnio(fechaIva(f))).reduce((s, f) => s + importe(f), 0));
    const caja = r2(devengado(g, `${anio}-12-31`) - devengado(g, `${anio - 1}-12-31`));
    if (!general && !caja) continue;
    const q = quien(g[0].cliente?.nif, g[0].cliente?.nombre);
    const o = registro(`Bcaja:${q.id}`, { clave: 'B', ...q, caja: true, importeCaja: 0 });
    sumar(o, null, general);
    o.importeCaja = r2(o.importeCaja + caja);
    if (caja) deOrigen(o, fechaIva(g[0]), g.reduce((s, f) => s + importe(f), 0));
  }
  // Cobros en metálico del año, por cliente, registro y ejercicio de la factura.
  const efectivo = new Map();
  for (const f of facturas) {
    if (fuera(f)) continue;
    const cobrado = r2(pagosDe(f).filter((p) => enEfectivo(f, p) && delAnio(String(p.fecha || f.fecha))).reduce((s, p) => s + p.importe, 0));
    if (!cobrado) continue;
    const q = quien(f.cliente?.nif, f.cliente?.nombre), ejercicio = Number(fechaIva(f).slice(0, 4));
    const k = `${enCaja.has(f) ? 'Bcaja' : 'B'}:${q.id}${ejercicio === anio ? '' : `:${ejercicio}`}`;
    const e = efectivo.get(k) || { q, caja: enCaja.has(f), ejercicio, importe: 0 };
    e.importe = r2(e.importe + cobrado);
    efectivo.set(k, e);
  }
  for (const [k, e] of efectivo) {
    if (e.importe <= LIMITE_METALICO) continue;
    const o = registro(k, { clave: 'B', ...e.q, ...(e.caja ? { caja: true, importeCaja: 0 } : {}) });
    Object.assign(o, { metalico: e.importe, ejercicioMetalico: e.ejercicio });
  }
  for (const g of gastos) {
    // Las importaciones tampoco (art. 33.2 RGAT: van en el DUA).
    if (g.alquiler || g.importacion || Number(g.irpfPct) > 0 || origenGasto(g) || g.nomina || SIN_FACTURA_347.includes(categoriaDe(g)) || !String(g.proveedor || '').trim()) continue;
    const q = quien(g.proveedorNif, g.proveedor);
    if (gastoEnCaja(g, recc)) {
      const general = delAnio(g.fecha) ? importe(g) : 0, caja = delAnio(fechaDeduccion(g)) ? importe(g) : 0;
      if (!general && !caja) continue;
      const o = registro(`Acaja:${q.id}`, { clave: 'A', ...q, caja: true, importeCaja: 0 });
      sumar(o, null, general);
      o.importeCaja = r2(o.importeCaja + caja);
      if (caja) deOrigen(o, g.fecha, importe(g));
    } else if (delAnio(g.fecha)) sumar(registro(`A${g.isp ? 'isp' : ''}:${q.id}`, { clave: 'A', ...q, ...(g.isp ? { isp: true } : {}) }), g.fecha, importe(g));
  }
  const persona = new Map();
  for (const [k, total] of origen) if (Math.abs(total) > LIMITE_347) persona.set(k.split('|')[0], { total: 0, otro: true });
  for (const o of m.values()) {
    const p = persona.get(o.clave + o.id) || { total: 0, otro: false };
    p.total = r2(p.total + o.total);
    if (Math.abs(o.importeCaja || 0) > LIMITE_347 || o.metalico) p.otro = true;
    persona.set(o.clave + o.id, p);
  }
  const soloAnual = Boolean(recc?.desde) && recc.desde <= `${anio}-12-31` && (!recc.hasta || recc.hasta >= `${anio}-01-01`);
  const declarados = [...m.values()]
    .filter((o) => { const p = persona.get(o.clave + o.id); return Math.abs(p.total) > LIMITE_347 || p.otro; })
    .map(({ id, trimestres, ...o }) => (o.caja || soloAnual ? o : { ...o, trimestres }))
    .sort((a, b) => b.total - a.total);
  return { ventas: declarados.filter((o) => o.clave === 'B'), compras: declarados.filter((o) => o.clave === 'A'), sinNif: declarados.filter((o, i, l) => !o.nif && !o.nifComunitario && l.findIndex((x) => x.clave === o.clave && x.nombre === o.nombre) === i), soloAnual };
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
  // perdida: lo que la base imponible negativa deja para compensar en los años siguientes (art. 26 LIS).
  const resultado = r2(ingresos - gastosAnio + ajustesContables);
  return { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base: Math.max(0, resultado), perdida: Math.max(0, -resultado) };
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
  const { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base, perdida } = baseSociedades(facturas, gastos, anio, { ...op, hasta });
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
  return { ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base, perdida, incn, conAnterior, tamano, nuevaCreacion: nueva, ...(foral !== null ? { foral: territorio } : {}), tramos: tramos.filter((x) => x.base > 0), cuota, pagos, retenciones, resultado: r2(cuota - pagos - retenciones), tipoMedio: base ? r2((cuota / base) * 100) : 0 };
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
  // Edad cumplida a 31 de diciembre: el incremento es para quien tiene 65 (o 75) años o más, como en Renta WEB y en el
  // algoritmo de retenciones (lib/retencionIrpf.js).
  const personal = MINIMO_PERSONAL + (nacimiento && edad(nacimiento) >= 65 ? 1150 : 0) + (nacimiento && edad(nacimiento) >= 75 ? 1400 : 0);
  const H = hijos.map(Number).filter((y) => y && edad(y) >= 0 && edad(y) < 25).sort((a, b) => a - b);
  // Con los dos progenitores declarando por separado, cada uno aplica la mitad.
  const parte = compartidos ? 0.5 : 1;
  const descendientes = r2(H.reduce((s, y, i) => s + (MINIMO_DESCENDIENTE[Math.min(i, 3)] + (edad(y) < 3 ? 2800 : 0)) * parte, 0));
  const A = ascendientes.map(Number).filter((y) => y && edad(y) >= 65);
  const ascend = A.reduce((s, y) => s + 1150 + (edad(y) >= 75 ? 1400 : 0), 0);
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

// personal: { nacimiento, hijos: [año de nacimiento…], compartidos, ascendientes: [año…], dependiente, otrasRentas, inicio,
// exEmpleador } (fiscal.renta).
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
  const reducido = r2(Math.max(0, elegida.rn - elegida.reduccion));
  // Inicio de actividad (art. 32.3 LIRPF): un 20 % del rendimiento neto positivo, ya reducido por el 32.2, hasta 100.000 €,
  // el primer año con rendimiento positivo y el siguiente. El año de alta y el siguiente siempre son uno de esos dos (si el
  // de alta no tuvo beneficio, el siguiente es el primero); más tarde depende de años que Fisquo no conoce. No se aplica si
  // más de la mitad de los ingresos vienen de quien le pagó una nómina el año anterior.
  const inicio = Number(personal.inicio) || 0;
  const reduccionInicio = inicio && (anio === inicio || anio === inicio + 1) && !personal.exEmpleador ? r2(0.2 * Math.min(reducido, 100000)) : 0;
  const rendimiento = r2(reducido - reduccionInicio);
  const minimos = minimosRenta(anio, personal);
  const base = r2(rendimiento + otrasRentas);
  const cuotaTotal = r2(Math.max(0, cuotaEscala(base) - cuotaEscala(Math.min(base, minimos.total))));
  // Solo la parte de la cuota que corresponde a la actividad (las otras rentas tienen sus propias retenciones, fuera de Fisquo).
  const cuota = base ? r2((cuotaTotal * rendimiento) / base) : 0;
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return { ingresos, gastos: gastosAnio, difJust: elegida.difJust, reduccion: elegida.reduccion, tipoReduccion: elegida.tipo, reduccionInicio, rendimiento, minimos, otrasRentas, cuota, retenciones, pagos130, resultado: r2(cuota - retenciones - pagos130), tipoMedio: rendimiento ? r2((cuota / rendimiento) * 100) : 0 };
}

export { importes };

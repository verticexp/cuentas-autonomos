// Contabilidad por partida doble: los asientos salen solos de las facturas, los gastos, las nóminas, las amortizaciones y
// las liquidaciones de impuestos, más los que se apunten a mano (el de apertura, ajustes de la gestoría…).
// Con ellos: libro diario, libro mayor, sumas y saldos, cuenta de pérdidas y ganancias y balance de situación.
// Cada línea es { cuenta, debe, haber }. Un asiento siempre cuadra: suma del debe = suma del haber.
import { desglose, importes, numeroFactura, origenGasto, pagosDe, r2 } from './calculos.js';
import { bienes, cuotaEntre, valorBien } from './amortizaciones.js';
import { calculoNomina, modelo111, fechaPagoNomina } from './nominas.js';
import { borradorSociedades, modelo115, retencionesProfesionales } from './modelos.js';
import { CATEGORIAS, categoriaDe } from './categorias.js';
import { hecho303, usa130, usa303 } from './empresa.js';
import { parseImporte } from './importe.js';
import { valorInventario } from './inventario.js';

export const CUENTAS = {
  100: 'Capital social', 102: 'Capital', 112: 'Reserva legal', 113: 'Reservas voluntarias',
  120: 'Remanente', 121: 'Resultados negativos de ejercicios anteriores', 129: 'Resultado del ejercicio',
  170: 'Deudas a largo plazo con entidades de crédito', 171: 'Deudas a largo plazo', 173: 'Proveedores de inmovilizado a largo plazo',
  206: 'Aplicaciones informáticas', 210: 'Terrenos y bienes naturales', 211: 'Construcciones', 212: 'Instalaciones técnicas', 213: 'Maquinaria',
  214: 'Utillaje', 215: 'Otras instalaciones', 216: 'Mobiliario', 217: 'Equipos para procesos de información', 218: 'Elementos de transporte', 219: 'Otro inmovilizado material',
  280: 'Amortización acumulada del inmovilizado intangible', 281: 'Amortización acumulada del inmovilizado material',
  300: 'Mercaderías', 400: 'Proveedores', 410: 'Acreedores por prestaciones de servicios', 430: 'Clientes', 440: 'Deudores', 465: 'Remuneraciones pendientes de pago',
  4700: 'Hacienda Pública, deudora por IVA', 4709: 'Hacienda Pública, deudora por devolución de impuestos', 472: 'Hacienda Pública, IVA soportado',
  473: 'Hacienda Pública, retenciones y pagos a cuenta', 4750: 'Hacienda Pública, acreedora por IVA', 4751: 'Hacienda Pública, acreedora por retenciones practicadas',
  4752: 'Hacienda Pública, acreedora por impuesto sobre sociedades', 476: 'Organismos de la Seguridad Social, acreedores', 477: 'Hacienda Pública, IVA repercutido',
  520: 'Deudas a corto plazo con entidades de crédito', 523: 'Proveedores de inmovilizado a corto plazo', 550: 'Titular de la explotación', 551: 'Cuenta corriente con socios y administradores',
  570: 'Caja', 572: 'Bancos',
  ...Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nombre])),
  641: 'Indemnizaciones', 643: 'Retribuciones a largo plazo (aportación definida)', 644: 'Retribuciones a largo plazo (prestación definida)',
  645: 'Retribuciones mediante instrumentos de patrimonio', 649: 'Otros gastos sociales',
  630: 'Impuesto sobre beneficios', 669: 'Otros gastos financieros', 678: 'Gastos excepcionales', 680: 'Amortización del inmovilizado intangible', 681: 'Amortización del inmovilizado material',
  700: 'Ventas de mercaderías', 705: 'Prestaciones de servicios', 740: 'Subvenciones a la explotación', 759: 'Ingresos por servicios diversos', 769: 'Otros ingresos financieros', 778: 'Ingresos excepcionales',
};
// Nombre de una cuenta (o de la más cercana: 5720001 → Bancos).
export function nombreCuenta(c) {
  for (let n = String(c); n.length >= 3; n = n.slice(0, -1)) if (CUENTAS[n]) return CUENTAS[n];
  return `Cuenta ${c}`;
}
export const cuentaValida = (c) => /^[1-7]\d{2,11}$/.test(String(c));

// Cuenta de inmovilizado de cada tipo de bien (lib/amortizaciones.js) y su amortización.
const CUENTA_BIEN = { edificios: '211', instalaciones: '212', mobiliario: '216', maquinaria: '213', electronicos: '213', informatica: '217', software: '206', transporte: '218', utiles: '214', otros: '219' };
export const cuentaBien = (g) => CUENTA_BIEN[g.inversion?.tipo] || '219';
const intangible = (g) => cuentaBien(g).startsWith('20');

// Líneas a partir de importes con signo: positivo al debe, negativo al haber (así una rectificativa se invierte sola).
const lineas = (pares) => pares.filter(([, v]) => r2(v)).map(([cuenta, v]) => ({ cuenta: String(cuenta), debe: v > 0 ? r2(v) : 0, haber: v < 0 ? r2(-v) : 0 }));
const hoyMas = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
const finMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
const FIN_T = ['03-31', '06-30', '09-30', '12-31'];
const INI_T = ['01-01', '04-01', '07-01', '10-01'];
// Plazo de cada trimestre: 303 y 130 hasta el 20 (el 4T, el 30 de enero); retenciones, el 20 (el 4T, el 20 de enero).
const plazoT = (anio, t, dia = 30) => (t === 4 ? `${anio + 1}-01-${dia}` : `${anio}-${['04', '07', '10'][t - 1]}-20`);

// Todos los asientos, de todos los años, hasta `hoy` (lo que aún no ha pasado no se contabiliza).
// datos: { facturas, gastos, nominas, manuales, fiscal, pagos130, pagos202, cuotaIS }
export function generarAsientos({ facturas = [], gastos = [], nominas = [], manuales = [], fiscal = {}, pagos130 = {}, pres303 = {}, pagos202 = {}, cuotaIS = {}, productos = [], ajustes = [], albaranes = [] }, hoy) {
  const A = [];
  // Fecha de corte: la del asiento de apertura. Lo anterior ya está en sus saldos (al venir de otro programa, por ejemplo),
  // así que no se vuelve a contabilizar; un cobro o un pago posterior de algo anterior, sí.
  const corte = manuales.filter((m) => m.apertura).map((m) => m.fecha).sort()[0] || '';
  const add = (fecha, concepto, pares, origen) => { if (fecha <= hoy && fecha >= corte) { const l = lineas(pares); if (l.length) A.push({ fecha, concepto, lineas: l, ...(origen ? { origen } : {}) }); } };
  const sociedad = fiscal.tipo === 'sociedad';
  const c303 = usa303(fiscal);

  for (const f of facturas) {
    const i = importes(f);
    const ivaF = r2(desglose(f).reduce((s, d) => s + d.iva, 0));
    add(f.fecha, `Factura ${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, [[430, i.total], [473, i.irpf], [705, -i.base], [477, -ivaF]], { tipo: 'factura', id: f.id });
    // Cierre de caja: lo cobrado en efectivo entra en caja (570); con tarjeta y otros, en el banco.
    if (f.caja) add(f.fecha, `Cobro del cierre de caja ${numeroFactura(f)}`, [[570, f.caja.efectivo || 0], [572, r2(i.total - (f.caja.efectivo || 0))], [430, -i.total]], { tipo: 'factura', id: f.id });
    // Un asiento por cada cobro, con su importe y su fecha (auditoría P03): los parciales también cuentan, sin esperar a que
    // la factura esté entera cobrada. Las marcadas a mano como cobradas siguen valiendo, enteras en la fecha de su cobro.
    else for (const p of pagosDe(f)) add(String(p.fecha || f.fecha).slice(0, 10), `Cobro de la factura ${numeroFactura(f)}`, [[572, p.importe], [430, -p.importe]], { tipo: 'factura', id: f.id });
  }

  for (const g of gastos) {
    if (g.nomina) continue; // las nóminas, abajo, con su desglose
    const i = importes(g);
    const bien = g.inversion && g.base > 0;
    const coste = c303 ? i.base : r2(i.base + i.iva);
    const iva = c303 ? i.iva : 0;
    const cat = categoriaDe(g);
    const cuenta = bien ? cuentaBien(g) : cat;
    const acreedor = bien ? 523 : ['600', '607'].includes(cat) ? 400 : 410;
    const auto = c303 && origenGasto(g) ? r2(g.base * 0.21) : 0; // IVA autoliquidado (proveedor de fuera)
    const ret = i.irpf;
    const aPagar = r2(coste + iva - ret);
    add(g.fecha, `${g.concepto}${g.proveedor && g.proveedor !== g.concepto ? ` · ${g.proveedor}` : ''}`, [[cuenta, coste], [472, iva + auto], [477, -auto], [4751, -ret], [acreedor, -aPagar]], { tipo: 'gasto', id: g.id });
    if (!g.pendiente) add(g.pagado || g.fecha, `Pago: ${g.concepto}`, [[acreedor, aPagar], [572, -aPagar]], { tipo: 'gasto', id: g.id });
  }

  for (const n of nominas) {
    const c = calculoNomina(n);
    const fecha = finMes(n.mes);
    const nombre = `${n.empleadoNombre || 'empleado'} · ${n.mes}`;
    add(fecha, `Nómina ${nombre}`, [[640, c.bruto], [642, c.ssEmpresa], [4751, -c.irpf], [476, -c.seguros], [465, -c.neto]], { tipo: 'nomina', id: n.id });
    if (n.pagada !== false) add(fechaPagoNomina(n), `Pago de la nómina ${nombre}`, [[465, c.neto], [572, -c.neto]], { tipo: 'nomina', id: n.id });
    add(finMes(hoyMas(fecha, 5).slice(0, 7)), `Seguridad Social de la nómina ${nombre}`, [[476, c.seguros], [572, -c.seguros]], { tipo: 'nomina', id: n.id });
  }

  for (const m of manuales) add(m.fecha, m.concepto, m.lineas.map((l) => [l.cuenta, r2((Number(l.debe) || 0) - (Number(l.haber) || 0))]), { tipo: m.apertura ? 'apertura' : 'manual', id: m.id, ...(m.banco ? { banco: m.banco } : {}) });

  // Saldo (haber − debe) de las cuentas que empiezan por `pref` hasta una fecha.
  const acreedor = (pref, fecha) => r2(A.reduce((s, a) => (a.fecha <= fecha ? s + a.lineas.filter((l) => l.cuenta.startsWith(pref)).reduce((x, l) => x + l.haber - l.debe, 0) : s), 0));
  const anios = new Set([...facturas, ...gastos].map((x) => Number(x.fecha.slice(0, 4))));
  for (const n of nominas) anios.add(Number(n.mes.slice(0, 4)));
  for (const b of bienes(gastos)) for (let y = Number(b.fecha.slice(0, 4)); y <= Number(hoy.slice(0, 4)); y++) anios.add(y);
  const op = { regimen: sociedad ? 'sociedad' : 'autonomo', ivaCoste: !c303 };
  const porBien = Object.fromEntries(bienes(gastos).map((g) => [g.id, g]));
  let compensar = 0;
  for (const y of [...anios].sort()) {
    for (const t of [1, 2, 3, 4]) {
      const fin = `${y}-${FIN_T[t - 1]}`;
      const finAmort = fin > hoy ? hoy : fin;
      // Amortización del trimestre (desde la fecha de corte, si cae dentro).
      const ini = `${y}-${INI_T[t - 1]}` < corte ? corte : `${y}-${INI_T[t - 1]}`;
      const am = ini > finAmort ? [] : Object.values(porBien).map((g) => ({ g, cuota: cuotaEntre(g, ini, finAmort, op) })).filter((x) => x.cuota > 0);
      const mat = r2(am.filter((x) => !intangible(x.g)).reduce((s, x) => s + x.cuota, 0));
      const inm = r2(am.filter((x) => intangible(x.g)).reduce((s, x) => s + x.cuota, 0));
      add(finAmort, `Amortización del ${t}T ${y}`, [[681, mat], [281, -mat], [680, inm], [280, -inm]], { tipo: 'amortizacion' });

      if (fin > hoy || fin < corte) continue;
      const presentado = pagos130[y]?.[t] !== undefined && pagos130[y]?.[t] !== null;
      const presentado303 = hecho303(pres303, pagos130, y, t);
      // Liquidación del IVA (303): lo repercutido contra lo soportado que haya en las cuentas (lo de la apertura incluido);
      // la diferencia, a pagar o a compensar.
      if (c303) {
        const rep = acreedor('477', fin), sop = -acreedor('472', fin);
        const res = r2(rep - sop);
        const usado = res > 0 ? Math.min(compensar, res) : 0;
        compensar = r2(compensar - usado + (res < 0 ? -res : 0));
        add(fin, `Liquidación del IVA (303) del ${t}T ${y}`, [[477, rep], [472, -sop], [4700, res < 0 ? -res : -usado], [4750, -(res > 0 ? r2(res - usado) : 0)]], { tipo: 'impuesto' });
        if (presentado303 && res - usado > 0) add(plazoT(y, t), `Pago del IVA (303) del ${t}T ${y}`, [[4750, r2(res - usado)], [572, -r2(res - usado)]], { tipo: 'impuesto' });
      }
      // Retenciones practicadas (111 y 115): lo pendiente a final del trimestre se paga en su plazo, si se presentó.
      const ret = r2(modelo115(gastos, y, t).retenciones + retencionesProfesionales(gastos, y, t).retenciones + modelo111(nominas, y, t).retenciones);
      if (presentado && ret > 0) add(plazoT(y, t, 20), `Pago de retenciones (111 y 115) del ${t}T ${y}`, [[4751, ret], [572, -ret]], { tipo: 'impuesto' });
    }
  }

  // Pagos a cuenta: 130 (autónomos) y 202 (sociedades).
  if (usa130(fiscal)) for (const [y, pagos] of Object.entries(pagos130)) for (const [t, v] of Object.entries(pagos || {})) {
    if (Number(v) > 0) add(plazoT(Number(y), Number(t)), `Pago fraccionado del IRPF (130) del ${t}T ${y}`, [[473, Number(v)], [572, -Number(v)]], { tipo: 'impuesto' });
  }
  if (sociedad) for (const [y, pagos] of Object.entries(pagos202)) for (const [p, v] of Object.entries(pagos || {})) {
    if (Number(v) > 0) add(`${y}-${{ 1: '04', 2: '10', 3: '12' }[p]}-20`, `Pago fraccionado del Impuesto sobre Sociedades (202) ${p}P ${y}`, [[473, Number(v)], [572, -Number(v)]], { tipo: 'impuesto' });
  }

  // Cierre de cada año ya terminado: impuesto (sociedades), retenciones al titular (autónomos), regularización y,
  // el 1 de enero siguiente, el resultado a remanente (o a resultados negativos).
  for (const y of [...anios].sort()) {
    const fin = `${y}-12-31`;
    if (fin >= hoy) continue;
    const saldoDe = (pref, lista) => r2(lista.reduce((s, a) => s + a.lineas.filter((l) => l.cuenta.startsWith(pref)).reduce((x, l) => x + l.debe - l.haber, 0), 0));
    // Existencias: la cuenta 300 pasa a valer lo que hay en el almacén a 31 de diciembre (coste medio); la diferencia,
    // a variación de existencias (610), que suma o resta en aprovisionamientos.
    if (productos.some((p) => !p.servicio)) {
      const valor = valorInventario({ productos, facturas, gastos, ajustes, albaranes }, fin);
      const dif = r2(valor - saldoDe('300', A.filter((a) => a.fecha <= fin)));
      add(fin, `Variación de existencias de ${y}`, [[300, dif], [610, -dif]], { tipo: 'cierre' });
    }
    if (sociedad) {
      // La cuota del borrador del Impuesto sobre Sociedades (la misma que en Impuestos).
      const impuesto = borradorSociedades(facturas, gastos, y, { ivaCoste: !c303, productos, ajustes, albaranes, manuales }).cuota;
      const hasta = A.filter((a) => a.fecha <= fin);
      const retenido = Math.max(0, saldoDe('473', hasta));
      add(fin, `Impuesto sobre Sociedades ${y}`, [[630, impuesto], [473, -retenido], [4752, -(impuesto - retenido)]], { tipo: 'cierre' });
      // Con la cuota del 200 ya apuntada en Impuestos, se da por pagado en su plazo (del 1 al 25 de julio).
      const aPagar = r2(impuesto - retenido);
      if (cuotaIS[y] !== undefined && cuotaIS[y] !== null && aPagar > 0) add(`${y + 1}-07-25`, `Pago del Impuesto sobre Sociedades ${y}`, [[4752, aPagar], [572, -aPagar]], { tipo: 'impuesto' });
    } else {
      const hasta = A.filter((a) => a.fecha <= fin);
      const r = saldoDe('473', hasta);
      add(fin, `Retenciones y pagos a cuenta de ${y}, al titular`, [[550, r], [473, -r]], { tipo: 'cierre' });
    }
    const cierreAnio = A.filter((a) => a.fecha.slice(0, 4) === String(y));
    const saldos = {};
    for (const a of cierreAnio) for (const l of a.lineas) if (/^[67]/.test(l.cuenta)) saldos[l.cuenta] = r2((saldos[l.cuenta] || 0) + l.debe - l.haber);
    const resultado = r2(-Object.values(saldos).reduce((s, v) => s + v, 0));
    add(fin, `Regularización de ${y}`, [...Object.entries(saldos).map(([c, v]) => [c, -v]), [129, -resultado]], { tipo: 'regularizacion' });
    // Aplicación del resultado: en sociedades, primero el 10 % a reserva legal (hasta el 20 % del capital) y compensar
    // pérdidas de años anteriores; el resto, a remanente. Las pérdidas, a resultados negativos.
    const hasta = A.filter((a) => a.fecha <= fin);
    const capital = sociedad ? -saldoDe('10', hasta) : 0;
    const legal = sociedad && resultado > 0 ? r2(Math.min(resultado * 0.1, Math.max(0, capital * 0.2 + saldoDe('112', hasta)))) : 0;
    const compensar = resultado > 0 ? r2(Math.min(resultado - legal, Math.max(0, saldoDe('121', hasta)))) : 0;
    add(`${y + 1}-01-01`, `Aplicación del resultado de ${y}`, [[129, resultado], [112, -legal], [121, -compensar], [resultado >= 0 ? 120 : 121, -(resultado >= 0 ? r2(resultado - legal - compensar) : resultado)]], { tipo: 'cierre' });
  }

  // Orden: por fecha; el mismo día, primero la apertura y lo último el cierre.
  const ORDEN = { apertura: 0, cierre: 3, regularizacion: 4 };
  return A.sort((a, b) => a.fecha.localeCompare(b.fecha) || (ORDEN[a.origen?.tipo] ?? 1) - (ORDEN[b.origen?.tipo] ?? 1));
}

// Libro diario de un año: los asientos numerados.
export function diario(asientos, anio) {
  return asientos.filter((a) => a.fecha.startsWith(`${anio}-`)).map((a, i) => ({ ...a, n: i + 1 }));
}

// Saldo (debe − haber) de cada cuenta en una lista de asientos.
function saldos(lista) {
  const m = {};
  for (const a of lista) for (const l of a.lineas) {
    const x = m[l.cuenta] || (m[l.cuenta] = { cuenta: l.cuenta, debe: 0, haber: 0 });
    x.debe = r2(x.debe + l.debe); x.haber = r2(x.haber + l.haber);
  }
  return m;
}

// Sumas y saldos de un año: las cuentas de balance (grupos 1-5) con su saldo inicial; las de gastos e ingresos, solo el año
// (sin la regularización, que las deja a cero).
export function sumasYSaldos(asientos, anio, hasta = `${anio}-12-31`) {
  const previos = saldos(asientos.filter((a) => a.fecha < `${anio}-01-01`));
  const delAnio = saldos(asientos.filter((a) => a.fecha.startsWith(`${anio}-`) && a.fecha <= hasta && a.origen?.tipo !== 'regularizacion'));
  const cuentas = [...new Set([...Object.keys(previos).filter((c) => /^[1-5]/.test(c)), ...Object.keys(delAnio)])].sort();
  const filas = cuentas.map((c) => {
    const p = /^[1-5]/.test(c) && previos[c] ? r2(previos[c].debe - previos[c].haber) : 0;
    const d = delAnio[c] || { debe: 0, haber: 0 };
    return { cuenta: c, nombre: nombreCuenta(c), inicial: p, debe: d.debe, haber: d.haber, saldo: r2(p + d.debe - d.haber) };
  }).filter((x) => x.inicial || x.debe || x.haber);
  const total = (k) => r2(filas.reduce((s, x) => s + x[k], 0));
  return { filas, debe: total('debe'), haber: total('haber') };
}

// Libro mayor de una cuenta (y sus subcuentas) en un año, con el saldo después de cada apunte.
export function mayor(asientos, cuenta, anio) {
  const es = (l) => l.cuenta.startsWith(String(cuenta));
  const balance = /^[1-5]/.test(String(cuenta));
  let saldo = balance ? r2(asientos.filter((a) => a.fecha < `${anio}-01-01`).reduce((s, a) => s + a.lineas.filter(es).reduce((x, l) => x + l.debe - l.haber, 0), 0)) : 0;
  const inicial = saldo;
  const movs = [];
  for (const a of diario(asientos, anio)) for (const l of a.lineas.filter(es)) {
    saldo = r2(saldo + l.debe - l.haber);
    movs.push({ n: a.n, fecha: a.fecha, concepto: a.concepto, cuenta: l.cuenta, debe: l.debe, haber: l.haber, saldo, origen: a.origen });
  }
  return { cuenta: String(cuenta), nombre: nombreCuenta(cuenta), inicial, movs, final: saldo };
}

// Cuenta de pérdidas y ganancias (modelo abreviado) entre dos fechas, a partir de los grupos 6 y 7.
export const PARTIDAS = [
  { id: 'cifra', nombre: '1. Importe neto de la cifra de negocios', pref: ['70'] },
  { id: 'otrosIngresos', nombre: '5. Otros ingresos de explotación', pref: ['74', '75'] },
  { id: 'aprovisionamientos', nombre: '4. Aprovisionamientos', pref: ['60', '61'] },
  { id: 'personal', nombre: '6. Gastos de personal', pref: ['64'] },
  { id: 'explotacion', nombre: '7. Otros gastos de explotación', pref: ['62', '631', '634', '636', '639', '65', '69'] },
  { id: 'amortizacion', nombre: '8. Amortización del inmovilizado', pref: ['68'] },
  { id: 'excepcionales', nombre: '12. Otros resultados', pref: ['67', '77'] },
  { id: 'ingresosFin', nombre: '13. Ingresos financieros', pref: ['76'] },
  { id: 'financieros', nombre: '14. Gastos financieros', pref: ['66'] },
  { id: 'impuesto', nombre: '18. Impuestos sobre beneficios', pref: ['630', '633', '638'] },
];
const partidaDe = (c) => {
  let mejor = null, largo = 0;
  for (const p of PARTIDAS) for (const x of p.pref) if (c.startsWith(x) && x.length > largo) { mejor = p.id; largo = x.length; }
  return mejor || (c.startsWith('7') ? 'otrosIngresos' : 'explotacion');
};

export function pygContable(asientos, { desde, hasta }) {
  const m = saldos(asientos.filter((a) => a.fecha >= desde && a.fecha <= hasta && a.origen?.tipo !== 'regularizacion'));
  const partidas = PARTIDAS.map((p) => {
    const detalle = Object.values(m).filter((x) => /^[67]/.test(x.cuenta) && partidaDe(x.cuenta) === p.id)
      .map((x) => ({ id: x.cuenta, nombre: `${x.cuenta} · ${nombreCuenta(x.cuenta)}`, importe: r2(x.haber - x.debe) }))
      .filter((x) => x.importe).sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe));
    return { ...p, importe: r2(detalle.reduce((s, x) => s + x.importe, 0)), detalle };
  });
  const v = (id) => partidas.find((p) => p.id === id).importe;
  const explotacion = r2(['cifra', 'otrosIngresos', 'aprovisionamientos', 'personal', 'explotacion', 'amortizacion', 'excepcionales'].reduce((s, id) => s + v(id), 0));
  const financiero = r2(v('ingresosFin') + v('financieros'));
  const antes = r2(explotacion + financiero);
  return { partidas, explotacion, financiero, antes, impuesto: v('impuesto'), resultado: r2(antes + v('impuesto')), margen: v('cifra') ? r2((antes / v('cifra')) * 100) : 0 };
}

// Balance de situación a una fecha (modelo abreviado). Las cuentas de los grupos 4 y 5 van al activo o al pasivo según
// su saldo; el resultado del año aún abierto, en el patrimonio neto. Cuadra siempre: es la suma de asientos que cuadran.
const MASAS = [
  { lado: 'activo', id: 'anc', nombre: 'A) Activo no corriente' },
  { lado: 'activo', id: 'ac', nombre: 'B) Activo corriente' },
  { lado: 'pasivo', id: 'pn', nombre: 'A) Patrimonio neto' },
  { lado: 'pasivo', id: 'pnc', nombre: 'B) Pasivo no corriente' },
  { lado: 'pasivo', id: 'pc', nombre: 'C) Pasivo corriente' },
];
function masaDe(c, saldo, sociedad) {
  if (/^2/.test(c)) return 'anc';
  if (/^1[0-3]/.test(c) || (!sociedad && c.startsWith('55') && c !== '551')) return 'pn';
  if (/^1[4-9]/.test(c)) return 'pnc';
  if (/^3/.test(c)) return 'ac';
  if (/^(52|40|41|465|475|476|477)/.test(c) && saldo <= 0) return 'pc';
  return saldo >= 0 ? 'ac' : 'pc';
}
export function balanceContable(asientos, fecha, { sociedad = false } = {}) {
  const m = saldos(asientos.filter((a) => a.fecha <= fecha));
  const masas = Object.fromEntries(MASAS.map((x) => [x.id, { ...x, detalle: [], importe: 0 }]));
  let resultado = 0;
  for (const x of Object.values(m)) {
    const s = r2(x.debe - x.haber);
    if (!s) continue;
    if (/^[67]/.test(x.cuenta)) { resultado = r2(resultado - s); continue; }
    const masa = masas[masaDe(x.cuenta, s, sociedad)];
    const importe = masa.lado === 'activo' ? s : -s;
    masa.detalle.push({ id: x.cuenta, nombre: `${x.cuenta} · ${nombreCuenta(x.cuenta)}`, importe });
  }
  if (resultado) masas.pn.detalle.push({ id: '129-año', nombre: 'Resultado del ejercicio (en curso)', importe: resultado });
  for (const x of Object.values(masas)) { x.detalle.sort((a, b) => a.id.localeCompare(b.id)); x.importe = r2(x.detalle.reduce((s, d) => s + d.importe, 0)); }
  const lado = (l) => MASAS.filter((x) => x.lado === l).map((x) => masas[x.id]);
  const total = (l) => r2(lado(l).reduce((s, x) => s + x.importe, 0));
  return { fecha, activo: lado('activo'), pasivo: lado('pasivo'), total: total('activo'), totalPasivo: total('pasivo') };
}

// Un asiento apuntado a mano: líneas válidas y que cuadren.
export function limpiarAsiento(b) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return { error: 'Fecha no válida' };
  const concepto = String(b.concepto || '').trim().slice(0, 140);
  if (!concepto) return { error: 'Falta el concepto' };
  const ls = (Array.isArray(b.lineas) ? b.lineas : []).map((l) => ({ cuenta: String(l.cuenta || '').trim(), debe: r2(parseImporte(l.debe || 0) || 0), haber: r2(parseImporte(l.haber || 0) || 0) }))
    .filter((l) => l.cuenta || l.debe || l.haber);
  if (ls.length < 2) return { error: 'Un asiento necesita al menos dos líneas' };
  const mala = ls.find((l) => !cuentaValida(l.cuenta));
  if (mala) return { error: `La cuenta «${mala.cuenta}» no es válida (de 3 a 12 cifras, empezando por 1 a 7)` };
  if (ls.some((l) => (l.debe > 0) === (l.haber > 0))) return { error: 'Cada línea va al debe o al haber, no a los dos' };
  const d = r2(ls.reduce((s, l) => s + l.debe, 0)), h = r2(ls.reduce((s, l) => s + l.haber, 0));
  if (d !== h) return { error: `No cuadra: debe ${d.toFixed(2)} y haber ${h.toFixed(2)}` };
  return { fecha: b.fecha, concepto, lineas: ls };
}

// Asiento de apertura a partir de lo que se sabe al empezar: banco, capital y préstamos. Lo que falta para cuadrar va a
// remanente (o a resultados negativos).
export function asientoApertura({ fecha, banco = 0, capital = 0, largo = 0, corto = 0 }, sociedad) {
  const n = (v) => r2(parseImporte(v || 0) || 0);
  const resto = r2(n(banco) - n(capital) - n(largo) - n(corto));
  return {
    fecha, concepto: 'Asiento de apertura', apertura: true,
    lineas: lineas([[572, n(banco)], [sociedad ? 100 : 102, -n(capital)], [170, -n(largo)], [520, -n(corto)], [resto >= 0 ? 120 : 121, -resto]]),
  };
}

export { valorBien };

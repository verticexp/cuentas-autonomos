// Asiento de personal a partir del listado de la gestoría: sueldos, retenciones de IRPF, Seguridad Social del trabajador
// y de la empresa y el resto de gastos de personal. Se pide cada importe y Netto monta el asiento; opcionalmente, los
// asientos de pago (líquido, Seguridad Social e IRPF), cada uno con su fecha.
// Devengo: debe 640 + 641/643-649 + 642 · haber 4751 (IRPF) + 476 (SS trabajador + empresa) + 465 (líquido).
import { r2 } from './redondeo.js';
import { parseImporte } from './importe.js';
import { nombreMes } from './nominas.js';

// Resto de cuentas del grupo 64: el sueldo (640) y la Seguridad Social de la empresa (642) tienen su propio campo.
export const CUENTAS_PERSONAL = [
  ['641', 'Indemnizaciones'],
  ['643', 'Retribuciones a largo plazo (aportación definida)'],
  ['644', 'Retribuciones a largo plazo (prestación definida)'],
  ['645', 'Retribuciones mediante instrumentos de patrimonio'],
  ['649', 'Otros gastos sociales'],
];
export const NOMBRES_PERSONAL = {
  640: 'Sueldos y salarios', 642: 'Seguridad Social a cargo de la empresa', 4751: 'Hacienda Pública, acreedora por retenciones practicadas',
  476: 'Organismos de la Seguridad Social, acreedores', 465: 'Remuneraciones pendientes de pago', 572: 'Bancos',
  ...Object.fromEntries(CUENTAS_PERSONAL),
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const importe = (v) => { const x = parseImporte(v || 0); return Number.isFinite(x) ? r2(x) : NaN; };
// Importes con signo (positivo al debe, negativo al haber) a líneas; las que valen cero se quitan.
const lineas = (pares) => pares.filter(([, v]) => r2(v)).map(([cuenta, v]) => ({ cuenta, debe: v > 0 ? r2(v) : 0, haber: v < 0 ? r2(-v) : 0 }));

// Cifras del asiento a partir de los campos del formulario (también para el resumen en vivo).
export function totalesPersonal(b) {
  const sueldos = importe(b.sueldos) || 0, ssEmpresa = importe(b.ssEmpresa) || 0, irpf = importe(b.irpf) || 0, ssTrabajador = importe(b.ssTrabajador) || 0;
  const otros = (Array.isArray(b.otros) ? b.otros : []).map((o) => ({ cuenta: String(o.cuenta || '').trim(), importe: importe(o.importe) || 0 })).filter((o) => o.importe);
  const sumaOtros = r2(otros.reduce((s, o) => s + o.importe, 0));
  const ss = r2(ssTrabajador + ssEmpresa);
  return { sueldos, ssEmpresa, irpf, ssTrabajador, otros, sumaOtros, ss, liquido: r2(sueldos + sumaOtros - irpf - ssTrabajador), gasto: r2(sueldos + sumaOtros + ssEmpresa) };
}

// Los asientos de un periodo de nóminas: el devengo y, si se pone la fecha, los pagos. Devuelve { asientos } o { error }.
export function asientosPersonal(b) {
  if (!FECHA.test(b.fecha || '')) return { error: 'Fecha no válida' };
  for (const k of ['sueldos', 'ssEmpresa', 'irpf', 'ssTrabajador']) if (Number.isNaN(importe(b[k]))) return { error: 'Algún importe no es válido' };
  const t = totalesPersonal(b);
  if (t.sueldos <= 0) return { error: 'Pon los sueldos y salarios (el bruto)' };
  for (const o of t.otros) if (!/^64[13-9]\d{0,9}$/.test(o.cuenta)) return { error: `La cuenta «${o.cuenta}» no es de gastos de personal (641, 643 a 649)` };
  if (t.liquido < 0) return { error: 'Las retenciones y la Seguridad Social del trabajador superan lo que se le paga' };
  const nombre = String(b.concepto || '').trim().slice(0, 100) || `Nóminas de ${nombreMes(b.fecha.slice(0, 7))}`;
  const otros = Object.values(t.otros.reduce((m, o) => ({ ...m, [o.cuenta]: { cuenta: o.cuenta, importe: r2((m[o.cuenta]?.importe || 0) + o.importe) } }), {}));
  const asientos = [{
    fecha: b.fecha, concepto: nombre,
    lineas: lineas([['640', t.sueldos], ...otros.map((o) => [o.cuenta, o.importe]), ['642', t.ssEmpresa], ['4751', -t.irpf], ['476', -t.ss], ['465', -t.liquido]]),
  }];
  const pago = (campo, concepto, cuenta, v) => {
    if (!b[campo] || !v) return null;
    if (!FECHA.test(b[campo])) return { error: 'Fecha de pago no válida' };
    return { fecha: b[campo], concepto: `${concepto} · ${nombre}`.slice(0, 140), lineas: lineas([[cuenta, v], ['572', -v]]) };
  };
  for (const p of [
    pago('pagoLiquido', 'Pago de las nóminas', '465', t.liquido),
    pago('pagoSS', 'Pago de la Seguridad Social', '476', t.ss),
    pago('pagoIRPF', 'Pago de las retenciones de IRPF (111)', '4751', t.irpf),
  ]) {
    if (p?.error) return p;
    if (p) asientos.push(p);
  }
  return { asientos };
}

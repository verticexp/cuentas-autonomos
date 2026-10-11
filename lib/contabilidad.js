// Contabilidad de la pantalla Contabilidad y su Excel: todo sale de los asientos (lib/asientos.js), que Netto genera solo
// a partir de facturas, gastos, nóminas, amortizaciones e impuestos, más los apuntados a mano.
import { r2 } from './calculos.js';
import { libroBienes } from './amortizaciones.js';
import { balanceContable, diario, generarAsientos, mayor, nombreCuenta, pygContable, sumasYSaldos } from './asientos.js';
import { xlsx } from './xlsx.js';
import { fechaCorta } from './formato.js';
import { usa303 } from './empresa.js';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from './categorias.js';

export { CATEGORIAS, categoria, categoriaDe, pareceBien };

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));

// Periodo: el año entero o un trimestre (1-4).
export function periodo(anio, p = '') {
  if (/^[1-4]$/.test(String(p))) {
    const t = Number(p);
    const fin = new Date(Date.UTC(anio, t * 3, 0)).toISOString().slice(0, 10);
    return { desde: `${anio}-${String(t * 3 - 2).padStart(2, '0')}-01`, hasta: fin, nombre: `${t}T ${anio}` };
  }
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, nombre: String(anio) };
}

// Todo lo de la pantalla Contabilidad para un año y, si se pide, un trimestre (p: 1-4) y una cuenta (para el mayor).
// datos: { facturas, gastos, nominas, manuales, saldo, fiscal, pagos130, pagos202, cuotaIS }
export function informe(datos, anio, p, hoy, { cuenta } = {}) {
  const { facturas = [], gastos = [], saldo = null, fiscal = {} } = datos;
  const sociedad = fiscal.tipo === 'sociedad';
  const regimen = sociedad ? 'sociedad' : 'autonomo';
  const asientos = generarAsientos(datos, hoy);
  const per = periodo(anio, p);
  const actual = pygContable(asientos, per);
  // Con el periodo aún abierto, el anterior solo hasta el mismo día (si no, se compara medio año con uno entero).
  const perAnt = periodo(anio - 1, p);
  const parcial = per.hasta > hoy && per.desde <= hoy;
  if (parcial) perAnt.hasta = `${anio - 1}-${hoy.slice(5)}`;
  const conAnterior = asientos.some((a) => a.fecha.startsWith(`${anio - 1}-`) && a.origen?.tipo !== 'apertura');
  const anterior = conAnterior ? pygContable(asientos, perAnt) : null;
  const fecha = anio < Number(hoy.slice(0, 4)) ? `${anio}-12-31` : hoy;
  const bal = balanceContable(asientos, fecha, { sociedad });
  // El banco de la contabilidad frente al saldo real (si se sabe y es de esa fecha): la diferencia es lo que falta apuntar.
  const banco = saldo && String(saldo.fecha || '').slice(0, 10) <= fecha && fecha === hoy
    ? { real: r2(Number(saldo.importe) || 0), contable: mayor(asientos, '57', anio).final } : null;
  if (banco) banco.diferencia = r2(banco.real - banco.contable);
  return {
    regimen, per, actual, anterior, parcial, fecha, bal, banco, asientos,
    libro: libroBienes(gastos, anio, { regimen, ivaCoste: !usa303(fiscal) }),
    diario: diario(asientos, anio),
    sumas: sumasYSaldos(asientos, anio, fecha),
    mayor: cuenta ? mayor(asientos, cuenta, anio) : null,
    apertura: (datos.manuales || []).find((m) => m.apertura) || null,
    nombre: { actual: per.nombre, anterior: conAnterior ? perAnt.nombre : '' },
    sinDatos: !facturas.length && !gastos.length,
  };
}

// Excel: pérdidas y ganancias (con el año anterior al lado), balance, libro diario, sumas y saldos y bienes de inversión.
export function contabilidadXlsx({ empresa, d }) {
  const { actual, anterior, nombre, libro, bal } = d;
  const filasPyg = [];
  const fila = (n, a, b, negrita) => filasPyg.push(negrita ? [{ b: n }, { b: a }, b === undefined ? '' : { b }] : [n, a, b === undefined ? '' : b]);
  for (const p of actual.partidas) {
    const a = anterior?.partidas.find((x) => x.id === p.id);
    if (p.id === 'impuesto') fila('C) Resultado antes de impuestos', actual.antes, anterior?.antes, true);
    if (p.importe || a?.importe || p.id === 'cifra') {
      fila(p.nombre, p.importe, a?.importe, true);
      for (const x of p.detalle) fila(`    ${x.nombre}`, x.importe);
    }
    if (p.id === 'excepcionales') fila('A) Resultado de explotación', actual.explotacion, anterior?.explotacion, true);
    if (p.id === 'financieros') fila('B) Resultado financiero', actual.financiero, anterior?.financiero, true);
  }
  fila('D) Resultado del ejercicio', actual.resultado, anterior?.resultado, true);
  const lado = (l) => l.flatMap((x) => [[{ b: x.nombre }, { b: x.importe }], ...x.detalle.map((y) => [`    ${y.nombre}`, y.importe])]);
  return xlsx([
    { nombre: 'Pérdidas y ganancias', anchos: [56, 16, 16], filas: [[`${empresa} · ${nombre.actual}`, nombre.actual, nombre.anterior || ''], ...filasPyg] },
    { nombre: 'Balance', anchos: [56, 16], filas: [[`Balance a ${fechaCorta(bal.fecha)}`, ''], [{ b: 'ACTIVO' }, { b: bal.total }], ...lado(bal.activo), [], [{ b: 'PATRIMONIO NETO Y PASIVO' }, { b: bal.totalPasivo }], ...lado(bal.pasivo)] },
    { nombre: 'Libro diario', anchos: [7, 11, 46, 10, 40, 14, 14], filas: [
      ['Asiento', 'Fecha', 'Concepto', 'Cuenta', 'Nombre de la cuenta', 'Debe', 'Haber'],
      ...d.diario.flatMap((a) => a.lineas.map((l, i) => [i ? '' : { n: a.n }, i ? '' : fechaCorta(a.fecha), i ? '' : a.concepto, l.cuenta, nombreCuenta(l.cuenta), l.debe || '', l.haber || ''])),
      ['', '', 'Total', '', '', { b: suma(d.diario, (a) => suma(a.lineas, (l) => l.debe)) }, { b: suma(d.diario, (a) => suma(a.lineas, (l) => l.haber)) }],
    ] },
    { nombre: 'Sumas y saldos', anchos: [10, 46, 14, 14, 14, 14], filas: [
      ['Cuenta', 'Nombre', 'Saldo inicial', 'Debe', 'Haber', 'Saldo'],
      ...d.sumas.filas.map((x) => [x.cuenta, x.nombre, x.inicial, x.debe, x.haber, x.saldo]),
      ['', 'Total', '', { b: d.sumas.debe }, { b: d.sumas.haber }, ''],
    ] },
    { nombre: 'Bienes de inversión', anchos: [11, 34, 30, 12, 8, 12, 12, 12, 11], filas: [
      ['Fecha', 'Bien', 'Tipo', 'Valor', '% anual', 'Amortización del año', 'Acumulada', 'Pendiente', 'Amortizado el'],
      ...libro.map((b) => [fechaCorta(b.fecha), b.concepto, b.tipo.nombre, b.valor, { n: b.coef }, b.anio, b.acumulada, b.pendiente, fechaCorta(b.fin)]),
      ['Total', '', '', { b: suma(libro, (b) => b.valor) }, '', { b: suma(libro, (b) => b.anio) }, { b: suma(libro, (b) => b.acumulada) }, { b: suma(libro, (b) => b.pendiente) }],
    ] },
  ]);
}

export { libroBienes };

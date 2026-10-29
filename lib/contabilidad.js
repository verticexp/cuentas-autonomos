// Contabilidad de la pantalla Contabilidad y su Excel: todo sale de los asientos (lib/asientos.js), que Fisquo genera solo
// a partir de facturas, gastos, nóminas, amortizaciones e impuestos, más los apuntados a mano.
import { importes, pagosDe, prorrataBienes, r2 } from './calculos.js';
import { libroBienes } from './amortizaciones.js';
import { asientosCierreApertura, balanceContable, generarAsientos, mayor, nombreCuenta, pygContable, sumasYSaldos } from './asientos.js';
import { cobradoSinBanco, enlacesPorFactura, tieneEnlaceAntiguo } from './banco.js';
import { diarioA3, diarioContaplus, diarioContasol } from './exportarContable.js';
import { xlsx } from './xlsx.js';
import { fechaCorta } from './formato.js';
import { reccDe, usa303 } from './empresa.js';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from './categorias.js';

export { CATEGORIAS, categoria, categoriaDe, pareceBien };

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));

// El saldo bancario se contrasta en su fecha, nunca con apuntes posteriores.
export function cuadreBanco({ asientos = [], saldo, movimientos = [], facturas = [], gastos = [], conectado = false, hasta = '9999-12-31' }) {
  if (!conectado && !saldo?.banco && !movimientos.length) return null;
  const fecha = String(saldo?.fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(Number(saldo?.importe))) return { sinSaldo: true };
  if (fecha > hasta) return null;
  const apuntes = asientos.filter((a) => a.fecha <= fecha && !['cierre-contable', 'apertura-contable'].includes(a.origen?.tipo));
  const cuenta = (pref) => suma(apuntes, (a) => suma(a.lineas.filter((l) => String(l.cuenta).startsWith(pref)), (l) => l.debe - l.haber));
  const movs = movimientos.filter((m) => m.fecha && m.fecha <= fecha);
  const pendientes = movs.filter((m) => !m.estado || m.estado === 'pendiente');
  const enlaces = enlacesPorFactura(movs);
  const gastosEnlazados = new Set(movs.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'gasto').map((m) => String(m.enlace.id)));
  const futuros = new Set(movimientos.filter((m) => m.fecha > fecha).map((m) => m.id));
  const cobros = facturas.filter((f) => !f.caja && !tieneEnlaceAntiguo(f, enlaces)).map((f) => {
    const pagos = pagosDe(f).filter((p) => String(p.fecha || f.fecha).slice(0, 10) <= fecha).map((p) => ({ ...p,
      metodo: p.metodo === 'banco' && !p.banco ? 'manual' : p.metodo || 'manual',
      ...(futuros.has(p.liquidado) ? { liquidado: undefined } : {}),
    }));
    return cobradoSinBanco({ ...f, cobrada: false, pagos, cobro: { ...f.cobro, ...(futuros.has(f.cobro?.liquidado) ? { liquidado: undefined } : {}) } });
  });
  const pagos = gastos.filter((g) => !g.nomina && !g.pendiente && !g.banco && !g.tpv && !gastosEnlazados.has(String(g.id)) && String(g.pagado || g.fecha).slice(0, 10) <= fecha);
  const contable = cuenta('572'), real = r2(Number(saldo.importe));
  const pendiente = suma(pendientes, (m) => Number(m.importe) || 0);
  // La tarjeta de los cierres de caja entra en la 572 el día del cierre: hasta que su ingreso se cuadra (o si se cuadró
  // después de la fecha del saldo), el banco aún no la tiene.
  const tarjetas = facturas.filter((f) => f.caja?.tarjeta > 0 && f.fecha <= fecha && (!f.caja.liquidacion || f.caja.liquidacion.fecha > fecha || futuros.has(f.caja.liquidacion.mov)));
  const cobrosSinBanco = r2(suma(cobros, (n) => n) + suma(tarjetas, (f) => f.caja.tarjeta)), pagosSinBanco = suma(pagos, (g) => importes(g).total);
  const diferencia = r2(real - contable), probable = r2(pendiente - cobrosSinBanco + pagosSinBanco);
  return { fecha, real, contable, caja: cuenta('570'), diferencia,
    pendientes: { cantidad: pendientes.length, importe: pendiente },
    cobrosSinBanco, pagosSinBanco, probable, sinExplicar: r2(diferencia - probable) };
}

// Los formatos antiguos omiten «regularizacion» y ordenan «cierre» al final.
// La adaptación solo existe durante la serialización del diario completo.
export function exportarDiario(asientos, { anio, formato, codigo = 1, digitos = 8, fecha }) {
  const lista = asientosCierreApertura(asientos, anio, fecha).map((a) => ({ ...a, origen: { ...a.origen,
    tipo: a.origen?.tipo === 'apertura-contable' ? 'apertura' : ['regularizacion', 'cierre-contable'].includes(a.origen?.tipo) ? 'cierre' : a.origen?.tipo,
  } }));
  if (formato === 'a3') return diarioA3(lista, { anio, empresa: codigo, digitos });
  if (formato === 'contaplus') return diarioContaplus(lista, { anio, digitos });
  if (formato === 'contasol') return diarioContasol(lista, { anio, digitos });
  throw new Error('Formato contable no válido');
}

// Mismo lector y filtrado de nóminas que diarioContable; se añade el cierre solo al exportar.
export async function diarioConCierreDe(u, opciones) {
  const [{ leer }, { fiscalDe }, { gastosQueVe, nominasQueVe }, { nombreDiario }] = await Promise.all([
    import('./redis.js'), import('./empresa.js'), import('./nominas.js'), import('./diarioContable.js'),
  ]);
  const [facturas, gastosLeidos, nominasLeidas, manuales, productos, ajustes, albaranes, capital] = await Promise.all(
    ['facturas', 'gastos', 'nominas', 'asientos', 'productos', 'stock', 'albaranes', 'capital'].map((tipo) => leer(u, tipo)));
  const gastos = gastosQueVe(u, gastosLeidos), nominas = nominasQueVe(u, nominasLeidas);
  if (!facturas || !gastos) return { error: 'No se han podido cargar los datos contables' };
  try {
    const asientos = generarAsientos({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], fiscal: fiscalDe(u),
      ...Object.fromEntries(['pagos130', 'pres303', 'pres369', 'pres123', 'pres111', 'pres115', 'pagadosHacienda', 'prorrata', 'pagos202', 'cuotaIS', 'binsPrevias', 'fondosPropios'].map((k) => [k, u[k] || {}])),
      productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [], capital: capital || [],
    }, opciones.fecha);
    return { nombre: nombreDiario(opciones.formato, opciones.anio), contenido: exportarDiario(asientos, opciones) };
  } catch (e) { return { error: e.message }; }
}

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
  const banco = cuadreBanco({ asientos, saldo, facturas, gastos, conectado: datos.bancoConectado, movimientos: datos.movimientos || [], hasta: fecha });
  return {
    regimen, per, actual, anterior, parcial, fecha, bal, banco, asientos,
    libro: libroBienes(gastos, anio, { regimen, ivaCoste: !usa303(fiscal), hasta: fecha, prorrata: usa303(fiscal) ? prorrataBienes(facturas, gastos, { prorrata: datos.prorrata || {}, ...(reccDe(fiscal) ? { recc: reccDe(fiscal) } : {}) }) : undefined }),
    diario: asientosCierreApertura(asientos, anio, hoy),
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

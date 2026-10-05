// Movimientos del banco: leer extractos (Norma 43, CSV o Excel) y emparejar cada cobro con su factura
// y cada pago con su gasto. Solo sugiere: el usuario confirma. Sin dependencias de servidor, para poder probarlo.
import { createHash } from 'node:crypto';
import { importes, leerImporte, numeroFactura, r2 } from './calculos.js';
import { totalDe } from './proveedores.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const txt = (v, n = 140) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// Mismo movimiento → mismo id, para no duplicarlo al subir otra vez el extracto. «n» distingue dos movimientos
// idénticos del mismo día (dos cafés iguales).
export const idMovimiento = (cuenta, m, n = 0) => `${cuenta}-${hash([m.fecha, m.importe.toFixed(2), norm(m.concepto), n].join('|'))}`;
function conIds(cuenta, lista) {
  const vistos = new Map();
  return lista.map((m) => {
    const k = [m.fecha, m.importe.toFixed(2), norm(m.concepto)].join('|');
    const n = vistos.get(k) || 0;
    vistos.set(k, n + 1);
    return { id: idMovimiento(cuenta, m, n), cuenta, ...m };
  });
}

// ---------- Norma 43 (cuaderno 43 de la AEB): registros de 80 caracteres ----------
const fechaN43 = (s) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
const importeN43 = (clave, s) => r2((clave === '1' ? -1 : 1) * (Number(s) / 100));
export const esNorma43 = (texto) => /^11\d{18}\d{12}[12]\d{14}/.test(String(texto).replace(/^\uFEFF/, '').trimStart());

export function leerNorma43(texto) {
  const cuentas = [];
  let c = null, ultimo = null;
  for (const l of String(texto).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tipo = l.slice(0, 2);
    if (tipo === '11') {
      c = { numero: l.slice(2, 20), nombre: txt(l.slice(51, 77), 40), movimientos: [] };
      cuentas.push(c);
    } else if (tipo === '22' && c) {
      ultimo = { fecha: fechaN43(l.slice(10, 16)), importe: importeN43(l.slice(27, 28), l.slice(28, 42)), concepto: txt(`${l.slice(52, 64)} ${l.slice(64, 80)}`), contraparte: '' };
      c.movimientos.push(ultimo);
    } else if (tipo === '23' && ultimo) {
      // Conceptos complementarios: el 01 suele llevar el nombre del ordenante o beneficiario.
      const extra = txt(`${l.slice(4, 42)} ${l.slice(42, 80)}`);
      if (l.slice(2, 4) === '01' && !ultimo.contraparte) ultimo.contraparte = txt(l.slice(4, 42), 80);
      ultimo.concepto = txt(`${extra} ${ultimo.concepto}`);
    } else if (tipo === '33' && c) {
      c.saldo = importeN43(l.slice(58, 59), l.slice(59, 73));
      c.fechaSaldo = c.movimientos.reduce((a, m) => (m.fecha > a ? m.fecha : a), '') || null;
    }
  }
  if (!cuentas.length) return { error: 'No es un fichero Norma 43 válido' };
  return {
    cuentas: cuentas.map((x) => ({ id: `n43-${x.numero}`, nombre: x.nombre || `Cuenta ${x.numero.slice(-4)}`, numero: x.numero, saldo: x.saldo ?? null, fechaSaldo: x.fechaSaldo || null })),
    movimientos: cuentas.flatMap((x) => conIds(`n43-${x.numero}`, x.movimientos.map((m) => ({ ...m, concepto: m.concepto || 'Movimiento' })))),
  };
}

// ---------- CSV o Excel del banco: se reconocen las columnas por su nombre ----------
const COLUMNAS = {
  fecha: ['fecha', 'fecha operacion', 'f operacion', 'fecha de operacion', 'fecha contable', 'fecha movimiento', 'date', 'booking date'],
  valor: ['fecha valor', 'f valor', 'value date'],
  concepto: ['concepto', 'descripcion', 'movimiento', 'detalle', 'concepto ampliado', 'description', 'texto', 'observaciones'],
  contraparte: ['beneficiario', 'ordenante', 'beneficiario ordenante', 'ordenante beneficiario', 'contraparte', 'remitente', 'destinatario'],
  importe: ['importe', 'importe eur', 'cantidad', 'amount', 'importe euros'],
  cargo: ['cargo', 'cargos', 'debe', 'gasto', 'salida', 'debito'],
  abono: ['abono', 'abonos', 'haber', 'ingreso', 'entrada', 'credito'],
  saldo: ['saldo', 'saldo eur', 'disponible', 'balance', 'saldo euros'],
};

export function leerTablaBanco(filas) {
  let mejor = { fila: -1, mapa: {}, n: 0 };
  filas.slice(0, 15).forEach((f, i) => {
    const mapa = {};
    f.forEach((h, c) => { const k = Object.keys(COLUMNAS).find((x) => !(x in mapa) && COLUMNAS[x].includes(norm(h))); if (k) mapa[k] = c; });
    const n = Object.keys(mapa).length;
    if (n > mejor.n) mejor = { fila: i, mapa, n };
  });
  const m = mejor.mapa;
  if (!('fecha' in m || 'valor' in m) || !('importe' in m || 'cargo' in m || 'abono' in m)) return { error: 'No se encuentran las columnas de fecha e importe del extracto' };
  const v = (f, k) => (k in m ? f[m[k]] : undefined);
  const num = (x) => (x === undefined || x === null || String(x).trim() === '' ? null : typeof x === 'number' ? r2(x) : r2(leerImporte(x)));
  const lista = [];
  let errores = 0;
  for (const f of filas.slice(mejor.fila + 1)) {
    const fecha = fechaBanco(v(f, 'fecha') ?? v(f, 'valor'));
    let importe = num(v(f, 'importe'));
    if (importe === null && ('cargo' in m || 'abono' in m)) {
      const cargo = num(v(f, 'cargo')), abono = num(v(f, 'abono'));
      importe = r2((abono || 0) - Math.abs(cargo || 0));
    }
    if (!fecha || !importe || !Number.isFinite(importe)) { if (f.some((x) => String(x ?? '').trim())) errores += 1; continue; }
    const concepto = txt(v(f, 'concepto')) || txt(v(f, 'contraparte')) || 'Movimiento';
    lista.push({ fecha, importe, concepto, contraparte: txt(v(f, 'contraparte'), 80), saldo: num(v(f, 'saldo')) });
  }
  if (!lista.length) return { error: 'El extracto no tiene movimientos' };
  // Saldo: el del movimiento más reciente (si el archivo va de nuevo a antiguo, el primero de ese día; si no, el último).
  let saldo = null, fechaSaldo = null;
  if ('saldo' in m) {
    const descendente = lista[0].fecha >= lista.at(-1).fecha && lista[0].fecha !== lista.at(-1).fecha;
    const fin = lista.reduce((a, x) => (x.fecha > a ? x.fecha : a), '');
    const delDia = lista.filter((x) => x.fecha === fin && x.saldo !== null);
    const s = descendente ? delDia[0] : delDia.at(-1);
    if (s) { saldo = s.saldo; fechaSaldo = fin; }
  }
  return {
    cuentas: [{ id: 'extracto', nombre: 'Extracto subido', saldo, fechaSaldo }],
    movimientos: conIds('extracto', lista.map(({ saldo: _s, ...x }) => x)),
    errores,
  };
}

// Fechas del banco: dd/mm/aaaa (o con guiones o puntos, año de 2 cifras), aaaa-mm-dd o número de serie de Excel.
export function fechaBanco(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let a, mes, d, x;
  if ((x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) [a, mes, d] = [x[1], x[2], x[3]];
  else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s))) [a, mes, d] = [x[3].length === 2 ? `20${x[3]}` : x[3], x[2], x[1]];
  else return null;
  const f = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && new Date(`${f}T12:00:00Z`).toISOString().startsWith(f) ? f : null;
}

// ---------- Emparejar ----------
const VACIAS = new Set(['transferencia', 'transf', 'recibo', 'pago', 'cobro', 'bizum', 'tarjeta', 'compra', 'desde', 'para', 'factura', 'concepto', 'favor', 'cuenta', 'adeudo', 'abono', 'ingreso', 'sepa', 'domiciliacion', 'eventos', 'servicios']);
const palabras = (s) => norm(s).split(' ').filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w));
const compacto = (s) => norm(s).replace(/ /g, '');
const nombreEn = (nombre, texto) => { const t = ` ${norm(texto)} `; return palabras(nombre).some((w) => t.includes(` ${w} `)); };

// Facturas que podría estar cobrando un ingreso, con su puntuación.
function candidatasFactura(m, facturas) {
  const texto = `${m.concepto} ${m.contraparte || ''}`;
  return facturas.filter((f) => !f.cobrada && Math.abs(importes(f).total - m.importe) <= 0.01 && dias(f.fecha, m.fecha) >= -3).map((f) => {
    const num = compacto(numeroFactura(f));
    let p = 50;
    const porNumero = num.length >= 4 && compacto(texto).includes(num);
    const porNombre = nombreEn(f.cliente?.nombre, texto);
    if (porNumero) p += 35;
    if (porNombre) p += 25;
    if (dias(f.fecha, m.fecha) <= 120) p += 5;
    return { tipo: 'factura', id: f.id, puntos: p, porNumero, porNombre };
  });
}

// Gastos que podría estar pagando un cargo.
function candidatosGasto(m, gastos, enlazados) {
  const texto = `${m.concepto} ${m.contraparte || ''}`;
  return gastos.filter((g) => !g.banco && !enlazados.has(g.id) && Math.abs(totalDe(g) + m.importe) <= 0.01 && (g.pendiente ? dias(g.fecha, m.fecha) >= -5 : Math.abs(dias(g.fecha, m.fecha)) <= 60)).map((g) => {
    let p = 50;
    const porNombre = nombreEn(g.proveedor, texto) || nombreEn(g.concepto, texto);
    if (g.pendiente) p += 15;
    if (porNombre) p += 25;
    if (Math.abs(dias(g.fecha, m.fecha)) <= 3) p += 10;
    return { tipo: 'gasto', id: g.id, puntos: p, porNombre };
  });
}

// Para cada movimiento pendiente, la mejor pareja (cada factura o gasto, para un solo movimiento) y si es segura.
// Segura: el importe cuadra y además el número de factura, el cliente o el proveedor aparecen en el concepto.
export function sugerencias(movimientos, facturas, gastos) {
  const enlazados = new Set(movimientos.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'gasto').map((m) => m.enlace.id));
  const pendientes = movimientos.filter((m) => !m.estado || m.estado === 'pendiente');
  const pares = [];
  const todas = new Map();
  for (const m of pendientes) {
    const c = (m.importe > 0 ? candidatasFactura(m, facturas) : candidatosGasto(m, gastos, enlazados)).sort((a, b) => b.puntos - a.puntos);
    todas.set(m.id, c);
    for (const x of c) pares.push({ m: m.id, ...x });
  }
  pares.sort((a, b) => b.puntos - a.puntos);
  const usados = new Set(), out = {};
  for (const p of pares) {
    const k = `${p.tipo}:${p.id}`;
    if (out[p.m] || usados.has(k)) continue;
    // Si hay empate en lo mejor de ese movimiento, no es segura: el usuario elige.
    const empate = todas.get(p.m).filter((x) => x.puntos === p.puntos).length > 1;
    out[p.m] = { tipo: p.tipo, id: p.id, puntos: p.puntos, segura: p.puntos >= 75 && !empate };
    usados.add(k);
  }
  return out;
}

// Para elegir a mano: facturas sin cobrar (para un ingreso) o gastos sin enlazar de fechas cercanas (para un cargo),
// los de importe más parecido primero.
export function opciones(m, facturas, gastos, movimientos = []) {
  if (m.importe > 0) {
    return facturas.filter((f) => !f.cobrada && importes(f).total > 0)
      .sort((a, b) => Math.abs(importes(a).total - m.importe) - Math.abs(importes(b).total - m.importe)).slice(0, 20)
      .map((f) => ({ tipo: 'factura', id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe: importes(f).total, fecha: f.fecha }));
  }
  const enlazados = new Set(movimientos.filter((x) => x.estado === 'emparejado' && x.enlace?.tipo === 'gasto').map((x) => x.enlace.id));
  return gastos.filter((g) => !g.banco && !enlazados.has(g.id) && (g.pendiente || Math.abs(dias(g.fecha, m.fecha)) <= 60))
    .sort((a, b) => Math.abs(totalDe(a) + m.importe) - Math.abs(totalDe(b) + m.importe)).slice(0, 20)
    .map((g) => ({ tipo: 'gasto', id: g.id, texto: `${g.proveedor || g.concepto}${g.pendiente ? ' · sin pagar' : ''}`, importe: totalDe(g), fecha: g.fecha }));
}

// Saldo real: la suma de lo último que se sabe de cada cuenta.
export function saldoTotal(cuentas) {
  const con = cuentas.filter((c) => typeof c.saldo === 'number' && !c.oculta);
  if (!con.length) return null;
  return { importe: r2(con.reduce((s, c) => s + c.saldo, 0)), fecha: con.map((c) => c.fechaSaldo || '').sort().at(-1) || null, banco: true, cuentas: con.length };
}

// Enable Banking → movimiento de la app.
export function deEnableBanking(cuenta, t) {
  const importe = r2((t.credit_debit_indicator === 'DBIT' ? -1 : 1) * Math.abs(Number(t.transaction_amount?.amount) || 0));
  const fecha = t.booking_date || t.value_date || t.transaction_date;
  if (!importe || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null;
  const info = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : t.remittance_information;
  const contraparte = txt((importe > 0 ? t.debtor?.name : t.creditor?.name) || '', 80);
  const concepto = txt(info) || txt(t.bank_transaction_code?.description) || contraparte || 'Movimiento';
  const ref = t.entry_reference || t.transaction_id;
  const m = { fecha, importe, concepto, contraparte };
  return { id: ref ? `${cuenta}-${hash(String(ref))}` : idMovimiento(cuenta, m), cuenta, ...m };
}

// El saldo que se toma de cada cuenta, por orden de preferencia (disponible, dispuesto al cierre…).
export function saldoDeEnableBanking(balances = []) {
  const orden = ['CLAV', 'ITAV', 'CLBD', 'ITBD', 'XPCD', 'OTHR'];
  const b = [...balances].sort((x, y) => (orden.indexOf(x.balance_type) + 99) % 99 - (orden.indexOf(y.balance_type) + 99) % 99)[0];
  const n = Number(b?.balance_amount?.amount);
  return Number.isFinite(n) && b ? r2(n) : null;
}

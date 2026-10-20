// Movimientos del banco: leer extractos (Norma 43, CSV o Excel) y emparejar cada cobro con su factura
// y cada pago con su gasto. Solo sugiere: el usuario confirma. Sin dependencias de servidor, para poder probarlo.
import { createHash } from 'node:crypto';
import { importes, leerImporte, numeroFactura, pagadoDe, pagosDe, r2, saldoDe } from './calculos.js';
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
    // El orden lo dicen los saldos encadenados (fila siguiente = esta ± su importe); si no lo aclaran, las fechas.
    // Así un extracto de un solo día de nuevo a antiguo no se toma por ascendente (auditoría 10-2026).
    let asc = 0, desc = 0;
    for (let i = 0; i + 1 < lista.length; i++) {
      const a = lista[i], b = lista[i + 1];
      if (a.saldo === null || b.saldo === null) continue;
      if (importeExacto(r2(a.saldo + b.importe), b.saldo)) asc += 1;
      if (importeExacto(r2(b.saldo + a.importe), a.saldo)) desc += 1;
    }
    const descendente = desc !== asc ? desc > asc : lista[0].fecha > lista.at(-1).fecha;
    const fin = lista.reduce((a, x) => (x.fecha > a ? x.fecha : a), '');
    const delDia = lista.filter((x) => x.fecha === fin && x.saldo !== null);
    const s = descendente ? delDia[0] : delDia.at(-1);
    if (s) { saldo = s.saldo; fechaSaldo = fin; }
  }
  // El IBAN (o el número de cuenta de 20 cifras) suele ir en las filas de encima de la tabla.
  const iban = filas.slice(0, mejor.fila + 1).flat().map(ibanDe).find(Boolean) || null;
  return {
    cuentas: [{ id: CUENTA_EXTRACTO, nombre: 'Extracto subido', saldo, fechaSaldo, iban }],
    movimientos: conIds(CUENTA_EXTRACTO, lista.map(({ saldo: _s, ...x }) => x)),
    errores,
  };
}

// ---------- Varias cuentas con extractos en CSV, Excel o PDF ----------
// Antes todos iban a «extracto»: sigue siendo la cuenta por defecto, así lo ya subido no cambia de id.
export const CUENTA_EXTRACTO = 'extracto';
const mod97 = (s) => [...s].reduce((r, ch) => Number(`${r}${/\d/.test(ch) ? ch : ch.charCodeAt(0) - 55}`) % 97, 0);
const dcCCC = (s) => { const n = 11 - ([1, 2, 4, 8, 5, 10, 9, 7, 3, 6].reduce((t, p, i) => t + p * Number(s[i]), 0) % 11); return n === 11 ? 0 : n === 10 ? 1 : n; };

// IBAN de un texto (con espacios o guiones), comprobando sus dígitos de control; o un número de cuenta español
// de 20 cifras (CCC) válido, que se pasa a IBAN. Sin control válido, nada: mejor preguntar que adivinar.
export function ibanDe(v) {
  const s = String(v ?? '').toUpperCase().replace(/[\s-]+/g, '');
  for (const x of s.matchAll(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g)) {
    for (let fin = x[0].length; fin >= 15; fin--) {
      const c = x[0].slice(0, fin);
      if ((!c.startsWith('ES') || c.length === 24) && mod97(c.slice(4) + c.slice(0, 4)) === 1) return c;
    }
  }
  const ccc = /(?<!\d)\d{20}(?!\d)/.exec(s)?.[0];
  if (ccc && dcCCC(`00${ccc.slice(0, 8)}`) === Number(ccc[8]) && dcCCC(ccc.slice(10)) === Number(ccc[9])) {
    return `ES${String(98 - mod97(`${ccc}ES00`)).padStart(2, '0')}${ccc}`;
  }
  return null;
}

// Los movimientos de una lectura con los ids de otra cuenta (el id de la cuenta entra en el del movimiento).
export function aCuenta(lectura, cuenta) {
  if (cuenta === CUENTA_EXTRACTO) return lectura.movimientos;
  return conIds(cuenta, lectura.movimientos.map(({ id: _i, cuenta: _c, ...m }) => m));
}

const cuatro = (iban) => `•••• ${iban.slice(-4)}`;
const ELEGIR = { elegir: true, error: 'Elige a qué cuenta corresponde este extracto' };

// A qué cuenta va un extracto en CSV, Excel o PDF (la Norma 43 trae la suya). «elegida»: el id de una cuenta de
// extracto, 'nueva' (con «nombre») o vacío para decidirlo con el IBAN del archivo. «solapan»: las cuentas que ya
// tienen alguno de estos movimientos (volver a subir un extracto la reconoce). Si hay dudas, se pide elegir.
export function cuentaDeExtracto({ iban = null, elegida = '', nombre = '', cuentas = [], solapan = new Set() }) {
  const propias = cuentas.filter((c) => c.origen !== 'enable');
  const conIban = iban && propias.find((c) => c.iban === iban);
  const nueva = (n) => ({ id: `ext-${hash(iban ? `iban|${iban}` : `nombre|${norm(n)}`).slice(0, 10)}`, nombre: n, iban, nueva: true });
  if (elegida === 'nueva') {
    const n = txt(nombre, 40);
    if (!n) return { error: 'Pon un nombre a la cuenta nueva' };
    if (conIban) return { error: `Este extracto es de ${conIban.nombre}: elígela en la lista` };
    const igual = propias.find((c) => norm(c.nombre) === norm(n));
    if (igual) return { error: `Ya tienes una cuenta llamada ${igual.nombre}: elígela en la lista o usa otro nombre` };
    return nueva(n);
  }
  if (elegida) {
    const c = propias.find((x) => x.id === elegida);
    if (!c) return { error: 'Esa cuenta ya no está. Elige otra.' };
    if (iban && c.iban && c.iban !== iban) return { error: `Este extracto es de la cuenta ${cuatro(iban)}, no de ${c.nombre} (${cuatro(c.iban)})` };
    if (conIban && conIban.id !== c.id) return { error: `Este extracto es de ${conIban.nombre}, no de ${c.nombre}` };
    return { id: c.id, nombre: c.nombre, iban: c.iban || iban };
  }
  if (conIban) return { id: conIban.id, nombre: conIban.nombre, iban };
  // Las de Norma 43 tienen sus propios ids: un CSV sin elegir nunca va a ellas (como hasta ahora).
  const candidatas = propias.filter((c) => !c.id.startsWith('n43-') && !(iban && c.iban));
  const ya = candidatas.filter((c) => solapan.has(c.id));
  if (ya.length === 1) return { id: ya[0].id, nombre: ya[0].nombre, iban: ya[0].iban || iban };
  if (iban) return candidatas.length ? ELEGIR : nueva(`Cuenta ${cuatro(iban)}`);
  if (!candidatas.length) return { id: CUENTA_EXTRACTO, nombre: 'Extracto subido', iban: null };
  if (candidatas.length === 1 && !candidatas[0].iban) return { id: candidatas[0].id, nombre: candidatas[0].nombre, iban: null };
  return ELEGIR;
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
export const centimos = (importe) => Math.round(importe * 100);
export const TOLERANCIA_CENTIMOS = 1;
export const importeExacto = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(centimos(a) - centimos(b)) <= TOLERANCIA_CENTIMOS;
export const tieneBanco = (f) => Boolean(f.banco || f.cobro?.banco || (f.pagos || []).some((p) => p.banco));

// Los cobros por otra vía (Stripe, remesa, caja, a mano), cada uno con el movimiento del banco que lo liquida (liquidado)
// si ya ha llegado. donde: su posición en pagos, o 'cobro' para lo cobrado sin pago apuntado (la marca va en cobro).
// Un documento antiguo sin lista de pagos es un único cobro por el importe de su cobro (o lo cobrado).
// Los pagos del banco de la misma factura no los anulan (auditoría 10-2026): 50 € del banco + 100 € de Stripe esperan
// todavía la liquidación de Stripe.
export function cobrosExternos(f) {
  if (f.banco) return [];
  if (!(f.pagos || []).length) {
    if (f.cobro?.banco || f.cobro?.metodo === 'banco') return [];
    const importe = r2(f.cobro?.importe ?? (f.cobrada ? pagadoDe(f) : 0));
    return importe > 0 ? [{ donde: 'cobro', importe, liquidado: f.cobro?.liquidado }] : [];
  }
  return pagosDe(f).flatMap((p, i) => (p.metodo && p.metodo !== 'banco' && !p.banco && p.importe > 0
    ? [{ donde: p.implicito ? 'cobro' : i, importe: r2(p.importe), liquidado: p.implicito ? f.cobro?.liquidado : p.liquidado }] : []));
}
const pendientesDeLiquidar = (f) => cobrosExternos(f).filter((x) => !x.liquidado);

// Lo cobrado por otra vía que el banco todavía no ha ingresado. Esa liquidación (también parcial) solo se enlaza;
// un ingreso por el saldo restante conserva la conciliación habitual.
export const cobradoSinBanco = (f) => r2(pendientesDeLiquidar(f).reduce((s, x) => s + x.importe, 0));
// Los importes que puede tener esa liquidación: la de cada cobro o la de todos juntos.
export function importesSinLiquidar(f) {
  const xs = pendientesDeLiquidar(f);
  return xs.length > 1 ? [...xs.map((x) => x.importe), cobradoSinBanco(f)] : xs.map((x) => x.importe);
}
// Qué cobros externos liquida un ingreso: el primero de su importe o, si no, todos los pendientes juntos.
export function liquidacion(f, importe) {
  const xs = pendientesDeLiquidar(f);
  const uno = xs.find((x) => importeExacto(x.importe, importe));
  return uno ? [uno] : xs.length > 1 && importeExacto(cobradoSinBanco(f), importe) ? xs : null;
}
export function liquidar(f, cuales, movId) {
  const donde = new Set(cuales.map((x) => x.donde));
  return { ...f,
    ...(f.pagos?.length ? { pagos: f.pagos.map((p, i) => (donde.has(i) ? { ...p, liquidado: movId } : p)) } : {}),
    ...(donde.has('cobro') ? { cobro: { ...f.cobro, liquidado: movId } } : {}) };
}
// Lo contrario: quita la marca de ese movimiento y nada más (los cobros se quedan). null si no estaba.
export function desliquidar(f, movId) {
  const enPagos = (f.pagos || []).some((p) => p.liquidado === movId), enCobro = f.cobro?.liquidado === movId;
  if (!enPagos && !enCobro) return null;
  const nueva = { ...f };
  if (enPagos) nueva.pagos = f.pagos.map(({ liquidado, ...p }) => (liquidado === movId ? p : { ...p, ...(liquidado ? { liquidado } : {}) }));
  if (enCobro) {
    const { liquidado: _l, ...cobro } = f.cobro;
    if (Object.keys(cobro).length) nueva.cobro = cobro;
    else delete nueva.cobro;
  }
  return nueva;
}
// Los movimientos que la factura recoge (sus pagos del banco y las liquidaciones de sus cobros externos). Un enlace que
// la factura no recoge es de antes de marcar liquidaciones: se toma, como entonces, por la de todo lo cobrado por otra vía.
export const movimientosDeFactura = (f) => new Set([f.banco, f.cobro?.banco, f.cobro?.liquidado,
  ...(f.pagos || []).flatMap((p) => [p.banco, p.liquidado])].filter(Boolean));
// Por factura, los movimientos emparejados con ella.
export function enlacesPorFactura(movimientos) {
  const out = new Map();
  for (const m of movimientos) {
    if (m.estado !== 'emparejado' || m.enlace?.tipo !== 'factura') continue;
    if (!out.has(m.enlace.id)) out.set(m.enlace.id, []);
    out.get(m.enlace.id).push(m.id);
  }
  return out;
}
export function tieneEnlaceAntiguo(f, enlaces, salvo) {
  const ids = (enlaces.get(f.id) || []).filter((id) => id !== salvo);
  if (!ids.length) return false;
  const recoge = movimientosDeFactura(f);
  return ids.some((id) => !recoge.has(id));
}

export function esAutomatica(s, m) {
  return Boolean(s?.segura && !s.motivo && m && (!m.estado || m.estado === 'pendiente') && !m.autoDescartada
    && importeExacto(s.importe, Math.abs(m.importe))
    && (s.tipo === 'factura' ? m.importe > 0 && s.porNumero
      : s.tipo === 'gasto' && m.importe < 0 && (s.porNumero || s.porNombre)));
}
const nombreEn = (ws, texto) => ws.some((w) => texto.has(w));
function nombreFuerte(ws, texto) {
  const coinciden = ws.filter((w) => texto.has(w)).length;
  return ws.length === 1 ? ws[0].length >= 5 && coinciden === 1
    : ws.length > 1 && (coinciden === ws.length || coinciden >= 2);
}
// Los nombres cortos también distinguen personas/empresas: Ana López no es Bea López,
// ni Ferretería Sol es Ferretería Central. Se excluyen conectores y formas societarias.
const VACIAS_NOMBRE = new Set([...VACIAS, 'del', 'las', 'los', 'con', 'por', 'sociedad', 'limitada', 'anonima']);
const distintivas = (s) => [...new Set(norm(s).split(' ').filter((w) => w.length >= 3 && !VACIAS_NOMBRE.has(w) && !/^\d+$/.test(w)))];

function indexarImportes(documentos, preparar) {
  const indice = { importes: new Map(), numeros: new Map() };
  documentos.forEach((doc, orden) => {
    const datos = { doc, orden, fecha: Date.parse(`${doc.fecha}T12:00:00Z`), ...preparar(doc) };
    for (const c of new Set(datos.importes.map(centimos))) {
      if (!indice.importes.has(c)) indice.importes.set(c, []);
      indice.importes.get(c).push(datos);
    }
    // Trie de tokens: consulta por referencia sin recorrer todos los documentos.
    // Normalizar separadores conserva los límites alfanuméricos: 01 nunca es 019.
    const tokens = norm(datos.numero).split(' ').filter(Boolean);
    if (!tokens.length) return;
    let nodo = indice.numeros;
    for (const token of tokens) {
      if (!nodo.has(token)) nodo.set(token, new Map());
      nodo = nodo.get(token);
    }
    if (!nodo.has(null)) nodo.set(null, []);
    nodo.get(null).push(datos);
  });
  return indice;
}

// Las tres listas están en orden de entrada. Mezclarlas por ese orden conserva
// el desempate de los sorts estables, incluso entre importes de céntimos vecinos.
function* compatibles(indice, importe) {
  const c = centimos(importe);
  const listas = Array.from({ length: 2 * TOLERANCIA_CENTIMOS + 1 }, (_, i) => indice.importes.get(c + i - TOLERANCIA_CENTIMOS) || []);
  const posiciones = listas.map(() => 0);
  while (true) {
    let siguiente = -1;
    for (let i = 0; i < listas.length; i++) {
      if (posiciones[i] < listas[i].length && (siguiente === -1 || listas[i][posiciones[i]].orden < listas[siguiente][posiciones[siguiente]].orden)) siguiente = i;
    }
    if (siguiente === -1) return;
    yield listas[siguiente][posiciones[siguiente]++];
  }
}

function referencias(indice, concepto) {
  const tokens = norm(concepto).split(' ').filter(Boolean), encontrados = new Set();
  for (let i = 0; i < tokens.length; i++) {
    let nodo = indice.numeros;
    for (let j = i; j < tokens.length; j++) {
      nodo = nodo.get(tokens[j]);
      if (!nodo) break;
      for (const datos of nodo.get(null) || []) encontrados.add(datos);
    }
  }
  return encontrados;
}

function candidatas(m, indice, tipo) {
  const esFactura = tipo === 'factura', cantidad = Math.abs(m.importe), c = centimos(cantidad);
  const refs = referencias(indice, m.concepto);
  const documentos = new Set(compatibles(indice, cantidad));
  const porImporte = documentos.size;
  for (const datos of refs) documentos.add(datos);
  const ordenados = documentos.size === porImporte ? documentos : [...documentos].sort((a, b) => a.orden - b.orden);
  const texto = new Set(norm(`${m.concepto} ${m.contraparte || ''}`).split(' '));
  const fecha = Date.parse(`${m.fecha}T12:00:00Z`), out = [];
  for (const datos of ordenados) {
    const { doc, nombre, fecha: fechaDoc } = datos;
    // Un gasto sin proveedor (un recibo domiciliado: «Alquiler del almacén») se identifica por su concepto entero: todas sus
    // palabras distintivas (al menos dos) en el concepto del banco. Una sola palabra suelta nunca basta.
    const porNumero = refs.has(datos), porNombre = nombreFuerte(nombre, texto)
      || (!esFactura && !nombre.length && datos.concepto?.length > 1 && datos.concepto.every((w) => texto.has(w)));
    const diferenciaDias = Math.round((fecha - fechaDoc) / 864e5);
    const enFecha = datos.yaCobrada ? Math.abs(diferenciaDias) <= 45 : esFactura ? diferenciaDias >= (porNumero ? -15 : -3)
      // Los pendientes siguen admitiendo pagos tardíos sin límite superior.
      : doc.pendiente ? diferenciaDias >= (porNumero ? -120 : -5)
        : Math.abs(diferenciaDias) <= (porNumero ? 120 : 60);
    if (!enFecha) continue;
    const importe = datos.importes.reduce((mejor, x) =>
      Math.abs(centimos(x) - c) < Math.abs(centimos(mejor) - c) ? x : mejor);
    const saldo = centimos(importe);
    // ±1 céntimo en ambos motores; un cobro nuevo nunca puede exceder el saldo.
    const exacta = importeExacto(importe, cantidad) && (!esFactura || datos.yaCobrada || c <= saldo);
    if (datos.yaCobrada && !exacta) continue;
    if (!exacta && !porNumero) continue;
    let p = exacta ? 50 : 0;
    if (porNumero) p += 35;
    // Una coincidencia débil o el concepto del gasto ayudan a ordenar,
    // pero porNombre solo acredita la identidad fuerte del cliente/proveedor.
    if (nombreEn(nombre, texto) || (!esFactura && nombreEn(datos.concepto, texto))) p += 25;
    if (esFactura) { if (diferenciaDias <= 120) p += 5; }
    else {
      if (doc.pendiente) p += 15;
      if (Math.abs(diferenciaDias) <= 3) p += 10;
    }
    out.push({ tipo, id: doc.id, puntos: p, importe, porNumero, porNombre, ...(datos.yaCobrada ? { yaCobrada: true } : {}),
      ...(!exacta ? { motivo: c < saldo ? 'parcial' : 'importe-distinto' } : {}) });
  }
  return out;
}

// Para cada movimiento pendiente, la mejor pareja y las pistas para explicarla.
// Las disputas se calculan antes de asignar: el orden nunca las convierte en seguras.
export function sugerencias(movimientos, facturas, gastos) {
  const enlazados = new Set(movimientos.filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === 'gasto').map((m) => m.enlace.id));
  const enlacesFactura = enlacesPorFactura(movimientos);
  const pendientes = movimientos.filter((m) => (!m.estado || m.estado === 'pendiente') && centimos(Math.abs(m.importe)) > 0);
  const indiceFacturas = indexarImportes(facturas.filter((f) => !f.cobrada && !(f.cobro && cobradoSinBanco(f) > 0) && centimos(saldoDe(f)) > 0), (f) => ({
    importes: [saldoDe(f)], numero: numeroFactura(f), nombre: distintivas(f.cliente?.nombre),
  }));
  // Cada cobro externo se liquida por separado: lo ya enlazado no vuelve a ofrecerse, lo pendiente sí.
  const indiceCobradas = indexarImportes(facturas.filter((f) => centimos(cobradoSinBanco(f)) > 0 && !tieneEnlaceAntiguo(f, enlacesFactura)), (f) => ({
    importes: importesSinLiquidar(f), yaCobrada: true,
    numero: numeroFactura(f), nombre: distintivas(f.cliente?.nombre),
  }));
  const indiceGastos = indexarImportes(gastos.filter((g) => !g.banco && !enlazados.has(g.id)), (g) => ({
    importes: [totalDe(g), importes(g).total], numero: g.numero,
    nombre: distintivas(g.proveedor), concepto: palabras(g.concepto),
  }));
  const pares = [], todas = new Map(), reclamaciones = new Map();
  const clave = (p) => `${p.tipo}:${p.id}`;
  for (const m of pendientes) {
    let c;
    if (m.importe > 0) {
      const cobradas = candidatas(m, indiceCobradas, 'factura');
      const ids = new Set(cobradas.map((x) => x.id));
      // Si coincide con lo ya cobrado, se enlaza antes de ofrecer otro pago de esa misma factura.
      c = [...candidatas(m, indiceFacturas, 'factura').filter((x) => !ids.has(x.id)), ...cobradas];
    } else c = candidatas(m, indiceGastos, 'gasto');
    c.sort((a, b) => b.puntos - a.puntos);
    todas.set(m.id, c);
    for (const x of c) {
      pares.push({ m: m.id, ...x });
      if (x === c[0] || x.porNumero) {
        const k = clave(x);
        if (!reclamaciones.has(k)) reclamaciones.set(k, new Set());
        reclamaciones.get(k).add(m.id);
      }
    }
  }
  const conflictos = new Set();
  for (const ids of reclamaciones.values()) if (ids.size > 1) for (const id of ids) conflictos.add(id);
  function resultado(p, movimiento, forzarConflicto = false) {
    const c = todas.get(movimiento);
    const alternativa = p.puntos < c[0].puntos;
    const conflicto = forzarConflicto || conflictos.has(movimiento);
    const empate = c.filter((x) => x.puntos === c[0].puntos).length > 1;
    const motivo = alternativa ? 'alternativa' : conflicto ? 'conflicto' : p.motivo;
    return { tipo: p.tipo, id: p.id, puntos: p.puntos,
      segura: p.puntos >= 75 && (p.porNumero || p.porNombre) && !motivo && !empate,
      ...(motivo ? { motivo } : {}), ...(p.yaCobrada ? { yaCobrada: true } : {}), importe: p.importe, porNumero: p.porNumero, porNombre: p.porNombre };
  }
  pares.sort((a, b) => b.puntos - a.puntos);
  const usados = new Set(), out = {};
  for (const p of pares) {
    const k = clave(p);
    if (out[p.m] || usados.has(k)) continue;
    out[p.m] = resultado(p, p.m);
    usados.add(k);
  }
  // Una disputa sin alternativa conserva la mejor sugerencia para ambos movimientos.
  for (const [m, c] of todas) if (!out[m] && c.length) out[m] = resultado(c[0], m, true);
  return out;
}

// Para elegir a mano: facturas sin cobrar (para un ingreso) o gastos sin enlazar de fechas cercanas (para un cargo),
// los de importe más parecido primero.
export function opciones(m, facturas, gastos, movimientos = []) {
  if (m.importe > 0) {
    return facturas.filter((f) => !f.cobrada).map((f) => ({ f, importe: saldoDe(f) })).filter((x) => x.importe > 0)
      .sort((a, b) => Math.abs(a.importe - m.importe) - Math.abs(b.importe - m.importe)).slice(0, 20)
      .map(({ f, importe }) => ({ tipo: 'factura', id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, importe, total: importes(f).total, saldo: importe, fecha: f.fecha }));
  }
  const enlazados = new Set(movimientos.filter((x) => x.estado === 'emparejado' && x.enlace?.tipo === 'gasto').map((x) => x.enlace.id));
  return gastos.filter((g) => !g.banco && !enlazados.has(g.id) && (g.pendiente || Math.abs(dias(g.fecha, m.fecha)) <= 60))
    .map((g) => ({ g, importe: totalDe(g) }))
    .sort((a, b) => Math.abs(a.importe + m.importe) - Math.abs(b.importe + m.importe)).slice(0, 20)
    .map(({ g, importe }) => ({ tipo: 'gasto', id: g.id, texto: `${g.proveedor || g.concepto}${g.pendiente ? ' · sin pagar' : ''}`, importe, total: importe, saldo: importe, fecha: g.fecha }));
}

// ---------- Movimientos sin factura ni gasto ----------
// Lo que puede ser un movimiento que no casa con nada. Fisquo propone una por el concepto y la persona confirma.
export const CLASES = {
  gasto: { t: 'Un gasto: falta su factura', signo: -1 },
  comision: { t: 'Comisión del banco', signo: -1 },
  cuota: { t: 'Cuota de autónomos', signo: -1 },
  hacienda: { t: 'Pago o devolución de Hacienda' },
  seguridad: { t: 'Seguridad Social de las nóminas', signo: -1 },
  nomina: { t: 'Pago de nóminas', signo: -1 },
  prestamo: { t: 'Préstamo (cuota o dinero recibido)' },
  socio: { t: 'Dinero de o para los socios' },
  traspaso: { t: 'Traspaso entre tus cuentas' },
  ingreso: { t: 'Otro ingreso sin factura', signo: 1 },
};
export const clasesPara = (m) => Object.entries(CLASES).filter(([, c]) => !c.signo || c.signo === Math.sign(m.importe)).map(([k, c]) => [k, c.t]);
export function clasificar(m, { autonomo = false } = {}) {
  const t = ` ${norm(`${m.concepto} ${m.contraparte || ''}`)} `;
  const hay = (...ws) => ws.some((w) => t.includes(w));
  if (hay('aeat', 'agencia tributaria', 'agencia estatal', 'hacienda', 'impuesto', ' mod 303', ' mod 111', ' mod 115', ' mod 130', ' mod 202', ' mod 200', 'modelo 303', 'modelo 130')) return 'hacienda';
  if (hay('tgss', 'seguridad social', 'tesoreria general', ' reta ', 'cuota autonomo', 'autonomos')) return autonomo && m.importe < 0 ? 'cuota' : 'seguridad';
  if (hay('nomina', 'salario', 'sueldo')) return m.importe < 0 ? 'nomina' : 'ingreso';
  if (hay('prestamo', 'hipoteca', 'amortizacion prest', 'cuota prest')) return 'prestamo';
  if (hay('traspaso', 'transferencia interna', 'entre cuentas', 'cuenta propia')) return 'traspaso';
  if (m.importe < 0 && hay('comision', 'mantenimiento', 'gastos bancarios', 'cuota tarjeta', 'custodia')) return 'comision';
  if (hay('ampliacion de capital', 'ampliacion capital', 'aportacion socio', 'aportacion de socio', 'desembolso', 'dividendo')) return 'socio';
  return m.importe < 0 ? 'gasto' : 'ingreso';
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

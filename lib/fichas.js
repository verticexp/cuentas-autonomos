// Índices de los documentos que crecen con los años (informe de capacidad E01). Lógica pura: qué índice lleva cada
// documento. Los mantiene lib/redis.js en la misma transacción que el documento; los lee lib/indices.js.
//
// Por colección y empresa (con el prefijo «cuentas:» de siempre):
//   ixo:<col>:<emp>  conjunto lexicográfico «<orden con 16 cifras>\0<id>»: listados por páginas y por rango de fechas.
//                    El par (orden, id) es único: el cursor de las páginas avanza por todos los empates (revisión S04).
//   ixop:<col>:<emp> lo mismo, solo los pendientes (facturas sin cobrar, gastos sin pagar): totales «por cobrar».
//   ixoi:<col>:<emp> lo mismo, solo los bienes de inversión (gastos).
//   ixf:<col>:<emp>  hash id → ficha: lo poco que hace falta para sumar, filtrar y buscar sin leer el documento.
//   ixt:<col>:<emp>  hash id → texto de búsqueda completo, sin recortar (revisión S06): cada campo en minúsculas, uno
//                    por línea, igual que la búsqueda de antes (cliente, número, concepto y todas las líneas).
//   ixn:<col>:<emp>  conjunto lexicográfico «N:<NOMBRE>\0id» y «F:<NIF>\0id»: documentos de un cliente (portal).
//   ixd:<col>:<emp> facturas sin cobrar con importe, por vencimiento: «<vence>\0<id>» (vencidas sin leer fichas).
//   ixa:<col>:<emp> totales precalculados en céntimos (E06): por cobrar, lo que se debe, y lo de cada mes (con y sin
//                    actividad, todo y solo lo pendiente). Cada ficha guarda su aportación (ag) y la transacción
//                    (lib/scripts.js TX_INDICES) resta la anterior y suma la nueva en la misma ejecución atómica.
//   ixv:<col>:<emp>  versión del índice construido; sin ella, el índice se reconstruye desde el hash (lib/indices.js).
import { importes, numeroFactura, pendienteDe, r2 } from './calculos.js';

export const VERSION_INDICE = '5'; // 2: NIF del proveedor; 3: tp y huella; 4: orden lexicográfico (S04); 5: totales (E06)
export const nifNormal = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const nombreNormal = (s) => String(s || '').trim().toUpperCase();
const total = (g) => r2(importes(g).total);

// Orden: fecha (AAAAMMDD) y, a igual fecha, número. Cabe de sobra en un double (2·10¹³ < 2⁵³).
const fechaN = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || '') ? Number(f.replaceAll('-', '')) : 0);
// Sin número (gastos), una cifra derivada del id: así casi nunca coinciden dos órdenes y el cursor de las páginas avanza.
const cifraId = (id) => { let h = 2166136261; for (const ch of String(id || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h % 1e6; };
export const ordenDe = (d) => fechaN(d?.fecha) * 1e6 + (Number.isInteger(d?.numero) && d.numero > 0 ? d.numero % 1e6 : cifraId(d?.id));
export const ordenFecha = (fecha, fin = false) => fechaN(fecha) * 1e6 + (fin ? 999999 : 0);
// Miembro del orden lexicográfico: orden con 16 cifras, un NUL y el id. Ordena exactamente por (orden, id).
export const pad = (o) => String(Math.max(0, Math.floor(Number(o) || 0))).padStart(16, '0');
export const miembro = (orden, id) => `${pad(orden)}\0${id}`;
export const idDe = (m) => { const s = String(m); return s.slice(s.indexOf('\0') + 1); };
export const ordenDeMiembro = (m) => Number(String(m).slice(0, String(m).indexOf('\0')));

const FICHAS = {
  facturas: (f) => ({
    f: f.fecha, c: f.cliente?.nombre || '', a: f.actividad || '', b: Number(f.base) || 0, t: total(f), p: pendienteDe(f),
    ...(f.cobrada ? { co: 1 } : {}), ...(f.vence ? { ve: f.vence } : {}), ...(f.caja ? { k: 1 } : {}), ...(f.proyecto ? { pr: f.proyecto } : {}),
  }),
  gastos: (g) => ({
    f: g.fecha, c: g.proveedor || '', ...(g.proveedorNif ? { n: g.proveedorNif } : {}), a: g.actividad || '', b: Number(g.base) || 0, t: total(g),
    // tp: lo que se le paga al proveedor (base + IVA, como lib/proveedores.js totalDe); h: huella del adjunto (duplicados).
    tp: r2(importes(g).base + importes(g).iva), ...(g.archivo?.huella ? { h: g.archivo.huella } : {}),
    ...(g.pendiente ? { pe: 1 } : {}), ...(g.migrado ? { mi: 1 } : {}), ...(g.inversion ? { in: 1 } : {}), ...(g.banco ? { bk: 1 } : {}), ...(g.proyecto ? { pr: g.proyecto } : {}),
  }),
  presupuestos: (p) => ({ f: p.fecha, c: p.cliente?.nombre || '' }),
};
// Subconjuntos marcados (conjuntos ordenados aparte): p = pendientes, i = bienes de inversión.
// Texto de búsqueda: los mismos campos que buscaban las pantallas antes del índice, cada uno en su línea (una búsqueda
// no puede casar a caballo entre dos campos, como antes). Sin límite: la validación ya acota cada campo.
const TEXTOS = {
  facturas: (f) => [f.cliente?.nombre, numeroFactura(f), f.concepto, ...(f.lineas || []).map((l) => l.concepto)],
  gastos: (g) => [g.concepto, g.proveedor, g.proveedorNif],
};
export const textoDe = (col, d) => (TEXTOS[col] ? TEXTOS[col](d).map((t) => String(t || '').toLowerCase()).join('\n') : null);
const MARCAS = { facturas: { p: (f) => !f.cobrada }, gastos: { p: (g) => Boolean(g.pendiente), i: (g) => Boolean(g.inversion) } };
const CLIENTE = { facturas: true, presupuestos: true };

export const INDEXADAS = Object.keys(FICHAS);
export const claves = (col, emp) => ({ ix: `ixo:${col}:${emp}`, ixp: `ixop:${col}:${emp}`, ixi: `ixoi:${col}:${emp}`, ixf: `ixf:${col}:${emp}`, ixt: `ixt:${col}:${emp}`, ixd: `ixd:${col}:${emp}`, ixa: `ixa:${col}:${emp}`, ixn: `ixn:${col}:${emp}`, ixv: `ixv:${col}:${emp}` });
// Las de la versión 3 (orden por puntuación), que ya no se usan: se borran al reconstruir.
export const clavesAntiguas = (col, emp) => [`ix:${col}:${emp}`, `ixp:${col}:${emp}`, `ixi:${col}:${emp}`];
export const marcas = (col) => Object.keys(MARCAS[col] || {});

// «facturas:<emp>» → { col, emp } si es una colección indexada.
export function coleccionDe(k) {
  const i = String(k).indexOf(':');
  if (i < 0) return null;
  const col = k.slice(0, i), emp = k.slice(i + 1);
  return FICHAS[col] && emp ? { col, emp } : null;
}

// Entradas del índice de cliente de un documento (para el portal).
export function entradasCliente(col, d) {
  if (!CLIENTE[col] || !d?.cliente) return [];
  const n = nombreNormal(d.cliente.nombre), f = nifNormal(d.cliente.nif);
  return [...(n ? [`N:${n}\0${d.id}`] : []), ...(f ? [`F:${f}\0${d.id}`] : [])];
}

// Todo lo que lleva el índice de un documento.
// Céntimos enteros: los totales se suman con HINCRBY, sin errores de coma flotante.
export const cent = (x) => Math.round((Number(x) || 0) * 100);
// Aportación de un documento a los totales (E06). Los campos los leen lib/indices.js y las pantallas.
const AGREGADOS = {
  facturas: (f, fi) => {
    const mes = String(fi.f || '').slice(0, 7), b = cent(fi.b), ag = { [`m:${mes}`]: b, ...(fi.a ? { [`m:${mes}:${fi.a}`]: b } : {}) };
    if (!fi.co) Object.assign(ag, { pn: 1, pc: cent(fi.p), [`mp:${mes}`]: b, ...(fi.a ? { [`mp:${mes}:${fi.a}`]: b } : {}) });
    return ag;
  },
  gastos: (g, fi) => {
    if (fi.mi) return {};
    const mes = String(fi.f || '').slice(0, 7), b = cent(fi.b), ag = { [`m:${mes}`]: b };
    if (fi.pe) Object.assign(ag, { sn: 1, [`mp:${mes}`]: b, ...(fi.c ? { dc: cent(fi.tp) } : {}) });
    return ag;
  },
};

// Todo lo que lleva el índice de un documento: su ficha (con zs: [[conjunto, miembro]] y ag: aportación a los totales).
export function indiceDe(col, d) {
  const id = String(d.id);
  const ficha = { ...FICHAS[col](d), o: ordenDe(d) };
  const m = miembro(ficha.o, id);
  const en = Object.fromEntries(Object.entries(MARCAS[col] || {}).map(([k, fn]) => [k, Boolean(fn(d))]));
  const cliente = entradasCliente(col, d);
  ficha.zs = [['ix', m], ...Object.entries(en).filter(([, si]) => si).map(([k]) => [k, m]), ...cliente.map((e) => ['n', e])];
  // Vencimiento: el guardado al emitir; las de antes sin él van con «» y se calculan con el plazo al leer.
  if (col === 'facturas' && !d.cobrada && ficha.t > 0) ficha.zs.push(['d', `${d.vence || ''}\0${id}`]);
  ficha.ag = AGREGADOS[col] ? Object.fromEntries(Object.entries(AGREGADOS[col](d, ficha)).filter(([, n]) => n)) : {};
  return { orden: ficha.o, ficha, marcas: en, cliente };
}

// Claves para el script de transacción (con el prefijo de la base de datos).
export function clavesTx(col, emp, P) {
  const k = claves(col, emp);
  return { ixf: P + k.ixf, ixt: P + k.ixt, ixa: P + k.ixa, z: { ix: P + k.ix, p: P + k.ixp, i: P + k.ixi, d: P + k.ixd, n: P + k.ixn } };
}
// Operaciones de TX_INDICES para guardar, borrar o (al reconstruir) indexar o quitar un documento.
export function opGuardar(col, emp, P, d, valor) {
  const { ficha } = indiceDe(col, d);
  return ['_g', P + `${col}:${emp}`, String(d.id), valor, JSON.stringify(ficha), textoDe(col, d), clavesTx(col, emp, P)];
}
export const opBorrar = (col, emp, P, id) => ['_b', P + `${col}:${emp}`, String(id), clavesTx(col, emp, P)];
export function opIndexar(col, emp, P, d, esperado) {
  const { ficha } = indiceDe(col, d);
  return ['_i', P + `${col}:${emp}`, String(d.id), esperado, JSON.stringify(ficha), textoDe(col, d), clavesTx(col, emp, P)];
}
export const opQuitar = (col, emp, P, id, sueltas = []) => ['_d', P + `${col}:${emp}`, String(id), clavesTx(col, emp, P), sueltas];

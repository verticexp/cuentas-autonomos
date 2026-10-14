// Índices de los documentos que crecen con los años (informe de capacidad E01). Lógica pura: qué índice lleva cada
// documento. Los mantiene lib/redis.js en la misma transacción que el documento; los lee lib/indices.js.
//
// Por colección y empresa (con el prefijo «cuentas:» de siempre):
//   ix:<col>:<emp>   conjunto ordenado id → orden (fecha y número): listados por páginas y por rango de fechas.
//   ixp:<col>:<emp>  lo mismo, solo los pendientes (facturas sin cobrar, gastos sin pagar): totales «por cobrar».
//   ixi:<col>:<emp>  lo mismo, solo los bienes de inversión (gastos).
//   ixf:<col>:<emp>  hash id → ficha: lo poco que hace falta para sumar, filtrar y buscar sin leer el documento.
//   ixn:<col>:<emp>  conjunto lexicográfico «N:<NOMBRE>\0id» y «F:<NIF>\0id»: documentos de un cliente (portal).
//   ixv:<col>:<emp>  versión del índice construido; sin ella, el índice se reconstruye desde el hash (lib/indices.js).
import { importes, numeroFactura, pendienteDe, r2 } from './calculos.js';

export const VERSION_INDICE = '3'; // 2: NIF del proveedor; 3: total con IVA sin IRPF (tp) y huella del adjunto (h)
export const nifNormal = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const nombreNormal = (s) => String(s || '').trim().toUpperCase();
const minus = (xs) => xs.filter(Boolean).map((x) => String(x).toLowerCase()).join(' ').replace(/\s+/g, ' ').slice(0, 400);
const total = (g) => r2(importes(g).total);

// Orden: fecha (AAAAMMDD) y, a igual fecha, número. Cabe de sobra en un double (2·10¹³ < 2⁵³).
const fechaN = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || '') ? Number(f.replaceAll('-', '')) : 0);
// Sin número (gastos), una cifra derivada del id: así casi nunca coinciden dos órdenes y el cursor de las páginas avanza.
const cifraId = (id) => { let h = 2166136261; for (const ch of String(id || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h % 1e6; };
export const ordenDe = (d) => fechaN(d?.fecha) * 1e6 + (Number.isInteger(d?.numero) && d.numero > 0 ? d.numero % 1e6 : cifraId(d?.id));
export const ordenFecha = (fecha, fin = false) => fechaN(fecha) * 1e6 + (fin ? 999999 : 0);

const FICHAS = {
  facturas: (f) => ({
    f: f.fecha, c: f.cliente?.nombre || '', a: f.actividad || '', b: Number(f.base) || 0, t: total(f), p: pendienteDe(f),
    ...(f.cobrada ? { co: 1 } : {}), ...(f.vence ? { ve: f.vence } : {}), ...(f.caja ? { k: 1 } : {}), ...(f.proyecto ? { pr: f.proyecto } : {}),
    x: minus([f.cliente?.nombre, numeroFactura(f), f.concepto, ...(f.lineas || []).map((l) => l.concepto)]),
  }),
  gastos: (g) => ({
    f: g.fecha, c: g.proveedor || '', ...(g.proveedorNif ? { n: g.proveedorNif } : {}), a: g.actividad || '', b: Number(g.base) || 0, t: total(g),
    // tp: lo que se le paga al proveedor (base + IVA, como lib/proveedores.js totalDe); h: huella del adjunto (duplicados).
    tp: r2(importes(g).base + importes(g).iva), ...(g.archivo?.huella ? { h: g.archivo.huella } : {}),
    ...(g.pendiente ? { pe: 1 } : {}), ...(g.migrado ? { mi: 1 } : {}), ...(g.inversion ? { in: 1 } : {}), ...(g.banco ? { bk: 1 } : {}), ...(g.proyecto ? { pr: g.proyecto } : {}),
    x: minus([g.concepto, g.proveedor, g.proveedorNif]),
  }),
  presupuestos: (p) => ({ f: p.fecha, c: p.cliente?.nombre || '' }),
};
// Subconjuntos marcados (conjuntos ordenados aparte): p = pendientes, i = bienes de inversión.
const MARCAS = { facturas: { p: (f) => !f.cobrada }, gastos: { p: (g) => Boolean(g.pendiente), i: (g) => Boolean(g.inversion) } };
const CLIENTE = { facturas: true, presupuestos: true };

export const INDEXADAS = Object.keys(FICHAS);
export const claves = (col, emp) => ({ ix: `ix:${col}:${emp}`, ixp: `ixp:${col}:${emp}`, ixi: `ixi:${col}:${emp}`, ixf: `ixf:${col}:${emp}`, ixn: `ixn:${col}:${emp}`, ixv: `ixv:${col}:${emp}` });
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
export function indiceDe(col, d) {
  const ficha = { ...FICHAS[col](d), o: ordenDe(d), cl: entradasCliente(col, d) };
  const en = Object.fromEntries(Object.entries(MARCAS[col] || {}).map(([m, fn]) => [m, Boolean(fn(d))]));
  return { orden: ficha.o, ficha, marcas: en, cliente: ficha.cl };
}

// Operaciones para una transacción: guardar documentos (con su ficha anterior, si la había) o borrarlos.
// tx: { zadd, zrem, hset, hdel } con claves sin prefijo. anteriores: { id: fichaAnterior }.
export function opsGuardar(tx, col, emp, docs, anteriores = {}) {
  const k = claves(col, emp);
  const fichas = {};
  for (const d of docs) {
    if (!d?.id) continue;
    const id = String(d.id);
    const { orden, ficha, marcas: en, cliente } = indiceDe(col, d);
    tx.zadd(k.ix, { score: orden, member: id });
    for (const [m, si] of Object.entries(en)) { if (si) tx.zadd(k[`ix${m}`], { score: orden, member: id }); else tx.zrem(k[`ix${m}`], id); }
    const viejas = (anteriores[id]?.cl || []).filter((e) => !cliente.includes(e));
    if (viejas.length) tx.zrem(k.ixn, ...viejas);
    for (const e of cliente) tx.zadd(k.ixn, { score: 0, member: e });
    fichas[id] = ficha;
  }
  if (Object.keys(fichas).length) tx.hset(k.ixf, fichas);
}

export function opsBorrar(tx, col, emp, ids, anteriores = {}) {
  const k = claves(col, emp);
  if (!ids.length) return;
  tx.zrem(k.ix, ...ids);
  for (const m of marcas(col)) tx.zrem(k[`ix${m}`], ...ids);
  tx.hdel(k.ixf, ...ids);
  const viejas = ids.flatMap((id) => anteriores[id]?.cl || []);
  if (viejas.length) tx.zrem(k.ixn, ...viejas);
}

// Proveedores: salen de los gastos (proveedor y proveedorNif). Lo que se les debe son los gastos marcados «pendiente».
import { importes, r2 } from './calculos.js';

const totalDe = (g) => { const i = importes(g); return r2(i.base + i.iva); };
// Mismo proveedor: mismo NIF o, sin NIF, mismo nombre (sin mayúsculas, tildes ni espacios de más).
export const claveProveedor = (g) => (g.proveedorNif ? g.proveedorNif.toUpperCase()
  : String(g.proveedor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim());

export function proveedores(gastos) {
  const m = new Map();
  for (const g of gastos) {
    if (!g.proveedor) continue;
    const k = claveProveedor(g);
    if (!m.has(k)) m.set(k, { clave: k, gastos: [] });
    m.get(k).gastos.push(g);
  }
  return [...m.values()].map((p) => {
    const lista = p.gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const pend = lista.filter((g) => g.pendiente);
    return { ...p, gastos: lista, nombre: lista[0].proveedor, nif: (lista.find((g) => g.proveedorNif)?.proveedorNif || '').toUpperCase(),
      n: lista.length, total: r2(lista.reduce((s, g) => s + totalDe(g), 0)), ultimo: lista[0].fecha,
      pendientes: pend.length, debe: r2(pend.reduce((s, g) => s + totalDe(g), 0)) };
  }).sort((a, b) => b.debe - a.debe || b.total - a.total);
}

// Lo mismo que proveedores() a partir de las fichas del índice (lib/fichas.js), sin leer los gastos (informe E01).
// Sin la lista de gastos de cada uno (para eso, el detalle).
export function proveedoresDeFichas(fichas) {
  const m = new Map();
  for (const f of fichas) {
    if (!f.c) continue;
    const k = claveProveedor({ proveedor: f.c, proveedorNif: f.n });
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return [...m].map(([k, xs]) => {
    const lista = xs.sort((a, b) => b.f.localeCompare(a.f));
    const pend = lista.filter((f) => f.pe);
    return { clave: k, nombre: lista[0].c, nif: (lista.find((f) => f.n)?.n || '').toUpperCase(), n: lista.length,
      total: r2(lista.reduce((s, f) => s + f.tp, 0)), ultimo: lista[0].f, pendientes: pend.length, debe: r2(pend.reduce((s, f) => s + f.tp, 0)) };
  }).sort((a, b) => b.debe - a.debe || b.total - a.total);
}

export { totalDe };

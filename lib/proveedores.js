// Proveedores: salen de los gastos (proveedor y proveedorNif). Lo que se les debe son los gastos marcados «pendiente».
import { importes, r2 } from './calculos.js';

const totalDe = (g) => importes(g).total;
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

// Une los proveedores que salen de los gastos con sus fichas (hash «fichasProv», lib/tercerosServidor.js): cada uno con su
// ficha (o null) y, al final, las fichas que aún no tienen gastos. La ficha se reconoce por su clave, por su NIF o por el
// nombre (sin mayúsculas, tildes ni espacios de más). Orden: lo que se les debe, lo gastado y el nombre.
const nifDe = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function unirProveedores(lista, fichas = []) {
  const porClave = new Map(fichas.map((f) => [f.id, f]));
  const porNif = new Map(fichas.filter((f) => nifDe(f.nif)).map((f) => [nifDe(f.nif), f]));
  const porNombre = new Map(fichas.map((f) => [claveProveedor({ proveedor: f.nombre }), f]));
  const usadas = new Set();
  const unidos = lista.map((p) => {
    const f = porClave.get(p.clave) || (nifDe(p.nif) && porNif.get(nifDe(p.nif))) || porNombre.get(claveProveedor({ proveedor: p.nombre })) || null;
    if (f) usadas.add(f.id);
    return { ...p, ficha: f };
  });
  for (const f of fichas) {
    if (!usadas.has(f.id)) unidos.push({ clave: f.id, nombre: f.nombre, nif: String(f.nif || '').toUpperCase(), n: 0, total: 0, ultimo: '', pendientes: 0, debe: 0, ficha: f });
  }
  return unidos.sort((a, b) => b.debe - a.debe || b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

export { totalDe };

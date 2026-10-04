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

export { totalDe };

// Proyectos y centros de coste: una obra, un cliente grande, un local… Cada factura, cierre de caja o gasto puede llevar
// el suyo (texto libre) y aquí se calcula la rentabilidad de cada uno. Sin dependencias de servidor, para poder probarlo.
import { importes, r2 } from './calculos.js';

export const limpiarProyecto = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
const clave = (p) => limpiarProyecto(p).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nombres ya usados (para sugerirlos al escribir), sin repetir mayúsculas ni tildes.
export function nombresProyectos(...listas) {
  const m = new Map();
  for (const x of listas.flat()) if (limpiarProyecto(x?.proyecto)) m.set(clave(x.proyecto), m.get(clave(x.proyecto)) || limpiarProyecto(x.proyecto));
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// Ingresos (base de facturas y cierres), gastos (base; con el IVA si no se recupera: ivaCoste) y margen de cada proyecto en
// un año. Las nóminas y los gastos sin proyecto quedan en «Sin proyecto» (gastos generales).
export function rentabilidad({ facturas = [], gastos = [] }, anio, { ivaCoste = false } = {}) {
  const P = new Map();
  const de = (x) => {
    const k = clave(x.proyecto);
    if (!P.has(k)) P.set(k, { proyecto: limpiarProyecto(x.proyecto) || '', ingresos: 0, gastos: 0, facturas: 0, apuntes: 0, desde: x.fecha, hasta: x.fecha });
    const p = P.get(k);
    if (x.fecha < p.desde) p.desde = x.fecha;
    if (x.fecha > p.hasta) p.hasta = x.fecha;
    return p;
  };
  const delAnio = (x) => !anio || x.fecha.startsWith(`${anio}-`);
  for (const f of facturas.filter(delAnio)) { const p = de(f); p.ingresos = r2(p.ingresos + f.base); p.facturas++; }
  for (const g of gastos.filter((x) => delAnio(x) && !x.inversion)) { const i = importes(g); const p = de(g); p.gastos = r2(p.gastos + (ivaCoste ? i.base + i.iva : i.base)); p.apuntes++; }
  const lista = [...P.values()].map((p) => ({ ...p, margen: r2(p.ingresos - p.gastos), margenPct: p.ingresos ? r2(((p.ingresos - p.gastos) / p.ingresos) * 100) : 0 }));
  return {
    proyectos: lista.filter((p) => p.proyecto).sort((a, b) => b.margen - a.margen),
    general: lista.find((p) => !p.proyecto) || { proyecto: '', ingresos: 0, gastos: 0, margen: 0, margenPct: 0, facturas: 0, apuntes: 0 },
  };
}

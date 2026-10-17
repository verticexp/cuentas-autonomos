// Cuota de autónomos: un gasto por mes, con id `cuota-AAAA-MM` (clave natural). Venga del formulario de Gastos o del
// banco, se escribe siempre sobre ese id: nunca dos cuotas del mismo mes.
import { r2 } from './calculos.js';

// Tarifa plana de cada año (importe mensual). Si el año no está, la del último conocido.
export const TARIFA_PLANA = { 2023: 80, 2024: 80, 2025: 80, 2026: 88.56 };
export function tarifaPlana(anio) {
  const anios = Object.keys(TARIFA_PLANA).map(Number).filter((y) => y <= anio);
  return TARIFA_PLANA[anios.length ? Math.max(...anios) : Math.min(...Object.keys(TARIFA_PLANA).map(Number))];
}

export const idCuota = (mes) => `cuota-${mes}`;
// Una cuota de autónomos: la del formulario (id cuota-…) o la del banco (concepto «Cuota de autónomos», cuenta 642).
export const esCuota = (g) => String(g.id).startsWith('cuota-') || (g.categoria === '642' && /^Cuota de autónomos/.test(g.concepto || ''));
const mesDe = (g) => (String(g.id).match(/^cuota-(\d{4}-\d{2})$/) || [])[1] || String(g.fecha).slice(0, 7);

// Meses AAAA-MM desde `desde` hasta `hasta` (incluidos).
export function mesesEntre(desde, hasta) {
  const out = [];
  for (let [y, m] = desde.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hasta; m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out;
}

// Une en una sola cuota `cuota-AAAA-MM` las cuotas de un mes: conserva el importe de la más reciente (la del banco, si la
// hay, porque es el cargo real; si no, la última en la lista) y su enlace con el banco. Devuelve { guardar, borrar }:
// las cuotas resultantes y los ids que sobran.
export function fusionarCuotas(gastos) {
  const porMes = new Map();
  for (const g of gastos.filter(esCuota)) porMes.set(mesDe(g), [...(porMes.get(mesDe(g)) || []), g]);
  const guardar = [], borrar = [];
  for (const [mes, l] of porMes) {
    const id = idCuota(mes);
    if (l.length === 1 && l[0].id === id) continue;
    const reciente = [...l].sort((a, b) => Number(Boolean(a.banco)) - Number(Boolean(b.banco)) || String(a.creado || '').localeCompare(String(b.creado || ''))).at(-1);
    const base = l.find((g) => g.id === id) || l[0];
    guardar.push({ ...base, ...reciente, id, base: r2(reciente.base) });
    borrar.push(...l.map((g) => g.id).filter((x) => x !== id));
  }
  return { guardar, borrar };
}

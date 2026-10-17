// «En revisión» de Gastos: cargos del banco pendientes que parecen un gasto, cada uno con el gasto que Netto cree que es
// (sugerencias) y los demás que podrían serlo (opciones), para revisarlo, emparejarlo o añadirlo
// desde la misma pantalla. Sin lecturas: recibe los movimientos y los candidatos (candidatosConciliacion).
import { clasificar, opciones, sugerencias } from './banco.js';
import { totalDe } from './proveedores.js';

const texto = (g) => `${g.proveedor || g.concepto}${g.proveedor && g.concepto && g.proveedor !== g.concepto ? ` · ${g.concepto}` : ''}`;

export function revisionGastos(movs, gastos, { autonomo = false, limite = 30 } = {}) {
  const lista = movs || [];
  const cargos = lista.filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe < 0 && clasificar(m, { autonomo }) === 'gasto');
  const sug = sugerencias(lista, [], gastos || []);
  const porId = new Map((gastos || []).map((g) => [g.id, g]));
  const items = cargos.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => {
    const s = sug[m.id]?.tipo === 'gasto' && porId.get(sug[m.id].id);
    const sugerencia = s ? { id: s.id, texto: texto(s), fecha: s.fecha, importe: totalDe(s), pendiente: Boolean(s.pendiente), segura: Boolean(sug[m.id].segura), motivo: sug[m.id].motivo } : null;
    const otras = opciones(m, [], gastos || [], lista).filter((o) => o.id !== sugerencia?.id).slice(0, 10)
      .map((o) => ({ id: o.id, texto: o.texto, fecha: o.fecha, importe: o.importe, cuadra: Math.abs(o.importe + m.importe) < 0.015 }));
    return { m: { id: m.id, fecha: m.fecha, importe: m.importe, concepto: m.concepto, contraparte: m.contraparte }, sugerencia, otras };
  });
  return { total: items.length, items: items.slice(0, limite) };
}

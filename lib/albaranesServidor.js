// Albaranes y pedidos en el servidor: lo que lee y guarda en Redis (la lógica pura está en lib/albaranes.js).
import { createHash } from 'node:crypto';
import { borrar, clave, guardar, leer, leerUno, redis } from './redis.js';
import { estadoPedidoProv, facturaDeAlbaranes, gastoDeRecepcion, lineasDeRecepcion, siguiente } from './albaranes.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { crearFactura, limpiar } from './facturas.js';
import { actividadesDe, fiscalDe } from './empresa.js';

export const normalizarIdsAlbaranes = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))].sort().slice(0, 100);

// Orden estable para que dos selecciones solapadas nunca esperen la una por la otra.
export async function facturarAlbaranes(u, b) {
  const ids = normalizarIdsAlbaranes(b.ids);
  if (!ids.length) return { error: 'Elige al menos un albarán' };
  const cerrojos = [];
  const tomar = (i) => i < ids.length
    ? conCerrojo(`albaran:${u.empresa || u.id}:${ids[i]}`, async (c) => {
      cerrojos.push(c);
      return tomar(i + 1);
    }, { caduca: 120000 })
    : emitir();
  const vigente = () => {
    if (cerrojos.some((c) => c.quedaMs() <= 0)) throw new Error('La operación ha tardado demasiado: inténtalo de nuevo.');
  };
  const emitir = async () => {
    const lista = await Promise.all(ids.map((id) => leerUno(u, 'albaranes', id)));
    if (lista.some((a) => !a)) return { error: 'Alguno de esos albaranes ya no existe' };
    const fd = facturaDeAlbaranes(lista);
    if (fd.error) return fd;
    const actividades = actividadesDe(u);
    const a = actividades.find((x) => x.id === b.actividad) || actividades[0];
    const datos = limpiar({ ...fd, fecha: b.fecha, actividad: a.id, irpfPct: b.irpfPct ?? a.irpfPct, cobrada: b.cobrada }, actividades, fiscalDe(u).tipo === 'sociedad');
    if (datos.error) return datos;
    const idem = `alb:${createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0, 32)}`;
    vigente();
    const resultado = await crearFactura(u, datos, { idem });
    if (resultado.error) return resultado;
    vigente();
    await redis.hset(clave(u, 'albaranes'), Object.fromEntries(lista.map((a) => [a.id, { ...a, factura: resultado.factura.id }])));
    return { ...resultado, albaranes: lista };
  };
  try { return await tomar(0); } catch (e) { return { error: e.message }; }
}

const conPedidoProv = async (u, id, fn) => {
  try {
    return await conCerrojo(`pedidoprov:${u.empresa || u.id}:${id}`, async (c) => {
      const p = await leerUno(u, 'pedidosProv', id);
      if (!p) return { error: 'Ese pedido ya no existe', status: 404 };
      return fn(p, c);
    });
  } catch (e) {
    if (e instanceof Ocupado) return { error: e.message };
    throw e;
  }
};

export async function recibirPedidoProv(u, b) {
  if (b.idem !== undefined && typeof b.idem !== 'string') return { error: 'La clave de idempotencia debe ser texto' };
  return conPedidoProv(u, String(b.id || ''), async (p, { quedaMs }) => {
    // Un reintento se reconoce incluso si esa recepción completó o se canceló el resto del pedido.
    const previa = b.idem && p.recepciones?.find((r) => r.idem === b.idem);
    if (previa) {
      const gasto = await leerUno(u, 'gastos', previa.gasto);
      if (!gasto) return { error: 'El gasto de esa recepción ya no existe' };
      return { gasto, recepcion: previa, pedido: p, repetida: true };
    }
    const estado = estadoPedidoProv(p).estado;
    if (estado === 'cancelado') return { error: 'Ese pedido está cancelado' };
    if (estado === 'recibido') return { error: 'Ese pedido ya está recibido' };
    const seleccion = lineasDeRecepcion(p, b.recibido);
    if (seleccion.error) return seleccion;
    const datos = gastoDeRecepcion(p, { fecha: b.fecha, recibido: seleccion.lineas, ivaPct: b.ivaPct, actividad: actividadesDe(u)[0].id });
    if (datos.error) return datos;
    // El número sigue al más alto (no a cuántas hay): si se borra la compra de una recepción, la siguiente no repite id.
    const numero = Math.max(0, ...(p.recepciones || []).map((r) => Number(String(r.id).split(':').pop()) || 0)) + 1;
    const id = createHash('sha256').update(JSON.stringify([u.empresa || u.id, p.id, numero])).digest('hex').slice(0, 32);
    const gasto = { id: `pp-${id}`, ...datos };
    const recepcion = { id: `${p.id}:${numero}`, fecha: gasto.fecha, gasto: gasto.id, lineas: seleccion.lineas, ...(b.idem ? { idem: b.idem } : {}) };
    const pedido = { ...p, recepciones: [...(p.recepciones || []), recepcion], recibido: undefined, gasto: undefined };
    pedido.estado = estadoPedidoProv(pedido).estado;
    if (pedido.estado === 'recibido') { pedido.recibido = gasto.fecha; pedido.gasto = gasto.id; }
    if (quedaMs() <= 0) return { error: 'La recepción ha tardado demasiado: inténtalo de nuevo.' };
    // Un corte no puede dejar un gasto con stock sin su recepción, ni una recepción sin gasto.
    await redis.multi().hset(clave(u, 'gastos'), { [gasto.id]: gasto }).hset(clave(u, 'pedidosProv'), { [pedido.id]: pedido }).exec();
    return { gasto, recepcion, pedido, repetida: false };
  });
}

export const cancelarPedidoProv = (u, id) => conPedidoProv(u, id, async (p, { quedaMs }) => {
  if (estadoPedidoProv(p).estado === 'recibido') return { error: 'Ese pedido ya está recibido' };
  if (quedaMs() <= 0) return { error: 'La operación ha tardado demasiado: inténtalo de nuevo.' };
  const pedido = { ...p, cancelado: p.cancelado || new Date().toISOString().slice(0, 10), estado: 'cancelado' };
  await guardar(u, 'pedidosProv', pedido);
  return { pedido };
});

export const borrarPedidoProv = (u, id) => conPedidoProv(u, id, async (p, { quedaMs }) => {
  if (p.recibido || p.recepciones?.length) return { error: 'Ese pedido tiene recepciones: no se puede borrar' };
  if (quedaMs() <= 0) return { error: 'La operación ha tardado demasiado: inténtalo de nuevo.' };
  await borrar(u, 'pedidosProv', id);
  return { pedido: p };
});

// Numera y guarda un pedido o un albarán nuevo (o lo corrige, con `antes`, conservando su número).
export async function guardarDoc(u, datos, antes) {
  const anio = Number(datos.fecha.slice(0, 4));
  const numero = antes && antes.anio === anio ? antes.numero : siguiente((await leer(u, 'albaranes')) || [], datos.tipo, anio);
  const d = { ...(antes || {}), entrega: undefined, ...datos, id: antes?.id || crypto.randomUUID(), numero, anio, ...(antes ? { editado: new Date().toISOString() } : { creado: new Date().toISOString(), por: u.id }) };
  await guardar(u, 'albaranes', d);
  return d;
}

// Al borrar una factura hecha con albaranes, esos albaranes vuelven a estar pendientes de facturar.
export async function soltarAlbaranes(u, f) {
  const ids = new Set((f?.lineas || []).map((l) => l.albaran).filter(Boolean));
  if (!ids.size) return;
  for (const a of ((await leer(u, 'albaranes')) || []).filter((x) => ids.has(x.id) && x.factura === f.id)) await guardar(u, 'albaranes', { ...a, factura: undefined });
}

export async function siguientePedidoProv(u, anio) {
  return Math.max(0, ...((await leer(u, 'pedidosProv')) || []).filter((p) => p.anio === anio).map((p) => p.numero)) + 1;
}

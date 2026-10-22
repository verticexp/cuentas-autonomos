// Albaranes y pedidos en el servidor: lo que lee y guarda en Redis (la lógica pura está en lib/albaranes.js).
import { createHash } from 'node:crypto';
import { borrar, clave, guardar, leer, leerUno, redis } from './redis.js';
import { estadoPedidoProv, facturaDeAlbaranes, gastoDeRecepcion, limpiarDoc, lineasDeRecepcion } from './albaranes.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { RiesgoSuperado, crearFactura, limpiar } from './facturas.js';
import { conLimiteDe, revisarRiesgo } from './tercerosServidor.js';
import { riesgoAlbaran } from './riesgo.js';
import { mismoCliente } from './terceros.js';
import { actividadesDe, fiscalDe, usaIgic } from './empresa.js';
import { hoy } from './formato.js';

export const normalizarIdsAlbaranes = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))].sort().slice(0, 100);

// Cerrojo de cada pedido o albarán de cliente: lo toman facturar, corregir, cerrar y borrar (informe R05).
const cerrojoDoc = (u, id) => `albaran:${u.empresa || u.id}:${id}`;

// Orden estable para que dos selecciones solapadas nunca esperen la una por la otra.
export async function facturarAlbaranes(u, b) {
  const ids = normalizarIdsAlbaranes(b.ids);
  if (!ids.length) return { error: 'Elige al menos un albarán' };
  const cerrojos = [];
  const tomar = (i) => i < ids.length
    ? conCerrojo(cerrojoDoc(u, ids[i]), async (c) => {
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
    const datos = limpiar({ ...fd, fecha: b.fecha, actividad: a.id, irpfPct: b.irpfPct ?? a.irpfPct, cobrada: b.cobrada }, actividades, fiscalDe(u).tipo === 'sociedad', { igic: usaIgic(fiscalDe(u)) });
    if (datos.error) return datos;
    const idem = `alb:${createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0, 32)}`;
    vigente();
    const resultado = await crearFactura(u, datos, { idem, albaranes: ids });
    if (resultado.error) return resultado;
    vigente();
    await redis.hset(clave(u, 'albaranes'), Object.fromEntries(lista.map((a) => [a.id, { ...a, factura: resultado.factura.id }])));
    return { ...resultado, albaranes: lista };
  };
  try { return await tomar(0); } catch (e) { return { error: e.message }; }
}

// Informe R05: corregir, cerrar o borrar un pedido o albarán se hace con su cerrojo y releyéndolo dentro. Así una
// corrección y una facturación a la vez nunca acaban las dos en «hecho»: o la factura recoge la corrección, o la corrección
// se rechaza porque el albarán ya está facturado.
const conDoc = async (u, id, fn) => {
  try {
    return await conCerrojo(cerrojoDoc(u, id), async (c) => {
      const d = await leerUno(u, 'albaranes', id);
      if (!d) return { error: 'Ese documento ya no existe', status: 404 };
      return fn(d, () => c.quedaMs() > 0);
    });
  } catch (e) {
    if (e instanceof Ocupado) return { error: e.message };
    throw e;
  }
};
const TARDE = { error: 'La operación ha tardado demasiado: inténtalo de nuevo.' };

// Corrige un pedido o albarán (b: el formulario). La escritura va dentro del cerrojo: guardarDoc no puede quedar fuera.
export const corregirDoc = (u, id, b) => conDoc(u, id, async (antes, aTiempo) => {
  if (antes.factura) return { error: 'Ese albarán ya está facturado: para cambiarlo, borra o rectifica la factura' };
  const datos = limpiarDoc(b, antes.tipo);
  if (datos.error) return datos;
  if (datos.pedido && !(await leerUno(u, 'albaranes', datos.pedido))) delete datos.pedido;
  if (!aTiempo()) return TARDE;
  try { return { doc: await guardarDoc(u, datos, antes) }; } catch (e) {
    if (e instanceof RiesgoSuperado || e.status === 409) return { error: e.message, status: 409 };
    throw e;
  }
});

export const cerrarPedido = (u, id, cerrado) => conDoc(u, id, async (p, aTiempo) => {
  if (p.tipo !== 'pedido') return { error: 'Ese pedido ya no existe', status: 404 };
  if (!aTiempo()) return TARDE;
  // La fecha de hoy en Madrid (con toISOString, entre las 00:00 y las 02:00 salía la de ayer).
  const doc = { ...p, cerrado: cerrado ? hoy() : undefined };
  await guardar(u, 'albaranes', doc);
  return { doc };
});

export const borrarDoc = (u, id) => conDoc(u, id, async (d, aTiempo) => {
  if (d.factura) return { error: 'Ese albarán está facturado: borra antes la factura' };
  if (d.tipo === 'pedido' && ((await leer(u, 'albaranes')) || []).some((a) => a.pedido === d.id)) return { error: 'Ese pedido tiene albaranes: bórralos antes o ciérralo' };
  if (!aTiempo()) return TARDE;
  await borrar(u, 'albaranes', id);
  return { doc: d };
});

// Cerrojo de cada pedido a proveedor: recibir, cancelar, borrar y también editar o borrar el gasto de una recepción
// (lib/gastosServidor.js, informe R04).
export const cerrojoPedidoProv = (u, id) => `pedidoprov:${u.empresa || u.id}:${id}`;

const conPedidoProv = async (u, id, fn) => {
  try {
    return await conCerrojo(cerrojoPedidoProv(u, id), async (c) => {
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
  const pedido = { ...p, cancelado: p.cancelado || hoy(), estado: 'cancelado' };
  await guardar(u, 'pedidosProv', pedido);
  return { pedido };
});

export const borrarPedidoProv = (u, id) => conPedidoProv(u, id, async (p, { quedaMs }) => {
  if (p.recibido || p.recepciones?.length) return { error: 'Ese pedido tiene recepciones: no se puede borrar' };
  if (quedaMs() <= 0) return { error: 'La operación ha tardado demasiado: inténtalo de nuevo.' };
  await borrar(u, 'pedidosProv', id);
  return { pedido: p };
});

// Informe de capacidad E05: los contadores de «numeracionDocs» se verifican una sola vez por colección contra los
// documentos guardados (los de antes del contador); después basta leer el contador, sin cargar el histórico. Borrar
// nunca baja un contador. Solo dentro del cerrojo «numdocs».
async function verificarDocs(u, nombre, campoDe) {
  const k = clave(u, 'numeracionDocs'), marca = `_verificado:${nombre}`;
  if (await redis.hget(k, marca)) return;
  const [cont, docs] = await Promise.all([redis.hgetall(k), leer(u, nombre)]);
  const max = {};
  for (const d of docs || []) { const c = campoDe(d); if (c && Number.isInteger(d.numero) && d.numero > (max[c] || 0)) max[c] = d.numero; }
  const subir = Object.fromEntries(Object.entries(max).filter(([c, n]) => n > (Number(cont?.[c]) || 0)));
  await redis.hset(k, { ...subir, [marca]: new Date().toISOString() });
}

// Numera y guarda un pedido o un albarán nuevo (o lo corrige, con `antes`, conservando su número).
// Un albarán nuevo, o uno que sube de importe, suma riesgo al cliente: si se pasa de su riesgo máximo no se guarda (lanza
// RiesgoSuperado). Con límite, bajo el cerrojo de emisión (orden de cerrojos: albarán → emisión → numeración), así una factura
// y un albarán a la vez no suman por encima. Los pedidos no cuentan: no se han servido.
export async function guardarDoc(u, datos, antes) {
  if (datos.tipo !== 'albaran') return numerarDoc(u, datos, antes);
  const r = await conLimiteDe(u, datos.cliente, async () => {
    const previo = antes && mismoCliente(antes.cliente, datos.cliente) ? riesgoAlbaran(antes) : 0;
    const { bloqueo } = await revisarRiesgo(u, datos.cliente, riesgoAlbaran(datos) - previo);
    if (bloqueo) return { bloqueo };
    return { doc: await numerarDoc(u, datos, antes) };
  });
  if (r.error) throw Object.assign(new Error(r.error), { status: 409 });
  if (r.bloqueo) throw new RiesgoSuperado(r.bloqueo);
  return r.doc;
}

async function numerarDoc(u, datos, antes) {
  return conCerrojo('numdocs:' + (u.empresa || u.id), async ({ quedaMs }) => {
    const anio = Number(datos.fecha.slice(0, 4));
    const campo = `${datos.tipo}|${anio}`;
    // Respeta documentos anteriores al contador; borrar el último no permite reutilizar su número.
    await verificarDocs(u, 'albaranes', (d) => d.tipo && d.anio && `${d.tipo}|${d.anio}`);
    const ultimo = Number(await redis.hget(clave(u, 'numeracionDocs'), campo)) || 0;
    const numero = antes && antes.anio === anio ? antes.numero : ultimo + 1;
    const d = { ...(antes || {}), entrega: undefined, ...datos, id: antes?.id || crypto.randomUUID(), numero, anio, ...(antes ? { editado: new Date().toISOString() } : { creado: new Date().toISOString(), por: u.id }) };
    if (quedaMs() <= 0) throw new Error('La numeración ha tardado demasiado: inténtalo de nuevo.');
    await redis.multi().hset(clave(u, 'albaranes'), { [d.id]: d }).hset(clave(u, 'numeracionDocs'), { [campo]: Math.max(ultimo, numero) }).exec();
    return d;
  });
}

// Al borrar una factura hecha con albaranes, esos albaranes vuelven a estar pendientes de facturar.
export async function soltarAlbaranes(u, f) {
  const ids = new Set((f?.lineas || []).map((l) => l.albaran).filter(Boolean));
  if (!ids.size) return;
  for (const a of ((await leer(u, 'albaranes')) || []).filter((x) => ids.has(x.id) && x.factura === f.id)) await guardar(u, 'albaranes', { ...a, factura: undefined });
}

// Numera y guarda el pedido a proveedor en la misma transacción que su contador.
export async function crearPedidoProv(u, datos) {
  return conCerrojo('numdocs:' + (u.empresa || u.id), async ({ quedaMs }) => {
    const anio = Number(datos.fecha.slice(0, 4));
    const campo = `proveedor|${anio}`;
    await verificarDocs(u, 'pedidosProv', (p) => p.anio && `proveedor|${p.anio}`);
    const numero = (Number(await redis.hget(clave(u, 'numeracionDocs'), campo)) || 0) + 1;
    const p = { id: crypto.randomUUID(), numero, anio, ...datos, estado: 'pendiente', creado: new Date().toISOString(), por: u.id };
    if (quedaMs() <= 0) throw new Error('La numeración ha tardado demasiado: inténtalo de nuevo.');
    await redis.multi().hset(clave(u, 'pedidosProv'), { [p.id]: p }).hset(clave(u, 'numeracionDocs'), { [campo]: numero }).exec();
    return p;
  });
}

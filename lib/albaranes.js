// Pedidos de clientes, albaranes y pedidos a proveedores. El circuito de venta: pedido → albarán (el stock sale al
// entregar, lib/inventario.js) → una factura que agrupa varios albaranes (sus líneas llevan el albarán, para no volver a
// restar el stock). El de compra: «Qué pedir» → pedido al proveedor → al recibirlo, un gasto con su stock.
// Se guardan en el hash «albaranes» (tipo 'pedido' | 'albaran') y en «pedidosProv». Sin dependencias de servidor.
import { baseLinea, leerImporte, limpiarLineas, r2, r3 } from './calculos.js';
import { fechaReal } from './validacion.js';

const txt = (v, n = 120) => String(v ?? '').trim().slice(0, n);
export const PREFIJO = { pedido: 'PED', albaran: 'ALB', proveedor: 'PP' };
export const NOMBRE = { pedido: 'Pedido', albaran: 'Albarán', proveedor: 'Pedido a proveedor' };

// Número a mostrar: ALB2026-007.
export const numeroDoc = (d) => `${PREFIJO[d.tipo] || ''}${d.anio}-${String(d.numero).padStart(3, '0')}`;
export const siguiente = (docs, tipo, anio) => Math.max(0, ...docs.filter((d) => d.tipo === tipo && d.anio === anio).map((d) => d.numero)) + 1;

// Pedido o albarán de un cliente: { fecha, cliente, lineas, nota, pedido (id del pedido del que sale el albarán) }.
// Las líneas de un albarán que sale de un pedido llevan `linea`: la del pedido que sirven.
export function limpiarDoc(b, tipo) {
  if (!['pedido', 'albaran'].includes(tipo)) return { error: 'Tipo no válido' };
  if (!fechaReal(b.fecha)) return { error: 'Fecha no válida' };
  if (tipo === 'pedido' && b.entrega && !fechaReal(b.entrega)) return { error: 'Fecha de entrega no válida' };
  const c = b.cliente || {};
  if (!txt(c.nombre)) return { error: 'Falta el cliente' };
  // Las líneas vacías se quitan antes, para que cada una conserve la línea del pedido que sirve.
  const llenas = (Array.isArray(b.lineas) ? b.lineas : []).filter((l) => String(l?.concepto || '').trim() || leerImporte(l?.precio));
  if (llenas.length > 100) return { error: 'Como mucho 100 líneas por documento' };
  const lineas = limpiarLineas(llenas)?.map((l, i) => {
    const x = { ...l };
    delete x.albaran;
    const k = llenas[i]?.linea === '' || llenas[i]?.linea === undefined ? NaN : Number(llenas[i].linea);
    return Number.isInteger(k) && k >= 0 ? { ...x, linea: k } : x;
  });
  if (!lineas?.length) return { error: 'Añade al menos una línea' };
  if (lineas.some((l) => !l.concepto)) return { error: 'Falta el concepto de alguna línea' };
  if (lineas.some((l) => l.cantidad <= 0)) return { error: 'Las cantidades tienen que ser positivas (las devoluciones, con una rectificativa)' };
  return {
    tipo,
    fecha: b.fecha,
    cliente: { nombre: txt(c.nombre), nif: txt(c.nif, 20), direccion: txt(c.direccion), ciudad: txt(c.ciudad), ...(c.email ? { email: txt(c.email).toLowerCase() } : {}), ...(typeof c.pais === 'string' && /^[a-z]{2}$/i.test(c.pais.trim()) ? { pais: c.pais.trim().toUpperCase() } : {}) },
    lineas,
    nota: txt(b.nota, 300),
    ...(tipo === 'pedido' && b.entrega ? { entrega: b.entrega } : {}),
    ...(tipo === 'albaran' && /^[a-z0-9-]{1,40}$/i.test(b.pedido || '') ? { pedido: b.pedido } : {}),
  };
}

export const baseDoc = (d) => r2((d.lineas || []).reduce((s, l) => s + baseLinea(l), 0));

// Cuánto se ha servido de cada línea de un pedido y en qué estado está: pendiente, parcial, servido (o cerrado a mano).
export function estadoPedido(p, albaranes = []) {
  const servido = (p.lineas || []).map(() => 0);
  const mios = albaranes.filter((a) => a.tipo === 'albaran' && a.pedido === p.id);
  for (const a of mios) for (const l of a.lineas || []) if (Number.isInteger(l.linea) && l.linea < servido.length) servido[l.linea] = r3(servido[l.linea] + Number(l.cantidad));
  const lineas = (p.lineas || []).map((l, i) => ({ ...l, servido: servido[i], pendiente: Math.max(0, r3(l.cantidad - servido[i])) }));
  const algo = servido.some((x) => x > 0);
  const todo = lineas.every((l) => l.pendiente === 0);
  return { lineas, albaranes: mios.map((a) => a.id), estado: p.cerrado ? 'cerrado' : todo ? 'servido' : algo ? 'parcial' : 'pendiente' };
}

// Albarán con lo que falta por servir de un pedido (para editarlo antes de guardarlo).
export function albaranDePedido(p, albaranes, fecha) {
  const { lineas } = estadoPedido(p, albaranes);
  return {
    tipo: 'albaran', fecha, cliente: p.cliente, pedido: p.id, nota: '',
    lineas: lineas.map((l, i) => ({ concepto: l.concepto, cantidad: l.pendiente, precio: l.precio, dto: l.dto, ivaPct: l.ivaPct, linea: i, ...(l.producto ? { producto: l.producto } : {}) })).filter((l) => l.cantidad > 0),
  };
}

// Factura que agrupa varios albaranes del mismo cliente: cada línea dice de qué albarán viene (y lleva su id, para no
// volver a restar el stock). Devuelve los datos para lib/facturas.js limpiar() o { error }.
export function facturaDeAlbaranes(lista) {
  if (!lista.length) return { error: 'Elige al menos un albarán' };
  if (new Set(lista.map((a) => a.id)).size !== lista.length) return { error: 'Hay albaranes duplicados en la selección' };
  if (lista.some((a) => a.tipo !== 'albaran')) return { error: 'Solo se facturan albaranes' };
  if (lista.some((a) => a.factura)) return { error: 'Alguno de esos albaranes ya está facturado' };
  const cli = (a) => (a.cliente?.nif || a.cliente?.nombre || '').toUpperCase().trim();
  if (new Set(lista.map(cli)).size > 1) return { error: 'Los albaranes tienen que ser del mismo cliente' };
  const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
  return {
    cliente: orden.at(-1).cliente,
    lineas: orden.flatMap((a) => a.lineas.map((l) => ({ concepto: `${numeroDoc(a)} · ${l.concepto}`.slice(0, 200), cantidad: l.cantidad, precio: l.precio, dto: l.dto, ivaPct: l.ivaPct, albaran: a.id, ...(l.producto ? { producto: l.producto } : {}) }))),
    nota: `Albaranes ${orden.map(numeroDoc).join(', ')}`.slice(0, 300),
  };
}

// ---------- Pedidos a proveedores ----------

// { fecha, proveedor, proveedorNif, lineas: [{ producto, concepto, cantidad, coste }], nota }
export function limpiarPedidoProv(b, productos = []) {
  if (!fechaReal(b.fecha)) return { error: 'Fecha no válida' };
  const proveedor = txt(b.proveedor, 80);
  if (!proveedor) return { error: 'Falta el proveedor' };
  const P = new Map(productos.map((p) => [p.id, p]));
  const lineas = (Array.isArray(b.lineas) ? b.lineas : []).slice(0, 100).map((l) => {
    const p = P.get(l.producto);
    return { ...(p ? { producto: p.id } : {}), concepto: txt(l.concepto || p?.nombre, 200), ...(p?.sku ? { sku: p.sku } : {}), cantidad: r3(leerImporte(l.cantidad ?? 0) || 0), coste: r2(leerImporte(l.coste ?? 0) || 0) };
  }).filter((l) => l.concepto && l.cantidad > 0);
  if (!lineas.length) return { error: 'Añade al menos un producto' };
  return { fecha: b.fecha, proveedor, ...(txt(b.proveedorNif, 20) ? { proveedorNif: txt(b.proveedorNif, 20).toUpperCase() } : {}), lineas, nota: txt(b.nota, 300) };
}

export const totalPedidoProv = (p) => r2((p.lineas || []).reduce((s, l) => s + l.cantidad * l.coste, 0));

// La posición identifica cada línea, también cuando se repite un producto o no lo hay.
export function estadoPedidoProv(p) {
  const recibidas = (p.lineas || []).map(() => 0);
  const antiguamenteCompleto = p.recibido && !p.recepciones?.length;
  for (const r of p.recepciones || []) for (const l of r.lineas || []) {
    if (Number.isInteger(l.linea) && l.linea >= 0 && l.linea < recibidas.length) recibidas[l.linea] = r3(recibidas[l.linea] + Number(l.cantidad));
  }
  const lineas = (p.lineas || []).map((l, i) => {
    const recibida = antiguamenteCompleto ? Number(l.cantidad) : recibidas[i];
    return { ...l, linea: i, pedida: Number(l.cantidad), recibida, pendiente: Math.max(0, r3(l.cantidad - recibida)) };
  });
  return { lineas, estado: p.cancelado ? 'cancelado' : lineas.every((l) => l.pendiente === 0) ? 'recibido' : lineas.some((l) => l.recibida > 0) ? 'parcial' : 'pendiente' };
}

// Al borrar el gasto de una recepción, el pedido recupera lo que esa recepción había recibido. Devuelve el pedido nuevo,
// o null si el gasto no era de ninguna recepción (pedidos antiguos: se tratan fuera, con p.gasto).
export function sinRecepcionDeGasto(p, gasto) {
  if (!p?.recepciones?.some((r) => r.gasto === gasto)) return null;
  const nuevo = { ...p, recepciones: p.recepciones.filter((r) => r.gasto !== gasto), recibido: undefined, gasto: undefined };
  return { ...nuevo, estado: estadoPedidoProv(nuevo).estado };
}

export function lineasDeRecepcion(p, recibido) {
  const { lineas } = estadoPedidoProv(p);
  if (recibido !== undefined && !Array.isArray(recibido)) return { error: 'Las líneas recibidas no son válidas' };
  const seleccion = recibido === undefined ? lineas.map((l) => ({ ...l, cantidad: l.pendiente })) : recibido;
  if (seleccion.length > 100) return { error: 'Demasiadas líneas recibidas' };
  const vistas = new Set(), recibidas = [];
  for (const l of seleccion) {
    if (!l || typeof l !== 'object') return { error: 'Línea recibida no válida' };
    const cantidad = r3(leerImporte(l.cantidad ?? 0));
    if (!Number.isFinite(cantidad) || cantidad < 0) return { error: 'Las cantidades recibidas deben ser positivas' };
    if (!cantidad) continue;
    let i = l.linea;
    if (i === undefined) {
      const candidatas = lineas.filter((x) => l.producto ? x.producto === l.producto : !x.producto && x.concepto === l.concepto);
      if (candidatas.length !== 1) return { error: 'Indica la posición de la línea recibida' };
      i = candidatas[0].linea;
    }
    const pedida = lineas[i];
    if (!Number.isInteger(i) || !pedida || (l.producto && l.producto !== pedida.producto)) return { error: 'Esa línea no pertenece al pedido' };
    if (vistas.has(i)) return { error: 'Hay líneas duplicadas en la recepción' };
    vistas.add(i);
    if (!pedida.pendiente) return { error: `Ya recibiste todo lo pedido de ${pedida.concepto}` };
    if (cantidad > pedida.pendiente) return { error: `Superas lo pendiente de ${pedida.concepto} (${pedida.pendiente})` };
    const coste = r2(leerImporte(l.coste ?? pedida.coste));
    if (!Number.isFinite(coste) || coste < 0) return { error: 'Coste recibido no válido' };
    recibidas.push({ linea: i, ...(pedida.producto ? { producto: pedida.producto } : {}), concepto: pedida.concepto, cantidad, coste });
  }
  return recibidas.length ? { lineas: recibidas } : { error: 'No ha llegado nada' };
}

// Unidades pedidas y sin recibir, por producto (para que «Qué pedir» no las proponga otra vez).
export function enCamino(pedidos = []) {
  const m = {};
  for (const p of pedidos) {
    const { estado, lineas } = estadoPedidoProv(p);
    if (estado === 'recibido' || estado === 'cancelado') continue;
    for (const l of lineas) if (l.producto && l.pendiente) m[l.producto] = r3((m[l.producto] || 0) + l.pendiente);
  }
  return m;
}

// Al recibir el pedido: el gasto (pendiente de pago) con las unidades que entran al almacén.
// recibido: [{ producto, cantidad, coste }] (por defecto, lo pedido). ivaPct: el de la factura del proveedor.
export function gastoDeRecepcion(p, { fecha, recibido, ivaPct = 21, actividad } = {}) {
  const fechaRecepcion = fecha === undefined ? p.fecha : fecha;
  if (!fechaReal(fechaRecepcion)) return { error: 'Fecha de recepción no válida' };
  const seleccion = lineasDeRecepcion(p, recibido);
  if (seleccion.error) return seleccion;
  const { lineas } = seleccion;
  const base = r2(lineas.reduce((s, l) => s + r2(l.cantidad * l.coste), 0));
  if (!base) return { error: 'Pon el coste de lo recibido' };
  const stock = lineas.filter((l) => /^[a-f0-9]{12}$/.test(l.producto || '')).map(({ producto, cantidad, coste }) => ({ producto, cantidad, coste }));
  return {
    fecha: fechaRecepcion,
    ...(actividad ? { actividad } : {}),
    concepto: `Pedido ${numeroDoc({ ...p, tipo: 'proveedor' })} · ${p.proveedor}`.slice(0, 140),
    proveedor: p.proveedor,
    ...(p.proveedorNif ? { proveedorNif: p.proveedorNif } : {}),
    base,
    ivaPct: [21, 10, 4, 0].includes(Number(ivaPct)) ? Number(ivaPct) : 21,
    categoria: '600',
    pendiente: true,
    pedidoProv: p.id,
    ...(stock.length ? { stock } : {}),
  };
}

// Fichas de clientes y proveedores en el servidor: lo que lee y guarda en Redis (la lógica pura está en lib/terceros.js
// y lib/riesgo.js). El límite de riesgo se comprueba aquí, dentro de la emisión de facturas (lib/facturas.js).
import { guardar, borrar, leer, leerUno } from './redis.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { fichasMarcadas, leerCliente, leerClientePendientes, todasFichas, documentos } from './indices.js';
import { delCliente } from './portal.js';
import { pendienteDe, r2 } from './calculos.js';
import { claveProveedor, proveedores, proveedoresDeFichas, unirProveedores } from './proveedores.js';
import { evaluarRiesgo, riesgoAlbaran, riesgoAlbaranes, riesgoDe, tieneLimite } from './riesgo.js';
import { CAMPOS_FICHA, idCliente, limpiarFicha } from './terceros.js';

const empresaDe = (u) => u.empresa || u.id;
const BASICOS = ['nombre', 'nif', 'direccion', 'ciudad', 'email', 'pais'];

// ---------- Clientes ----------
export const fichaCliente = (u, nombre) => (idCliente(nombre) ? leerUno(u, 'clientes', idCliente(nombre)) : null);

// Guarda los datos básicos de un cliente (los de la última factura) sin perder los de su ficha (forma de cobro, plazo,
// comercial, zona, riesgo máximo…): lo que no viene de las facturas se conserva tal cual.
export async function guardarCliente(u, c) {
  const id = idCliente(c.nombre);
  const antes = await leerUno(u, 'clientes', id);
  const ficha = Object.fromEntries(CAMPOS_FICHA.filter((k) => antes?.[k] !== undefined).map((k) => [k, antes[k]]));
  return guardar(u, 'clientes', { id, ...c, ...ficha });
}

// Lo que debe cada cliente ahora, por nombre: las facturas sin cobrar (sus fichas, sin leer ninguna factura) y los albaranes
// entregados sin facturar. Es una vista rápida para listados y formularios (no distingue dos clientes con el mismo nombre y
// distinto NIF); la comprobación del límite usa riesgoCliente, que sí los distingue. Los albaranes no tienen índice: se leen
// todos, así que solo se piden cuando algún cliente tiene límite.
export async function riesgosPendientes(u, { albaranes = true } = {}) {
  const debe = new Map();
  const sumar = (nombre, n) => { const k = idCliente(nombre); if (k && n) debe.set(k, r2((debe.get(k) || 0) + n)); };
  const [fichas, docs] = await Promise.all([fichasMarcadas(u, 'facturas', 'p'), albaranes ? leer(u, 'albaranes') : []]);
  for (const f of fichas) sumar(f.c, Number(f.p) || 0);
  for (const a of docs || []) sumar(a.cliente?.nombre, riesgoAlbaran(a));
  return new Map([...debe].map(([k, v]) => [k, Math.max(0, v)]));
}

// Riesgo exacto de un cliente (por NIF y nombre, como el portal): lo que debe en facturas y en albaranes sin facturar, y los
// documentos que lo forman. excluirAlbaranes: ids que no cuentan (los que la factura que se emite va a sustituir).
export async function riesgoCliente(u, { nombre, nif } = {}, { excluirAlbaranes = [] } = {}) {
  const quien = { id: idCliente(nombre), nif };
  const [docs, todos] = await Promise.all([leerClientePendientes(u, 'facturas', { nombre, nif }), leer(u, 'albaranes')]);
  const facturas = delCliente(quien, docs).filter((f) => pendienteDe(f) !== 0);
  const fuera = new Set(excluirAlbaranes);
  const sinFacturar = (todos || []).filter((a) => riesgoAlbaran(a) > 0 && !fuera.has(a.id));
  const albaranes = delCliente(quien, sinFacturar, sinFacturar);
  const deFacturas = riesgoDe(facturas), deAlbaranes = riesgoAlbaranes(albaranes);
  return { riesgo: r2(deFacturas + deAlbaranes), deFacturas, deAlbaranes, facturas, albaranes };
}

const conRiesgo = (c, riesgo) => {
  const limite = tieneLimite(c) ? Number(c.riesgoMax) : null;
  return { ...c, riesgo, limite, disponible: limite === null ? null : Math.max(0, r2(limite - riesgo)), excedido: limite !== null && riesgo > limite };
};

// Todos los clientes con su riesgo: [{ ...ficha, riesgo, limite, disponible, excedido }] por nombre.
export async function listarClientes(u) {
  const clientes = (await leer(u, 'clientes')) || [];
  const debe = await riesgosPendientes(u, { albaranes: clientes.some(tieneLimite) });
  return clientes.map((c) => conRiesgo(c, debe.get(c.id) || 0)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Un cliente con su riesgo exacto, las facturas pendientes que lo forman y las últimas facturas. null si no existe.
export async function detalleCliente(u, id, { ultimas = 30 } = {}) {
  const c = await leerUno(u, 'clientes', String(id));
  if (!c) return null;
  const quien = { nombre: c.nombre, nif: c.nif };
  const [{ riesgo, deFacturas, deAlbaranes, facturas: pendientes, albaranes }, todas] = await Promise.all([riesgoCliente(u, quien), leerCliente(u, 'facturas', quien)]);
  const recientes = delCliente({ ...c, id: c.id }, todas).slice(0, ultimas);
  return { cliente: conRiesgo(c, riesgo), pendientes, albaranes, deFacturas, deAlbaranes, facturas: recientes };
}

// ¿Cabe `incremento` más de riesgo para este cliente? { ficha, bloqueo }: bloqueo es la evaluación (con `error`) si no cabe.
// Sin ficha, sin límite o con incremento <= 0 no se lee ninguna factura. Se llama dentro del cerrojo de emisión.
export async function revisarRiesgo(u, cliente, incremento, { excluirAlbaranes } = {}) {
  const ficha = await fichaCliente(u, cliente?.nombre);
  if (!ficha || !tieneLimite(ficha) || !(Number(incremento) > 0)) return { ficha };
  const { riesgo } = await riesgoCliente(u, { nombre: cliente.nombre, nif: cliente.nif }, { excluirAlbaranes });
  const ev = evaluarRiesgo({ limite: ficha.riesgoMax, riesgo, incremento, cliente: ficha.nombre });
  return ev.ok ? { ficha } : { ficha, bloqueo: ev };
}

// Ejecuta fn bajo el cerrojo de emisión si el cliente tiene límite (así dos altas a la vez no suman por encima de él);
// sin límite, directamente. Orden de cerrojos de la app: emisión → factura.
export async function conLimiteDe(u, cliente, fn) {
  const ficha = await fichaCliente(u, cliente?.nombre);
  if (!tieneLimite(ficha)) return fn();
  try { return await conCerrojo(`emision:${empresaDe(u)}`, fn); } catch (e) {
    if (e instanceof Ocupado) return { error: e.message, status: 409 };
    throw e;
  }
}

// Alta o cambio de la ficha de un cliente. b: el formulario; id: el cliente que se edita (sin id, uno nuevo).
// puedeRiesgo: si esta persona puede cambiar el riesgo máximo. Devuelve { cliente } o { error, errores?, status }.
export async function guardarFichaCliente(u, b, { id, puedeRiesgo = false } = {}) {
  const antes = id ? await leerUno(u, 'clientes', String(id)) : null;
  if (id && !antes) return { error: 'Ese cliente ya no existe', status: 404 };
  // El nombre se fija con el primero: las facturas lo llevan escrito y es lo que las une a la ficha.
  const v = limpiarFicha(antes ? { ...b, nombre: antes.nombre } : b, 'cliente');
  if (!v.ok) return { error: v.error, errores: v.errores, status: 400 };
  const { datos } = v;
  if (!antes && (await leerUno(u, 'clientes', idCliente(datos.nombre)))) return { error: 'Ya existe un cliente con ese nombre', status: 409 };
  if (datos.riesgoMax !== antes?.riesgoMax && !puedeRiesgo) return { error: 'Solo quien administra la empresa puede cambiar el riesgo máximo', status: 403 };
  const otros = Object.fromEntries(Object.entries(antes || {}).filter(([k]) => !BASICOS.includes(k) && !CAMPOS_FICHA.includes(k)));
  const cliente = { ...otros, id: antes?.id || idCliente(datos.nombre), ...datos };
  await guardar(u, 'clientes', cliente);
  return { cliente, nuevo: !antes };
}

// La ficha de un cliente que no tiene facturas. Con facturas no se borra: se volvería a crear con la siguiente.
export async function borrarFichaCliente(u, id) {
  const c = await leerUno(u, 'clientes', String(id));
  if (!c) return { error: 'Ese cliente ya no existe', status: 404 };
  if ((await leerCliente(u, 'facturas', { nombre: c.nombre, nif: c.nif })).length) return { error: 'Este cliente tiene facturas: la ficha no se puede borrar', status: 409 };
  await borrar(u, 'clientes', c.id);
  return { cliente: c };
}

// ---------- Proveedores ----------
// Los proveedores salen de los gastos (lib/proveedores.js); su ficha, aparte, en «fichasProv» (id = claveProveedor).
// Lista unida: los de los gastos con su ficha, y las fichas sin gastos todavía.
export async function listarProveedores(u) {
  const [gastos, fichas] = await Promise.all([todasFichas(u, 'gastos'), leer(u, 'fichasProv')]);
  return unirProveedores(proveedoresDeFichas(gastos), fichas || []);
}

// Un proveedor con su ficha y sus gastos. null si no hay ni gastos ni ficha con esa clave.
export async function detalleProveedor(u, clave) {
  const [gastos, fichas] = await Promise.all([todasFichas(u, 'gastos'), leer(u, 'fichasProv')]);
  const ids = gastos.filter((f) => f.c && claveProveedor({ proveedor: f.c, proveedorNif: f.n }) === clave).map((f) => f.id);
  const [p] = proveedores(await documentos(u, 'gastos', ids));
  const unidos = unirProveedores(p ? [{ ...p, gastos: undefined }] : [], fichas || []);
  const elegido = unidos.find((x) => x.clave === clave);
  if (!elegido) return null;
  return { ...elegido, gastos: p?.gastos || [] };
}

// Alta o cambio de la ficha de un proveedor. Sin id, la clave sale de su NIF o de su nombre, como los gastos.
// Con id que ya tiene ficha, se cambia (el nombre se fija); con id sin ficha (proveedor que viene de los gastos), se crea.
export async function guardarFichaProveedor(u, b, { id } = {}) {
  const clave = String(id || '').trim().slice(0, 200);
  const antes = clave ? await leerUno(u, 'fichasProv', clave) : null;
  const v = limpiarFicha(antes ? { ...b, nombre: antes.nombre } : b, 'proveedor');
  if (!v.ok) return { error: v.error, errores: v.errores, status: 400 };
  const { datos } = v;
  const nueva = clave || claveProveedor({ proveedor: datos.nombre, proveedorNif: datos.nif });
  if (!antes && (await leerUno(u, 'fichasProv', nueva))) return { error: 'Ya hay una ficha de este proveedor', status: 409 };
  const ficha = { id: nueva, ...datos };
  await guardar(u, 'fichasProv', ficha);
  return { ficha, nuevo: !antes };
}

export async function borrarFichaProveedor(u, id) {
  const f = await leerUno(u, 'fichasProv', String(id));
  if (!f) return { error: 'Esa ficha ya no existe', status: 404 };
  await borrar(u, 'fichasProv', f.id);
  return { ficha: f };
}

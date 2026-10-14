// Portal del cliente: un enlace público por cliente con todas sus facturas y presupuestos (/portal/<token>).
import { randomBytes } from 'node:crypto';
import { redis, leer, clave } from './redis.js';

const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const reciente = (a, b) => b.fecha.localeCompare(a.fecha) || (b.numero || 0) - (a.numero || 0);

// Los documentos del cliente. Con NIF en los dos lados manda el NIF (aunque cambie el nombre; dos personas con el mismo
// nombre y distinto NIF no se mezclan nunca, auditoría N01). Si a uno le falta el NIF se admite el mismo nombre, salvo que
// ese nombre aparezca en los documentos de la empresa con más de un NIF: entonces no se sabe de quién es y no se enseña.
// contexto: todos los documentos de la empresa (por defecto, los propios). Los más recientes primero.
export const delCliente = (c, docs, contexto = docs) => {
  const nombre = (d) => String(d.cliente?.nombre || '').trim().toUpperCase();
  const nifs = new Set((contexto || []).filter((d) => d.cliente && nombre(d) === c.id && nif(d.cliente.nif)).map((d) => nif(d.cliente.nif)));
  if (nif(c.nif)) nifs.add(nif(c.nif));
  return (docs || []).filter((d) => {
    if (!d.cliente) return false;
    const nd = nif(d.cliente.nif);
    if (nif(c.nif) && nd) return nd === nif(c.nif);
    return nombre(d) === c.id && nifs.size <= 1;
  }).sort(reciente);
};

// Da (y crea si no tiene) el enlace del portal de un cliente guardado. null si el cliente no existe. El enlace recuerda
// el NIF del cliente al crearlo: si luego otro cliente con el mismo nombre y distinto NIF ocupa su ficha, no hereda el
// enlace del anterior (se crea otro) ni el anterior pasa a enseñar los documentos del nuevo.
export async function enlacePortal(u, nombre) {
  const id = String(nombre || '').trim().toUpperCase();
  const cliente = redis && id && (await redis.hget(clave(u, 'clientes'), id));
  if (!cliente) return null;
  const hay = await redis.hget(clave(u, 'portales'), id);
  if (hay?.token) {
    const e = await redis.hget('portal-enlaces', hay.token);
    if (e) {
      if (!nif(e.nif) && nif(cliente.nif)) await redis.hset('portal-enlaces', { [hay.token]: { ...e, nif: cliente.nif } });
      if (!nif(e.nif) || !nif(cliente.nif) || nif(e.nif) === nif(cliente.nif)) return `/portal/${hay.token}`;
    }
  }
  const token = randomBytes(18).toString('base64url');
  await redis.hset('portal-enlaces', { [token]: { empresa: u.empresa || u.id, cliente: id, ...(cliente.nif ? { nif: cliente.nif } : {}) } });
  await redis.hset(clave(u, 'portales'), { [id]: { token } });
  return `/portal/${token}`;
}

export async function portalDe(token) {
  const enlace = token && redis && (await redis.hget('portal-enlaces', String(token)));
  if (!enlace) return null;
  const e = { empresa: enlace.empresa };
  const [cliente, empresa, facturas, presupuestos] = await Promise.all([
    redis.hget(clave(e, 'clientes'), enlace.cliente), redis.hget('empresas', enlace.empresa), leer(e, 'facturas'), leer(e, 'presupuestos'),
  ]);
  // Una empresa dada de baja (o que ya no existe) no tiene portal público: sus documentos se conservan, pero bloqueados.
  if (!cliente || !empresa || empresa.baja) return null;
  const c = { ...cliente, id: enlace.cliente, ...(enlace.nif ? { nif: enlace.nif } : {}) };
  const todos = [...(facturas || []), ...(presupuestos || [])];
  return { e, cliente: c, empresa, facturas: delCliente(c, facturas, todos), presupuestos: delCliente(c, presupuestos, todos) };
}

// Portal del cliente: un enlace público por cliente con todas sus facturas y presupuestos (/portal/<token>).
import { randomBytes } from 'node:crypto';
import { redis, leer, clave } from './redis.js';

const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const reciente = (a, b) => b.fecha.localeCompare(a.fecha) || (b.numero || 0) - (a.numero || 0);

// Los documentos del cliente: los que llevan su nombre (el id del cliente) o su NIF. Los más recientes primero.
export const delCliente = (c, docs) => (docs || [])
  .filter((d) => d.cliente && (String(d.cliente.nombre || '').trim().toUpperCase() === c.id || (nif(c.nif) !== '' && nif(d.cliente.nif) === nif(c.nif))))
  .sort(reciente);

// Da (y crea si no tiene) el enlace del portal de un cliente guardado. null si el cliente no existe.
export async function enlacePortal(u, nombre) {
  const id = String(nombre || '').trim().toUpperCase();
  if (!redis || !id || !(await redis.hget(clave(u, 'clientes'), id))) return null;
  const hay = await redis.hget(clave(u, 'portales'), id);
  if (hay?.token) return `/portal/${hay.token}`;
  const token = randomBytes(18).toString('base64url');
  await redis.hset('portal-enlaces', { [token]: { empresa: u.empresa || u.id, cliente: id } });
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
  if (!cliente) return null;
  const c = { ...cliente, id: enlace.cliente };
  return { e, cliente: c, empresa: empresa || {}, facturas: delCliente(c, facturas), presupuestos: delCliente(c, presupuestos) };
}

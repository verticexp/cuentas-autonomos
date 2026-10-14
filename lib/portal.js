// Portal del cliente: un enlace público por cliente con todas sus facturas y presupuestos (/portal/<token>).
import { randomBytes } from 'node:crypto';
import { redis, clave } from './redis.js';
import { leerCliente } from './indices.js';
import { nifNormal } from './fichas.js';

const nif = nifNormal;
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

// Da (y crea si no tiene) el enlace del portal de un cliente guardado. null si el cliente no existe. El enlace es de una
// identidad (nombre + NIF del documento desde el que se pide) y recuerda ese NIF: dos clientes con el mismo nombre y
// distinto NIF tienen cada uno su portal, y el nuevo no hereda el del anterior ni lo pisa (auditoría N01).
export async function enlacePortal(u, nombre, nifDoc) {
  const id = String(nombre || '').trim().toUpperCase();
  const cliente = redis && id && (await redis.hget(clave(u, 'clientes'), id));
  if (!cliente) return null;
  const identidad = nifDoc !== undefined ? nifDoc : cliente.nif;
  const k = nif(identidad) ? `${id}|${nif(identidad)}` : id;
  for (const clavePortal of k === id ? [id] : [k, id]) {
    const hay = await redis.hget(clave(u, 'portales'), clavePortal);
    const e = hay?.token && (await redis.hget('portal-enlaces', hay.token));
    if (!e) continue;
    // Un enlace de antes (clave solo por nombre) se reutiliza si es de la misma identidad o aún no tenía NIF.
    if (clavePortal === k || !nif(e.nif) || !nif(identidad) || nif(e.nif) === nif(identidad)) {
      if (!nif(e.nif) && nif(identidad)) await redis.hset('portal-enlaces', { [hay.token]: { ...e, nif: identidad } });
      return `/portal/${hay.token}`;
    }
  }
  const token = randomBytes(18).toString('base64url');
  await redis.hset('portal-enlaces', { [token]: { empresa: u.empresa || u.id, cliente: id, ...(nif(identidad) ? { nif: identidad } : {}) } });
  await redis.hset(clave(u, 'portales'), { [k]: { token } });
  return `/portal/${token}`;
}

export async function portalDe(token) {
  const enlace = token && redis && (await redis.hget('portal-enlaces', String(token)));
  if (!enlace) return null;
  const e = { empresa: enlace.empresa };
  const [cliente, empresa] = await Promise.all([redis.hget(clave(e, 'clientes'), enlace.cliente), redis.hget('empresas', enlace.empresa)]);
  // Una empresa dada de baja (o que ya no existe) no tiene portal público: sus documentos se conservan, pero bloqueados.
  if (!cliente || !empresa || empresa.baja) return null;
  const c = { ...cliente, id: enlace.cliente, ...(enlace.nif ? { nif: enlace.nif } : {}) };
  // Informe de capacidad E01: solo los documentos con su nombre o su NIF (índice de cliente), no los de toda la empresa.
  // Basta como contexto de delCliente: lo que no comparte nombre ni NIF nunca es suyo ni cambia la decisión.
  const quien = { nombre: c.id, nif: c.nif };
  const [facturas, presupuestos] = await Promise.all([leerCliente(e, 'facturas', quien), leerCliente(e, 'presupuestos', quien)]);
  const todos = [...(facturas || []), ...(presupuestos || [])];
  return { e, cliente: c, empresa, facturas: delCliente(c, facturas, todos), presupuestos: delCliente(c, presupuestos, todos) };
}

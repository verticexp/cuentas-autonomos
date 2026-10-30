// Portal del cliente: un enlace público por cliente con todas sus facturas y presupuestos (/portal/<token>).
import { randomBytes } from 'node:crypto';
import { redis, clave } from './redis.js';
import { leerCliente } from './indices.js';
import { nifNormal } from './fichas.js';
import { headers } from 'next/headers.js';
import { MUCHOS, ipDe, pasado, respuesta429 } from './limite.js';

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

// Caducidad (informe de seguridad M2): el enlace vale un año desde la última vez que la empresa lo usa (al abrir una
// factura o un presupuesto del cliente, o al enviarle uno). Un portal que nadie mueve deja de funcionar solo.
export const VIDA_PORTAL_DIAS = 365;
const hasta = (desde = Date.now()) => new Date(desde + VIDA_PORTAL_DIAS * 864e5).toISOString();
export const portalCaducado = (e, ahora = Date.now()) => Boolean(e?.hasta && Date.parse(e.hasta) < ahora);

// El enlace en uso de una identidad: { token, enlace, clavePortal } o null.
export async function enlaceActual(u, id, identidad) {
  const k = nif(identidad) ? `${id}|${nif(identidad)}` : id;
  for (const clavePortal of k === id ? [id] : [k, id]) {
    const hay = await redis.hget(clave(u, 'portales'), clavePortal);
    const e = hay?.token && (await redis.hget('portal-enlaces', hay.token));
    if (!e || portalCaducado(e)) continue;
    // Un enlace de antes (clave solo por nombre) se reutiliza solo si es de la misma identidad exacta: los dos sin NIF o
    // con el mismo. Un enlace sin NIF no pasa a otro cliente con el mismo nombre y NIF distinto.
    if ((nif(e.nif) || '') === (nif(identidad) || '')) return { token: hay.token, enlace: e, clavePortal };
  }
  return null;
}

// Da (y crea si no tiene) el enlace del portal de un cliente guardado. null si el cliente no existe. El enlace es de una
// identidad (nombre + NIF del documento desde el que se pide) y recuerda ese NIF: dos clientes con el mismo nombre y
// distinto NIF tienen cada uno su portal, y el nuevo no hereda el del anterior ni lo pisa (auditoría N01).
export async function enlacePortal(u, nombre, nifDoc) {
  const id = String(nombre || '').trim().toUpperCase();
  const cliente = redis && id && (await redis.hget(clave(u, 'clientes'), id));
  if (!cliente) return null;
  const identidad = nifDoc !== undefined ? nifDoc : cliente.nif;
  const actual = await enlaceActual(u, id, identidad);
  if (actual) {
    const { token, enlace: e } = actual;
    // Se renueva la caducidad como mucho una vez al día (no en cada visita a la factura).
    const renovar = !e.hasta || Date.parse(e.hasta) - Date.now() < (VIDA_PORTAL_DIAS - 1) * 864e5;
    // Nunca se graba un NIF nuevo en un enlace: su identidad queda fija desde que se emite.
    if (renovar) await redis.hset('portal-enlaces', { [token]: { ...e, hasta: hasta() } });
    return `/portal/${token}`;
  }
  const k = nif(identidad) ? `${id}|${nif(identidad)}` : id;
  const token = randomBytes(18).toString('base64url');
  await redis.hset('portal-enlaces', { [token]: { empresa: u.empresa || u.id, cliente: id, ...(nif(identidad) ? { nif: identidad } : {}), hasta: hasta() } });
  await redis.hset(clave(u, 'portales'), { [k]: { token } });
  return `/portal/${token}`;
}

export async function limitePortal(token, req) {
  let cabeceras = req?.headers;
  if (!cabeceras) {
    try { cabeceras = await headers(); } catch { /* fuera de una petición (tests) */ }
  }
  const ip = ipDe({ headers: cabeceras || new Headers() });
  if (await pasado('portal-ip', ip, 60, 600)) return respuesta429(600, MUCHOS);
  if (await pasado('portal-token', String(token || ''), 120, 3600)) return respuesta429(3600, MUCHOS);
  return null;
}

export async function portalDe(token, req) {
  const limite = await limitePortal(token, req);
  if (limite) return limite;
  const enlace = token && redis && (await redis.hget('portal-enlaces', String(token)));
  if (!enlace || portalCaducado(enlace)) return null;
  // Enlaces de antes de la caducidad: empiezan a contar ahora.
  if (!enlace.hasta) await redis.hset('portal-enlaces', { [String(token)]: { ...enlace, hasta: hasta() } });
  const e = { empresa: enlace.empresa };
  const [cliente, empresa] = await Promise.all([redis.hget(clave(e, 'clientes'), enlace.cliente), redis.hget('empresas', enlace.empresa)]);
  // Una empresa dada de baja (o que ya no existe) no tiene portal público: sus documentos se conservan, pero bloqueados.
  if (!cliente || !empresa || empresa.baja) return null;
  // La identidad sale del enlace, no de la ficha (que solo tiene clave por nombre y la pisa la última factura): un enlace
  // sin NIF aplica la regla de ambigüedad de delCliente y no enseña nada si el nombre tiene más de un NIF.
  const c = { ...cliente, id: enlace.cliente, nif: enlace.nif || '' };
  // Informe de capacidad E01: solo los documentos con su nombre o su NIF (índice de cliente), no los de toda la empresa.
  // Basta como contexto de delCliente: lo que no comparte nombre ni NIF nunca es suyo ni cambia la decisión.
  const quien = { nombre: c.id, nif: c.nif };
  const [facturas, presupuestos] = await Promise.all([leerCliente(e, 'facturas', quien), leerCliente(e, 'presupuestos', quien)]);
  const todos = [...(facturas || []), ...(presupuestos || [])];
  return { e, cliente: c, empresa, facturas: delCliente(c, facturas, todos), presupuestos: delCliente(c, presupuestos, todos) };
}

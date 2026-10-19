import { redis } from './redis.js';

export const PRUEBA_GESTORIA_DIAS = 90;

export function normalizarCodigo(c) {
  if (typeof c !== 'string') return null;
  const codigo = c.trim().toUpperCase();
  return /^[A-Z0-9-]{4,20}$/.test(codigo) ? codigo : null;
}

export async function crearGestoria({ nombre, email, codigo } = {}) {
  nombre = typeof nombre === 'string' ? nombre.trim() : '';
  email = typeof email === 'string' ? email.trim() : '';
  if (!nombre || nombre.length > 120) return { error: 'Escribe el nombre de la gestoría (máximo 120 caracteres).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'Escribe un email válido.' };
  const generado = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/g, '');
  codigo = normalizarCodigo(codigo === undefined ? generado : codigo);
  if (!codigo) return { error: 'El código debe tener entre 4 y 20 caracteres: letras A-Z, números o guion.' };
  const gestoria = { codigo, nombre, email, creada: new Date().toISOString(), activa: true };
  // HSETNX reserva el código de forma atómica, también ante altas simultáneas.
  if (!(await redis.hsetnx('gestorias', codigo, gestoria))) return { error: 'Ese código de gestoría ya existe.' };
  return gestoria;
}

export async function gestoriaPorCodigo(codigo) {
  codigo = normalizarCodigo(codigo);
  if (!codigo) return null;
  const gestoria = await redis.hget('gestorias', codigo);
  return gestoria?.activa === true ? gestoria : null;
}

export async function apuntarCliente(codigo, empresaId) {
  codigo = normalizarCodigo(codigo);
  if (!codigo || typeof empresaId !== 'string' || !empresaId) throw new Error('Código de gestoría o empresa no válido.');
  return redis.sadd(`gestoria-clientes:${codigo}`, empresaId);
}

export async function listarGestorias() {
  const gestorias = Object.values((await redis.hgetall('gestorias')) || {});
  return Promise.all(gestorias.map(async (g) => ({
    ...g, clientes: (await redis.smembers(`gestoria-clientes:${g.codigo}`)).length,
  })));
}

export async function desactivarGestoria(codigo) {
  codigo = normalizarCodigo(codigo);
  const gestoria = codigo ? await redis.hget('gestorias', codigo) : null;
  if (!gestoria) return { error: 'Ese código de gestoría no existe.' };
  const desactivada = { ...gestoria, activa: false };
  await redis.hset('gestorias', { [codigo]: desactivada });
  return desactivada;
}

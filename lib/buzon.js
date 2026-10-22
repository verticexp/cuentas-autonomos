// Dirección de correo de cada empresa para su bandeja de facturas: <alias>@fisqal.com (lib/correoEntrante.js). Lo que
// llega ahí entra en la bandeja (lib/bandejaServidor.js); de un remitente que la empresa no conoce, en cuarentena (se
// guarda, pero no gasta lecturas hasta que alguien lo pida).
//
//   empresa.buzon = { alias, creado, remitentes: [email], confirmacion?: { codigo, enlace, fecha } }
//   buzones         hash global alias → id de empresa (para el webhook, que no tiene sesión)
import { redis } from './redis.js';
import { DOMINIO_ENTRANTE, nuevoAlias } from './correoEntrante.js';
import { membresias } from './membresias.js';
import { emailValido } from './email.js';

export const MAX_REMITENTES = 200;
const norm = (s) => String(s || '').trim().toLowerCase();
// El nombre para el alias, sin la forma jurídica: «Sonora Eventos, S.L.» → «Sonora Eventos».
export const nombreParaAlias = (n) => String(n || '').replace(/\./g, '')
  .replace(/[\s,]+(slu|sll|slp|sl|sau|sa|scoop|scp|sc|cb|sociedad limitada( unipersonal)?|sociedad anonima)\s*$/i, '').trim();

export const buzonDe = (e) => (e?.buzon?.alias ? e.buzon : null);
export const direccionDe = (buzon) => (buzon?.alias ? `${buzon.alias}@${DOMINIO_ENTRANTE()}` : '');

async function guardarBuzon(empresa, cambiar) {
  const e = await redis.hget('empresas', empresa);
  if (!e) return null;
  const buzon = cambiar(e.buzon || null);
  await redis.hset('empresas', { [empresa]: { ...e, buzon } });
  return buzon;
}

// Crea la dirección (o la cambia por otra nueva: la anterior deja de recibir al momento).
export async function crearBuzon(u, { nueva = false } = {}) {
  const empresa = u.empresa || u.id;
  const e = await redis.hget('empresas', empresa);
  if (!e) return { error: 'No se encuentra la empresa' };
  if (e.buzon?.alias && !nueva) return { buzon: e.buzon };
  let alias = null;
  for (let i = 0; i < 5 && !alias; i++) {
    const a = nuevoAlias(nombreParaAlias(e.emisor?.nombre || e.nombre || u.empresaNombre || ''));
    if (await redis.hsetnx('buzones', a, empresa)) alias = a;
  }
  if (!alias) return { error: 'No se ha podido crear la dirección. Inténtalo otra vez.' };
  if (e.buzon?.alias) await redis.hdel('buzones', e.buzon.alias);
  const buzon = await guardarBuzon(empresa, (b) => ({ remitentes: [], ...(b || {}), alias, creado: new Date().toISOString(), confirmacion: undefined }));
  return { buzon };
}

// La empresa de un alias (el webhook): null si no existe, si se cambió o si la empresa está de baja.
export async function empresaDeAlias(alias) {
  if (!alias) return null;
  const id = await redis.hget('buzones', alias);
  const e = id && (await redis.hget('empresas', id));
  if (!e || e.baja || e.buzon?.alias !== alias) return null;
  return { ...e, empresa: id, id };
}

// Quien puede mandar sin cuarentena: alguien de la empresa (por su email de Fisquo) o un remitente ya conocido (de una
// factura aprobada o añadido a mano).
export async function remitenteConocido(e, de) {
  const email = norm(de);
  if (!email) return false;
  if ((e.buzon?.remitentes || []).includes(email)) return true;
  const id = await redis.hget('emails', email);
  const usuario = id && (await redis.hget('usuarios', id));
  return Boolean(usuario && membresias(usuario)[e.empresa]);
}

export async function recordar(u, de) {
  const email = norm(de);
  if (!emailValido(email)) return;
  await guardarBuzon(u.empresa || u.id, (b) => (b?.alias && !(b.remitentes || []).includes(email)
    ? { ...b, remitentes: [email, ...(b.remitentes || [])].slice(0, MAX_REMITENTES) } : b));
}

export async function olvidar(u, de) {
  const email = norm(de);
  await guardarBuzon(u.empresa || u.id, (b) => (b ? { ...b, remitentes: (b.remitentes || []).filter((x) => x !== email) } : b));
}

// Gmail pide confirmar un reenvío automático con un correo a la dirección nueva: se enseña el código en la bandeja.
export const guardarConfirmacion = (empresa, c) => guardarBuzon(empresa, (b) => (b ? { ...b, confirmacion: { ...c, fecha: new Date().toISOString() } } : b));
export const quitarConfirmacion = (u) => guardarBuzon(u.empresa || u.id, (b) => (b ? { ...b, confirmacion: undefined } : b));
// El aviso de Gmail caduca a la semana (Google tampoco acepta el código mucho más tarde).
export const confirmacionVigente = (b, ahora = Date.now()) => (b?.confirmacion && ahora - Date.parse(b.confirmacion.fecha) < 7 * 864e5 ? b.confirmacion : null);

// Baja de la empresa: la dirección deja de recibir.
export async function revocarBuzon(empresa) {
  const e = await redis.hget('empresas', empresa);
  if (e?.buzon?.alias) await redis.hdel('buzones', e.buzon.alias);
}

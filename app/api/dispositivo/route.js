import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { mismoId, redis } from '@/lib/redis';
import { crearSesion, desbloqueo, opcionesCookie, opcionesDesbloqueo, usuarioActual } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { esApp } from '@/lib/app';
import { MUCHOS, ipDe, pasado } from '@/lib/limite';
import { auditar } from '@/lib/auditoria';
import { apuntarAcceso } from '@/lib/accesos';

// Face ID nativo de la app de iOS, como en la app de un banco (mobile/ios/App/App/BiometriaPlugin.swift,
// lib/faceidNativo.js): al activarlo, una credencial aleatoria para este iPhone que la app guarda en el llavero protegida
// con Face ID. Aquí solo se guarda su huella (SHA-256): con la base de datos no se puede entrar.
// dispositivos:<usuario> → id → { huella, nombre, creada, usada } · dispositivo-credencial: huella → «usuario:id»
// Las llaves de acceso (app/api/passkey) siguen para la web; este es el camino de la app.
export const dynamic = 'force-dynamic';

const MAXIMO = 10;
const huellaDe = (valor) => createHash('sha256').update(String(valor)).digest('hex');

export async function POST(req) {
  if (!redis) return error('Base de datos no conectada', 503);
  if (!esApp(req.headers.get('user-agent'))) return error('Solo en la app de Fisquo para iPhone', 404);
  const b = await cuerpo(req);

  // Activar en este iPhone (con la sesión abierta).
  if (b.accion === 'alta') {
    const { u, res } = await usuarioApi();
    if (res) return res;
    const mios = (await redis.hgetall(`dispositivos:${u.id}`)) || {};
    if (Object.keys(mios).length >= MAXIMO) return error(`Ya tienes Face ID en ${MAXIMO} dispositivos. Quita alguno en Ajustes › Seguridad.`);
    const id = randomBytes(9).toString('base64url');
    const valor = randomBytes(32).toString('base64url');
    const huella = huellaDe(valor);
    const nombre = String(b.nombre || 'iPhone').slice(0, 60);
    await redis.hset(`dispositivos:${u.id}`, { [id]: { huella, nombre, creada: new Date().toISOString() } });
    await redis.hset('dispositivo-credencial', { [huella]: `${u.id}:${id}` });
    await auditar(u, 'Face ID activado', nombre);
    return Response.json({ ok: true, id, valor });
  }

  // Entrar o desbloquear con la credencial que la app ha leído del llavero tras Face ID. 30 intentos por IP cada 15 min.
  if (b.accion === 'entrar') {
    if (await pasado('dispositivo', ipDe(req), 30, 900)) return error(MUCHOS, 429);
    if (typeof b.valor !== 'string' || b.valor.length < 30 || b.valor.length > 100) return error('Face ID no válido', 401);
    const huella = huellaDe(b.valor);
    const [dueno, id] = String((await redis.hget('dispositivo-credencial', huella)) || '').split(':');
    const d = dueno && id && (await redis.hget(`dispositivos:${dueno}`, id));
    // Desactivado desde Ajustes o tras recuperar la contraseña: la app borra la suya y pide la contraseña.
    if (!d || d.huella !== huella) return Response.json({ error: 'Face ID ya no está activado en este iPhone. Entra con tu contraseña y vuelve a activarlo en Ajustes.', retirada: true }, { status: 401 });
    if (!(await redis.hget('usuarios', dueno))) return error('Esta cuenta ya no existe', 401);
    await redis.hset(`dispositivos:${dueno}`, { [id]: { ...d, usada: new Date().toISOString() } });
    const u = await usuarioActual();
    const cambio = Boolean(u && !mismoId(u.id, dueno));
    const c = await cookies();
    const token = !u || cambio ? await crearSesion(dueno) : c.get('t')?.value;
    if (!token) return error('No se ha podido entrar. Vuelve a intentarlo.', 401);
    if (!u || cambio) { c.set('t', token, opcionesCookie); await apuntarAcceso(dueno, req, 'Face ID'); }
    c.set('d', await desbloqueo(token), opcionesDesbloqueo);
    return Response.json({ ok: true, cambio });
  }
  return error('Acción no válida');
}

// Quitar Face ID de un iPhone (Ajustes › Seguridad).
export async function DELETE(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id') || '';
  const d = await redis.hget(`dispositivos:${u.id}`, id);
  if (d?.huella) await redis.hdel('dispositivo-credencial', d.huella);
  await redis.hdel(`dispositivos:${u.id}`, id);
  await auditar(u, 'Face ID desactivado en un dispositivo');
  return Response.json({ ok: true });
}

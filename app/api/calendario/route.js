import { randomBytes } from 'node:crypto';
import { error, usuarioApi } from '@/lib/api';
import { redis } from '@/lib/redis';
import { actualizarEmpresa } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Enlace privado al calendario de plazos (lib/calendarioFiscal.js). POST lo crea o, con { nuevo: true }, lo cambia por
// otro (el anterior deja de funcionar al momento); DELETE lo quita. Quien ve Impuestos lo puede gestionar.
const empresaDe = (u) => u.empresa || u.id;
const enlace = (req, token) => `${req.nextUrl.origin}/api/calendario/${token}.ics`;

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await req.json().catch(() => ({}));
  const e = await redis.hget('empresas', empresaDe(u));
  if (!e) return error('No se encuentra la empresa', 404);
  if (e.calendario && !b?.nuevo) return Response.json({ url: enlace(req, e.calendario) });
  const token = randomBytes(24).toString('hex');
  await redis.hset('calendarios', { [token]: empresaDe(u) });
  if (e.calendario) await redis.hdel('calendarios', e.calendario);
  await actualizarEmpresa(empresaDe(u), { calendario: token });
  return Response.json({ url: enlace(req, token) });
}

export async function DELETE() {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const e = await redis.hget('empresas', empresaDe(u));
  if (e?.calendario) {
    await redis.hdel('calendarios', e.calendario);
    await actualizarEmpresa(empresaDe(u), { calendario: null });
  }
  return Response.json({ ok: true });
}

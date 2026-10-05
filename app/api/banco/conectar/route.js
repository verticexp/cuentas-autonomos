import { randomBytes } from 'node:crypto';
import { borrar, leer, leerUno, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { bancoListo, cerrarSesion, iniciar, listaBancos } from '@/lib/enableBanking';
import { actualizarSaldo } from '@/lib/bancoServidor';

export const dynamic = 'force-dynamic';
const NO_LISTO = 'La conexión con los bancos aún no está activada. Mientras, sube el extracto.';

// Bancos de España que se pueden conectar (se guardan un día).
export async function GET() {
  const { res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  if (!bancoListo()) return error(NO_LISTO, 503);
  let lista = await redis.get('banco-lista');
  if (!lista) {
    try { lista = await listaBancos(); } catch (e) { return error(e.message, 502); }
    await redis.set('banco-lista', lista, { ex: 86400 });
  }
  return Response.json({ bancos: lista });
}

// Empieza la conexión: devuelve la dirección del banco donde el usuario da permiso.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  if (!bancoListo()) return error(NO_LISTO, 503);
  const b = await cuerpo(req);
  const banco = String(b.banco || '').slice(0, 120);
  if (!banco) return error('Elige tu banco');
  const lista = (await redis.get('banco-lista')) || [];
  const dias = lista.find((x) => x.nombre === banco)?.dias;
  const estado = randomBytes(18).toString('base64url');
  await redis.set(`banco-estado:${estado}`, { u: u.id, empresa: u.empresa, banco }, { ex: 1800 });
  try {
    const url = await iniciar({ banco, tipo: b.tipo, dias, estado, vuelta: `${req.nextUrl.origin}/api/banco/vuelta` });
    return Response.json({ url });
  } catch (e) { return error(e.message, 502); }
}

// Quita una cuenta (si es conectada, retira también el permiso del banco). Sus movimientos se quedan.
export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  const c = id && (await leerUno(u, 'bancos', id));
  if (!c) return error('Esa cuenta ya no está', 404);
  if (c.sesion) {
    const otras = ((await leer(u, 'bancos')) || []).filter((x) => x.sesion === c.sesion && x.id !== c.id);
    if (!otras.length) await cerrarSesion(c.sesion);
  }
  await borrar(u, 'bancos', id);
  await actualizarSaldo(u);
  return Response.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { guardar, redis } from '@/lib/redis';
import { usuarioActual } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { abrirSesion } from '@/lib/enableBanking';
import { sincronizar } from '@/lib/bancoServidor';

export const dynamic = 'force-dynamic';

// El banco devuelve aquí al usuario tras dar (o no) el permiso.
export async function GET(req) {
  const p = req.nextUrl.searchParams;
  const ir = (q) => NextResponse.redirect(`${req.nextUrl.origin}/banco?${q}`, 303);
  const estado = p.get('state') || '';
  const datos = estado && (await redis.get(`banco-estado:${estado}`));
  const u = await usuarioActual();
  if (!datos || !u || datos.u !== u.id || datos.empresa !== u.empresa || !puede(u, 'empresa')) return ir('error=caducado');
  await redis.del(`banco-estado:${estado}`);
  if (p.get('error') || !p.get('code')) return ir('error=cancelado');
  let s;
  try { s = await abrirSesion(p.get('code')); } catch { return ir('error=banco'); }
  if (!s.cuentas.length) return ir('error=sincuentas');
  for (const c of s.cuentas) {
    const id = `eb-${createHash('sha1').update(c.iban || c.uid).digest('hex').slice(0, 12)}`;
    await guardar(u, 'bancos', { id, origen: 'enable', uid: c.uid, sesion: s.sesion, valida: s.valida, banco: s.banco || datos.banco, iban: c.iban, nombre: c.nombre || s.banco || datos.banco, conectada: new Date().toISOString() });
  }
  await sincronizar(u, { forzar: true });
  return ir(`conectado=${s.cuentas.length}`);
}

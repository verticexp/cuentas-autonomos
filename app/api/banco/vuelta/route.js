import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { guardar, redis } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { abrirSesion, bancoDirectoPermitido, urlApp } from '@/lib/enableBanking';
import { sincronizar } from '@/lib/bancoServidor';

export const dynamic = 'force-dynamic';

// El banco devuelve aquí al usuario tras dar (o no) el permiso.
export async function GET(req) {
  const p = req.nextUrl.searchParams;
  const ir = (q) => NextResponse.redirect(`${urlApp(req)}/banco?${q}`, 303);
  // Con la app bloqueada o el plan en solo lectura no se guarda nada: se vuelve a Banco con el motivo.
  const { u, res } = await usuarioApi({ escritura: true });
  if (res) return res.status === 401 ? res : ir(`error=${res.status === 402 ? 'solo-lectura' : 'bloqueada'}`);
  const estado = p.get('state') || '';
  const datos = estado && (await redis.get(`banco-estado:${estado}`));
  if (!datos || !u || !bancoDirectoPermitido(u) || datos.u !== u.id || datos.empresa !== u.empresa || !puede(u, 'empresa')) return ir('error=caducado');
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

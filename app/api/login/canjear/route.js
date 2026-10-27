import { NextResponse } from 'next/server';
import { opcionesCookie, RETO_DOS_PASOS } from '@/lib/auth';
import { apuntarAcceso } from '@/lib/accesos';
import { ponerEntrada } from '@/lib/entrada';
import { canjear, NOMBRE } from '@/lib/socialServidor';
import { redis } from '@/lib/redis';

// La app de iOS abre aquí, en su vista web, el código de un solo uso con el que volvió «Continuar con Google»
// (app/api/login/social/vuelta): así la sesión queda en las cookies de la app y no en las de Safari.
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const v = redis ? await canjear(req.nextUrl.searchParams.get('c')) : null;
  const url = (ruta) => new URL(ruta, req.url);
  if (!v) return NextResponse.redirect(url('/login?error=caducado'), 303);
  if (v.reto) {
    const res = NextResponse.redirect(url('/login/dos-pasos'), 303);
    res.cookies.set('reto', v.reto, { ...opcionesCookie, maxAge: RETO_DOS_PASOS });
    return res;
  }
  const u = await redis.hget('usuarios', String(v.id));
  if (!u) return NextResponse.redirect(url('/login?error=social'), 303);
  await apuntarAcceso(u.id, req, NOMBRE[v.proveedor] || 'Google');
  return ponerEntrada(NextResponse.redirect(url(u.despacho ? '/despacho' : '/'), 303), v.token, u, { recien: true });
}

import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { opcionesCookie, usuarioActual } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Volver al despacho desde las cuentas de un cliente: la empresa de este dispositivo vuelve a ser la propia.
// ?a=empresa: a la propia empresa del despacho en Fisquo (su Resumen) en lugar del panel.
export async function POST(req) {
  const u = await usuarioActual();
  const destino = req.nextUrl.searchParams.get('a') === 'empresa' ? '/' : '/despacho';
  const r = NextResponse.redirect(new URL(u ? destino : '/login', req.url), 303);
  const cuenta = u && (await redis.hget('usuarios', u.id));
  if (cuenta) r.cookies.set('e', String(cuenta.empresa || cuenta.id), opcionesCookie);
  return r;
}

import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { opcionesCookie, usuarioActual } from '@/lib/auth';
import { enEmpresa } from '@/lib/membresias';

export const dynamic = 'force-dynamic';

// Volver al despacho desde las cuentas de un cliente: la empresa de este dispositivo vuelve a ser la propia.
// ?a=empresa: a la propia empresa del despacho en Fisquo (su Resumen) en lugar del panel. &e=<id>: a cuál de las suyas, si
// tiene varias (components/SelectorCuenta.js); se comprueba con la cuenta guardada, no con la sesión (que es la del cliente).
export async function POST(req) {
  const u = await usuarioActual();
  const p = req.nextUrl.searchParams;
  const destino = p.get('a') === 'empresa' ? '/' : '/despacho';
  const r = NextResponse.redirect(new URL(u ? destino : '/login', req.url), 303);
  const cuenta = u && (await redis.hget('usuarios', u.id));
  const pedida = p.get('e');
  if (cuenta) r.cookies.set('e', String(pedida && enEmpresa(cuenta, pedida) ? pedida : cuenta.empresa || cuenta.id), opcionesCookie);
  return r;
}

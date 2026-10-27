import { NextResponse } from 'next/server';
import { PROVEEDORES, nuevoAzar, socialListo, urlAutorizar } from '@/lib/social';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';

// «Continuar con Google / Apple» (components/BotonesSociales.js): manda al proveedor con un state y un nonce que se
// guardan en la cookie «social» (10 min). SameSite=None: Apple vuelve con un POST desde appleid.apple.com.
// ?app=1: lo abre la app de iOS en ASWebAuthenticationSession y la vuelta acaba en fisquo://acceso.
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const proveedor = q.get('p');
  if (!PROVEEDORES.includes(proveedor) || !socialListo()[proveedor]) return NextResponse.redirect(new URL('/login?error=social', req.url), 303);
  if (await pasado('social', ipDe(req), 30, 900)) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(MUCHOS)}`, req.url), 303);
  const state = nuevoAzar(), nonce = nuevoAzar();
  const vuelta = new URL('/api/login/social/vuelta', req.url).toString();
  const res = NextResponse.redirect(urlAutorizar(proveedor, { state, nonce, vuelta }), 303);
  res.cookies.set('social', JSON.stringify({ proveedor, state, nonce, app: q.get('app') === '1' }), { httpOnly: true, secure: true, sameSite: 'none', path: '/api/login/social', maxAge: 600 });
  return res;
}

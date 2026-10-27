import { NextResponse } from 'next/server';
import { cabeceraCsp, EMBEBIBLE, modoCsp, politicaCsp } from '@/lib/csp';
import { desvioApp } from '@/lib/app';
import { PUBLICO } from '@/lib/rutasPublicas';

export function proxy(req) {
  // Anti-CSRF en TODAS las rutas (también login, registro, invitación y llaves de acceso): lo que modifica datos solo
  // puede venir de la propia app. Con «Referrer-Policy: no-referrer» los formularios envían «Origin: null»; entonces
  // vale Sec-Fetch-Site, que pone el navegador. Sin Origin (Stripe, crons) pasa: esas rutas comprueban su firma o secreto.
  const origen = req.headers.get('origin');
  const mismoSitio = origen === 'null' && req.headers.get('sec-fetch-site') === 'same-origin';
  // La única excepción: «Continuar con Apple» vuelve con un POST desde appleid.apple.com (form_post); esa ruta comprueba
  // el state de su cookie y la firma del token de Apple (app/api/login/social/vuelta).
  const vueltaApple = origen === 'https://appleid.apple.com' && req.nextUrl.pathname === '/api/login/social/vuelta';
  if (!['GET', 'HEAD'].includes(req.method) && origen && !mismoSitio && !vueltaApple && URL.parse(origen)?.host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  // App de iOS: sin web pública ni precios (lib/app.js).
  const desvio = desvioApp({ ua: req.headers.get('user-agent'), ruta: req.nextUrl.pathname, conSesion: Boolean(req.cookies.get('t')?.value) });
  if (desvio) return NextResponse.redirect(new URL(desvio, req.url));
  if (PUBLICO.test(req.nextUrl.pathname) || req.cookies.get('t')?.value) {
    // x-ruta: adónde volver tras desbloquear (lib/auth.js exigirDesbloqueo). Siempre la pone el servidor.
    const h = new Headers(req.headers);
    h.set('x-ruta', req.nextUrl.pathname + req.nextUrl.search);
    // x-metodo: para el modo solo lectura (lib/api.js usuarioApi).
    h.set('x-metodo', req.method);
    if (modoCsp() === 'off') return NextResponse.next({ request: { headers: h } });
    // Nonce nuevo en cada petición: Next.js lo lee de la cabecera para sus scripts; x-nonce, para los nuestros (lib/csp.js).
    const nonce = btoa(crypto.randomUUID());
    const csp = politicaCsp(nonce, { embebible: EMBEBIBLE.test(req.nextUrl.pathname) });
    h.set('x-nonce', nonce);
    h.set(cabeceraCsp(), csp);
    const res = NextResponse.next({ request: { headers: h } });
    res.headers.set(cabeceraCsp(), csp);
    return res;
  }
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/).*)'],
};

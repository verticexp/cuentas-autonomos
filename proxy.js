import { NextResponse } from 'next/server';

export function proxy(req) {
  // Anti-CSRF: las peticiones que modifican datos solo pueden venir de la propia app.
  // Con «Referrer-Policy: no-referrer» los formularios envían «Origin: null»; entonces vale Sec-Fetch-Site, que pone el navegador.
  const origen = req.headers.get('origin');
  const mismoSitio = origen === 'null' && req.headers.get('sec-fetch-site') === 'same-origin';
  if (!['GET', 'HEAD'].includes(req.method) && origen && !mismoSitio && URL.parse(origen)?.host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  if (req.cookies.get('t')?.value) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!login|invitacion|p/|api/presupuestos/aceptar|api/abierta/|api/pagar|pagar/|api/stripe|api/recordatorios|api/recurrentes/cron|api/login|api/registro|api/invitacion|api/passkey|_next|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|sw.js).*)'],
};

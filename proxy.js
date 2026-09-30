import { NextResponse } from 'next/server';

export function proxy(req) {
  // Anti-CSRF: las peticiones que modifican datos solo pueden venir de la propia app.
  const origen = req.headers.get('origin');
  if (!['GET', 'HEAD'].includes(req.method) && origen && URL.parse(origen)?.host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  if (req.cookies.get('t')?.value) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!login|invitacion|api/login|api/registro|api/invitacion|_next|favicon.ico|icon.svg|apple-icon|manifest.webmanifest).*)'],
};

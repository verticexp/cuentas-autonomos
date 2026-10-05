import { NextResponse } from 'next/server';

// Lo que se ve sin sesión: login, páginas legales, enlaces públicos (presupuesto, portal, pago), avisos de Stripe,
// crons de Vercel (con su secreto) e iconos.
const PUBLICO = /^\/(login|privacidad|condiciones|invitacion|p\/|portal\/|api\/portal\/|api\/presupuestos\/aceptar|api\/abierta\/|api\/pagar|pagar\/|api\/stripe|api\/recordatorios|api\/recurrentes\/cron|api\/login|api\/registro|api\/invitacion|api\/passkey|favicon\.ico|icon\.svg|apple-icon|manifest\.webmanifest|sw)/;

export function proxy(req) {
  // Anti-CSRF en TODAS las rutas (también login, registro, invitación y llaves de acceso): lo que modifica datos solo
  // puede venir de la propia app. Con «Referrer-Policy: no-referrer» los formularios envían «Origin: null»; entonces
  // vale Sec-Fetch-Site, que pone el navegador. Sin Origin (Stripe, crons) pasa: esas rutas comprueban su firma o secreto.
  const origen = req.headers.get('origin');
  const mismoSitio = origen === 'null' && req.headers.get('sec-fetch-site') === 'same-origin';
  if (!['GET', 'HEAD'].includes(req.method) && origen && !mismoSitio && URL.parse(origen)?.host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  if (PUBLICO.test(req.nextUrl.pathname) || req.cookies.get('t')?.value) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/).*)'],
};

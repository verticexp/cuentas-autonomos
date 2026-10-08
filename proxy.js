import { NextResponse } from 'next/server';
import { cabeceraCsp, modoCsp, politicaCsp } from '@/lib/csp';

// Lo que se ve sin sesión: la web pública (/ y app/(web)), login, páginas legales, enlaces públicos (presupuesto, portal, pago), avisos de Stripe,
// crons de Vercel (con su secreto) e iconos.
const PUBLICO = /^\/($|(funciones|precios|autonomos|pymes|grandes-empresas|seguridad|contacto)(\/|$)|login|privacidad|condiciones|invitacion|p\/|portal\/|api\/portal\/|api\/presupuestos\/aceptar|api\/abierta\/|api\/pagar|pagar\/|api\/stripe|api\/recordatorios|api\/recurrentes\/cron|api\/login|api\/registro|api\/contacto|api\/csp|api\/invitacion|api\/passkey|api\/confirmar|favicon\.ico|icon1\.svg|apple-icon|manifest\.webmanifest|sw)/;

export function proxy(req) {
  // Anti-CSRF en TODAS las rutas (también login, registro, invitación y llaves de acceso): lo que modifica datos solo
  // puede venir de la propia app. Con «Referrer-Policy: no-referrer» los formularios envían «Origin: null»; entonces
  // vale Sec-Fetch-Site, que pone el navegador. Sin Origin (Stripe, crons) pasa: esas rutas comprueban su firma o secreto.
  const origen = req.headers.get('origin');
  const mismoSitio = origen === 'null' && req.headers.get('sec-fetch-site') === 'same-origin';
  if (!['GET', 'HEAD'].includes(req.method) && origen && !mismoSitio && URL.parse(origen)?.host !== req.nextUrl.host) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  if (PUBLICO.test(req.nextUrl.pathname) || req.cookies.get('t')?.value) {
    // x-ruta: adónde volver tras desbloquear (lib/auth.js exigirDesbloqueo). Siempre la pone el servidor.
    const h = new Headers(req.headers);
    h.set('x-ruta', req.nextUrl.pathname + req.nextUrl.search);
    if (modoCsp() === 'off') return NextResponse.next({ request: { headers: h } });
    // Nonce nuevo en cada petición: Next.js lo lee de la cabecera para sus scripts; x-nonce, para los nuestros (lib/csp.js).
    const nonce = btoa(crypto.randomUUID());
    const csp = politicaCsp(nonce);
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

import { atenderAviso } from '@/lib/compraApple';

export const dynamic = 'force-dynamic';

// Avisos del App Store (App Store Server Notifications V2) de las suscripciones compradas en la app de iOS: renovaciones,
// cambios de plan, cobros fallidos, bajas, reembolsos y revocaciones (lib/compraApple.js atenderAviso). Se configura en
// App Store Connect › la app › Información de la app › Notificaciones del servidor del App Store, versión 2, con esta URL
// para producción y para sandbox. Sin sesión ni Origin (proxy.js la deja pasar, lib/rutasPublicas.js): lo que vale es la
// firma de Apple. Con 200 Apple no lo repite; un aviso con firma no válida se responde 400.
export async function POST(req) {
  let datos = null;
  try { datos = await req.json(); } catch { /* vacío o no JSON */ }
  if (typeof datos?.signedPayload !== 'string' || datos.signedPayload.length > 100000) return Response.json({ error: 'Aviso no válido' }, { status: 400 });
  const r = await atenderAviso(datos.signedPayload);
  if (r.error) {
    console.warn(`[apple] aviso rechazado: ${r.error}`);
    return Response.json({ error: r.error }, { status: r.status || 400 });
  }
  return Response.json({ ok: true });
}

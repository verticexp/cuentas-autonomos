import { NextResponse } from 'next/server';
import { error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { actualizarUsuario } from '@/lib/auth';
import { stripeListo } from '@/lib/stripe';
import { actualizarEstado, crearCuenta, enlaceAlta } from '@/lib/stripeConnect';

export const dynamic = 'force-dynamic';

// Cobro con tarjeta en la cuenta de Stripe de la empresa (lib/stripeConnect.js). Solo la administración de la empresa:
// es la cuenta donde entra el dinero de sus clientes.
const base = (req) => (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
async function quien() {
  const { u, res } = await usuarioApi({ permiso: 'empresa', escritura: true });
  if (res) return { res };
  if (u.rol !== 'admin') return { res: error('Solo la administración de la empresa conecta su cuenta de Stripe', 403) };
  if (!stripeListo()) return { res: error('El cobro con tarjeta no está disponible todavía', 503) };
  return { u };
}

// Conectar (o completar el alta): crea la cuenta si no hay y devuelve el enlace de un solo uso al alta de Stripe.
export async function POST(req) {
  const { u, res } = await quien();
  if (res) return res;
  const c = await crearCuenta(u, u.emisor?.email || u.email);
  if (c.error) return error(`No se ha podido crear la cuenta en Stripe: ${c.error}`, 502);
  if (!u.stripeConnect) await auditar(u, 'Cuenta de Stripe creada', c.cuenta);
  const l = await enlaceAlta(c.cuenta, base(req));
  if (l.error) return error(`Stripe no ha dado el enlace del alta: ${l.error}`, 502);
  return Response.json({ ok: true, url: l.url });
}

// Vuelta del alta (?vuelta=1): se lee el estado de la cuenta. Enlace caducado (?refrescar=1): uno nuevo.
export async function GET(req) {
  const { u, res } = await quien();
  if (res) return res;
  const q = req.nextUrl.searchParams;
  if (!u.stripeConnect?.cuenta) return NextResponse.redirect(`${base(req)}/ajustes/cobros`, 303);
  if (q.get('refrescar')) {
    const l = await enlaceAlta(u.stripeConnect.cuenta, base(req));
    return NextResponse.redirect(l.url || `${base(req)}/ajustes/cobros?stripe=error`, 303);
  }
  const r = await actualizarEstado(u);
  return NextResponse.redirect(`${base(req)}/ajustes/cobros?stripe=${r.estado || 'error'}`, 303);
}

// Desconectar: la cuenta de Stripe sigue siendo de la empresa, pero Fisquo deja de ofrecer el pago con tarjeta.
export async function DELETE() {
  const { u, res } = await quien();
  if (res) return res;
  if (!u.stripeConnect) return Response.json({ ok: true });
  await actualizarUsuario(u, { stripeConnect: null });
  await auditar(u, 'Cuenta de Stripe desconectada', u.stripeConnect.cuenta);
  return Response.json({ ok: true });
}

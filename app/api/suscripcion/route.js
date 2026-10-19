import { cuerpo, error, usuarioApi } from '@/lib/api';
import { esApp } from '@/lib/app';
import { PERIODOS } from '@/lib/planes';
import { esFundador, planDe } from '@/lib/prueba';
import { fiscalDe } from '@/lib/empresa';
import { stripeListo } from '@/lib/stripe';
import { cambiarPlan, confirmarCheckout, crearCheckout, portal } from '@/lib/suscripcion';

export const dynamic = 'force-dynamic';

// Ajustes › Tu plan (components/ElegirPlan.js). Solo el administrador de la empresa; nunca desde la app de iOS (lib/app.js).
// { tipo, nombre, periodo } → Checkout (o cambio de plan si ya paga) · { portal: true } → portal de Stripe ·
// { sesion } → al volver del Checkout, deja el plan activado sin esperar al aviso de Stripe.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede cambiar el plan', 403);
  if (esApp(req.headers.get('user-agent'))) return error('El plan se contrata desde la web', 403);
  if (!stripeListo()) return error('Los pagos no están activados todavía. Escríbenos a corporate@nettohq.com.', 503);
  if (esFundador(u.plan)) return error('Tu empresa tiene el plan Fundador: es gratis de por vida y no tienes que contratar nada.', 400);
  const b = await cuerpo(req);
  const volver = new URL('/ajustes/plan', req.url).toString();
  if (b.portal) {
    const r = await portal({ plan: u.plan, volver });
    return r.error ? error(r.error, 502) : Response.json(r);
  }
  if (b.sesion) {
    const r = await confirmarCheckout(String(b.sesion), u.empresa);
    return r.error ? error(r.error) : Response.json(r);
  }
  const { tipo, nombre, periodo } = b;
  if (!planDe(tipo, nombre) || !PERIODOS[periodo] || (tipo === 'gra' && (u.plan.tipo !== 'gra' || nombre !== u.plan.nombre))) return error('Plan no válido');
  // Autónomo o pyme según los datos fiscales de la empresa (Ajustes › Tu plan ya no deja elegirlo).
  if (tipo !== 'gra' && tipo !== (fiscalDe(u).tipo === 'sociedad' ? 'pym' : 'aut')) return error('Este plan no corresponde al tipo de tu empresa.');
  const r = u.plan.pagado && u.plan.suscripcion
    ? await cambiarPlan({ plan: u.plan, tipo, nombre, periodo, empresa: u.empresa })
    : await crearCheckout({ empresa: u.empresa, plan: u.plan, tipo, nombre, periodo, email: u.email, volver });
  return r.error ? error(r.error, 502) : Response.json(r);
}

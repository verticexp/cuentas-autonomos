// Stripe Connect (cuentas v2): cada empresa cobra las facturas con tarjeta en su propia cuenta de Stripe, nunca en la de
// Fisquo. Cuenta de tipo SaaS: panel de Stripe completo, Stripe cobra sus comisiones a la empresa y responde de los
// saldos negativos, y la capacidad card_payments de la configuración «merchant». Cargos directos en su cuenta
// (Stripe-Account, lib/stripe.js). La empresa completa sus datos en el alta alojada por Stripe (Account Links).
import { stripeV2 } from './stripe.js';
import { actualizarUsuario } from './auth.js';

const NOMBRE = 120;
// Estado de la capacidad de cobro (configuration.merchant.capabilities.card_payments.status): activa, en revisión o
// pendiente de que la empresa complete datos.
export const estadoDe = (cuenta) => {
  const s = cuenta?.configuration?.merchant?.capabilities?.card_payments?.status;
  return s === 'active' ? 'activa' : s === 'pending' ? 'revision' : 'pendiente';
};

// Crea la cuenta conectada de la empresa (si aún no tiene) y la guarda. u: el usuario con su empresa.
export async function crearCuenta(u, email) {
  if (u.stripeConnect?.cuenta) return { cuenta: u.stripeConnect.cuenta };
  const sociedad = u.fiscal?.tipo === 'sociedad';
  const nombre = String(u.emisor?.nombre || u.empresaNombre || '').slice(0, NOMBRE);
  const c = await stripeV2('core/accounts', {
    ...(email ? { contact_email: email } : {}),
    display_name: nombre,
    dashboard: 'full',
    identity: { country: 'es', entity_type: sociedad ? 'company' : 'individual', ...(sociedad && nombre ? { business_details: { registered_name: nombre } } : {}) },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    defaults: { currency: 'eur', locales: ['es-ES'], responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
    include: ['configuration.merchant', 'requirements'],
  });
  if (c.error || !/^acct_\w+$/.test(c.id || '')) return { error: c.error || 'Stripe no ha creado la cuenta' };
  await actualizarUsuario(u, { stripeConnect: { cuenta: c.id, estado: estadoDe(c), creada: new Date().toISOString() } });
  return { cuenta: c.id };
}

// Enlace de un solo uso al alta de Stripe (o a completar lo que falte). base: la dirección de la app.
export async function enlaceAlta(cuenta, base) {
  const l = await stripeV2('core/account_links', {
    account: cuenta,
    use_case: { type: 'account_onboarding', account_onboarding: { configurations: ['merchant'], return_url: `${base}/api/stripe/connect?vuelta=1`, refresh_url: `${base}/api/stripe/connect?refrescar=1` } },
  });
  return l.error || !l.url ? { error: l.error || 'Stripe no ha dado el enlace' } : { url: l.url };
}

// Lee la cuenta en Stripe y guarda su estado si ha cambiado. Devuelve el estado (o { error }).
export async function actualizarEstado(u) {
  const cuenta = u.stripeConnect?.cuenta;
  if (!cuenta) return { estado: null };
  const c = await stripeV2(`core/accounts/${encodeURIComponent(cuenta)}?include=configuration.merchant&include=requirements`);
  if (c.error) return { error: c.error };
  const estado = estadoDe(c);
  if (estado !== u.stripeConnect.estado) await actualizarUsuario(u, { stripeConnect: { ...u.stripeConnect, estado, revisada: new Date().toISOString() } });
  return { estado };
}

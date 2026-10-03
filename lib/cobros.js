// Enlace de pago de cada factura y marca de cobrada cuando Stripe confirma el pago.
import { randomBytes } from 'node:crypto';
import { redis, guardar, leerUno } from './redis.js';
import { subirFactura } from './drive.js';

// Da (y crea si no tiene) el enlace público de pago de la factura: /pagar/<token>.
export async function enlacePago(u, f) {
  if (f.pago) return { f, ruta: `/pagar/${f.pago}` };
  const token = randomBytes(16).toString('hex');
  await redis.hset('factura-pagos', { [token]: { empresa: u.empresa || u.id, id: f.id } });
  const nueva = { ...f, pago: token };
  await guardar(u, 'facturas', nueva);
  return { f: nueva, ruta: `/pagar/${token}` };
}

export async function facturaDePago(token) {
  const enlace = token && redis && (await redis.hget('factura-pagos', String(token)));
  if (!enlace) return null;
  const e = { empresa: enlace.empresa };
  const [f, empresa] = await Promise.all([leerUno(e, 'facturas', enlace.id), redis.hget('empresas', enlace.empresa)]);
  return f ? { e, f, empresa: empresa || {} } : null;
}

// Sesión de Stripe pagada → factura cobrada (una sola vez, aunque llegue por la página y por el aviso).
export async function marcarPagada(s) {
  if (s?.payment_status !== 'paid' || !s.metadata?.token) return false;
  const d = await facturaDePago(s.metadata.token);
  if (!d || d.f.cobrada) return Boolean(d);
  const f = { ...d.f, cobrada: true, cobro: { fecha: new Date().toISOString(), importe: s.amount_total / 100, metodo: 'stripe', sesion: s.id } };
  await guardar(d.e, 'facturas', f);
  await subirFactura({ ...d.empresa, empresa: d.e.empresa }, f).catch(() => {});
  return true;
}

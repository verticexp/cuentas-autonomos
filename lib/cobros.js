// Enlace de pago de cada factura y marca de cobrada cuando Stripe confirma el pago.
import { randomBytes } from 'node:crypto';
import { redis, guardar, leerUno } from './redis.js';
import { subirFactura } from './drive.js';
import { conCerrojo } from './cerrojo.js';
import { auditar } from './auditoria.js';
import { importes, numeroFactura, pagadoDe, r2, saldoDe } from './calculos.js';

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

// Sesión de Stripe pagada → un pago de la factura (auditoría F04). Solo se aplica si es en euros, de esta empresa y de
// esta factura; se apunta lo que de verdad se ha cobrado (puede ser parcial) y la factura queda cobrada cuando los pagos
// cubren el total. El mismo evento (aviso de Stripe y vuelta del cliente a la vez, o repetido) se aplica una sola vez.
// Devuelve { aplicado, cobrada, motivo }.
export async function marcarPagada(s) {
  if (s?.payment_status !== 'paid' || !s.metadata?.token || !s.id) return { aplicado: false, motivo: 'sin pagar' };
  const d = await facturaDePago(s.metadata.token);
  if (!d) return { aplicado: false, motivo: 'enlace desconocido' };
  const incidencia = async (motivo) => {
    await auditar({ empresa: d.e.empresa, id: 'stripe' }, 'Cobro no aplicado', `${numeroFactura(d.f)} · ${motivo} · sesión ${s.id}`).catch(() => {});
    return { aplicado: false, motivo };
  };
  if (String(s.currency || '').toLowerCase() !== 'eur') return incidencia(`moneda ${s.currency}`);
  if (s.metadata.factura !== d.f.id || s.metadata.empresa !== d.e.empresa) return incidencia('el pago es de otra factura');
  const importe = r2((Number(s.amount_total) || 0) / 100);
  if (!(importe > 0)) return incidencia('importe no válido');
  return conCerrojo(`cobro:${d.e.empresa}:${d.f.id}`, async () => {
    const f = await leerUno(d.e, 'facturas', d.f.id);
    if (!f) return { aplicado: false, motivo: 'factura borrada' };
    if ((f.pagos || []).some((p) => p.ref === s.id)) return { aplicado: false, cobrada: Boolean(f.cobrada), motivo: 'ya aplicado' };
    const fecha = new Date().toISOString();
    // Una factura marcada antes como cobrada a mano no recibe más pagos encima: se avisa (posible cobro doble).
    if (f.cobrada && !f.pagos?.length) return incidencia('la factura ya estaba cobrada');
    const pagos = [...(f.pagos || []), { fecha, importe, metodo: 'stripe', ref: s.id, moneda: 'eur' }];
    const nueva = { ...f, pagos };
    const pendiente = saldoDe({ ...nueva, cobrada: false });
    if (pendiente <= 0) Object.assign(nueva, { cobrada: true, cobro: { fecha, importe: pagadoDe(nueva), metodo: 'stripe', sesion: s.id } });
    if (pagadoDe(nueva) > importes(f).total) await auditar({ empresa: d.e.empresa, id: 'stripe' }, 'Cobro de más', `${numeroFactura(f)} · pagado ${pagadoDe(nueva)} de ${importes(f).total}`).catch(() => {});
    await guardar(d.e, 'facturas', nueva);
    await subirFactura({ ...d.empresa, empresa: d.e.empresa }, nueva).catch(() => {});
    return { aplicado: true, cobrada: Boolean(nueva.cobrada) };
  });
}

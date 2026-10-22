// Enlace de pago de cada factura y marca de cobrada cuando Stripe confirma el pago.
import { randomBytes } from 'node:crypto';
import { redis, clave, guardar, leerUno } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { actualizarFactura, cerrojoFactura } from './actualizarFactura.js';
import { auditar } from './auditoria.js';
import { importes, numeroFactura, pagadoDe, r2, saldoDe } from './calculos.js';
import { opsSecundarios, procesarLuego } from './trabajos.js';

// Da (y crea si no tiene) el enlace público de pago de la factura: /pagar/<token>.
export async function enlacePago(u, f) {
  if (f.pago) return { f, ruta: `/pagar/${f.pago}` };
  // Solo se añade el enlace a la factura de ahora (con sus cobros y envíos), no a la copia que trae quien llama.
  const r = await actualizarFactura(u, f.id, async (actual) => {
    if (actual.pago) return null;
    const token = randomBytes(16).toString('hex');
    await redis.hset('factura-pagos', { [token]: { empresa: u.empresa || u.id, id: f.id } });
    return { nueva: { ...actual, pago: token } };
  });
  if (r.error) throw new Error(r.error);
  return { f: r.factura, ruta: `/pagar/${r.factura.pago}` };
}

// Cambiar o anular el enlace de pago (informe de seguridad M2): el token queda marcado como anulado, no se borra, para
// que un pago con tarjeta que ya estaba en marcha se siga aplicando cuando Stripe avise.
export async function anularEnlacePago(u, f) {
  const r = await actualizarFactura(u, f.id, async (actual) => {
    if (!actual.pago) return null;
    const e = await redis.hget('factura-pagos', actual.pago);
    if (e) await redis.hset('factura-pagos', { [actual.pago]: { ...e, anulado: new Date().toISOString() } });
    const { pago: _, ...sin } = actual;
    return { nueva: sin };
  });
  if (r.error) throw new Error(r.error);
}

// Una factura pagada enseña su página de pago 90 días más (para el justificante del cliente); luego, el enlace caduca.
export const PAGO_DIAS_TRAS_COBRO = 90;
export function pagoCaducado(f, ahora = Date.now()) {
  if (!f.cobrada) return false;
  const fecha = [f.cobro?.fecha, ...(f.pagos || []).map((p) => p.fecha)].filter(Boolean).sort().at(-1);
  return Boolean(fecha) && Date.parse(String(fecha).slice(0, 10)) + PAGO_DIAS_TRAS_COBRO * 864e5 < ahora;
}

// conBaja: solo para aplicar un cobro de Stripe ya hecho (a una empresa dada de baja, o con el enlace ya anulado o
// caducado); las páginas públicas no lo usan.
export async function facturaDePago(token, { conBaja = false } = {}) {
  const enlace = token && redis && (await redis.hget('factura-pagos', String(token)));
  if (!enlace || (enlace.anulado && !conBaja)) return null;
  const e = { empresa: enlace.empresa };
  const [f, empresa] = await Promise.all([leerUno(e, 'facturas', enlace.id), redis.hget('empresas', enlace.empresa)]);
  // Empresa borrada o dada de baja (auditoría N02): el enlace público ya no resuelve; los documentos quedan conservados.
  if (!f || !empresa || (!conBaja && (empresa.baja || pagoCaducado(f)))) return null;
  return { e, f, empresa };
}

// Sesión de Stripe pagada → un pago de la factura (auditoría F04). Solo se aplica si es en euros, de esta empresa y de
// esta factura; se apunta lo que de verdad se ha cobrado (puede ser parcial) y la factura queda cobrada cuando los pagos
// cubren el total. El mismo evento (aviso de Stripe y vuelta del cliente a la vez, o repetido) se aplica una sola vez.
// Devuelve { aplicado, cobrada, motivo }.
// cuenta: la cuenta de Stripe de la que viene el pago (ev.account en los avisos de Connect): tiene que ser la de la
// empresa de la factura; un pago de otra cuenta conectada, o de la de Fisquo si la empresa cobra en la suya, no vale.
export async function marcarPagada(s, { cuenta } = {}) {
  if (s?.payment_status !== 'paid' || !s.metadata?.token || !s.id) return { aplicado: false, motivo: 'sin pagar' };
  const d = await facturaDePago(s.metadata.token, { conBaja: true });
  if (!d) return { aplicado: false, motivo: 'enlace desconocido' };
  const incidencia = async (motivo) => {
    await auditar({ empresa: d.e.empresa, id: 'stripe' }, 'Cobro no aplicado', `${numeroFactura(d.f)} · ${motivo} · sesión ${s.id}`).catch(() => {});
    return { aplicado: false, motivo };
  };
  const suya = d.empresa?.stripeConnect?.cuenta;
  if ((suya || cuenta) && cuenta !== suya) return incidencia('el pago es de otra cuenta de Stripe');
  if (String(s.currency || '').toLowerCase() !== 'eur') return incidencia(`moneda ${s.currency}`);
  if (s.metadata.factura !== d.f.id || s.metadata.empresa !== d.e.empresa) return incidencia('el pago es de otra factura');
  const importe = r2((Number(s.amount_total) || 0) / 100);
  if (!(importe > 0)) return incidencia('importe no válido');
  return conCerrojo(cerrojoFactura(d.e, d.f.id), async () => {
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
    // El pago y su subida a Drive (como trabajo) en la misma transacción; Drive nunca se espera dentro del cerrojo (E03).
    const tx = redis.multi().hset(clave(d.e, 'facturas'), { [nueva.id]: nueva });
    opsSecundarios(tx, { ...d.empresa, empresa: d.e.empresa }, { facturas: [nueva.id] });
    await tx.exec();
    return { aplicado: true, cobrada: Boolean(nueva.cobrada) };
  }).then((x) => { if (x.aplicado) procesarLuego(d.e); return x; });
}

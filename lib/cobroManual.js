// Cobro a mano de una factura: cobrarla entera de un toque (lo normal), con otra fecha o por una parte, y deshacerlo.
// cobroManual y deshacerCobroManual son puras (reciben la factura y devuelven la nueva); cobrarFactura y deshacerCobro las
// aplican bajo el cerrojo de la factura (lib/actualizarFactura.js) y comprueban el riesgo máximo del cliente al deshacer.
import { actualizarFactura } from './actualizarFactura.js';
import { pagadoDe, pendienteDe, r2 } from './calculos.js';
import { eur } from './formato.js';
import { conLimiteDe, revisarRiesgo } from './tercerosServidor.js';
import { enlazadosCon } from './enlacesBanco.js';
import { fechaReal, numeroLocal } from './validacion.js';

const vacio = (v) => v == null || (typeof v === 'string' && !v.trim());
const ORIGEN = { stripe: 'con tarjeta o Bizum', banco: 'por el banco', sepa: 'por una remesa' };

// { nueva } o { error }. Sin fecha, hoy; sin importe, lo que falta por cobrar (cobrada entera). Un importe menor deja un
// cobro parcial; uno mayor que lo que falta, no. hoy: AAAA-MM-DD.
export function cobroManual(f, { fecha, importe } = {}, hoy) {
  if (f.caja) return { error: 'Un cierre de caja no se cobra: ya está cobrado' };
  if (f.cobrada) return { error: 'Esa factura ya está cobrada' };
  const dia = vacio(fecha) ? hoy : fecha;
  if (!fechaReal(dia)) return { error: 'La fecha del cobro no es válida' };
  if (dia > hoy) return { error: 'La fecha del cobro no puede ser futura' };
  if (dia < f.fecha) return { error: 'El cobro no puede ser anterior a la factura' };
  const pendiente = pendienteDe(f);
  let cuanto = pendiente;
  if (!vacio(importe)) {
    const n = numeroLocal(importe);
    if (!Number.isFinite(n) || n <= 0) return { error: 'El importe cobrado debe ser mayor que 0' };
    if (pendiente <= 0) return { error: 'Esta factura es un abono: se marca como cobrada entera, sin importe' };
    if (r2(n) > pendiente) return { error: `Solo faltan ${eur(pendiente)} por cobrar` };
    cuanto = r2(n);
  }
  if (cuanto >= pendiente) return { nueva: { ...f, cobrada: true, cobro: { fecha: dia, metodo: 'manual' } }, completa: true };
  return { nueva: { ...f, pagos: [...(f.pagos || []), { fecha: dia, importe: cuanto, metodo: 'manual' }] }, completa: false };
}

// Último cobro apuntado a mano (no de apertura) de una factura sin cobrar del todo: su posición en pagos, o -1.
const ultimoManual = (f) => (f.pagos || []).findLastIndex((p) => p.metodo === 'manual' && !p.apertura);

// ¿Qué haría «Deshacer» en esta factura? null si nada (no hay cobro suyo que quitar), o 'cobrada' (quitar la marca) o
// 'parcial' (quitar el último cobro a mano). Un cobro de Stripe, del banco o de una remesa no se deshace desde aquí.
export function deshacerDe(f) {
  if (f.caja) return null;
  if (f.cobrada) return !f.cobro?.metodo || f.cobro.metodo === 'manual' ? 'cobrada' : null;
  return ultimoManual(f) >= 0 ? 'parcial' : null;
}

export function deshacerCobroManual(f) {
  if (f.caja) return { error: 'Un cierre de caja no se cobra' };
  if (f.cobrada) {
    const m = f.cobro?.metodo;
    if (m && m !== 'manual') return { error: `Se cobró ${ORIGEN[m] || 'por otra vía'}: para deshacerlo, quita ese cobro desde donde se registró` };
    return { nueva: { ...f, cobrada: false, cobro: undefined } };
  }
  const i = ultimoManual(f);
  if (i < 0) return { error: 'No hay cobros apuntados a mano que deshacer' };
  const pagos = f.pagos.filter((_, j) => j !== i);
  return { nueva: { ...f, pagos: pagos.length ? pagos : undefined } };
}

// Lo que enseña la pantalla tras cobrar o deshacer.
export const estadoCobro = (f) => ({ id: f.id, cobrada: Boolean(f.cobrada), pagado: pagadoDe(f), pendiente: Math.max(0, pendienteDe(f)) });

// Aplica un cambio que deja más (o menos) por cobrar. Si sube lo que debe el cliente, no puede pasar de su riesgo máximo.
async function aplicar(u, id, cambio) {
  const antes = await actualizarFactura(u, id, () => null);
  if (antes.error) return antes;
  return conLimiteDe(u, antes.factura.cliente, () => actualizarFactura(u, id, async (actual) => {
    const r = cambio(actual);
    if (r.error) return { error: r.error, status: 400 };
    const mas = pendienteDe(r.nueva) - pendienteDe(actual);
    const { bloqueo } = await revisarRiesgo(u, actual.cliente, mas);
    return bloqueo ? { error: bloqueo.error, status: 409 } : { nueva: r.nueva, extra: { completa: r.completa } };
  }));
}

export const cobrarFactura = (u, id, opciones, hoy) => aplicar(u, id, (f) => cobroManual(f, opciones, hoy));
// Un cobro a mano que luego se enlazó con un ingreso del banco (yaCobrada, lib/bancoServidor.js): se deshace desde Banco,
// o el movimiento quedaría emparejado con una factura sin cobrar.
export async function deshacerCobro(u, id) {
  if ((await enlazadosCon(u, 'factura', id)).some((m) => m.enlace.yaCobrada)) {
    return { error: 'Este cobro está enlazado con un movimiento del banco: deshaz primero el emparejamiento en Banco', status: 409 };
  }
  return aplicar(u, id, deshacerCobroManual);
}

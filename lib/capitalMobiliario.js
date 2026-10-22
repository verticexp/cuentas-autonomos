// Dividendos e intereses que una sociedad paga a sus socios (rendimientos del capital mobiliario): la retención del 19 %
// se ingresa cada trimestre con el modelo 123 y se resume en enero en el 193, por perceptor.
import { habil, leerImporte, limiteTrimestre, r2, trimestre } from './calculos.js';
import { fechaReal, validarNif } from './validacion.js';

export const RET_CAPITAL = 19;
export const TIPOS_RENDIMIENTO = {
  dividendos: 'Dividendos',
  intereses: 'Intereses de un préstamo',
  otros: 'Otros rendimientos del capital',
};

const texto = (v) => typeof v === 'string' ? v.trim() : '';
const nifNormalizado = (nif) => texto(nif).toUpperCase().replace(/[\s.-]/g, '').replace(/^ES/, '');
// Los prefijos evitan confundir un nombre sin NIF con un identificador fiscal.
const clavePerceptor = (p) => nifNormalizado(p.nif) ? `nif:${nifNormalizado(p.nif)}` : `nombre:${texto(p.nombre).toUpperCase()}`;
const delPeriodo = (pagos, anio, t) => pagos.filter((p) => p.fecha.startsWith(`${anio}-`) && (t === undefined || trimestre(p.fecha) === t));
const suma = (pagos, campo) => r2(pagos.reduce((s, p) => s + p[campo], 0));

export function limpiarPago(b = {}) {
  if (!fechaReal(b?.fecha)) return { error: 'La fecha del pago no es válida' };
  if (!Object.hasOwn(TIPOS_RENDIMIENTO, b.tipo)) return { error: 'El tipo de rendimiento no es válido' };
  const nombre = texto(b.perceptor?.nombre);
  if (!nombre || nombre.length > 120) return { error: 'El nombre del perceptor es obligatorio y admite hasta 120 caracteres' };
  const validacion = validarNif(b.perceptor?.nif);
  if (!validacion.ok) return { error: validacion.error };
  const brutoLeido = typeof b.bruto === 'number' || typeof b.bruto === 'string' ? leerImporte(b.bruto) : NaN;
  if (!Number.isFinite(brutoLeido) || brutoLeido <= 0 || brutoLeido > 1_000_000_000) {
    return { error: 'El bruto debe ser mayor que 0 y no superar 1.000.000.000' };
  }
  const bruto = r2(brutoLeido);
  if (bruto <= 0) return { error: 'El bruto debe ser mayor que 0 tras redondear a céntimos' };
  const pct = typeof b.retencionPct === 'string' ? b.retencionPct.trim().replace(',', '.') : b.retencionPct;
  const retencionPct = pct == null || pct === ''
    ? RET_CAPITAL
    : typeof pct === 'number' || typeof pct === 'string' ? Number(pct) : NaN;
  if (!Number.isFinite(retencionPct) || retencionPct < 0 || retencionPct > 100) {
    return { error: 'El porcentaje de retención debe estar entre 0 y 100' };
  }
  const retencion = r2(bruto * retencionPct / 100);
  return {
    fecha: b.fecha,
    tipo: b.tipo,
    perceptor: { nombre, nif: nifNormalizado(b.perceptor?.nif) },
    bruto,
    retencionPct,
    retencion,
    liquido: r2(bruto - retencion),
    nota: texto(b.nota).slice(0, 300),
  };
}

// Los modelos reciben pagos normalizados; el periodo corresponde a su fecha exigible.
export function modelo123(pagos, anio, t) {
  const periodo = delPeriodo(pagos, anio, t);
  return {
    perceptores: new Set(periodo.map((p) => clavePerceptor(p.perceptor))).size,
    base: suma(periodo, 'bruto'),
    retenciones: suma(periodo, 'retencion'),
  };
}

export function modelo193(pagos, anio) {
  const grupos = new Map();
  for (const pago of delPeriodo(pagos, anio)) {
    const clave = JSON.stringify([clavePerceptor(pago.perceptor), pago.tipo]);
    const p = grupos.get(clave) || { nif: nifNormalizado(pago.perceptor.nif), nombre: texto(pago.perceptor.nombre), tipo: pago.tipo, base: 0, retenciones: 0 };
    p.base = r2(p.base + pago.bruto);
    p.retenciones = r2(p.retenciones + pago.retencion);
    grupos.set(clave, p);
  }
  const perceptores = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { perceptores, base: suma(perceptores, 'base'), retenciones: suma(perceptores, 'retenciones') };
}

export const plazo123 = (anio, t) => limiteTrimestre(t, anio, 20);
export const plazo193 = (anio) => habil(`${Number(anio) + 1}-01-31`);

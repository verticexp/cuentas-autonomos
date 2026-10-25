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
  const vinculado = limpiarVinculado(b, bruto);
  if (vinculado.error) return vinculado;
  return {
    fecha: b.fecha,
    tipo: b.tipo,
    perceptor: { nombre, nif: nifNormalizado(b.perceptor?.nif) },
    bruto,
    retencionPct,
    retencion,
    liquido: r2(bruto - retencion),
    ...(b.tipo === 'otros' && NATURALEZAS_C.includes(b.naturaleza) ? { naturaleza: b.naturaleza } : {}),
    ...vinculado,
    nota: texto(b.nota).slice(0, 300),
  };
}

// Préstamo de un socio persona física a su sociedad vinculada (art. 46.a LIRPF y diseño del 193, clave D): los intereses
// que corresponden a la parte del capital prestado que excede del triple de su participación en los fondos propios
// (exceso, tecleado; entre 0 y el bruto) van con clave D; el resto, con la B. Solo en intereses y si el perceptor es una
// persona física (contribuyente del IRPF). { vinculado: true, exceso } o { error }; nada si no es vinculado.
function limpiarVinculado(b, bruto) {
  if (b.tipo !== 'intereses' || b.vinculado !== true) return {};
  if (ENTIDAD.test(nifNormalizado(b.perceptor?.nif))) return { error: 'El préstamo de un socio vinculado (clave D) solo se marca si el socio es una persona física' };
  const sinExceso = b.exceso == null || (typeof b.exceso === 'string' && !b.exceso.trim());
  const leido = sinExceso ? 0 : typeof b.exceso === 'number' || typeof b.exceso === 'string' ? leerImporte(b.exceso) : NaN;
  if (!Number.isFinite(leido) || leido < 0) return { error: 'Los intereses del exceso deben ser un importe de 0 o más' };
  const exceso = r2(leido);
  if (exceso > bruto) return { error: 'Los intereses del exceso no pueden pasar del bruto' };
  return { vinculado: true, exceso };
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

// Casillas del 123 desde los devengos de 2024 (Orden HAC/56/2024): número de rentas (pagos), bases y retenciones, aparte los
// dividendos y otras rentas de participación en fondos propios (01, 04, 07) y el resto de rentas (02, 05, 08), con sus totales
// (03, 06, 09). Sin periodificación (10-11) ni complementaria (13): 12 = 09 y 14, el resultado a ingresar.
export function casillas123(pagos, anio, t) {
  const periodo = delPeriodo(pagos, anio, t);
  const div = periodo.filter((p) => p.tipo === 'dividendos'), resto = periodo.filter((p) => p.tipo !== 'dividendos');
  const c = {
    '01': div.length, '02': resto.length, '03': periodo.length,
    '04': suma(div, 'bruto'), '05': suma(resto, 'bruto'), '06': suma(periodo, 'bruto'),
    '07': suma(div, 'retencion'), '08': suma(resto, 'retencion'), '09': suma(periodo, 'retencion'),
  };
  c['12'] = c['09'];
  c['14'] = c['12'];
  return c;
}

// Clave y naturaleza de cada percepción en el 193 (diseño de registro, posiciones 92-94): dividendos, A.02 (A.08, «no
// sometidos a retención», si el perceptor es una sociedad y no se le retiene: art. 61 RIS); intereses del préstamo de un
// socio, B.03 (préstamos no bancarios); otros, C con su naturaleza (la elegida en el pago o, sin ella, la 12, «otros a la
// base general», o la 14 si el perceptor no es una persona física). Los intereses del préstamo de un socio vinculado
// (pago.vinculado) se reparten entre la B y la D (partes193).
// Naturalezas de la clave C, con el nombre corto que ve el usuario (diseño de registro del 193, posiciones 93-94).
export const NATURALEZAS_C_NOMBRES = {
  '01': 'Propiedad intelectual, si el perceptor no es el autor',
  '02': 'Propiedad industrial no afecta a una actividad',
  '03': 'Asistencia técnica fuera de una actividad económica',
  '04': 'Arrendamiento de bienes muebles, negocios o minas (sin actividad)',
  '05': 'Rentas vitalicias o temporales por imposición de capitales',
  '06': 'Cesión de derechos de imagen fuera de una actividad (perceptor del IRPF)',
  '07': 'Subarrendamiento de inmuebles urbanos sin actividad (perceptor del IRPF)',
  '08': 'Cesión de derechos de imagen (perceptor del IS o IRNR con establecimiento)',
  '09': 'Premios de juegos, concursos o rifas (perceptor del IS o IRNR con establecimiento)',
  '10': 'Cargos de administrador o consejero (perceptor del IS o IRNR con establecimiento)',
  '11': 'Rendimientos exentos',
  '12': 'Otros, a la base general',
  '13': 'Otros, a la base del ahorro',
  '14': 'Otros, si el perceptor no es contribuyente del IRPF',
  '15': 'Anticipos de derechos de autor que se devengan en varios años',
};
// En orden (las claves '10' a '15' de un objeto irían delante de la '01').
export const NATURALEZAS_C = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0'));
const ENTIDAD = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;
export function clave193(pago) {
  const entidad = ENTIDAD.test(nifNormalizado(pago.perceptor?.nif));
  if (pago.tipo === 'dividendos') return { clave: 'A', naturaleza: entidad && !(pago.retencion > 0) ? '08' : '02' };
  if (pago.tipo === 'intereses') return { clave: 'B', naturaleza: '03' };
  return { clave: 'C', naturaleza: NATURALEZAS_C.includes(pago.naturaleza) ? pago.naturaleza : entidad ? '14' : '12' };
}

// Las partes de un pago en el 193: una, con su clave193, salvo los intereses del préstamo de un socio vinculado con exceso,
// que van en dos (diseño del 193, clave D): los del exceso, D.03, con su retención al mismo porcentaje, y el resto, B.03.
export function partes193(pago) {
  const una = { ...clave193(pago), base: pago.bruto, retencion: pago.retencion };
  if (pago.tipo !== 'intereses' || !pago.vinculado || !(pago.exceso > 0)) return [una];
  const exceso = Math.min(pago.exceso, pago.bruto), retD = r2(exceso * pago.retencionPct / 100);
  const d = { clave: 'D', naturaleza: '03', base: exceso, retencion: Math.min(retD, pago.retencion) };
  if (exceso >= pago.bruto) return [d];
  return [{ ...una, base: r2(pago.bruto - exceso), retencion: r2(pago.retencion - d.retencion) }, d];
}

export function modelo193(pagos, anio) {
  const grupos = new Map();
  for (const pago of delPeriodo(pagos, anio)) {
    for (const { clave: c, naturaleza, base, retencion } of partes193(pago)) {
      const clave = JSON.stringify([clavePerceptor(pago.perceptor), pago.tipo, c, naturaleza]);
      const p = grupos.get(clave) || { nif: nifNormalizado(pago.perceptor.nif), nombre: texto(pago.perceptor.nombre), tipo: pago.tipo, clave: c, naturaleza, base: 0, retenciones: 0 };
      p.base = r2(p.base + base);
      p.retenciones = r2(p.retenciones + retencion);
      grupos.set(clave, p);
    }
  }
  const perceptores = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { perceptores, base: suma(perceptores, 'base'), retenciones: suma(perceptores, 'retenciones') };
}

export const plazo123 = (anio, t) => limiteTrimestre(t, anio, 20);
export const plazo193 = (anio) => habil(`${Number(anio) + 1}-01-31`);

// Modelo 840: alta, variación o baja en el Impuesto sobre Actividades Económicas (IAE) de una sociedad. No hay nada que
// calcular: la cuota la fija cada ayuntamiento con su ordenanza. Lo que Fisquo dice es si a la sociedad le toca
// presentarlo y cuándo, a partir de su cifra de negocios. Orientativo: lo confirma la gestoría.
//
// Normas (texto consolidado del BOE):
//  · Art. 82.1.c del texto refundido de la Ley reguladora de las Haciendas Locales (RDLeg 2/2004): están exentos los
//    sujetos pasivos del Impuesto sobre Sociedades con un importe neto de la cifra de negocios INFERIOR a 1.000.000 €. Con
//    1.000.000 € exactos no hay exención.
//  · Regla 1.ª: la cifra es la del art. 35.2 del Código de Comercio. Regla 3.ª: cuenta el conjunto de sus actividades y,
//    si la sociedad está en un grupo del art. 42 del Código de Comercio, la del grupo entero.
//  · Regla 2.ª: la cifra es la del período impositivo CUYO PLAZO DE PRESENTACIÓN del Impuesto sobre Sociedades acabó el año
//    anterior al del devengo; si ese período duró menos de un año, se eleva al año. Con el ejercicio igual al año natural, el
//    IAE de un año T mira la cifra del ejercicio T−2: el del 2026 se presenta hasta el 25 de julio de 2027, así que decide
//    el IAE de 2028.
//  · Art. 82.1.b: tampoco pagan durante los dos primeros períodos impositivos del IAE en que desarrollan la actividad (el
//    del alta, que llega al 31 de diciembre, y el siguiente). Art. 89: el impuesto se devenga el 1 de enero.
//  · Art. 5.1 y 5.3 del Real Decreto 243/1995: quien venía aplicando una exención y deja de cumplir sus condiciones presenta
//    la declaración de alta (modelo 840) «durante el mes de diciembre inmediato anterior al año en el que el sujeto pasivo
//    resulte obligado a contribuir». La obligada con la cifra del 2026 presenta el alta en diciembre de 2027 y paga desde 2028.
//  · Art. 7.4 del mismo real decreto: quien ya estaba en la matrícula y accede a una exención presenta la baja en diciembre
//    inmediato anterior al año en que queda exonerado.
//  · Art. 90.2 del texto refundido: quien no está exento comunica su cifra de negocios a la AEAT (el modelo 200 ya la lleva).
import { habil, r2 } from './calculos.js';

export const UMBRAL_IAE = 1000000;

const delAnio = (l, y) => l.filter((x) => x.fecha?.startsWith(`${y}-`));

// Cifra de negocios de un ejercicio (año natural), igual que lib/modelos.js cifraNegocios: sin las ventas de bienes de
// inversión ni las inmobiliarias accesorias (art. 35.2 del Código de Comercio). Si fue el de la constitución y duró menos de
// un año, se eleva al año (regla 2.ª): cifra / días × 365.
export function incnEjercicio(facturas, y, constitucion = '') {
  const real = r2(delAnio(facturas, y).filter((f) => !f.accesoria).reduce((s, f) => s + (Number(f.base) || 0), 0));
  if (/^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') && Number(constitucion.slice(0, 4)) === y) {
    const dias = Math.round((Date.parse(`${y}-12-31T12:00:00Z`) - Date.parse(`${constitucion}T12:00:00Z`)) / 864e5) + 1;
    if (dias > 0 && dias < 365) return { real, incn: r2((real / dias) * 365), elevada: true };
  }
  return { real, incn: real, elevada: false };
}

// Qué pasa con el IAE a partir de la cifra de negocios del ejercicio `anio`. Devuelve:
//  situacion:
//   'sin-datos'  no hay nada apuntado en `anio`: no se puede concluir.
//   'en-curso'   `anio` no ha acabado y de momento no llega al millón: la cifra aún puede cambiar.
//   'exenta'     ni `anio` ni el anterior llegan al millón: sin IAE.
//   'alta'       `anio` llega al millón y el anterior no: hay que presentar el alta (840) y se paga desde `anio + 2`.
//   'sigue'      llega al millón dos años seguidos: ya tributa; nada nuevo que presentar por la cifra.
//   'baja'       `anio` no llega y el anterior sí: recupera la exención en `anio + 2`; si estaba de alta, presenta la baja.
//  anteriorSinDatos: no hay nada apuntado en `anio − 1`, así que 'alta' puede ser en realidad 'sigue'.
//  cerca: queda por debajo pero a menos de un 10 % del millón.
export function modelo840(facturas, gastos, anio, { constitucion = '', hoy = '' } = {}) {
  const hay = (y) => delAnio(facturas, y).length + delAnio(gastos, y).length > 0;
  const { real, incn, elevada } = incnEjercicio(facturas, anio, constitucion);
  const anterior = hay(anio - 1) ? incnEjercicio(facturas, anio - 1, constitucion).incn : null;
  const supera = incn >= UMBRAL_IAE;
  const enCurso = Boolean(hoy) && hoy < `${anio}-12-31`;
  let situacion;
  if (!hay(anio)) situacion = 'sin-datos';
  else if (enCurso && !supera) situacion = 'en-curso';
  else if (supera) situacion = anterior !== null && anterior >= UMBRAL_IAE ? 'sigue' : 'alta';
  else situacion = anterior !== null && anterior >= UMBRAL_IAE ? 'baja' : 'exenta';
  const anioAlta = anio + 1;
  return {
    anio, umbral: UMBRAL_IAE, incn, incnReal: real, elevada, anterior, enCurso, supera, situacion,
    anteriorSinDatos: anterior === null, cerca: !supera && incn >= UMBRAL_IAE * 0.9,
    // Año del primer IAE por la cifra de `anio` y mes de presentación (el alta o la baja).
    tributaDesde: anio + 2,
    plazo: { desde: `${anioAlta}-12-01`, hasta: habil(`${anioAlta}-12-31`) },
    // Primer año en el que la sociedad que se constituyó en `constitucion` puede tener que pagar el IAE (art. 82.1.b).
    primerAnioConIae: /^\d{4}-/.test(constitucion || '') ? Number(constitucion.slice(0, 4)) + 2 : null,
  };
}

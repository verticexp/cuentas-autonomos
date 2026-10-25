import { festivoNacional } from './festivos.js';

// Fechas de la guía «Calendario fiscal del autónomo». Si el último día de un plazo cae en sábado, domingo o festivo
// nacional, pasa al siguiente día hábil (Ley 39/2015, art. 30.5). No conoce festivos autonómicos ni locales.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dos = (n) => String(n).padStart(2, '0');
const utc = (iso) => new Date(`${iso}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);

export const diaSemana = (f) => DIAS[utc(f).getUTCDay()];
export const esHabil = (f) => { const d = utc(f).getUTCDay(); return d !== 0 && d !== 6 && !festivoNacional(f); };
export function siguienteHabil(f) {
  const d = utc(f);
  while (!esHabil(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
// «martes, 20 de octubre de 2026» (con conDia en false,«20 de octubre de 2026»).
export function fechaLarga(f, conDia = true) {
  const [a, m, d] = f.split('-').map(Number);
  return `${conDia ? `${diaSemana(f)}, ` : ''}${d} de ${MESES[m - 1]} de ${a}`;
}
export const diaMes = (f) => { const [, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };

// Trimestrales (303, 130, 111, 115, 349…): del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero. Con
// domiciliación, tres días hábiles antes del último día, como en la app (lib/domiciliacion.js).
// anio es el del ejercicio al que se refiere el trimestre; el 4.º se presenta en enero del año siguiente.
export function plazoTrimestre(anio, t) {
  const mes = [4, 7, 10, 1][t - 1], a = t === 4 ? anio + 1 : anio;
  const inicio = `${a}-${dos(mes)}-01`;
  const limite = `${a}-${dos(mes)}-${t === 4 ? '30' : '20'}`;
  const domicilia = `${a}-${dos(mes)}-${t === 4 ? '25' : '15'}`;
  return { anio, t, inicio, limite, fin: siguienteHabil(limite), domicilia: siguienteHabil(domicilia), trasladado: siguienteHabil(limite) !== limite };
}

// Resúmenes anuales del ejercicio `anio`, que se presentan al año siguiente: 390 (1-30 de enero), 190 y 180 (1-31 de
// enero) y 347 (febrero).
export function plazosAnuales(anio) {
  const a = anio + 1;
  const finFeb = iso(new Date(Date.UTC(a, 2, 0, 12)));
  return [
    { modelo: '390', nombre: 'Resumen anual del IVA', inicio: `${a}-01-01`, limite: `${a}-01-30` },
    { modelo: '190', nombre: 'Resumen anual de retenciones del trabajo y de profesionales', inicio: `${a}-01-01`, limite: `${a}-01-31` },
    { modelo: '180', nombre: 'Resumen anual de retenciones por alquileres', inicio: `${a}-01-01`, limite: `${a}-01-31` },
    { modelo: '347', nombre: 'Operaciones con terceros superiores a 3.005,06 €', inicio: `${a}-02-01`, limite: finFeb },
  ].map((p) => ({ ...p, fin: siguienteHabil(p.limite), trasladado: siguienteHabil(p.limite) !== p.limite }));
}

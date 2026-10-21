// Registro de jornada (art. 34.9 del Estatuto de los Trabajadores): entrada, salida y pausas de cada día por persona,
// guardado 4 años y a disposición de la plantilla y de la Inspección de Trabajo. Sin dependencias, para poder probarlo.
// Las horas son locales de España: «AAAA-MM-DDTHH:MM».
import { r2 } from './calculos.js';
import { festivoNacional } from './festivos.js';

export const HORAS_SEMANA = 40;
export const ahoraMadrid = (d = new Date()) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16).replace(' ', 'T');
// Instante (ms) de una hora local de Madrid: con su desfase de ese día (1 h en invierno, 2 en verano). Leerla como UTC
// descuadraba los cambios de hora: de 01:30 a 03:30 son 60 minutos el último domingo de marzo y 180 el de octubre, no 120.
const desfase = (t) => Date.parse(`${new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T')}Z`) - t;
const instante = (m) => { const local = Date.parse(`${m}:00Z`); const t = local - desfase(local); return local - desfase(t); };
const min = (a, b) => Math.round((instante(b) - instante(a)) / 60000);
const MOMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// Una fecha y hora que existen (Date.parse convierte el 30 de febrero en el 2 de marzo).
const momentoReal = (m) => MOMENTO.test(m || '') && new Date(`${m.slice(0, 10)}T12:00:00Z`).toISOString().slice(0, 10) === m.slice(0, 10) && Number(m.slice(11, 13)) < 24 && Number(m.slice(14, 16)) < 60;
export const MAX_PAUSAS = 10;
export const horaDe = (m) => (m ? m.slice(11, 16) : '');

// «38:30» a partir de minutos.
export const hhmm = (m) => `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

export function estadoDe(f) {
  if (!f || f.salida) return 'fuera';
  return f.pausas?.some((p) => !p.fin) ? 'pausa' : 'dentro';
}

// El fichaje abierto (sin salida) de un empleado, si lo hay.
export const abiertoDe = (fichajes, empleado) => fichajes.filter((f) => f.empleado === empleado && !f.salida).sort((a, b) => b.entrada.localeCompare(a.entrada))[0] || null;

// Entrar, pausa, volver o salir. Devuelve el fichaje nuevo o cambiado, o { error }.
export function fichar(fichajes, empleado, accion, ahora, por) {
  const f = abiertoDe(fichajes, empleado);
  const e = estadoDe(f);
  if (accion === 'entrar') {
    if (e !== 'fuera') return { error: 'Ya has fichado la entrada' };
    return { fichaje: { id: `${empleado}-${ahora}`, empleado, fecha: ahora.slice(0, 10), entrada: ahora, salida: null, pausas: [], por } };
  }
  if (e === 'fuera') return { error: 'Primero ficha la entrada' };
  if (ahora < f.entrada) return { error: 'La hora es anterior a la entrada' };
  const pausas = (f.pausas || []).map((p) => ({ ...p }));
  if (accion === 'pausa') {
    if (e === 'pausa') return { error: 'Ya estás en pausa' };
    return { fichaje: { ...f, pausas: [...pausas, { inicio: ahora, fin: null }] } };
  }
  if (accion === 'volver') {
    if (e !== 'pausa') return { error: 'No estás en pausa' };
    pausas.at(-1).fin = ahora;
    return { fichaje: { ...f, pausas } };
  }
  if (accion === 'salir') {
    if (e === 'pausa') pausas.at(-1).fin = ahora;
    return { fichaje: { ...f, pausas, salida: ahora } };
  }
  return { error: 'Acción no válida' };
}

// Minutos de trabajo efectivo (sin pausas). Sin salida: null.
export function minutos(f) {
  if (!f?.salida) return null;
  return min(f.entrada, f.salida) - (f.pausas || []).reduce((s, p) => s + (p.fin ? min(p.inicio, p.fin) : 0), 0);
}

// Revisa un fichaje escrito a mano (corrección o día que se olvidó): todo dentro del día de trabajo y en orden.
export function validar({ entrada, salida, pausas = [] }) {
  if (!momentoReal(entrada) || !momentoReal(salida)) return { error: 'Pon la hora de entrada y de salida (una fecha que exista)' };
  if (salida <= entrada) return { error: 'La salida tiene que ser después de la entrada' };
  if (min(entrada, salida) > 16 * 60) return { error: 'Una jornada no puede pasar de 16 horas: divídela en dos' };
  const P = [];
  // Más pausas de las que caben se rechazan (antes se quitaban las que sobraban y contaban como trabajo).
  if (Array.isArray(pausas) && pausas.length > MAX_PAUSAS) return { error: `Como mucho ${MAX_PAUSAS} pausas por jornada: junta las más cortas` };
  for (const p of Array.isArray(pausas) ? pausas : []) {
    if (!momentoReal(p?.inicio) || !momentoReal(p?.fin)) return { error: 'Cada pausa necesita inicio y fin' };
    if (p.inicio < entrada || p.fin > salida || p.fin <= p.inicio) return { error: 'Las pausas tienen que estar dentro de la jornada' };
    if (P.length && p.inicio < P.at(-1).fin) return { error: 'Las pausas no pueden solaparse' };
    P.push({ inicio: p.inicio, fin: p.fin });
  }
  return { entrada, salida, pausas: P };
}

// Días laborables (lunes a viernes, sin las fiestas comunes a toda España) entre dos fechas, ambas incluidas. Contar los
// festivos como jornada hacía que las horas de esos días faltasen y se comieran las horas extra del mes.
export function laborables(desde, hasta) {
  let n = 0;
  for (let t = Date.parse(`${desde}T12:00:00Z`); t <= Date.parse(`${hasta}T12:00:00Z`); t += 864e5) {
    const d = new Date(t);
    if (![0, 6].includes(d.getUTCDay()) && !festivoNacional(d.toISOString().slice(0, 10))) n += 1;
  }
  return n;
}
const ultimoDia = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

// Horas de un empleado en un mes: trabajadas, las de su jornada (lunes a viernes, según horas por semana, dentro de
// su alta y baja, y hasta «hasta» si el mes no ha acabado) y la diferencia (extra si es positiva).
export function resumenMes(fichajes, empleado, mes, hasta) {
  const F = fichajes.filter((f) => f.empleado === empleado.id && f.fecha.startsWith(mes));
  const cerrados = F.filter((f) => f.salida);
  const trabajados = cerrados.reduce((s, f) => s + minutos(f), 0);
  const desde = [`${mes}-01`, empleado.alta || ''].sort().at(-1);
  const fin = [ultimoDia(mes), hasta || '9999', empleado.baja || '9999'].sort()[0];
  const dias = fin >= desde ? laborables(desde, fin) : 0;
  const teoricos = Math.round((dias * (Number(empleado.horasSemana) || HORAS_SEMANA) * 60) / 5);
  return { fichajes: F.length, dias: new Set(cerrados.map((f) => f.fecha)).size, abiertos: F.length - cerrados.length, trabajados, teoricos, diferencia: trabajados - teoricos, extra: Math.max(0, trabajados - teoricos) };
}

// Horas extra de un mes en la nómina: si el empleado tiene precio por hora extra.
export function extrasNomina(r, empleado) {
  const precio = Number(empleado.precioHoraExtra) || 0;
  if (!r.trabajados) return null;
  const horas = { trabajadas: r.trabajados, teoricas: r.teoricos, extra: r.extra };
  return precio > 0 && r.extra > 0 ? { horas, importe: r2((r.extra / 60) * precio) } : { horas, importe: 0 };
}

// Filas del registro para la Inspección: una por jornada, con las correcciones anotadas.
export function filasRegistro(fichajes, empleados) {
  const porId = Object.fromEntries(empleados.map((e) => [e.id, e]));
  return [...fichajes].sort((a, b) => a.fecha.localeCompare(b.fecha) || (porId[a.empleado]?.nombre || '').localeCompare(porId[b.empleado]?.nombre || '') || a.entrada.localeCompare(b.entrada)).map((f) => {
    const m = minutos(f);
    return {
      trabajador: porId[f.empleado]?.nombre || 'Empleado borrado', nif: porId[f.empleado]?.nif || '', fecha: f.fecha,
      entrada: horaDe(f.entrada), salida: f.salida ? `${f.salida.slice(0, 10) !== f.fecha ? `${f.salida.slice(8, 10)}/${f.salida.slice(5, 7)} ` : ''}${horaDe(f.salida)}` : 'Sin salida',
      pausas: (f.pausas || []).map((p) => `${horaDe(p.inicio)}-${p.fin ? horaDe(p.fin) : '…'}`).join(', '),
      horas: m === null ? '' : hhmm(m),
      observaciones: (f.cambios || []).map((c) => `Corregido el ${c.cuando.slice(0, 10)} por ${c.porNombre || 'la empresa'}: ${c.motivo}`).join(' · ') + (f.manual ? `${f.cambios?.length ? ' · ' : ''}Apuntado a mano: ${f.manual}` : ''),
    };
  });
}

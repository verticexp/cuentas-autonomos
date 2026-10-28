// El mes de una nómina o de la jornada («2026-10») escrito en el idioma de la app: en castellano, tal cual lo da nombreMes
// (lib/nominas.js: «octubre 2026»); en catalán e inglés, con Intl. No es un diccionario: solo lo usan las pantallas de equipo.
import { nombreMes } from '../nominas.js';
import { localeDe } from '../i18n.js';

export function mesEnIdioma(mes, idioma, soloMes = false) {
  if (!idioma || idioma === 'es') return soloMes ? nombreMes(mes).split(' ')[0] : nombreMes(mes);
  const fecha = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1, 12));
  return fecha.toLocaleDateString(localeDe(idioma), { month: 'long', ...(soloMes ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

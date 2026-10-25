// Calendario de plazos de Hacienda para suscribirse desde el móvil o el ordenador (iCalendar, RFC 5545): un evento de día
// entero por plazo (lib/avisos.js plazosFiscales, del año en curso y el siguiente) con dos alarmas, una semana y un día
// antes, y en la descripción hasta cuándo se puede domiciliar (lib/domiciliacion.js). Se sirve con un enlace privado por
// empresa (empresas[id].calendario, índice «calendarios»: token → empresa), que se puede cambiar o quitar.
// Sin acceso a la base de datos, para poder probarlo.
import { plazosFiscales } from './avisos.js';
import { conPagoDomiciliable, finDomiciliacion } from './domiciliacion.js';
import { foralDe } from './territorios.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const diaMes = (f) => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
const compacta = (f) => f.replaceAll('-', '');
const siguiente = (f) => new Date(Date.parse(`${f}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
// Texto de una propiedad (RFC 5545, 3.3.11): barra invertida, punto y coma, coma y saltos de línea, escapados.
const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Líneas de 75 octetos como mucho, las siguientes empezando por un espacio (3.1); sin partir un carácter de varios bytes.
function plegar(linea) {
  const out = [];
  let actual = '', bytes = 0;
  for (const ch of linea) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(actual); actual = ''; bytes = 0; }
    actual += ch; bytes += n;
  }
  out.push(actual);
  return out.join('\r\n ');
}

// fiscal: los datos fiscales de la empresa (lib/empresa.js fiscalDe); anio: desde qué año; ahora: marca de tiempo DTSTAMP.
export function calendarioIcs(fiscal, { anio, cuotaIS, nombre = '', url = 'https://www.fisquo.com/modelos', ahora = new Date().toISOString() } = {}) {
  const foral = foralDe(fiscal);
  const plazos = [...plazosFiscales(fiscal, anio, { cuotaIS }), ...plazosFiscales(fiscal, anio + 1, { cuotaIS })];
  const sello = `${ahora.replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fisquo//Plazos de Hacienda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(`Plazos de Hacienda${nombre ? ` · ${nombre}` : ''}`)}`, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:P1D'];
  for (const p of plazos) {
    const domiciliar = !foral && conPagoDomiciliable(p.texto) && finDomiciliacion(p.fecha);
    const descripcion = [`Último día: ${p.texto}.`, domiciliar && `Si lo domicilias, hasta el ${diaMes(domiciliar)}.`, `Revisa los importes en Fisquo: ${url}`].filter(Boolean).join('\n');
    lineas.push('BEGIN:VEVENT', `UID:${compacta(p.fecha)}-${Buffer.from(p.texto).toString('base64url').slice(0, 24)}@fisquo.com`, `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${compacta(p.fecha)}`, `DTEND;VALUE=DATE:${compacta(siguiente(p.fecha))}`, `SUMMARY:${escapar(`Hacienda: ${p.texto}`)}`,
      `DESCRIPTION:${escapar(descripcion)}`, `URL:${url}`, 'TRANSP:TRANSPARENT',
      ...[['P7D', 'Queda una semana'], ['P1D', 'Mañana acaba el plazo']].flatMap(([t, aviso]) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(`${aviso}: ${p.texto}`)}`, `TRIGGER:-${t}`, 'END:VALARM']),
      'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}

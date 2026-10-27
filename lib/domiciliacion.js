// Plazo para domiciliar el pago de una autoliquidación de la AEAT (calendario del contribuyente, «Plazos de presentación de
// autoliquidaciones con domiciliación bancaria»): acaba tres días hábiles antes del último día de presentación, contando
// ese último día (si la presentación pasa a un día hábil posterior, la domiciliación se alarga lo mismo). Son inhábiles
// los sábados, los domingos, las fiestas nacionales y las de la Comunidad de Madrid, donde está el Departamento de
// Informática Tributaria (las locales de la ciudad no cuentan: el calendario de 2026 da el 15 de mayo, San Isidro).
// Solo para la AEAT: las haciendas forales y la ATC tienen sus propios plazos.
// Sin dependencias de servidor, para la pantalla, los avisos y las pruebas.
import { festivoNacional } from './festivos.js';

// Fiestas de la Comunidad de Madrid que no son nacionales (BOCM: Decreto 75/2025 para 2026 y Decreto 82/2026 para 2027).
const MADRID = {
  2026: ['2026-04-02', '2026-05-02', '2026-11-02', '2026-12-07'],
  2027: ['2027-03-19', '2027-03-25', '2027-08-16'],
};
// Fechas publicadas por la AEAT que la regla no da (2M 2026 del 111: el 16 de marzo, no el 17): mandan las suyas.
const PUBLICADAS = { '2026-03-20': '2026-03-16' };

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const inhabilAeat = (fecha) => [0, 6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay()) || festivoNacional(fecha) || Boolean(MADRID[fecha.slice(0, 4)]?.includes(fecha));

// Último día para domiciliar, dado el último día de presentación (ya pasado a hábil).
export function finDomiciliacion(limite) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(limite || ''))) return null;
  if (PUBLICADAS[limite]) return PUBLICADAS[limite];
  let d = limite;
  for (let habiles = 0; habiles < 3;) { d = masDias(d, -1); if (!inhabilAeat(d)) habiles += 1; }
  return d;
}

// Los modelos de la AEAT con pago que se pueden domiciliar (los informativos, el 349 y el 369 no).
export const DOMICILIABLES = ['303', '309', '130', '131', '111', '115', '123', '216', '202', '200', '100'];
// ¿Un texto de plazos (lib/avisos.js plazosFiscales: «303 y 130 del 3T», «la renta»…) lleva algún pago domiciliable?
export const conPagoDomiciliable = (texto) => /la renta/.test(texto) || DOMICILIABLES.some((m) => new RegExp(`(^|[^0-9])${m}([^0-9]|$)`).test(texto));

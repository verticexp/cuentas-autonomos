// Retenciones a no residentes sin establecimiento permanente en España (IRNR): el alquiler de un local cuyo arrendador vive
// fuera, los honorarios de un profesional de otro país por un trabajo que se usa aquí, cánones, intereses… Quien paga
// retiene y lo ingresa con el modelo 216 cada trimestre (no con el 111 ni el 115) y lo resume en enero con el 296.
// Sin dependencias, para usarlo en el formulario, en los modelos y en las pruebas.
// Fuentes (Sede de la AEAT, consultadas el 25-10-2026): «Tipos de gravamen en el IRNR sin establecimiento permanente»,
// «Retenciones en el IRNR sin EP» (arrendamiento de local, profesional, rentas exceptuadas, modelo 216), «Disposiciones
// más comunes de los Convenios», instrucciones del 216 (ejercicio 2024 y siguientes) y diseños de registro del 216 y el 296.

// Tipo general (art. 25.1.a TRLIRNR): 24 %; 19 % para residentes en otro Estado de la UE o del EEE con intercambio de
// información (Islandia, Noruega y, desde el 11-07-2021, Liechtenstein). Dividendos e intereses (art. 25.1.f): 19 %.
export const UE_EEE = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'GR', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'IS', 'NO', 'LI'];
export const TIPO_GENERAL = 24;
export const TIPO_UE = 19;

// Claves de renta del 296 (diseño de registro, posiciones 100-101). La 1 (dividendos) va aparte en el 216 (casillas 05,
// 08 y 11; desde 2024).
export const CLAVES_296 = {
  1: 'Dividendos y otras participaciones en fondos propios',
  2: 'Intereses y otras rentas por ceder capitales propios',
  3: 'Cánones por patentes, marcas, dibujos o modelos',
  4: 'Cánones por obras literarias y artísticas',
  5: 'Cánones por obras científicas',
  6: 'Cánones por películas y obras sonoras o visuales',
  7: 'Cánones por know-how (experiencias industriales, comerciales o científicas)',
  8: 'Cánones por programas informáticos',
  9: 'Cánones por derechos de imagen y otros derechos personales',
  10: 'Cánones por equipos industriales, comerciales o científicos',
  11: 'Otros cánones',
  12: 'Seguros de vida o invalidez y operaciones de capitalización',
  13: 'Otros rendimientos del capital mobiliario',
  14: 'Rendimientos de bienes inmuebles (alquiler)',
  15: 'Actividades empresariales',
  16: 'Asistencia técnica',
  17: 'Actividades artísticas',
  18: 'Actividades deportivas',
  19: 'Actividades profesionales',
  20: 'Rentas del trabajo',
  21: 'Pensiones',
  22: 'Retribuciones de administradores y consejeros',
  23: 'Operaciones de reaseguro',
  24: 'Entidades de navegación marítima o aérea',
  25: 'Otras rentas',
};
// Las que se eligen en un gasto, en este orden.
export const CLAVES_GASTO = [14, 19, 15, 16, 8, 3, 11, 9, 17, 2, 25];

// Países más habituales para el campo de residencia (cualquier otro, con su código ISO de 2 letras).
export const PAISES = {
  DE: 'Alemania', AD: 'Andorra', AR: 'Argentina', AU: 'Australia', AT: 'Austria', BE: 'Bélgica', BR: 'Brasil', BG: 'Bulgaria',
  CA: 'Canadá', CL: 'Chile', CN: 'China', CY: 'Chipre', CO: 'Colombia', HR: 'Croacia', DK: 'Dinamarca', AE: 'Emiratos Árabes Unidos',
  SK: 'Eslovaquia', SI: 'Eslovenia', US: 'Estados Unidos', EE: 'Estonia', FI: 'Finlandia', FR: 'Francia', GR: 'Grecia', HU: 'Hungría',
  IN: 'India', IE: 'Irlanda', IS: 'Islandia', IL: 'Israel', IT: 'Italia', JP: 'Japón', LV: 'Letonia', LI: 'Liechtenstein',
  LT: 'Lituania', LU: 'Luxemburgo', MT: 'Malta', MA: 'Marruecos', MX: 'México', NO: 'Noruega', NL: 'Países Bajos', PE: 'Perú',
  PL: 'Polonia', PT: 'Portugal', GB: 'Reino Unido', CZ: 'República Checa', RO: 'Rumanía', SE: 'Suecia', CH: 'Suiza', UY: 'Uruguay',
};
export const nombrePais = (p) => PAISES[p] || p || '';

export const ueEee = (pais) => UE_EEE.includes(String(pais || '').toUpperCase());
// Tipo de retención sin convenio (art. 25.1 TRLIRNR) según el país del perceptor y la clave de la renta.
export const tipoGeneral = (pais, clave) => ([1, 2].includes(Number(clave)) || ueEee(pais) ? TIPO_UE : TIPO_GENERAL);

// NIF con forma de NIF español (DNI, NIE o de entidad, con o sin «ES»): sin ella, el proveedor no tiene NIF en España.
const NIF_ES = /^(ES)?([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
const compacto = (nif) => String(nif || '').toUpperCase().replace(/[\s.-]/g, '');
export const nifEspanol = (nif) => NIF_ES.test(compacto(nif));
export const nifExtranjero = (nif) => Boolean(compacto(nif)) && !nifEspanol(nif);
// País de un NIF-IVA europeo por su prefijo (EL es Grecia; XI, Irlanda del Norte, en el Reino Unido); si no, vacío.
const UE_IVA = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z]{2,13}$/;
export const paisDeNif = (nif) => { const n = compacto(nif); return UE_IVA.test(n) ? ({ EL: 'GR', XI: 'GB' })[n.slice(0, 2)] || n.slice(0, 2) : ''; };

// Lo que el formulario propone al ver un NIF que no es español en un gasto con retención o en el alquiler del local.
export function propuestaNoResidente(g) {
  const pais = paisDeNif(g.proveedorNif);
  const clave = g.alquiler ? 14 : 19;
  return { pais, clave, pct: tipoGeneral(pais, clave) };
}

// Retención del gasto (gasto.noResidente = { pais, clave, pct, motivo? }). motivo: sin él, el tipo general del art. 25;
// 'convenio', el límite de un convenio con su certificado de residencia (0 si lo deja exento); 'exenta', exención de la
// propia ley (art. 14 TRLIRNR), sin retención.
export const pctNoResidente = (g) => Number(g?.noResidente?.pct) || 0;
export const claveNoResidente = (g) => (CLAVES_296[Number(g?.noResidente?.clave)] ? Number(g.noResidente.clave) : g?.alquiler ? 14 : 19);
// Subclave del 296 (posiciones 102-103): 01 tipo general, 02 límite de un convenio, 03 exención interna, 04 exención por
// convenio.
export const SUBCLAVES_296 = { '01': 'tipo general', '02': 'límite del convenio', '03': 'exenta por la ley', '04': 'exenta por el convenio' };
export function subclave296(g) {
  const nr = g?.noResidente || {};
  if (nr.motivo === 'exenta') return '03';
  if (nr.motivo === 'convenio') return pctNoResidente(g) > 0 ? '02' : '04';
  return '01';
}

// Normaliza lo que llega del formulario o de la API (ya validado con errorNoResidente): el objeto o undefined.
export function limpiarNoResidente(x) {
  if (!x || typeof x !== 'object') return undefined;
  const pais = String(x.pais || '').trim().toUpperCase();
  const clave = Number(x.clave);
  const motivo = ['convenio', 'exenta'].includes(x.motivo) ? x.motivo : undefined;
  const pct = motivo === 'exenta' ? 0 : Math.round(Number(String(x.pct ?? '').replace(',', '.')) * 100) / 100;
  return { pais, clave, pct, ...(motivo ? { motivo } : {}) };
}

// Error de validación de gasto.noResidente o '' si vale.
export function errorNoResidente(x) {
  if (x === undefined || x === null || x === false) return '';
  if (typeof x !== 'object') return 'Los datos del perceptor no residente no son válidos';
  const pais = String(x.pais || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais) || pais === 'ES') return 'Indica el país de residencia del perceptor no residente (código de 2 letras, distinto de ES)';
  if (!CLAVES_296[Number(x.clave)]) return 'Elige qué le pagas al no residente (clave de la renta del 296)';
  if (x.motivo !== undefined && !['convenio', 'exenta'].includes(x.motivo)) return 'El motivo de la retención reducida no es válido';
  if (x.motivo === 'exenta') return '';
  const pct = Number(String(x.pct ?? '').replace(',', '.'));
  if (String(x.pct ?? '').trim() === '' || !Number.isFinite(pct)) return 'Indica el porcentaje de retención del no residente';
  if (!x.motivo && ![TIPO_UE, TIPO_GENERAL].includes(pct)) return 'Sin convenio, la retención de un no residente es del 24 % o del 19 % (UE y EEE, dividendos e intereses)';
  if (x.motivo === 'convenio' && !(pct >= 0 && pct < TIPO_GENERAL && Math.abs(Math.round(pct * 100) - pct * 100) < 1e-6)) return 'La retención del convenio debe ser un porcentaje de 0 a menos del 24 %, con dos decimales como mucho';
  return '';
}

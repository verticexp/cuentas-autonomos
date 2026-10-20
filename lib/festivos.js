// Domingo de Pascua gregoriano: algoritmo de Meeus/Jones/Butcher.
export const pascua = (anio) => {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = (h + l - 7 * m + 114) % 31 + 1;
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

const fijos = new Set(['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']);

// Solo fiestas comunes a toda España, sin traslados autonómicos ni locales.
export const festivoNacional = (fecha) => {
  if (fijos.has(fecha.slice(5))) return true;
  const viernes = new Date(`${pascua(Number(fecha.slice(0, 4)))}T12:00:00Z`);
  viernes.setUTCDate(viernes.getUTCDate() - 2);
  return fecha === viernes.toISOString().slice(0, 10);
};

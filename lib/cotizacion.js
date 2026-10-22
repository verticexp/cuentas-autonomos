import { r2 } from './calculos.js';

const congelar = (objeto) => {
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') congelar(valor);
  }
  return Object.freeze(objeto);
};

// Orden PJC/297/2026 (BOE-A-2026-7296), arts. 2–5, 16, 17 y 33. Revisar cada año.
// https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296
export const COTIZACION_2026 = congelar({
  baseMaxima: 5101.20,
  baseMaximaDiaria: 170.04,
  topeMinimoAT: 1424.40,
  basesPorGrupo: {
    1: { minima: 1989.30, maxima: 5101.20, diaria: false },
    2: { minima: 1649.70, maxima: 5101.20, diaria: false },
    3: { minima: 1435.20, maxima: 5101.20, diaria: false },
    4: { minima: 1424.40, maxima: 5101.20, diaria: false },
    5: { minima: 1424.40, maxima: 5101.20, diaria: false },
    6: { minima: 1424.40, maxima: 5101.20, diaria: false },
    7: { minima: 1424.40, maxima: 5101.20, diaria: false },
    8: { minima: 47.48, maxima: 170.04, diaria: true },
    9: { minima: 47.48, maxima: 170.04, diaria: true },
    10: { minima: 47.48, maxima: 170.04, diaria: true },
    11: { minima: 47.48, maxima: 170.04, diaria: true },
  },
  tipos: {
    contingenciasComunes: { empresa: 23.60, trabajador: 4.70 },
    horasExtraFuerzaMayor: { empresa: 12.00, trabajador: 2.00 },
    horasExtra: { empresa: 23.60, trabajador: 4.70 },
    desempleoIndefinido: { empresa: 5.50, trabajador: 1.55 },
    desempleoTemporal: { empresa: 6.70, trabajador: 1.60 },
    fogasa: { empresa: 0.20, trabajador: 0 },
    formacion: { empresa: 0.60, trabajador: 0.10 },
    mei: { empresa: 0.75, trabajador: 0.15 },
  },
  tramosSolidaridad: [
    { desde: 5101.20, hasta: 5611.32, total: 1.15, empresa: 0.96, trabajador: 0.19 },
    { desde: 5611.32, hasta: 7651.80, total: 1.25, empresa: 1.04, trabajador: 0.21 },
    { desde: 7651.80, hasta: Infinity, total: 1.46, empresa: 1.22, trabajador: 0.24 },
  ],
  atPct: 1.50,
});

const importeValido = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const acotar = (valor, minima, maxima) => r2(Math.min(maxima, Math.max(minima, valor)));

// parcial: coeficiente de jornada (horas de su jornada / jornada completa): las bases mínimas se reducen en proporción.
export function baseMensual({ remuneracion, pagasExtraAnuales = 0, prorrateadas = false, grupo = 7, dias = 30, parcial = 1 } = {}) {
  if (!importeValido(remuneracion)) return { error: 'La remuneración debe ser un número finito mayor o igual que cero.' };
  if (!importeValido(pagasExtraAnuales)) return { error: 'Las pagas extra anuales deben ser un número finito mayor o igual que cero.' };
  if (!Number.isInteger(grupo) || grupo < 1 || grupo > 11) return { error: 'El grupo debe ser un entero de 1 a 11.' };
  if (!Number.isInteger(dias) || dias < 1 || dias > 31) return { error: 'Los días deben ser un entero de 1 a 31.' };
  if (typeof prorrateadas !== 'boolean') return { error: 'Prorrateadas debe ser un booleano.' };

  if (typeof parcial !== 'number' || !(parcial > 0) || parcial > 1) return { error: 'El coeficiente de jornada debe estar entre 0 y 1.' };
  const datos = COTIZACION_2026.basesPorGrupo[grupo];
  const minima = r2(datos.minima * (datos.diaria ? dias : 1) * parcial);
  const maxima = r2(datos.maxima * (datos.diaria ? dias : 1));
  const mensual = remuneracion + (prorrateadas ? 0 : pagasExtraAnuales / 12);
  if (!Number.isFinite(mensual)) return { error: 'La remuneración con prorrata debe ser finita.' };
  return {
    remuneracion: r2(mensual),
    base: acotar(mensual, minima, maxima),
    baseAT: acotar(mensual, r2(COTIZACION_2026.topeMinimoAT * parcial), maxima),
    minima,
    maxima,
    exceso: r2(Math.max(0, mensual - maxima)),
  };
}

export function solidaridad(exceso) {
  if (!importeValido(exceso)) return { error: 'El exceso debe ser un número finito mayor o igual que cero.' };
  const resultado = { empresa: 0, trabajador: 0 };
  for (const tramo of COTIZACION_2026.tramosSolidaridad) {
    // Límites inferiores exclusivos: el primer céntimo de exceso también cotiza.
    const parte = Math.max(0, Math.min(exceso - (tramo.desde - COTIZACION_2026.baseMaxima), tramo.hasta - tramo.desde));
    resultado.empresa += parte * tramo.empresa / 100;
    resultado.trabajador += parte * tramo.trabajador / 100;
  }
  return { empresa: r2(resultado.empresa), trabajador: r2(resultado.trabajador) };
}

export function cuotas({ base, baseAT, exceso = 0, temporal = false, atPct = 1.5, horasExtra = 0, horasExtraFuerzaMayor = 0 } = {}) {
  for (const [campo, valor] of Object.entries({ base, baseAT, exceso, atPct, horasExtra, horasExtraFuerzaMayor })) {
    if (!importeValido(valor)) return { error: `${campo} debe ser un número finito mayor o igual que cero.` };
  }
  if (typeof temporal !== 'boolean') return { error: 'Temporal debe ser un booleano.' };
  const adicional = solidaridad(exceso);
  const tipos = COTIZACION_2026.tipos;
  const desempleo = temporal ? tipos.desempleoTemporal : tipos.desempleoIndefinido;
  const resultado = {};
  for (const parte of ['empresa', 'trabajador']) {
    const cuota = (importe, tipo) => r2(importe * tipo[parte] / 100);
    // Desempleo, FOGASA y formación comparten la base AT/EP (art. 33).
    const detalle = {
      contingenciasComunes: cuota(base, tipos.contingenciasComunes),
      desempleo: cuota(baseAT, desempleo),
      ...(parte === 'empresa' ? { fogasa: cuota(baseAT, tipos.fogasa) } : {}),
      formacion: cuota(baseAT, tipos.formacion),
      mei: cuota(base, tipos.mei),
      ...(parte === 'empresa' ? { at: r2(baseAT * atPct / 100) } : {}),
      horasExtra: r2(cuota(horasExtra, tipos.horasExtra) + cuota(horasExtraFuerzaMayor, tipos.horasExtraFuerzaMayor)),
      solidaridad: adicional[parte],
    };
    detalle.total = r2(Object.values(detalle).reduce((suma, valor) => suma + valor, 0));
    if (!Object.values(detalle).every(Number.isFinite)) return { error: 'Las cuotas calculadas deben ser finitas.' };
    resultado[parte] = detalle;
  }
  return resultado;
}

export function nominaCotizacion({ bruto, pagasExtraAnuales, prorrateadas, grupo, dias, parcial = 1, temporal, atPct, horasExtra = 0, horasExtraFuerzaMayor = 0 } = {}) {
  if (!importeValido(bruto)) return { error: 'El bruto debe ser un número finito mayor o igual que cero.' };
  if (!importeValido(horasExtra) || !importeValido(horasExtraFuerzaMayor) || r2(horasExtra + horasExtraFuerzaMayor) > bruto) {
    return { error: 'Las horas extra deben ser importes no negativos y no superar el bruto.' };
  }
  const opciones = { pagasExtraAnuales, prorrateadas, grupo, dias, parcial };
  const bases = baseMensual({ ...opciones, remuneracion: bruto });
  if (bases.error) return bases;
  // El bruto ya incluye las horas extra: solo se restan de la base de comunes.
  const comunes = baseMensual({ ...opciones, remuneracion: r2(bruto - r2(horasExtra + horasExtraFuerzaMayor)) });
  if (comunes.error) return comunes;
  bases.base = comunes.base;
  const detalle = cuotas({ ...bases, temporal, atPct, horasExtra, horasExtraFuerzaMayor });
  if (detalle.error) return detalle;
  const costeEmpresa = r2(bruto + detalle.empresa.total);
  if (!Number.isFinite(costeEmpresa)) return { error: 'El coste de empresa debe ser finito.' };
  return { ...bases, cuotas: detalle, costeEmpresa, seguridadSocialTrabajador: detalle.trabajador.total };
}

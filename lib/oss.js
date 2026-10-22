// Ventanilla única de la Unión (OSS): ventas a consumidores de otros países de la UE.
import { desglose, importes, r2, trimestre } from './calculos.js';

// Tipos a 1 de enero de 2026. Revisar cada año con la lista de la Comisión Europea.
export const TIPOS_UE = Object.freeze({
  AT: { general: 20, reducidos: [10, 13] },
  BE: { general: 21, reducidos: [6, 12] },
  BG: { general: 20, reducidos: [9] },
  HR: { general: 25, reducidos: [5, 13] },
  CY: { general: 19, reducidos: [5, 9] },
  CZ: { general: 21, reducidos: [12] },
  DK: { general: 25, reducidos: [] },
  EE: { general: 24, reducidos: [9, 13] },
  FI: { general: 25.5, reducidos: [10, 14] },
  FR: { general: 20, reducidos: [2.1, 5.5, 10] },
  DE: { general: 19, reducidos: [7] },
  GR: { general: 24, reducidos: [6, 13] },
  HU: { general: 27, reducidos: [5, 18] },
  IE: { general: 23, reducidos: [4.8, 9, 13.5] },
  IT: { general: 22, reducidos: [4, 5, 10] },
  LV: { general: 21, reducidos: [5, 12] },
  LT: { general: 21, reducidos: [5, 9] },
  LU: { general: 17, reducidos: [3, 8, 14] },
  MT: { general: 18, reducidos: [5, 7, 12] },
  NL: { general: 21, reducidos: [9] },
  PL: { general: 23, reducidos: [5, 8] },
  PT: { general: 23, reducidos: [6, 13] },
  RO: { general: 21, reducidos: [11] },
  SK: { general: 23, reducidos: [5, 19] },
  SI: { general: 22, reducidos: [5, 9.5] },
  SE: { general: 25, reducidos: [6, 12] },
});
for (const tipo of Object.values(TIPOS_UE)) {
  Object.freeze(tipo.reducidos);
  Object.freeze(tipo);
}

// Nombre de cada país, para elegirlo en la factura.
export const NOMBRES_UE = Object.freeze({
  AT: 'Austria', BE: 'Bélgica', BG: 'Bulgaria', HR: 'Croacia', CY: 'Chipre', CZ: 'Chequia', DK: 'Dinamarca', EE: 'Estonia',
  FI: 'Finlandia', FR: 'Francia', DE: 'Alemania', GR: 'Grecia', HU: 'Hungría', IE: 'Irlanda', IT: 'Italia', LV: 'Letonia',
  LT: 'Lituania', LU: 'Luxemburgo', MT: 'Malta', NL: 'Países Bajos', PL: 'Polonia', PT: 'Portugal', RO: 'Rumanía',
  SK: 'Eslovaquia', SI: 'Eslovenia', SE: 'Suecia',
});

const paisValido = (pais) => typeof pais === 'string' && Object.hasOwn(TIPOS_UE, pais);
export const tiposPais = (pais) => paisValido(pais) ? [TIPOS_UE[pais].general, ...TIPOS_UE[pais].reducidos, 0] : [];
export const tipoValidoOss = (pais, pct) => typeof pct === 'number' && tiposPais(pais).includes(pct);
export const esVentaOss = (f) => paisValido(f?.oss?.pais);

const suma = (lista, campo) => r2(lista.reduce((s, x) => s + x[campo], 0));
const delAnio = (facturas, anio) => facturas.filter((f) => esVentaOss(f) && f.fecha.startsWith(`${anio}-`));

// Bases con su signo: las rectificativas también cuentan para el umbral.
export const ventasUeB2c = (facturas, anio) => suma(delAnio(facturas, anio).map(importes), 'base');
export function umbralOss(facturas, anio) {
  const actual = ventasUeB2c(facturas, anio), anterior = ventasUeB2c(facturas, anio - 1);
  return { anio: actual, anterior, superado: actual > 10000 || anterior > 10000, limite: 10000 };
}

// 369: bases y cuotas por país de consumo y tipo, según la fecha de la factura.
export function modelo369(facturas, anio, t) {
  const m = new Map();
  for (const f of delAnio(facturas, anio).filter((f) => trimestre(f.fecha) === t)) {
    const pais = f.oss.pais;
    if (!m.has(pais)) m.set(pais, new Map());
    const tipos = m.get(pais);
    for (const l of desglose(f)) {
      const tipo = tipos.get(l.pct) || { pct: l.pct, base: 0, cuota: 0 };
      tipo.base = r2(tipo.base + l.base);
      tipo.cuota = r2(tipo.cuota + l.iva);
      tipos.set(l.pct, tipo);
    }
  }
  const paises = [...m].sort(([a], [b]) => a.localeCompare(b)).map(([pais, grupos]) => {
    const tipos = [...grupos.values()].sort((a, b) => b.pct - a.pct);
    return { pais, tipos, base: suma(tipos, 'base'), cuota: suma(tipos, 'cuota') };
  });
  return { paises, base: suma(paises, 'base'), cuota: suma(paises, 'cuota') };
}

// Último día del mes siguiente al trimestre, sin ajuste por fines de semana.
export const plazo369 = (anio, t) => t === 4 ? `${anio + 1}-01-31` : `${anio}-${['04-30', '07-31', '10-31'][t - 1]}`;

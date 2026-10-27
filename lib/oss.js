// Ventanilla única de la Unión (OSS): ventas a consumidores de otros países de la UE.
import { desglose, importes, r2, trimestre } from './calculos.js';

// Tipos de 2026 (Finlandia: 13,5 % y Lituania: 12 % desde el 1 de enero; Austria: 4,9 % desde el 1 de julio). Revisar cada año
// con la lista de la Comisión Europea (TEDB, enlazada desde la Sede: https://ec.europa.eu/taxation_customs/tedb/).
export const TIPOS_UE = Object.freeze({
  AT: { general: 20, reducidos: [4.9, 10, 13] },
  BE: { general: 21, reducidos: [6, 12] },
  BG: { general: 20, reducidos: [9] },
  HR: { general: 25, reducidos: [5, 13] },
  CY: { general: 19, reducidos: [5, 9] },
  CZ: { general: 21, reducidos: [12] },
  DK: { general: 25, reducidos: [] },
  EE: { general: 24, reducidos: [9, 13] },
  FI: { general: 25.5, reducidos: [10, 13.5] },
  FR: { general: 20, reducidos: [2.1, 5.5, 10] },
  DE: { general: 19, reducidos: [7] },
  GR: { general: 24, reducidos: [6, 13] },
  HU: { general: 27, reducidos: [5, 18] },
  IE: { general: 23, reducidos: [4.8, 9, 13.5] },
  IT: { general: 22, reducidos: [4, 5, 10] },
  LV: { general: 21, reducidos: [5, 12] },
  LT: { general: 21, reducidos: [5, 12] },
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

// 369, régimen de la Unión (ayuda de la Sede: /Sede/Ayuda/369/RegimenUnion.shtml y sus apartados 2 a 8):
//   3 y 4: bases y cuotas del trimestre por país de consumo y tipo, según la fecha de la factura; aparte las prestaciones
//   de servicios (apartado 3) y las entregas de bienes expedidos desde España (apartado 4). La factura dice cuál es con
//   oss.bienes (lib/facturas.js); sin él, es un servicio.
//   7: una rectificativa de una factura de un trimestre anterior no cambia las bases de este: corrige la cuota de aquel
//   (país, ejercicio, periodo y diferencia, con su signo), hasta 3 años desde el plazo de aquella declaración. Pasados,
//   ya no va por la ventanilla única, sino ante el Estado de consumo (fuera). Sin la fecha de la original, va en las bases.
//   8: resultado por país. Uno negativo lo devuelve ese Estado y no compensa a los demás: a ingresar en España (cuota),
//   la suma de los positivos; devolver, la de los negativos.
// Se presenta cada trimestre mientras se esté en el régimen; sin operaciones ni correcciones, como «Declaración sin
// actividad» (apartado 2): sinActividad.
const periodoDe = (fecha) => (/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? { anio: Number(fecha.slice(0, 4)), t: trimestre(fecha) } : null);
const masTresAnios = (fecha) => `${Number(fecha.slice(0, 4)) + 3}${fecha.slice(4)}`;
const porPais = (grupos) => [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([pais, tipos]) => {
  const lista = [...tipos.values()].sort((a, b) => b.pct - a.pct);
  return { pais, tipos: lista, base: suma(lista, 'base'), cuota: suma(lista, 'cuota') };
});
const orden = (a, b) => a.pais.localeCompare(b.pais) || a.anio - b.anio || a.t - b.t;
export function modelo369(facturas, anio, t) {
  const apartados = { servicios: new Map(), bienes: new Map() };
  const correcciones = new Map(), fuera = new Map();
  for (const f of delAnio(facturas, anio).filter((f) => trimestre(f.fecha) === t)) {
    const pais = f.oss.pais;
    const original = f.rectifica && periodoDe(f.rectifica.fecha);
    if (original && (original.anio < anio || (original.anio === anio && original.t < t))) {
      const lista = plazo369(anio, t) <= masTresAnios(plazo369(original.anio, original.t)) ? correcciones : fuera;
      const k = `${pais}-${original.anio}-${original.t}`;
      const c = lista.get(k) || { pais, anio: original.anio, t: original.t, cuota: 0 };
      c.cuota = r2(c.cuota + suma(desglose(f), 'iva'));
      lista.set(k, c);
      continue;
    }
    const grupos = apartados[f.oss.bienes ? 'bienes' : 'servicios'];
    if (!grupos.has(pais)) grupos.set(pais, new Map());
    const tipos = grupos.get(pais);
    for (const l of desglose(f)) {
      const tipo = tipos.get(l.pct) || { pct: l.pct, base: 0, cuota: 0 };
      tipo.base = r2(tipo.base + l.base);
      tipo.cuota = r2(tipo.cuota + l.iva);
      tipos.set(l.pct, tipo);
    }
  }
  const servicios = porPais(apartados.servicios), bienes = porPais(apartados.bienes);
  const corr = [...correcciones.values()].sort(orden);
  const saldos = new Map();
  for (const x of [...servicios, ...bienes, ...corr]) saldos.set(x.pais, r2((saldos.get(x.pais) || 0) + x.cuota));
  const paises = [...saldos].sort(([a], [b]) => a.localeCompare(b)).map(([pais, saldo]) => ({ pais, saldo }));
  return {
    servicios, bienes, correcciones: corr, fuera: [...fuera.values()].sort(orden), paises,
    base: r2(suma(servicios, 'base') + suma(bienes, 'base')),
    cuota: suma(paises.filter((p) => p.saldo > 0), 'saldo'),
    devolver: r2(-suma(paises.filter((p) => p.saldo < 0), 'saldo')),
    sinActividad: !servicios.length && !bienes.length && !corr.length,
  };
}

// Último día del mes siguiente al trimestre, sin ajuste por fines de semana.
export const plazo369 = (anio, t) => t === 4 ? `${anio + 1}-01-31` : `${anio}-${['04-30', '07-31', '10-31'][t - 1]}`;

// Bienes de inversión y su amortización (lineal, por días desde la compra). Sin dependencias, para poder probarlo.
// Un gasto es un bien de inversión si lleva `inversion: { tipo }`: su coste no se resta entero el día de la compra,
// sino repartido en varios años con el coeficiente máximo de la tabla oficial.
//   Autónomos (estimación directa simplificada): tabla de la Orden de 27-3-1998.
//   Sociedades: tabla del art. 12.1.a de la Ley del Impuesto sobre Sociedades.
// Lo que vale 300 € o menos se amortiza entero en el año de la compra (libertad de amortización de las empresas
// de reducida dimensión, hasta 25.000 € al año).
import { r2 } from './redondeo.js';
import { costeAfecto, ivaNoDeducible, pctAfecto } from './ivaDeducible.js';

export const TIPOS_BIEN = [
  { id: 'edificios', nombre: 'Local o edificio (sin el suelo)', autonomo: 3, sociedad: 2 },
  { id: 'instalaciones', nombre: 'Instalaciones y reformas del local', autonomo: 10, sociedad: 10 },
  { id: 'mobiliario', nombre: 'Mobiliario', autonomo: 10, sociedad: 10 },
  { id: 'maquinaria', nombre: 'Maquinaria', autonomo: 12, sociedad: 12 },
  { id: 'electronicos', nombre: 'Equipos electrónicos (sonido, imagen, iluminación…)', autonomo: 12, sociedad: 20 },
  { id: 'informatica', nombre: 'Ordenadores, tablets y móviles', autonomo: 26, sociedad: 25 },
  { id: 'software', nombre: 'Programas informáticos (licencia, no suscripción)', autonomo: 26, sociedad: 33 },
  { id: 'transporte', nombre: 'Vehículos', autonomo: 16, sociedad: 16 },
  { id: 'utiles', nombre: 'Útiles y herramientas', autonomo: 30, sociedad: 25 },
  { id: 'otros', nombre: 'Otro inmovilizado', autonomo: 10, sociedad: 10 },
];
export const tipoBien = (id) => TIPOS_BIEN.find((t) => t.id === id) || TIPOS_BIEN.at(-1);
export const LIMITE_LIBERTAD = 300;

// Al editar un gasto, lo que viene de una migración o de un cambio de criterio (lo ya amortizado, la fecha de corte, el
// coeficiente del gestor) no se toca desde el formulario (auditoría N06): se parte de lo guardado y solo se cambia el tipo
// de bien. nueva: { tipo } ya validado, o undefined si el formulario no lo pide. antes: la inversión guardada.
export function inversionEditada(nueva, antes) {
  if (!nueva) return undefined;
  if (!antes) return nueva;
  return antes.tipo === nueva.tipo ? { ...antes } : { ...antes, tipo: nueva.tipo };
}

// % anual que se aplica a un bien (el máximo de la tabla, o el que se haya puesto a mano si es menor).
export function coeficiente(bien, regimen = 'autonomo') {
  const max = tipoBien(bien.inversion?.tipo)[regimen === 'sociedad' ? 'sociedad' : 'autonomo'];
  const propio = Number(bien.inversion?.coef);
  return propio > 0 && propio < max ? propio : max;
}

const dia = (fecha) => Date.parse(`${fecha}T00:00:00Z`) / 864e5;
const fechaDe = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const diasAnio = (y) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365);

// Años (con decimales) de `desde` a `hasta`, ambos incluidos: cada día vale 1/365 o 1/366 según su año, para que un año
// entero sea justo el coeficiente anual también en los bisiestos (auditoría 19-10-2026: con 1/365 fijo, 3.650 € al 26 %
// amortizaban 951,60 € en 2028 en lugar de 949 €).
function anios(desde, hasta) {
  let total = 0;
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
    const a = desde > `${y}-01-01` ? desde : `${y}-01-01`;
    const b = hasta < `${y}-12-31` ? hasta : `${y}-12-31`;
    if (b >= a) total += (dia(b) - dia(a) + 1) / diasAnio(y);
  }
  return total;
}
// Último día en que se completan `n` años contados desde `desde` (incluido), con la misma cuenta por días.
function finTras(desde, n) {
  let y = Number(desde.slice(0, 4)), d = dia(desde);
  for (;;) {
    const resto = dia(`${y}-12-31`) - d + 1;
    if (n * diasAnio(y) <= resto + 1e-9) return fechaDe(d + Math.max(1, Math.ceil(n * diasAnio(y) - 1e-9)) - 1);
    n -= resto / diasAnio(y);
    y += 1; d = dia(`${y}-01-01`);
  }
}

// Lo que vale el bien para amortizarlo: su base, más el IVA que no se recupera (quien no presenta el 303, o la parte no
// deducible de un bien usado a medias, lib/ivaDeducible.js). irpf: solo la parte afecta a la actividad en el IRPF
// (un turismo sin uso exclusivo no se amortiza en el 130 ni en la renta). prorrata: id → IVA que la prorrata no dejó
// deducir al comprarlo (lib/calculos.js prorrataBienes), que también es más valor del bien.
export function valorBien(g, { ivaCoste = false, irpf = false, prorrata } = {}) {
  const extra = prorrata?.get(g.id) || 0;
  if (irpf) return r2(costeAfecto(g, { ivaCoste }) + (extra * pctAfecto(g)) / 100);
  return r2(g.base + ivaNoDeducible(g, { ivaCoste }) + extra);
}

// Amortización acumulada de un bien al final del día `hasta` (incluido). irpf: solo la parte afecta (valorBien); la
// libertad de amortización y lo ya amortizado en otro programa se miden con el valor entero del bien.
export function acumulada(g, hasta, { regimen = 'autonomo', ivaCoste = false, irpf = false, prorrata } = {}) {
  const entero = valorBien(g, { ivaCoste, prorrata });
  const valor = irpf ? valorBien(g, { ivaCoste, irpf, prorrata }) : entero;
  if (hasta < g.fecha || valor <= 0) return 0;
  // Traído de otro programa: lo ya amortizado a la fecha de corte (desde) y, a partir de ahí, lo de cada día.
  const previa = g.inversion?.acumulada === undefined ? undefined : (irpf && entero > 0 ? (g.inversion.acumulada * valor) / entero : g.inversion.acumulada);
  if (previa !== undefined && g.inversion.desde) {
    if (hasta < g.inversion.desde) return r2(Math.min(valor, previa));
    return r2(Math.min(valor, previa + (valor * coeficiente(g, regimen) * anios(g.inversion.desde, hasta)) / 100));
  }
  if (entero <= LIMITE_LIBERTAD) return valor;
  return r2(Math.min(valor, (valor * coeficiente(g, regimen) * anios(g.fecha, hasta)) / 100));
}

// Cuota de amortización de un bien entre dos fechas (ambas incluidas).
export const cuotaEntre = (g, desde, hasta, op) => r2(acumulada(g, hasta, op) - acumulada(g, ayer(desde), op));
const ayer = (fecha) => fechaDe(dia(fecha) - 1);

const FIN_T = ['03-31', '06-30', '09-30', '12-31'];
const INI_T = ['01-01', '04-01', '07-01', '10-01'];
export const bienes = (gastos) => gastos.filter((g) => g.inversion && g.base > 0);

// Cuotas de un año, por trimestre y por actividad, de todos los bienes comprados hasta entonces.
export function amortizacionesAnio(gastos, anio, op = {}) {
  const hasta = op.hasta && op.hasta < `${anio}-12-31` ? op.hasta : `${anio}-12-31`;
  return bienes(gastos).filter((g) => g.fecha <= hasta).flatMap((g) => [1, 2, 3, 4].map((t) => ({
    id: g.id, t, actividad: g.actividad, cuota: `${anio}-${INI_T[t - 1]}` > hasta ? 0 : cuotaEntre(g, `${anio}-${INI_T[t - 1]}`, `${anio}-${FIN_T[t - 1]}` > hasta ? hasta : `${anio}-${FIN_T[t - 1]}`, op),
  }))).filter((x) => x.cuota > 0);
}

// Libro de bienes de inversión a final de un año: cada bien con lo amortizado ese año, lo acumulado y lo pendiente.
export function libroBienes(gastos, anio, op = {}) {
  const fin = op.hasta && op.hasta < `${anio}-12-31` ? op.hasta : `${anio}-12-31`;
  return bienes(gastos).filter((g) => g.fecha <= fin).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) => {
    const valor = valorBien(g, op);
    const acum = acumulada(g, fin, op);
    const libertad = valor <= LIMITE_LIBERTAD && g.inversion.acumulada === undefined;
    return {
      id: g.id, fecha: g.fecha, concepto: g.concepto, proveedor: g.proveedor || '', actividad: g.actividad, tipo: tipoBien(g.inversion.tipo),
      valor, coef: libertad ? 100 : coeficiente(g, op.regimen), libertad, ...(g.migrado ? { migrado: true } : {}),
      anio: cuotaEntre(g, `${anio}-01-01`, fin, op), acumulada: acum, pendiente: r2(valor - acum),
      fin: libertad ? g.fecha : finAmortizacion(g, op),
    };
  });
}

// Fecha en la que el bien queda amortizado del todo.
function finAmortizacion(g, op = {}) {
  const previa = g.inversion?.acumulada;
  if (previa !== undefined && g.inversion.desde) {
    const valor = valorBien(g, op);
    const falta = ((valor - previa) * 100) / (valor * coeficiente(g, op.regimen));
    return falta > 0 ? finTras(g.inversion.desde, falta) : ayer(g.inversion.desde);
  }
  return finTras(g.fecha, 100 / coeficiente(g, op.regimen));
}

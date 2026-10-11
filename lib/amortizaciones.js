// Bienes de inversión y su amortización (lineal, por días desde la compra). Sin dependencias, para poder probarlo.
// Un gasto es un bien de inversión si lleva `inversion: { tipo }`: su coste no se resta entero el día de la compra,
// sino repartido en varios años con el coeficiente máximo de la tabla oficial.
//   Autónomos (estimación directa simplificada): tabla de la Orden de 27-3-1998.
//   Sociedades: tabla del art. 12.1.a de la Ley del Impuesto sobre Sociedades.
// Lo que vale 300 € o menos se amortiza entero en el año de la compra (libertad de amortización de las empresas
// de reducida dimensión, hasta 25.000 € al año).
const r2 = (n) => Math.round(n * 100) / 100;

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

// % anual que se aplica a un bien (el máximo de la tabla, o el que se haya puesto a mano si es menor).
export function coeficiente(bien, regimen = 'autonomo') {
  const max = tipoBien(bien.inversion?.tipo)[regimen === 'sociedad' ? 'sociedad' : 'autonomo'];
  const propio = Number(bien.inversion?.coef);
  return propio > 0 && propio < max ? propio : max;
}

const dia = (fecha) => Date.parse(`${fecha}T00:00:00Z`) / 864e5;

// Lo que vale el bien para amortizarlo: su base, más el IVA si no se recupera (quien no presenta el 303).
export function valorBien(g, { ivaCoste = false } = {}) {
  return ivaCoste ? r2(g.base * (1 + (Number(g.ivaPct) || 0) / 100)) : g.base;
}

// Amortización acumulada de un bien al final del día `hasta` (incluido).
export function acumulada(g, hasta, { regimen = 'autonomo', ivaCoste = false } = {}) {
  const valor = valorBien(g, { ivaCoste });
  if (hasta < g.fecha || valor <= 0) return 0;
  if (valor <= LIMITE_LIBERTAD) return valor;
  const dias = dia(hasta) - dia(g.fecha) + 1;
  return r2(Math.min(valor, (valor * coeficiente(g, regimen) * dias) / 100 / 365));
}

// Cuota de amortización de un bien entre dos fechas (ambas incluidas).
export const cuotaEntre = (g, desde, hasta, op) => r2(acumulada(g, hasta, op) - acumulada(g, ayer(desde), op));
const ayer = (fecha) => new Date((dia(fecha) - 1) * 864e5).toISOString().slice(0, 10);

const FIN_T = ['03-31', '06-30', '09-30', '12-31'];
const INI_T = ['01-01', '04-01', '07-01', '10-01'];
export const bienes = (gastos) => gastos.filter((g) => g.inversion && g.base > 0);

// Cuotas de un año, por trimestre y por actividad, de todos los bienes comprados hasta entonces.
export function amortizacionesAnio(gastos, anio, op = {}) {
  return bienes(gastos).filter((g) => g.fecha <= `${anio}-12-31`).flatMap((g) => [1, 2, 3, 4].map((t) => ({
    id: g.id, t, actividad: g.actividad, cuota: cuotaEntre(g, `${anio}-${INI_T[t - 1]}`, `${anio}-${FIN_T[t - 1]}`, op),
  }))).filter((x) => x.cuota > 0);
}

// Libro de bienes de inversión a final de un año: cada bien con lo amortizado ese año, lo acumulado y lo pendiente.
export function libroBienes(gastos, anio, op = {}) {
  const fin = `${anio}-12-31`;
  return bienes(gastos).filter((g) => g.fecha <= fin).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) => {
    const valor = valorBien(g, op);
    const acum = acumulada(g, fin, op);
    const libertad = valor <= LIMITE_LIBERTAD;
    return {
      id: g.id, fecha: g.fecha, concepto: g.concepto, proveedor: g.proveedor || '', actividad: g.actividad, tipo: tipoBien(g.inversion.tipo),
      valor, coef: libertad ? 100 : coeficiente(g, op.regimen), libertad,
      anio: cuotaEntre(g, `${anio}-01-01`, fin, op), acumulada: acum, pendiente: r2(valor - acum),
      fin: libertad ? g.fecha : finAmortizacion(g, op),
    };
  });
}

// Fecha en la que el bien queda amortizado del todo.
function finAmortizacion(g, op = {}) {
  const dias = Math.ceil(36500 / coeficiente(g, op.regimen));
  return new Date((dia(g.fecha) + dias - 1) * 864e5).toISOString().slice(0, 10);
}

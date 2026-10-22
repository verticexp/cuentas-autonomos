import { r2 } from './redondeo.js';

const congelar = (objeto) => {
  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === 'object') congelar(valor);
  }
  return Object.freeze(objeto);
};

// Fuente: AEAT, «Algoritmo de cálculo del tipo de retención 2026», 10-09-2026.
// https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/Algoritmo%20Retenciones-2026_10sept.pdf
// Aplicable desde el 10 de septiembre; revisar cada año.
export const IRPF_2026 = congelar({
  anio: 2026,
  entrada: { nacimientoMinimo: 1906, descendientesMaximos: 16, menores3Maximos: 9,
    ascendientesMaximos: 6, convivenciaMaxima: 9, edadDescendienteLimite: 25 },
  irregulares: { maximo: 90000, proporcionMaxima: 0.30 },
  gastos: { general: 2000, movilidad: 2000, discapacidad: 3500, discapacidadConAsistencia: 7750 },
  reduccion20: {
    primerLimite: 14852, segundoLimite: 17673.52, limite: 19747.50,
    primeraCuantia: 7302, primerFactor: 1.75, segundaCuantia: 2364.34, segundoFactor: 1.14,
  },
  reducciones: { pensionista: 600, masDeDosDescendientes: 600, desempleado: 1200 },
  minimos: {
    contribuyente: 5550, edad65: 65, incremento65: 1150, edad75: 75, incremento75: 1400,
    descendientes: [2400, 2700, 4000, 4500], edadMenor: 3, menor3: 2800,
    ascendiente: 1150, ascendiente75: 1400,
    discapacidad: { no: 0, '33a65': 3000, '65': 9000 }, asistencia: 3000,
    incrementoAlimentos: 1980,
  },
  // TABLA 1: índices 0, 1 y 2 (dos o más descendientes).
  limitesExcluyentes: { 1: [null, 17644, 18694], 2: [17197, 18130, 19262], 3: [15876, 16342, 16867] },
  // TABLA 2: cuota acumulada en cada comienzo de tramo.
  escala: [
    { desde: 0, cuota: 0, resto: 12450, tipo: 19 },
    { desde: 12450, cuota: 2365.50, resto: 7750, tipo: 24 },
    { desde: 20200, cuota: 4225.50, resto: 15000, tipo: 30 },
    { desde: 35200, cuota: 8725.50, resto: 24800, tipo: 37 },
    { desde: 60000, cuota: 17901.50, resto: 240000, tipo: 45 },
    { desde: 300000, cuota: 125901.50, resto: null, tipo: 47 },
  ],
  limiteCuota: { retribuciones: 35200, factor: 0.43 },
  tipos: { inferiorAnio: 2, especial: 15, maximoRegularizacion: 47 },
  vivienda: { limiteRetribuciones: 33007.20, factor: 0.02, maximoMinoracion: 660.14 },
  territorial: { factorCuota: 0.40, inferiorAnio: 0.80, especial: 6, maximoRegularizacion: 19 },
});

const P = IRPF_2026;
const error = (texto) => { throw new Error(texto); };
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const numero = (x, nombre) => {
  if (typeof x !== 'number' && !(typeof x === 'string' && /^\d+(?:\.\d+)?$/.test(x.trim()))) {
    error(`${nombre} debe ser un número válido`);
  }
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) error(`${nombre} debe ser un número no negativo y finito`);
  return n;
};
const anio = (x, nombre) => {
  const n = numero(x, nombre);
  if (!Number.isInteger(n) || n < P.entrada.nacimientoMinimo || n > P.anio) {
    error(`${nombre} debe estar entre ${P.entrada.nacimientoMinimo} y ${P.anio}`);
  }
  return n;
};
const booleano = (x, nombre) => {
  if (x === undefined) return false;
  if (typeof x !== 'boolean') error(`${nombre} debe ser verdadero o falso`);
  return x;
};
const opcion = (x, opciones, nombre) => {
  if (!opciones.includes(x)) error(`${nombre} no válido`);
  return x;
};
const nifFisico = (x) => typeof x === 'string' && /^(?:\d{8}|[XYZKLM]\d{7})[A-Z]$/.test(x);
const nifLimpio = (x) => typeof x === 'string' ? x.trim().toUpperCase() : '';

const persona = (d, nombre) => {
  if (!esObjeto(d)) error(`Datos de ${nombre} no válidos`);
  const nacimiento = anio(d.nacimiento, `Año de nacimiento de ${nombre}`);
  const discapacidad = opcion(d.discapacidad ?? 'no', ['no', '33a65', '65'], `Discapacidad de ${nombre}`);
  const movilidadReducida = booleano(d.movilidadReducida, `Movilidad reducida de ${nombre}`);
  if (movilidadReducida && discapacidad !== '33a65') {
    error(`Movilidad reducida incorrecta para discapacidad de ${nombre}`);
  }
  return { nacimiento, discapacidad, movilidadReducida };
};

/** Modelo 145: los familiares declarados deben cumplir los requisitos de renta y convivencia.
 * `nif` es obligatorio (persona física). `rendimientosTerritorio` representa RENCEME,
 * independiente de `residencia`, y por defecto es falso. Importes en euros anuales.
 * `manuales` admite peonadas/jornales; no tiene mínimo específico en este algoritmo.
 * `inferiorAnio` incluye artistas; `general`, indefinidos de personas con discapacidad/penados.
 */
export function limpiar145(d) {
  try {
    if (!esObjeto(d)) error('Datos del trabajador obligatorios');
    const nif = nifLimpio(d.nif);
    if (!nifFisico(nif)) error('NIF del perceptor obligatorio de persona física');
    if (!d.nacimiento) error('Año de nacimiento del perceptor obligatorio');
    const trabajador = persona(d, 'perceptor');
    const situacionFamiliar = numero(d.situacionFamiliar, 'Situación familiar del perceptor');
    opcion(situacionFamiliar, [1, 2, 3], 'Situación familiar del perceptor');
    const nifConyuge = nifLimpio(d.nifConyuge);
    if (situacionFamiliar === 2 && !nifFisico(nifConyuge)) error('NIF del cónyuge obligatorio de persona física');
    if (situacionFamiliar !== 2 && nifConyuge) error('NIF del cónyuge no debe tener contenido');
    const situacion = opcion(d.situacion, ['activo', 'pensionista', 'desempleado', 'otra'], 'Situación laboral del perceptor');
    let contrato = '';
    if (situacion === 'activo') {
      contrato = opcion(d.contrato, ['general', 'inferiorAnio', 'especial', 'manuales'], 'Tipo de contrato');
    } else if (d.contrato !== undefined && d.contrato !== '') {
      error('Tipo de contrato incorrecto para situación laboral del perceptor');
    }
    const movilidadGeografica = booleano(d.movilidadGeografica, 'Movilidad geográfica');
    if (movilidadGeografica && situacion !== 'activo') error('Movilidad geográfica incorrecta para situación laboral del perceptor');
    const residencia = opcion(d.residencia ?? 'general', ['general', 'ceutaMelilla', 'laPalma'], 'Residencia');
    const rendimientosTerritorio = booleano(d.rendimientosTerritorio, 'Rendimientos obtenidos en el territorio');
    const retribuciones = numero(d.retribuciones, 'Retribuciones totales');
    if (!retribuciones) error('Las retribuciones totales son obligatorias');
    const cantidades = {};
    for (const campo of ['irregulares', 'irregulares2', 'cotizaciones', 'pensionConyuge', 'alimentos']) {
      cantidades[campo] = numero(d[campo] === undefined ? 0 : d[campo], campo);
    }
    if (cantidades.irregulares > P.irregulares.maximo) error('La reducción del art. 18.2 no puede superar 90.000 euros');
    if (cantidades.irregulares > retribuciones * P.irregulares.proporcionMaxima) {
      error('La reducción del art. 18.2 no puede superar el 30% de las retribuciones totales');
    }
    const prestamoVivienda = booleano(d.prestamoVivienda, 'Préstamo para vivienda');
    if (prestamoVivienda && retribuciones >= P.vivienda.limiteRetribuciones) {
      error('Los pagos por préstamos para vivienda exigen retribuciones inferiores a 33.007,20 euros');
    }
    const lista = (campo, maximo) => {
      const valores = d[campo] === undefined ? [] : d[campo];
      if (!Array.isArray(valores) || valores.length > maximo) error(`${campo}: máximo ${maximo} y formato de lista obligatorio`);
      return valores;
    };
    const descendientes = lista('descendientes', P.entrada.descendientesMaximos).map((h) => {
      const p = persona(h, 'descendiente');
      if (P.anio - p.nacimiento >= P.entrada.edadDescendienteLimite && p.discapacidad === 'no') {
        error('Descendientes de 25 o más años sin discapacidad no dan derecho a mínimo');
      }
      const adopcion = h.adopcion === undefined ? undefined : anio(h.adopcion, 'Año de adopción');
      if (adopcion !== undefined && adopcion < p.nacimiento) error('La adopción no puede ser anterior al nacimiento');
      return { ...p, ...(adopcion === undefined ? {} : { adopcion }), porEntero: booleano(h.porEntero, 'Cómputo por entero') };
    }).sort((a, b) => a.nacimiento - b.nacimiento);
    if (descendientes.filter(menor3).length > P.entrada.menores3Maximos) error('El número de descendientes menores de 3 años no puede ser superior a 9');
    if (situacionFamiliar === 1 && !descendientes.length) error('La situación familiar 1 exige al menos un descendiente con derecho a reducción');
    const ascendientes = lista('ascendientes', P.entrada.ascendientesMaximos).map((a) => {
      const p = persona(a, 'ascendiente');
      if (P.anio - p.nacimiento < P.minimos.edad65 && p.discapacidad === 'no') {
        error('Ascendientes menores de 65 años sin discapacidad no dan derecho a mínimo');
      }
      const convivencia = numero(a.convivencia === undefined ? 1 : a.convivencia, 'Convivencia del ascendiente');
      if (!Number.isInteger(convivencia) || convivencia < 1 || convivencia > P.entrada.convivenciaMaxima) {
        error('Convivencia del ascendiente debe ser un entero entre 1 y 9');
      }
      return { ...p, convivencia };
    });
    return { nif, ...trabajador, situacionFamiliar, nifConyuge, situacion, contrato,
      movilidadGeografica, residencia, rendimientosTerritorio, retribuciones, ...cantidades,
      prestamoVivienda, descendientes, ascendientes };
  } catch (e) {
    return { error: e.message };
  }
}

const menor3 = (p) => P.anio - p.nacimiento < P.minimos.edadMenor
  || (p.adopcion !== undefined && P.anio - p.adopcion < P.minimos.edadMenor);
const asistencia = (p) => p.discapacidad === '65' || (p.discapacidad === '33a65' && p.movilidadReducida);
const sumar = (lista, f) => lista.reduce((s, p, i) => s + f(p, i), 0);
// TRUNCAR al segundo decimal; elimina únicamente el residuo binario (como r2).
const truncar = (n) => Math.trunc(Number((n * 100).toPrecision(15))) / 100;
const escala = (base) => {
  const t = P.escala.findLast((tramo) => base >= tramo.desde);
  return t.cuota + (base - t.desde) * t.tipo / 100;
};
const territorial = (d) => d.residencia !== 'general' && d.rendimientosTerritorio;
const tipoMinimo = (d) => (territorial(d) ? P.territorial : P.tipos)[d.contrato] ?? 0;

function calcular(d) {
  const incrementoMovilidad = d.movilidadGeografica ? P.gastos.movilidad : 0;
  const incrementoDiscapacidad = d.situacion !== 'activo' ? 0
    : asistencia(d) ? P.gastos.discapacidadConAsistencia : d.discapacidad === '33a65' ? P.gastos.discapacidad : 0;
  const otrosGastos = Math.min(P.gastos.general + incrementoMovilidad + incrementoDiscapacidad,
    Math.max(0, d.retribuciones - d.cotizaciones));
  const gastos = d.cotizaciones + otrosGastos;
  // RNT excluye OTROSGASTOS: se descuentan después de calcular RED20.
  const rendimientoNeto = Math.max(0, d.retribuciones - d.irregulares - d.irregulares2 - d.cotizaciones);
  const r = P.reduccion20;
  const reduccion20 = r2(rendimientoNeto <= r.primerLimite ? r.primeraCuantia
    : rendimientoNeto <= r.segundoLimite ? r.primeraCuantia - r.primerFactor * (rendimientoNeto - r.primerLimite)
      : rendimientoNeto < r.limite ? r.segundaCuantia - r.segundoFactor * (rendimientoNeto - r.segundoLimite) : 0);
  const rendimientoReducido = Math.max(0, rendimientoNeto - otrosGastos - reduccion20);
  const reducciones = {
    pensionista: d.situacion === 'pensionista' ? P.reducciones.pensionista : 0,
    descendientes: d.descendientes.length > 2 ? P.reducciones.masDeDosDescendientes : 0,
    desempleado: d.situacion === 'desempleado' ? P.reducciones.desempleado : 0,
    pensionConyuge: d.pensionConyuge,
  };
  const m = P.minimos;
  const edad = P.anio - d.nacimiento;
  const contribuyente = m.contribuyente + (edad >= m.edad65 ? m.incremento65 : 0) + (edad >= m.edad75 ? m.incremento75 : 0);
  const descendientes = r2(sumar(d.descendientes, (h, i) => m.descendientes[Math.min(i, 3)] * (h.porEntero ? 1 : 0.5)))
    + r2(sumar(d.descendientes, (h) => menor3(h) ? m.menor3 * (h.porEntero ? 1 : 0.5) : 0));
  // Cada componente se suma completo antes de REDONDEAR1 (no cada familiar).
  const ascendientes = r2(sumar(d.ascendientes, (a) => m.ascendiente / a.convivencia))
    + r2(sumar(d.ascendientes, (a) => P.anio - a.nacimiento >= m.edad75 ? m.ascendiente75 / a.convivencia : 0));
  const discapacidad = m.discapacidad[d.discapacidad] + (asistencia(d) ? m.asistencia : 0)
    + r2(sumar(d.descendientes, (h) => m.discapacidad[h.discapacidad] * (h.porEntero ? 1 : 0.5)))
    + r2(sumar(d.descendientes, (h) => asistencia(h) ? m.asistencia * (h.porEntero ? 1 : 0.5) : 0))
    + r2(sumar(d.ascendientes, (a) => m.discapacidad[a.discapacidad] / a.convivencia))
    + r2(sumar(d.ascendientes, (a) => asistencia(a) ? m.asistencia / a.convivencia : 0));
  const minimo = { contribuyente, descendientes, ascendientes, discapacidad,
    total: contribuyente + descendientes + ascendientes + discapacidad };
  const base = Math.max(0, rendimientoReducido - sumar(Object.values(reducciones), (n) => n));
  const limiteExcluyente = P.limitesExcluyentes[d.situacionFamiliar][Math.min(d.descendientes.length, 2)]
    + reducciones.pensionista + reducciones.desempleado;
  const exento = d.retribuciones <= limiteExcluyente;
  const separarAlimentos = d.alimentos > 0 && base > d.alimentos;
  const cuotaBase = separarAlimentos ? escala(base - d.alimentos) + escala(d.alimentos) : escala(base);
  const cuotaMinimo = escala(minimo.total + (separarAlimentos ? m.incrementoAlimentos : 0));
  const limiteCuota = d.retribuciones <= P.limiteCuota.retribuciones
    ? Math.max(0, (d.retribuciones - limiteExcluyente) * P.limiteCuota.factor) : null;
  const cuota = exento ? 0 : Math.min(Math.max(0, cuotaBase - cuotaMinimo), limiteCuota ?? Infinity);
  const minoracionVivienda = d.prestamoVivienda ? truncar(d.retribuciones * P.vivienda.factor) : 0;
  const cuotaTerritorial = cuota * (territorial(d) ? P.territorial.factorCuota : 1);
  const tipoPrevio = truncar(Math.max(0, cuotaTerritorial - minoracionVivienda) / d.retribuciones * 100);
  // La salida EXENTOS salta al cálculo del tipo: los mínimos de contrato siguen aplicándose.
  const tipo = Math.max(tipoPrevio, tipoMinimo(d));
  const importe = r2(d.retribuciones * tipo / 100);
  return { gastos, otrosGastos, incrementoMovilidad, incrementoDiscapacidad, rendimientoNeto,
    reduccion20, rendimientoReducido, reducciones, minimo, base, limiteExcluyente, exento,
    cuotaBase, cuotaMinimo, limiteCuota, cuota, cuotaTerritorial, minoracionVivienda, tipoPrevio, tipo, importe };
}

export function retencionTrabajo(datos) {
  const d = limpiar145(datos);
  return d.error ? d : calcular(d);
}

/** Fórmula general de REGULARIZACIÓN, con residencia y origen de las rentas estables.
 * Sin historial no se pueden aplicar las restricciones específicas del art. 87.5,
 * los cambios territoriales CAUSA6–8 ni los ajustes históricos de vivienda CAUSA1–10.
 * Se usa la cuota nueva (no el importe anual truncado); vivienda sólo sobre lo pendiente.
 * Vivienda sigue la rama CAUSA11; para el tope territorial se presupone RENCEMEA=S.
 */
export function regularizar(datos, contexto = {}) {
  const d = limpiar145(datos);
  if (d.error) return d;
  try {
    if (!esObjeto(contexto)) error('Datos de regularización no válidos');
    let { percibido, retenido } = contexto;
    percibido = numero(percibido, 'Retribuciones ya satisfechas');
    retenido = numero(retenido, 'Retenciones ya practicadas');
    if (!percibido) error('Las retribuciones ya satisfechas son obligatorias');
    if (percibido >= d.retribuciones) error('Las retribuciones totales deben superar las ya satisfechas');
    const anual = calcular(d);
    const pendiente = d.retribuciones - percibido;
    const minoracionVivienda = d.prestamoVivienda ? truncar(pendiente * P.vivienda.factor) : 0;
    const tipoPrevio = truncar(Math.max(0, (anual.cuotaTerritorial - retenido - minoracionVivienda) / pendiente * 100));
    const maximo = territorial(d) ? P.territorial.maximoRegularizacion : P.tipos.maximoRegularizacion;
    const tipo = Math.max(tipoMinimo(d), Math.min(maximo, tipoPrevio));
    const importePendiente = r2(pendiente * tipo / 100);
    const importe = r2(pendiente * tipo / 100 + retenido);
    return { ...anual, tipoAnual: anual.tipo, importeAnual: anual.importe, percibido, retenido,
      pendiente, minoracionVivienda, tipoPrevio, tipo, importePendiente, importe };
  } catch (e) {
    return { error: e.message };
  }
}

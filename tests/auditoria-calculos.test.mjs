// Auditoría exhaustiva de los cálculos de los modelos (noviembre de 2026). Una simulación con semilla fija genera
// empresas completas —facturas, gastos, nóminas, dividendos e intereses, alquileres con inmueble, pagos a no residentes,
// vinculadas, paraísos fiscales, ventanilla única, IGIC y módulos— y de cada una se comprueba, modelo a modelo:
//   A. la aritmética interna de cada casilla: cada total es la suma de sus parciales y cada cuota, el porcentaje de su
//      base, recalculado aquí en céntimos enteros por otro camino.
//   B. que cada resumen anual cuadra con la suma de sus autoliquidaciones: 193 = Σ123, 296 = Σ216, 180 = Σ115,
//      190 = Σ111 + profesionales, 425 = Σ420 y 415 = el 347 canario sin trimestres.
//   C. la higiene numérica de todo lo que sale: nada infinito, nada NaN y todo importe en céntimos exactos.
//   D. que el fichero de ancho fijo de la Sede dice lo mismo que el cálculo, leyéndolo campo a campo, y que cuando falta
//      un dato el generador se niega con un mensaje para la persona, nunca con un error de programación.
//   E. que el cálculo es determinista y que con datos vacíos o en los bordes del año no se rompe.
// Complementa tests/auditoria-fuzz.test.mjs, que cubre 303, 347, 349, 390, 115, renta, sociedades y contabilidad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importes, r2, trimestre } from '../lib/calculos.js';
import {
  LIMITE_232, LIMITE_232_ESPECIFICAS, modelo115, modelo180, modelo190, modelo202, modelo216, modelo232, modelo296,
  modelo309, modelo347, modelo415, paraisosDe, provinciaDe,
} from '../lib/modelos.js';
import { casillas123, limpiarPago, modelo123, modelo193, partes193 } from '../lib/capitalMobiliario.js';
import { calculoNomina, modelo111 } from '../lib/nominas.js';
import { modelo369 } from '../lib/oss.js';
import { casillas420, liquidaciones420, modelo425 } from '../lib/igic.js';
import { modelo131, modelos131, pctModulos } from '../lib/estimacionObjetiva.js';
import { modelo840 } from '../lib/iae.js';
import { nifEspanolValido } from '../lib/validacion.js';
import { fichero111, fichero115, fichero123, fichero216 } from '../lib/ficheroAeat.js';
import { fichero180, fichero190, fichero193, fichero347 } from '../lib/ficherosInformativas.js';
import { fichero232 } from '../lib/ficheroVinculadas.js';

const EMPRESAS = 250;
const ANIO = 2026;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const c = (x) => Math.round(Number(x || 0) * 100); // a céntimos
const eur = (x) => Math.round(x) / 100;
// Redondeo de céntimos de referencia (mitad lejos del cero) sobre milésimas de céntimo enteras, como en el fuzz.
const rc = (milicent) => Math.sign(milicent) * Math.round(Math.abs(milicent) / 1000);

const fallos = [];
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; if (!cond) fallos.push(msg); };
// Igualdad en céntimos: la que importa en un modelo.
const igual = (a, b, msg) => ok(c(a) === c(b), `${msg}: ${a} ≠ ${b}`);

// ---------- NIF válidos, para que los ficheros informativos no se nieguen por el carácter de control ----------
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const dni = (n) => { const d = String(Math.abs(n) % 100000000).padStart(8, '0'); return d + LETRAS_DNI[Number(d) % 23]; };
const controlCif = (d) => {
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const x = Number(d[i]);
    if (i % 2 === 0) { const y = x * 2; suma += Math.floor(y / 10) + (y % 10); } else suma += x;
  }
  return (10 - (suma % 10)) % 10;
};
// A, B, E y H llevan dígito de control; N, P, Q, R, S y W, letra.
const cif = (letra, n) => { const d = String(Math.abs(n) % 10000000).padStart(7, '0'); const k = controlCif(d); return letra + d + ('ABEH'.includes(letra) ? String(k) : 'JABCDEFGHI'[k]); };

// ---------- Generador de empresas ----------
const CP = ['08005 Barcelona', '28013 Madrid', '46001 Valencia', '41001 Sevilla', '50001 Zaragoza', '15001 A Coruña'];
const REF_CATASTRAL = '9872023VH5702S0001WX';

function empresa(seed) {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const fecha = (anio = ANIO) => `${anio}-${String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`;
  const importe = (max) => Math.round(R() * max * 100) / 100 || 0.01;

  const yo = { nif: cif('B', seed * 7919), nombre: `Empresa ${seed} SL`, telefono: '600123456', contacto: 'Ana Pérez Gil', email: 'ana@empresa.es' };
  const domicilios = new Map();
  const apuntar = (nif, nombre, cp) => { if (nif) domicilios.set(String(nif).toUpperCase(), cp); if (nombre) domicilios.set(String(nombre).trim().toUpperCase(), cp); };

  // Terceros: españoles (con NIF y CP), de la UE (van al 349, no al 347) y de un paraíso fiscal.
  const espanoles = Array.from({ length: 4 }, (_, i) => ({ nombre: `Cliente ${seed}-${i}`, nif: i % 2 ? dni(seed * 131 + i) : cif('B', seed * 311 + i), cp: pick(CP) }));
  const paraiso = { nombre: `Offshore ${seed}`, nif: '', pais: pick(['KY', 'VG', 'JE', 'BM']), cp: '' };
  const provs = Array.from({ length: 4 }, (_, i) => ({ nombre: `Proveedor ${seed}-${i}`, nif: i % 2 ? dni(seed * 977 + i) : cif('B', seed * 613 + i), cp: pick(CP) }));
  for (const x of [...espanoles, ...provs]) apuntar(x.nif, x.nombre, x.cp);

  // Fichas con vinculación (siempre una de las que tienen letra en la tabla A: el 232 no admite «otra»).
  const vinculos = ['socio', 'administrador', 'familiar', 'grupo'];
  const clientes = espanoles.map((x, i) => ({ ...x, ...(i < 2 ? { vinculo: vinculos[i], ...(i === 1 && R() < 0.3 ? { vinculoModulos: true } : {}) } : {}) }));
  const proveedores = provs.map((x, i) => ({ ...x, ...(i < 2 ? { vinculo: vinculos[i + 2] } : {}) }));

  // Facturas: nacionales, OSS, canarias, de paraíso, rectificativas y accesorias.
  const facturas = [];
  const nF = 4 + Math.floor(R() * 24);
  for (let i = 0; i < nF; i++) {
    const anio = R() < 0.12 ? ANIO - 1 : ANIO;
    const cliente = R() < 0.1 ? paraiso : pick(espanoles);
    const f = { id: `f${i}`, fecha: fecha(anio), anio, serie: '', numero: i + 1, actividad: pick(['a1', 'a2']), cliente: { nombre: cliente.nombre, nif: cliente.nif, ...(cliente.pais ? { pais: cliente.pais } : {}) }, base: importe(4000), ivaPct: pick([21, 21, 10, 4, 0]), irpfPct: pick([0, 0, 0, 15]) };
    if (R() < 0.15) { const pais = pick(['DE', 'FR', 'IT', 'PT', 'NL']); f.oss = { pais, bienes: R() < 0.5 }; f.ivaPct = pick([0, 21]); }
    if (R() < 0.1) f.accesoria = true;
    if (R() < 0.08) { f.rectifica = { fecha: fecha(anio) }; f.serie = 'R'; f.base = -f.base; }
    if (R() < 0.12) f.lineas = [{ concepto: 'x', cantidad: 1, precio: f.base, dto: 0, ivaPct: f.ivaPct, ...(R() < 0.5 ? { producto: 'p1' } : {}) }];
    facturas.push(f);
  }

  // Gastos: corrientes, alquiler del local con inmueble, profesionales con retención, no residentes, UE/fuera,
  // importaciones e inversión del sujeto pasivo (IGIC) e inmovilizado.
  const gastos = [];
  const nG = 4 + Math.floor(R() * 24);
  for (let i = 0; i < nG; i++) {
    const p = R() < 0.1 ? paraiso : pick(provs);
    const g = { id: `g${i}`, fecha: fecha(R() < 0.12 ? ANIO - 1 : ANIO), actividad: pick(['a1', 'a2']), concepto: pick(['Material', 'Gestoría', 'Luz', 'Software', 'Ordenador', 'Intereses del préstamo']), proveedor: p.nombre, proveedorNif: p.nif, ...(p.pais ? { proveedorPais: p.pais } : {}), base: importe(3000), ivaPct: pick([21, 21, 10, 0]) };
    const d = R();
    if (d < 0.14) { g.alquiler = true; g.concepto = 'Alquiler de la oficina'; g.proveedor = pick(provs).nombre; g.proveedorNif = provs.find((x) => x.nombre === g.proveedor).nif; g.inmueble = R() < 0.7 ? { situacion: 1, refCatastral: REF_CATASTRAL } : { situacion: 4 }; }
    else if (d < 0.26) g.irpfPct = pick([15, 7, 2, 1, 19, 24]);
    else if (d < 0.36) { g.noResidente = { pais: pick(['GB', 'US', 'CH', 'MA']), clave: pick([1, 14, 19]), pct: pick([0, 15, 19, 24]), ...(R() < 0.4 ? { motivo: pick(['convenio', 'exenta']) } : {}) }; if (g.noResidente.motivo === 'exenta') g.noResidente.pct = 0; }
    else if (d < 0.46) { g.ivaPct = 0; g.origen = pick(['ue', 'fuera']); if (R() < 0.5) g.bienes = true; }
    else if (d < 0.52) { g.inversion = { tipo: pick(['informatica', 'mobiliario', 'maquinaria']) }; g.base = importe(9000); }
    else if (d < 0.58) { g.isp = true; g.ivaPct = pick([7, 3, 15]); }
    else if (d < 0.63) g.importacion = true;
    else if (d < 0.67) g.compensacion = pick([12, 10.5]);
    if (R() < 0.08) g.deduciblePct = pick([50, 0, 30]);
    if (R() < 0.08) g.pendiente = true;
    gastos.push(g);
  }

  // Nóminas y empleados: uno corriente y un administrador (clave E del 190).
  const empleados = [
    { id: 'e1', nombre: `Luis Soler Vidal`, nif: dni(seed * 17 + 1), cp: pick(CP) },
    { id: 'e2', nombre: `Marta Ruiz Peña`, nif: dni(seed * 17 + 2), cp: pick(CP), cotizacion: { administrador: pick(['asimilado', 'autonomo']), pequena: R() < 0.5 } },
  ];
  const nominas = [];
  for (let mes = 1; mes <= 12; mes++) for (const e of empleados) {
    if (R() < 0.2) continue;
    nominas.push({ id: `n${mes}-${e.id}`, empleado: e.id, empleadoNombre: e.nombre, empleadoNif: e.nif, mes: `${ANIO}-${String(mes).padStart(2, '0')}`, bruto: importe(3000), irpfPct: pick([0, 12, 19, 35]), ssTrabajadorPct: 6.47, ssEmpresaPct: 31.65 });
  }

  // Dividendos e intereses a los socios (modelos 123 y 193).
  const socios = [
    { nombre: 'Juan Gómez Alba', nif: dni(seed * 23 + 1), cp: pick(CP) },
    { nombre: 'Rosa Nieto Cruz', nif: dni(seed * 23 + 2), cp: pick(CP) },
    { nombre: `Matriz ${seed} SL`, nif: cif('B', seed * 29 + 3), cp: pick(CP) },
  ];
  for (const s of socios) apuntar(s.nif, s.nombre, s.cp);
  const capital = [];
  for (let i = 0; i < Math.floor(R() * 10); i++) {
    const s = pick(socios), tipo = pick(['dividendos', 'intereses', 'otros']);
    const bruto = importe(12000);
    const p = limpiarPago({
      fecha: fecha(ANIO), tipo, perceptor: { nombre: s.nombre, nif: s.nif }, bruto,
      ...(R() < 0.3 ? { retencionPct: pick([0, 19, 24]) } : {}),
      ...(tipo === 'otros' && R() < 0.5 ? { naturaleza: pick(['06', '12', '13', '11']) } : {}),
      ...(tipo === 'intereses' && !/^[A-Z]/.test(s.nif) && R() < 0.4 ? { vinculado: true, exceso: Math.round(bruto * R() * 100) / 100 } : {}),
    });
    if (!p.error) capital.push(p);
  }

  // Módulos (131) y cuotas del IS de años anteriores (202).
  const modulos = R() < 0.4 ? { a1: { tipo: 'datos', rendimiento: importe(40000), asalariados: pick([0, 0.5, 1, 2.5]), iva: { cuota: importe(5000), ingreso: 8, minima: 20 } }, ...(R() < 0.5 ? { a2: { tipo: pick(['sinDatos', 'agricola']), ...(R() < 0.3 ? { joven: true } : {}) } } : {}) } : {};
  const cuotaIS = { [ANIO - 2]: R() < 0.7 ? importe(30000) : 0, [ANIO - 1]: R() < 0.7 ? importe(30000) : -importe(500) };

  return { yo, facturas, gastos, nominas, empleados, capital, clientes, proveedores, modulos, cuotaIS, domicilios, socios };
}

// ---------- Higiene numérica: todo número que sale de un modelo es finito y está en céntimos exactos ----------
function numeros(x, ruta = '', out = []) {
  if (typeof x === 'number') out.push([ruta, x]);
  else if (Array.isArray(x)) x.forEach((v, i) => numeros(v, `${ruta}[${i}]`, out));
  else if (x instanceof Map) [...x.entries()].forEach(([k, v]) => numeros(v, `${ruta}.${k}`, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) numeros(v, ruta ? `${ruta}.${k}` : k, out);
  return out;
}
function higiene(nombre, salida, E) {
  for (const [ruta, v] of numeros(salida)) {
    ok(Number.isFinite(v), `${E} ${nombre}.${ruta}: no es un número finito (${v})`);
    ok(Number.isFinite(v) && v === r2(v), `${E} ${nombre}.${ruta}: no está en céntimos exactos (${v})`);
  }
}

// ---------- Lectura de los ficheros de ancho fijo ----------
const campo = (s, pos, lon) => s.slice(pos - 1, pos - 1 + lon);
const entero = (s, pos, lon) => Number(campo(s, pos, lon));
const sinSigno = (s, pos, lon) => Number(campo(s, pos, lon)) / 100;
const conSigno = (s, pos, lon) => (campo(s, pos, 1) === 'N' ? -1 : 1) * Number(campo(s, pos + 1, lon)) / 100;
function pagina(contenido, etiqueta, lon, E, nombre) {
  const i = contenido.indexOf(etiqueta);
  ok(i >= 0, `${E} ${nombre}: no aparece la página ${etiqueta}`);
  const p = contenido.slice(i, i + lon);
  ok(p.length === lon, `${E} ${nombre}: la página ${etiqueta} mide ${p.length} y no ${lon}`);
  ok(p.endsWith(`</${etiqueta.slice(1)}`), `${E} ${nombre}: la página ${etiqueta} no se cierra`);
  return p;
}
// Un error del generador es aceptable si es un aviso para la persona; nunca un fallo de programación.
const ERROR_DE_CODIGO = /undefined|null|NaN|is not a function|Cannot read|Campos solapados|Campo fuera del registro|posiciones en vez de|Importe negativo|Número no válido|Importe no válido|demasiado grande/;
function sinRomperse(fn, E, nombre) {
  try { return fn(); } catch (e) {
    ok(e instanceof Error && e.message && !ERROR_DE_CODIGO.test(e.message), `${E} ${nombre}: se rompió en vez de avisar («${e?.message}»)`);
    return null;
  }
}

test(`auditoría: ${EMPRESAS} empresas contra la aritmética de cada modelo`, () => {
  let conCapital = 0, con232 = 0, conNoResidentes = 0, ficheros = 0;

  for (let seed = 1; seed <= EMPRESAS; seed++) {
    const { yo, facturas, gastos, nominas, empleados, capital, clientes, proveedores, modulos, cuotaIS, domicilios, socios } = empresa(seed);
    const E = `empresa ${seed}`;

    // El generador no vale si inventa NIF: los ficheros informativos los rechazarían con razón.
    for (const nif of [yo.nif, ...socios.map((s) => s.nif), ...empleados.map((e) => e.nif)]) ok(nifEspanolValido(nif), `${E}: el generador produce el NIF inválido ${nif}`);

    // ===== A. 123 y 193 (capital mobiliario) =====
    const m193 = modelo193(capital, ANIO);
    let suma123 = { base: 0, retenciones: 0, rentas: 0 };
    for (const t of [1, 2, 3, 4]) {
      const k = casillas123(capital, ANIO, t), m = modelo123(capital, ANIO, t);
      const delT = capital.filter((p) => p.fecha.startsWith(`${ANIO}-`) && trimestre(p.fecha) === t);
      const div = delT.filter((p) => p.tipo === 'dividendos'), resto = delT.filter((p) => p.tipo !== 'dividendos');
      ok(k['01'] === div.length && k['02'] === resto.length && k['03'] === delT.length, `${E} 123 T${t}: el número de rentas no cuadra`);
      ok(k['03'] === k['01'] + k['02'], `${E} 123 T${t}: 03 ≠ 01 + 02`);
      igual(k['06'], k['04'] + k['05'], `${E} 123 T${t}: 06 ≠ 04 + 05`);
      igual(k['09'], k['07'] + k['08'], `${E} 123 T${t}: 09 ≠ 07 + 08`);
      igual(k['12'], k['09'], `${E} 123 T${t}: 12 ≠ 09`);
      igual(k['14'], k['12'], `${E} 123 T${t}: 14 ≠ 12`);
      ok(c(k['04']) === div.reduce((s, p) => s + c(p.bruto), 0), `${E} 123 T${t}: la 04 no suma los dividendos`);
      ok(c(k['05']) === resto.reduce((s, p) => s + c(p.bruto), 0), `${E} 123 T${t}: la 05 no suma el resto de rentas`);
      ok(c(k['09']) === delT.reduce((s, p) => s + c(p.retencion), 0), `${E} 123 T${t}: la 09 no suma las retenciones`);
      igual(m.base, k['06'], `${E} 123 T${t}: modelo123.base ≠ casilla 06`);
      igual(m.retenciones, k['09'], `${E} 123 T${t}: modelo123.retenciones ≠ casilla 09`);
      // Cada retención es su porcentaje del bruto, recalculado en céntimos.
      for (const p of delT) ok(c(p.retencion) === rc(c(p.bruto) * p.retencionPct * 10), `${E} 123: la retención de ${p.perceptor.nombre} (${p.retencion}) no es el ${p.retencionPct} % de ${p.bruto}`);
      suma123 = { base: r2(suma123.base + k['06']), retenciones: r2(suma123.retenciones + k['09']), rentas: suma123.rentas + k['03'] };
      higiene(`123 T${t}`, k, E);
    }
    // B. El 193 es la suma de los cuatro 123, y repartir un pago en varias claves no crea ni pierde dinero.
    igual(m193.base, suma123.base, `${E}: el 193 no es la suma de los 123 (base)`);
    igual(m193.retenciones, suma123.retenciones, `${E}: el 193 no es la suma de los 123 (retenciones)`);
    igual(m193.base, m193.perceptores.reduce((s, p) => s + p.base, 0), `${E}: el 193 no suma sus perceptores (base)`);
    igual(m193.retenciones, m193.perceptores.reduce((s, p) => s + p.retenciones, 0), `${E}: el 193 no suma sus perceptores (retenciones)`);
    for (const p of capital) {
      const partes = partes193(p);
      igual(partes.reduce((s, x) => s + x.base, 0), p.bruto, `${E} 193: las partes de un pago de ${p.perceptor.nombre} no suman el bruto`);
      igual(partes.reduce((s, x) => s + x.retencion, 0), p.retencion, `${E} 193: las partes de un pago de ${p.perceptor.nombre} no suman la retención`);
      for (const x of partes) ok(['A', 'B', 'C', 'D'].includes(x.clave) && /^\d{2}$/.test(x.naturaleza), `${E} 193: clave o naturaleza imposible (${x.clave}.${x.naturaleza})`);
    }
    for (const p of m193.perceptores) ok(p.base >= 0 && p.retenciones >= 0 && p.retenciones <= p.base + 0.005, `${E} 193: ${p.nombre} con retención mayor que la base`);
    if (capital.length) conCapital++;
    higiene('193', m193, E);

    // ===== A. 216 y 296 (no residentes) =====
    const m296 = modelo296(gastos, ANIO);
    let suma216 = { base: 0, retenciones: 0, rentas: 0 };
    for (const t of [1, 2, 3, 4]) {
      const m = modelo216(gastos, ANIO, t), k = m.c;
      ok(k['07'] === k['05'] + k['06'], `${E} 216 T${t}: 07 ≠ 05 + 06`);
      igual(k['10'], k['08'] + k['09'], `${E} 216 T${t}: 10 ≠ 08 + 09`);
      igual(k['13'], k['11'] + k['12'], `${E} 216 T${t}: 13 ≠ 11 + 12`);
      ok(k['16'] === k['14'] + k['15'], `${E} 216 T${t}: 16 ≠ 14 + 15`);
      igual(k['19'], k['17'] + k['18'], `${E} 216 T${t}: 19 ≠ 17 + 18`);
      igual(k['21'], k['13'] - k['20'], `${E} 216 T${t}: 21 ≠ 13 − 20`);
      ok(m.rentas === k['07'] + k['16'], `${E} 216 T${t}: las rentas (${m.rentas}) no son las sometidas más las exentas`);
      igual(m.base, k['10'] + k['19'], `${E} 216 T${t}: la base no es 10 + 19`);
      igual(m.retenciones, k['13'], `${E} 216 T${t}: las retenciones no son la casilla 13`);
      ok(m.negativa === (m.rentas > 0 && c(k['13']) === 0), `${E} 216 T${t}: la marca de negativa no corresponde`);
      // Solo hay importe exento si hay rentas exentas, y las exentas no llevan retención en ninguna casilla.
      ok(!(c(k['19']) > 0) || k['16'] > 0, `${E} 216 T${t}: hay ${k['19']} exento sin ninguna renta exenta`);
      ok(!(k['16'] > 0) || k['16'] <= m.rentas, `${E} 216 T${t}: más rentas exentas que rentas`);
      suma216 = { base: r2(suma216.base + m.base), retenciones: r2(suma216.retenciones + m.retenciones), rentas: suma216.rentas + m.rentas };
      higiene(`216 T${t}`, m, E);
    }
    // B. El 296 es la suma de los cuatro 216.
    igual(m296.base, suma216.base, `${E}: el 296 no es la suma de los 216 (base)`);
    igual(m296.retenciones, suma216.retenciones, `${E}: el 296 no es la suma de los 216 (retenciones)`);
    igual(m296.base, m296.perceptores.reduce((s, p) => s + p.base, 0), `${E}: el 296 no suma sus perceptores`);
    ok(m296.perceptores.reduce((s, p) => s + p.rentas, 0) === suma216.rentas, `${E}: el 296 declara ${m296.perceptores.reduce((s, p) => s + p.rentas, 0)} rentas y los 216, ${suma216.rentas}`);
    for (const p of m296.perceptores) {
      ok(['01', '02', '03', '04'].includes(p.subclave), `${E} 296: subclave ${p.subclave} fuera del diseño`);
      ok(c(p.retenciones) === rc(c(p.base) * p.pct * 10) || Math.abs(c(p.retenciones) - rc(c(p.base) * p.pct * 10)) <= p.rentas, `${E} 296: la retención de ${p.nombre} no es el ${p.pct} % de ${p.base}`);
      ok(p.pct > 0 || c(p.retenciones) === 0, `${E} 296: ${p.nombre} exento con retención`);
    }
    if (m296.perceptores.length) conNoResidentes++;
    higiene('296', m296, E);

    // ===== A. 111, 115, 180 y 190 (retenciones del trabajo, profesionales y alquileres) =====
    const m180 = modelo180(gastos, ANIO, { domicilios }), m190 = modelo190(nominas, empleados, ANIO, gastos, { domicilios });
    let suma111 = { percepciones: 0, retenciones: 0 }, suma115 = { base: 0, retenciones: 0 };
    for (const t of [1, 2, 3, 4]) {
      const m111 = modelo111(nominas, ANIO, t);
      const delT = nominas.filter((n) => n.mes.startsWith(`${ANIO}-`) && Math.ceil(Number(n.mes.slice(5, 7)) / 3) === t).map(calculoNomina);
      ok(c(m111.percepciones) === delT.reduce((s, x) => s + c(x.bruto), 0), `${E} 111 T${t}: las percepciones no suman los brutos`);
      ok(c(m111.retenciones) === delT.reduce((s, x) => s + c(x.irpf), 0), `${E} 111 T${t}: las retenciones no suman el IRPF`);
      ok(c(m111.seguros) === delT.reduce((s, x) => s + c(x.seguros), 0), `${E} 111 T${t}: los seguros no suman`);
      suma111 = { percepciones: r2(suma111.percepciones + m111.percepciones), retenciones: r2(suma111.retenciones + m111.retenciones) };

      const m115 = modelo115(gastos, ANIO, t);
      const alq = gastos.filter((g) => g.alquiler && !g.noResidente && !g.pendiente && g.fecha.startsWith(`${ANIO}-`) && trimestre(g.fecha) === t);
      ok(c(m115.base) === alq.reduce((s, g) => s + c(g.base), 0), `${E} 115 T${t}: la base no suma los alquileres`);
      ok(c(m115.retenciones) === alq.reduce((s, g) => s + rc(c(g.base) * 190), 0), `${E} 115 T${t}: la retención no es el 19 % de cada alquiler`);
      suma115 = { base: r2(suma115.base + m115.base), retenciones: r2(suma115.retenciones + m115.retenciones) };
      higiene(`111 T${t}`, m111, E);
      higiene(`115 T${t}`, m115, E);
    }
    // B. El 180 es la suma de los cuatro 115 y el 190 contiene los cuatro 111.
    igual(m180.base, suma115.base, `${E}: el 180 no es la suma de los 115 (base)`);
    igual(m180.retenciones, suma115.retenciones, `${E}: el 180 no es la suma de los 115 (retenciones)`);
    igual(m180.base, m180.arrendadores.reduce((s, p) => s + p.base, 0), `${E}: el 180 no suma sus arrendadores`);
    for (const p of m180.arrendadores) {
      const suyos = gastos.filter((g) => g.alquiler && !g.noResidente && !g.pendiente && g.fecha.startsWith(`${ANIO}-`) && (g.proveedorNif || g.proveedor) === (p.nif || p.nombre));
      ok(c(p.retenciones) === suyos.reduce((s, g) => s + rc(c(g.base) * 190), 0) || Math.abs(c(p.retenciones) - rc(c(p.base) * 190)) <= suyos.length, `${E} 180: la retención de ${p.nombre} (${p.retenciones}) no es la suma de los 19 % de sus alquileres`);
      ok(p.retenciones * p.base >= 0, `${E} 180: la retención de ${p.nombre} tiene signo distinto que su base`);
    }

    const trabajo190 = m190.perceptores.filter((p) => ['A', 'E'].includes(p.clave));
    igual(trabajo190.reduce((s, p) => s + p.percepciones, 0), suma111.percepciones, `${E}: el 190 (claves A y E) no cuadra con la suma de los 111`);
    igual(trabajo190.reduce((s, p) => s + p.retenciones, 0), suma111.retenciones, `${E}: las retenciones del 190 (claves A y E) no cuadran con los 111`);
    const profesionales = gastos.filter((g) => !g.alquiler && !g.noResidente && Number(g.irpfPct) > 0 && !g.pendiente && g.fecha.startsWith(`${ANIO}-`));
    const prof190 = m190.perceptores.filter((p) => !['A', 'E', 'L'].includes(p.clave));
    ok(c(prof190.reduce((s, p) => s + p.percepciones, 0)) === profesionales.reduce((s, g) => s + c(g.base), 0), `${E}: el 190 no declara todas las bases de los profesionales`);
    ok(c(prof190.reduce((s, p) => s + p.retenciones, 0)) === profesionales.reduce((s, g) => s + c(importes(g).irpf), 0), `${E}: el 190 no declara todas las retenciones de los profesionales`);
    igual(m190.percepciones, m190.perceptores.reduce((s, p) => s + p.percepciones, 0), `${E}: el 190 no suma sus perceptores`);
    for (const p of m190.perceptores) ok(/^[A-L]$/.test(p.clave), `${E} 190: clave ${p.clave} fuera del diseño`);
    higiene('180', m180, E);
    higiene('190', m190, E);

    // ===== A. 309 (IVA no periódico) =====
    for (const regimen of ['recargo', 'reagp', 'exento']) {
      for (const t of [1, 2, 3, 4]) {
        const m = modelo309(gastos, ANIO, t, { regimen });
        for (const d of m.declaraciones) {
          const k = d.c;
          ok([1, 3].includes(d.hecho), `${E} 309: hecho imponible ${d.hecho} fuera del diseño`);
          ok([1, 2, 3].includes(d.situacion), `${E} 309: situación tributaria ${d.situacion} fuera del diseño`);
          for (const [b, p, q] of [['01', '02', '03'], ['25', '26', '27'], ['04', '05', '06'], ['07', '08', '09'], ['10', '11', '12'], ['13', '14', '15'], ['16', '17', '18'], ['19', '20', '21']]) {
            if (!k[b] && !k[q]) continue;
            igual(k[q], r2((k[b] * k[p]) / 100), `${E} 309 T${t} ${regimen}: la cuota ${q} no es el ${k[p]} % de la base ${b}`);
          }
          igual(k['22'], ['03', '27', '06', '09', '12', '15', '18', '21'].reduce((s, x) => s + (k[x] || 0), 0), `${E} 309 T${t} ${regimen}: la 22 no suma las cuotas`);
          ok(k['23'] === 0, `${E} 309: la 23 no puede deducir nada`);
          igual(k['24'], k['22'] - k['23'], `${E} 309 T${t} ${regimen}: 24 ≠ 22 − 23`);
          ok(regimen === 'recargo' || ['12', '15', '18', '21'].every((x) => !k[x]), `${E} 309 ${regimen}: recargo de equivalencia sin estar en el régimen`);
        }
        igual(m.ingresar, m.declaraciones.reduce((s, d) => s + d.c['24'], 0), `${E} 309 T${t} ${regimen}: lo a ingresar no suma las declaraciones`);
        higiene(`309 T${t} ${regimen}`, m, E);
      }
    }

    // ===== A. 232 (operaciones vinculadas y paraísos) =====
    const m232 = modelo232(facturas, gastos, ANIO, { clientes, proveedores });
    ok(m232.obligado === m232.motivos.length > 0, `${E} 232: obligado y motivos no coinciden`);
    for (const t of m232.terceros) {
      igual(t.total, t.ingresos + t.pagos, `${E} 232: el total de ${t.nombre} no es ingresos + pagos`);
      igual(t.ingresos, t.grupos.filter((g) => g.lado === 'I').reduce((s, g) => s + g.importe, 0), `${E} 232: los ingresos de ${t.nombre} no suman sus grupos`);
      igual(t.pagos, t.grupos.filter((g) => g.lado === 'P').reduce((s, g) => s + g.importe, 0), `${E} 232: los pagos de ${t.nombre} no suman sus grupos`);
      ok(/^[a-h]$/i.test(t.letra) || t.vinculo === 'otra', `${E} 232: letra de vinculación ${t.letra} fuera de la tabla A`);
      ok(t.supera250 === (!t.especifica && Math.abs(t.total) > LIMITE_232), `${E} 232: el límite de 250.000 € de ${t.nombre} está mal aplicado`);
    }
    for (const x of m232.porTipo) {
      igual(x.total, m232.filas.filter((f) => f.tipo === x.tipo).reduce((s, f) => s + f.importe, 0), `${E} 232: el total de «${x.tipo}» no suma sus filas`);
      ok(x.supera100 === (Math.abs(x.especificas) > LIMITE_232_ESPECIFICAS), `${E} 232: el límite de 100.000 € de «${x.tipo}» está mal aplicado`);
      const bruto = m232.filas.filter((f) => f.tipo === x.tipo).reduce((s, f) => s + Math.abs(f.importe), 0);
      ok(Math.abs(x.especificas) <= bruto + 0.005, `${E} 232: las específicas de «${x.tipo}» (${x.especificas}) pasan del volumen de operaciones (${bruto})`);
      igual(x.especificas, m232.filas.filter((f) => f.tipo === x.tipo && f.especifica).reduce((s, f) => s + f.importe, 0), `${E} 232: las específicas de «${x.tipo}» no suman sus filas`);
    }
    igual(m232.filas.reduce((s, f) => s + f.importe, 0), m232.terceros.reduce((s, t) => s + t.total, 0), `${E} 232: las filas del cuadro I no suman los terceros`);
    const lista = paraisosDe(ANIO);
    for (const p of m232.paraisos) ok(lista[p.pais], `${E} 232: ${p.pais} no está en la lista del ejercicio`);
    ok(m232.vinculadas === m232.terceros.length + m232.sinOperaciones.length, `${E} 232: el recuento de vinculadas no cuadra`);
    if (m232.obligado) con232++;
    higiene('232', m232, E);

    // ===== A. 202 y 840 =====
    const m202 = modelo202(cuotaIS, ANIO);
    for (const p of m202) {
      igual(p.pago, p.cuota > 0 ? r2(p.cuota * 0.18) : 0, `${E} 202 ${p.mes}: el pago no es el 18 % de la cuota`);
      ok(p.pago >= 0, `${E} 202 ${p.mes}: pago negativo`);
    }
    higiene('202', m202, E);
    const m840 = modelo840(facturas, gastos, ANIO, { hoy: `${ANIO}-12-31` });
    ok(m840.supera === (m840.incn >= m840.umbral), `${E} 840: supera no corresponde a la cifra`);
    ok(['sin-datos', 'en-curso', 'exenta', 'alta', 'sigue', 'baja'].includes(m840.situacion), `${E} 840: situación ${m840.situacion} desconocida`);
    if (m840.situacion === 'sigue') ok(m840.supera && m840.anterior >= m840.umbral, `${E} 840: «sigue» sin dos años por encima`);
    if (m840.situacion === 'exenta') ok(!m840.supera && !(m840.anterior >= m840.umbral), `${E} 840: «exenta» con algún año por encima`);
    higiene('840', m840, E);

    // ===== A y B. 420 y 425 (IGIC) =====
    const liq420 = liquidaciones420(facturas, gastos, ANIO), m425 = modelo425(facturas, gastos, ANIO);
    let total25 = 0, total40 = 0;
    for (const t of [1, 2, 3, 4]) {
      const k = casillas420(facturas, gastos, ANIO, t);
      igual(k['40'], ['27', '29', '31', '33', '35', '36'].reduce((s, x) => s + k[x], 0), `${E} 420 T${t}: la 40 no suma las deducciones`);
      igual(k['41'], k['25'] - k['40'], `${E} 420 T${t}: 41 ≠ 25 − 40`);
      igual(k['45'], k['41'], `${E} 420 T${t}: 45 ≠ 41`);
      for (let i = 0; i < 6; i++) {
        const n = String(i * 3 + 1).padStart(2, '0'), p = String(i * 3 + 2).padStart(2, '0'), q = String(i * 3 + 3).padStart(2, '0');
        if (!k[n]) continue;
        ok(Math.abs(c(k[q]) - rc(c(k[n]) * k[p] * 10)) <= 50, `${E} 420 T${t}: la cuota ${q} (${k[q]}) no es el ${k[p]} % de ${k[n]}`);
      }
      total25 = r2(total25 + k['25']); total40 = r2(total40 + k['40']);
      higiene(`420 T${t}`, k, E);
    }
    igual(m425.totalDevengado, total25, `${E}: el 425 no suma el devengado de los cuatro 420`);
    igual(m425.deducciones.total, total40, `${E}: el 425 no suma las deducciones de los cuatro 420`);
    for (let i = 0; i < 4; i++) igual(m425.resultadosTrimestrales[i], liq420[i]['45'], `${E}: el resultado del ${i + 1}T del 425 no es el del 420`);
    for (const q of liq420) {
      ok(q.ingresar >= 0 && q.pendiente >= -0.005, `${E} 420 T${q.t}: compensación imposible`);
      ok(q.compensado <= q.anterior + 0.005, `${E} 420 T${q.t}: compensa más saldo del que había`);
    }
    higiene('425', m425, E);

    // ===== A. 369 (ventanilla única) =====
    for (const t of [1, 2, 3, 4]) {
      const m = modelo369(facturas, ANIO, t);
      igual(m.base, r2(m.servicios.reduce((s, x) => s + x.base, 0) + m.bienes.reduce((s, x) => s + x.base, 0)), `${E} 369 T${t}: la base no suma servicios y bienes`);
      igual(m.cuota - m.devolver, m.paises.reduce((s, p) => s + p.saldo, 0), `${E} 369 T${t}: a ingresar menos a devolver ≠ saldos por país`);
      ok(m.cuota >= 0 && m.devolver >= 0, `${E} 369 T${t}: importes negativos a ingresar o devolver`);
      for (const x of [...m.servicios, ...m.bienes]) {
        igual(x.base, x.tipos.reduce((s, y) => s + y.base, 0), `${E} 369 T${t} ${x.pais}: la base no suma sus tipos`);
        igual(x.cuota, x.tipos.reduce((s, y) => s + y.cuota, 0), `${E} 369 T${t} ${x.pais}: la cuota no suma sus tipos`);
        for (const y of x.tipos) ok(Math.abs(c(y.cuota) - rc(c(y.base) * y.pct * 10)) <= 50, `${E} 369 T${t} ${x.pais}: la cuota al ${y.pct} % no cuadra`);
      }
      ok(m.sinActividad === !(m.servicios.length || m.bienes.length || m.correcciones.length), `${E} 369 T${t}: la marca de sin actividad no corresponde`);
      higiene(`369 T${t}`, m, E);
    }

    // ===== A. 131 (módulos) =====
    if (Object.keys(modulos).length) {
      const serie = modelos131({ modulos, facturas }, ANIO);
      let negativos = 0, vivienda = 0;
      serie.forEach((k, i) => {
        igual(k['07'], k['02'] + k['04'] + k['06'], `${E} 131 T${i + 1}: 07 ≠ 02 + 04 + 06`);
        igual(k['10'], k['07'] - k['08'] - k['09'], `${E} 131 T${i + 1}: 10 ≠ 07 − 08 − 09`);
        igual(k['13'], k['10'] - k['11'] - k['12'], `${E} 131 T${i + 1}: 13 ≠ 10 − 11 − 12`);
        igual(k['15'], k['13'], `${E} 131 T${i + 1}: 15 ≠ 13`);
        ok(k['11'] <= negativos + 0.005, `${E} 131 T${i + 1}: resta ${k['11']} de negativos cuando solo había ${negativos}`);
        ok(k['12'] >= 0 && vivienda + k['12'] <= 660.14 + 0.005, `${E} 131 T${i + 1}: la deducción por vivienda pasa del límite anual`);
        negativos = r2(negativos - k['11'] + Math.max(0, -k['13']));
        vivienda = r2(vivienda + k['12']);
        higiene(`131 T${i + 1}`, k, E);
      });
      // La 02 es el porcentaje del art. 110.1.b sobre el rendimiento de cada actividad con datos.
      const k1 = modelo131({ modulos, facturas, anio: ANIO, t: 1 });
      const esperado = Object.values(modulos).filter((m) => m.tipo === 'datos').reduce((s, m) => s + rc(c(m.rendimiento) * pctModulos(m.asalariados) * 10), 0);
      ok(Math.abs(c(k1['02']) - esperado) <= 1, `${E} 131: la casilla 02 (${k1['02']}) no es el porcentaje del rendimiento`);
    }

    // ===== B. 415 = el 347 canario sin trimestres =====
    const m347c = modelo347(facturas, gastos, ANIO, { canarias: true }), m415 = modelo415(facturas, gastos, ANIO);
    for (const lado of ['ventas', 'compras']) {
      ok(m415[lado].length === m347c[lado].length, `${E} 415: ${lado} tiene ${m415[lado].length} y el 347 canario, ${m347c[lado].length}`);
      m415[lado].forEach((o, i) => {
        igual(o.total, m347c[lado][i].total, `${E} 415: el total de ${o.nombre} no es el del 347 canario`);
        ok(!('trimestres' in o), `${E} 415: ${o.nombre} lleva columnas trimestrales, que el 415 no tiene`);
      });
    }
    higiene('415', m415, E);

    // ===== D. El fichero de la Sede dice lo mismo que el cálculo =====
    for (const t of [1, 2, 3, 4]) {
      const k123 = casillas123(capital, ANIO, t);
      if (k123['03']) {
        const f = sinRomperse(() => fichero123(yo, ANIO, t, k123), E, `fichero 123 T${t}`);
        if (f) {
          ficheros++;
          const p = pagina(f.contenido, '<T12301000>', 600, E, `fichero 123 T${t}`);
          ok(campo(p, 14, 9) === yo.nif, `${E} fichero 123 T${t}: NIF del declarante distinto`);
          ok(campo(p, 103, 4) === String(ANIO) && campo(p, 107, 2) === `${t}T`, `${E} fichero 123 T${t}: ejercicio o periodo distintos`);
          ok(entero(p, 109, 15) === k123['01'] && entero(p, 124, 15) === k123['02'] && entero(p, 139, 15) === k123['03'], `${E} fichero 123 T${t}: el número de rentas no coincide`);
          igual(sinSigno(p, 154, 17), k123['04'], `${E} fichero 123 T${t}: casilla 04`);
          igual(sinSigno(p, 171, 17), k123['05'], `${E} fichero 123 T${t}: casilla 05`);
          igual(sinSigno(p, 188, 17), k123['06'], `${E} fichero 123 T${t}: casilla 06`);
          igual(sinSigno(p, 239, 17), k123['09'], `${E} fichero 123 T${t}: casilla 09`);
          igual(sinSigno(p, 324, 17), k123['14'], `${E} fichero 123 T${t}: resultado`);
          ok(campo(p, 13, 1) === (k123['14'] > 0 ? 'I' : 'N'), `${E} fichero 123 T${t}: tipo de declaración`);
        }
      }
      const m216 = modelo216(gastos, ANIO, t);
      if (m216.rentas) {
        const f = sinRomperse(() => fichero216(yo, ANIO, t, m216), E, `fichero 216 T${t}`);
        if (f) {
          ficheros++;
          const p = pagina(f.contenido, '<T21601000>', 600, E, `fichero 216 T${t}`);
          ok(entero(p, 109, 17) === m216.c['05'] && entero(p, 143, 17) === m216.c['07'], `${E} fichero 216 T${t}: el número de rentas sometidas no coincide`);
          ok(entero(p, 262, 17) === m216.c['14'] && entero(p, 296, 17) === m216.c['16'], `${E} fichero 216 T${t}: el número de rentas exentas no coincide`);
          igual(sinSigno(p, 194, 17), m216.c['10'], `${E} fichero 216 T${t}: casilla 10`);
          igual(sinSigno(p, 245, 17), m216.c['13'], `${E} fichero 216 T${t}: casilla 13`);
          igual(sinSigno(p, 347, 17), m216.c['19'], `${E} fichero 216 T${t}: casilla 19`);
          igual(sinSigno(p, 381, 17), m216.c['21'], `${E} fichero 216 T${t}: resultado`);
        }
      }
      const m111 = modelo111(nominas, ANIO, t);
      if (m111.perceptores) {
        const f = sinRomperse(() => fichero111(yo, ANIO, t, m111), E, `fichero 111 T${t}`);
        if (f) {
          ficheros++;
          const p = pagina(f.contenido, '<T11101000>', 1000, E, `fichero 111 T${t}`);
          ok(entero(p, 109, 8) === m111.perceptores, `${E} fichero 111 T${t}: perceptores`);
          igual(sinSigno(p, 117, 17), m111.percepciones, `${E} fichero 111 T${t}: percepciones`);
          igual(sinSigno(p, 134, 17), m111.retenciones, `${E} fichero 111 T${t}: retenciones`);
          igual(sinSigno(p, 521, 17), m111.retenciones, `${E} fichero 111 T${t}: resultado`);
        }
      }
      const m115 = modelo115(gastos, ANIO, t);
      if (m115.perceptores) {
        const f = sinRomperse(() => fichero115(yo, ANIO, t, m115), E, `fichero 115 T${t}`);
        if (f) {
          ficheros++;
          const p = pagina(f.contenido, '<T11501000>', 500, E, `fichero 115 T${t}`);
          ok(entero(p, 109, 15) === m115.perceptores, `${E} fichero 115 T${t}: perceptores`);
          igual(sinSigno(p, 124, 17), m115.base, `${E} fichero 115 T${t}: base`);
          igual(sinSigno(p, 141, 17), m115.retenciones, `${E} fichero 115 T${t}: retenciones`);
        }
      }
    }
    // Informativas: tipo 1 de declarante y un tipo 2 por perceptor, de 500 posiciones cada uno.
    const informativas = [
      ['180', m180.arrendadores.length, () => fichero180(yo, ANIO, m180), (det) => {
        m180.arrendadores.forEach((p, i) => {
          igual(conSigno(det[i], 79, 13), p.base, `${E} fichero 180: base de ${p.nombre}`);
          igual(sinSigno(det[i], 97, 13), p.retenciones, `${E} fichero 180: retención de ${p.nombre}`);
          ok(campo(det[i], 93, 4) === '1900', `${E} fichero 180: el porcentaje no es el 19 %`);
          ok(entero(det[i], 114, 1) === Number(p.situacion || 0), `${E} fichero 180: situación del inmueble de ${p.nombre}`);
        });
      }, (cab) => { igual(conSigno(cab, 145, 15), m180.base, `${E} fichero 180: base total`); igual(sinSigno(cab, 161, 15), m180.retenciones, `${E} fichero 180: retenciones totales`); }],
      ['190', m190.perceptores.length, () => fichero190(yo, ANIO, m190), (det) => {
        m190.perceptores.forEach((p, i) => {
          ok(campo(det[i], 78, 1) === p.clave, `${E} fichero 190: clave de ${p.nombre}`);
          ok(campo(det[i], 79, 2) === (p.clave === 'A' ? '00' : p.subclave), `${E} fichero 190: subclave de ${p.nombre}`);
          igual(conSigno(det[i], 81, 13), p.percepciones, `${E} fichero 190: percepciones de ${p.nombre}`);
          igual(sinSigno(det[i], 95, 13), p.retenciones, `${E} fichero 190: retenciones de ${p.nombre}`);
        });
      }, (cab) => { igual(conSigno(cab, 145, 15), m190.percepciones, `${E} fichero 190: percepciones totales`); igual(sinSigno(cab, 161, 15), m190.retenciones, `${E} fichero 190: retenciones totales`); }],
      ['193', m193.perceptores.length, () => fichero193(yo, ANIO, { ...m193, perceptores: m193.perceptores.map((p) => ({ ...p, provincia: provinciaDe(domicilios, p.nif, p.nombre) })) }), (det) => {
        m193.perceptores.forEach((p, i) => {
          ok(campo(det[i], 92, 1) === p.clave && campo(det[i], 93, 2) === p.naturaleza, `${E} fichero 193: clave y naturaleza de ${p.nombre}`);
          igual(sinSigno(det[i], 123, 13), p.base, `${E} fichero 193: base de ${p.nombre}`);
          igual(sinSigno(det[i], 152, 13), p.base, `${E} fichero 193: base retenida de ${p.nombre}`);
          igual(sinSigno(det[i], 169, 13), p.retenciones, `${E} fichero 193: retención de ${p.nombre}`);
          // El porcentaje declarado (165-168, dos enteros y dos decimales) es el último aplicado en el año.
          igual(entero(det[i], 165, 4) / 100, p.pct, `${E} fichero 193: el porcentaje de ${p.nombre} no es el último aplicado`);
          const pcts = new Set(capital.filter((x) => x.perceptor.nif === p.nif).map((x) => x.retencionPct));
          if (p.base > 0 && pcts.size === 1) ok(Math.abs(c(p.retenciones) - rc(c(p.base) * p.pct * 10)) <= 2, `${E} fichero 193: con un solo porcentaje, el ${p.pct} % de ${p.base} no da ${p.retenciones}`);
          ok((campo(det[i], 95, 1) === '1') === ['A', 'B', 'D'].includes(p.clave), `${E} fichero 193: el pago de ${p.nombre} no corresponde a su clave`);
        });
      }, (cab) => { igual(sinSigno(cab, 145, 15), m193.base, `${E} fichero 193: base total`); igual(sinSigno(cab, 160, 15), m193.retenciones, `${E} fichero 193: retenciones totales`); }],
      ['347', m347c.ventas.length + m347c.compras.length, () => fichero347(yo, ANIO, modelo347(facturas, gastos, ANIO, { domicilios })), null, null],
    ];
    for (const [modelo, cuantos, generar, revisarDetalles, revisarCabecera] of informativas) {
      if (!cuantos) continue;
      const f = sinRomperse(generar, E, `fichero ${modelo}`);
      if (!f) continue;
      ficheros++;
      const [cab, ...det] = f.contenido.split('\r\n');
      ok(cab.length === 500 && det.every((r) => r.length === 500), `${E} fichero ${modelo}: hay registros que no miden 500 posiciones`);
      ok(cab[0] === '1' && det.every((r) => r[0] === '2'), `${E} fichero ${modelo}: tipos de registro mal`);
      ok(campo(cab, 2, 3) === modelo && campo(cab, 5, 4) === String(ANIO), `${E} fichero ${modelo}: modelo o ejercicio de la cabecera`);
      ok(entero(cab, 136, 9) === det.length, `${E} fichero ${modelo}: la cabecera dice ${entero(cab, 136, 9)} registros y hay ${det.length}`);
      if (revisarDetalles && det.length === cuantos) revisarDetalles(det);
      if (revisarCabecera) revisarCabecera(cab);
    }
    // 232: las dos páginas, con el cuadro I leído registro a registro.
    if (m232.obligado) {
      const f = sinRomperse(() => fichero232(yo, ANIO, m232, { domicilios }), E, 'fichero 232');
      if (f) {
        ficheros++;
        const p = pagina(f.contenido, '<T23201000>', 1500, E, 'fichero 232');
        ok(campo(p, 14, 9) === yo.nif && campo(p, 103, 4) === String(ANIO) && campo(p, 107, 2) === '0A', `${E} fichero 232: identificación o periodo`);
        m232.filas.slice(0, 5).forEach((fila, j) => {
          const base = 144 + j * 121;
          ok(campo(p, base, 15).trim() === fila.nif, `${E} fichero 232: NIF de ${fila.nombre}`);
          ok(campo(p, base + 96, 1) === String(fila.letra).toUpperCase(), `${E} fichero 232: letra de vinculación de ${fila.nombre}`);
          ok(campo(p, base + 101, 1) === fila.lado, `${E} fichero 232: ingreso o pago de ${fila.nombre}`);
          ok(campo(p, base + 102, 2) === '  ', `${E} fichero 232: el método de valoración debe quedar en blanco`);
          igual(sinSigno(p, base + 104, 17), fila.importe, `${E} fichero 232: importe de ${fila.nombre}`);
        });
        if (m232.paraisos.length) {
          const p2 = pagina(f.contenido, '<T23202000>', 3500, E, 'fichero 232 página 2');
          m232.paraisos.slice(0, 12).forEach((op, j) => {
            const base = 13 + j * 150;
            ok(campo(p2, base + 131, 2) === op.pais, `${E} fichero 232: país de ${op.nombre}`);
            igual(sinSigno(p2, base + 133, 17), op.importe, `${E} fichero 232: importe en ${op.pais}`);
          });
        }
        // Páginas de más: las que no caben van marcadas como complementarias.
        ok(f.paginas === Math.ceil(Math.max(1, m232.filas.length) / 5) + (m232.paraisos.length ? Math.ceil(m232.paraisos.length / 12) : 0), `${E} fichero 232: ${f.paginas} páginas para ${m232.filas.length} filas y ${m232.paraisos.length} operaciones`);
      }
    }

    // ===== E. Determinismo: el mismo dato da el mismo modelo =====
    if (seed % 25 === 0) {
      const dos = (fn) => assert.deepEqual(fn(), fn());
      dos(() => modelo232(facturas, gastos, ANIO, { clientes, proveedores }));
      dos(() => modelo193(capital, ANIO));
      dos(() => modelo190(nominas, empleados, ANIO, gastos, { domicilios }));
      dos(() => modelo425(facturas, gastos, ANIO));
      dos(() => modelo296(gastos, ANIO));
    }
  }

  // La simulación no vale si no llega a los casos que quiere auditar.
  ok(conCapital > EMPRESAS / 3, `la simulación solo generó capital mobiliario en ${conCapital} empresas`);
  ok(conNoResidentes > EMPRESAS / 3, `la simulación solo generó no residentes en ${conNoResidentes} empresas`);
  ok(con232 > 10, `la simulación solo obligó al 232 en ${con232} empresas`);
  ok(ficheros > EMPRESAS, `la simulación solo generó ${ficheros} ficheros`);

  if (fallos.length) {
    const resumen = [...new Set(fallos.map((m) => m.replace(/empresa \d+/, 'empresa N').replace(/[\d.,-]+/g, '#')))];
    console.log(`\n${fallos.length} fallos en ${comprobaciones} comprobaciones. Tipos:\n${resumen.slice(0, 40).join('\n')}\nEjemplos:\n${fallos.slice(0, 15).join('\n')}`);
  } else console.log(`\n${comprobaciones} comprobaciones, 0 fallos (${ficheros} ficheros leídos campo a campo)`);
  assert.equal(fallos.length, 0);
});

// ---------- E. Vacíos y bordes del año ----------
test('con datos vacíos todos los modelos salen a cero sin romperse', () => {
  const yo = { nif: 'B12345674', nombre: 'Vacía SL', telefono: '600123456', contacto: 'Ana Pérez', email: 'a@b.es' };
  for (const t of [1, 2, 3, 4]) {
    const k123 = casillas123([], 2026, t);
    assert.equal(k123['14'], 0);
    assert.equal(fichero123(yo, 2026, t, k123).tipo, 'N');
    const m216 = modelo216([], 2026, t);
    assert.equal(m216.c['21'], 0);
    assert.equal(m216.negativa, false);
    assert.equal(fichero216(yo, 2026, t, m216).tipo, 'N');
    assert.equal(modelo309([], 2026, t).declaraciones.length, 0);
    assert.equal(modelo369([], 2026, t).sinActividad, true);
    assert.equal(modelo111([], 2026, t).retenciones, 0);
    assert.equal(modelo115([], 2026, t).base, 0);
    assert.equal(casillas420([], [], 2026, t)['41'], 0);
  }
  assert.equal(modelo193([], 2026).perceptores.length, 0);
  assert.equal(modelo296([], 2026).perceptores.length, 0);
  assert.equal(modelo180([], 2026).arrendadores.length, 0);
  assert.equal(modelo190([], [], 2026).perceptores.length, 0);
  assert.equal(modelo232([], [], 2026).obligado, false);
  assert.equal(modelo840([], [], 2026).situacion, 'sin-datos');
  assert.deepEqual(modelo202({}, 2026).map((p) => p.pago), [0, 0, 0]);
  // Sin obligación no se genera el fichero del 232: se dice, no se entrega medio vacío.
  assert.throws(() => fichero232(yo, 2026, modelo232([], [], 2026)), /no hay obligación/);
});

test('los bordes del año van al trimestre que les toca, también en año bisiesto', () => {
  const pago = (fecha) => limpiarPago({ fecha, tipo: 'dividendos', perceptor: { nombre: 'Ana Pérez Gil', nif: '12345672P' }, bruto: 100 });
  const bordes = ['2024-01-01', '2024-02-29', '2024-03-31', '2024-04-01', '2024-06-30', '2024-07-01', '2024-09-30', '2024-10-01', '2024-12-31'];
  const pagos = bordes.map(pago);
  for (const p of pagos) assert.ok(!p.error, `${p.error}`);
  const porT = [1, 2, 3, 4].map((t) => casillas123(pagos, 2024, t)['03']);
  assert.deepEqual(porT, [3, 2, 2, 2], 'los nueve pagos no caen en los trimestres esperados');
  assert.equal(casillas123(pagos, 2024, 1)['06'] + casillas123(pagos, 2024, 2)['06'] + casillas123(pagos, 2024, 3)['06'] + casillas123(pagos, 2024, 4)['06'], 900);
  // El año anterior y el siguiente no entran.
  assert.equal(casillas123(pagos, 2023, 1)['03'], 0);
  assert.equal(casillas123(pagos, 2025, 4)['03'], 0);
  // El 29 de febrero es una fecha real; el 30 de febrero, no.
  assert.ok(!pago('2024-02-29').error);
  assert.ok(pago('2024-02-30').error);
  assert.equal(modelo193(pagos, 2024).base, 900);
});

// ---------- D. Negativos que los ficheros informativos tienen que rechazar, no maquillar ----------
test('los reintegros y los negativos de las informativas se rechazan con un aviso o salen con su signo', () => {
  const yo = { nif: 'B12345674', nombre: 'Prueba SL', telefono: '600123456', contacto: 'Ana Pérez', email: 'a@b.es' };
  const arrendador = { nombre: 'Ana Pérez Gil', nif: '12345672P', provincia: '08', situacion: 4, base: -500, retenciones: -95 };
  const m180 = (p) => ({ arrendadores: [p], base: p.base, retenciones: p.retenciones });
  // Sin el ejercicio de devengo no se sabe de qué año es el reintegro (diseño del 180, posiciones 110-113).
  assert.throws(() => fichero180(yo, 2026, m180(arrendador)), /ejercicio de devengo/);
  // Con el ejercicio, la retención negativa sigue sin caber: las posiciones 97-109 son numéricas sin signo.
  assert.throws(() => fichero180(yo, 2026, m180({ ...arrendador, ejercicioDevengo: 2025 })), /no admite signo en ese campo/);
  // La base sí lleva signo (posición 78): un reintegro sin retención que devolver se declara con la N delante.
  const f = fichero180(yo, 2026, m180({ ...arrendador, ejercicioDevengo: 2025, retenciones: 0 }));
  const det = f.contenido.split('\r\n')[1];
  assert.equal(det.slice(78, 79), 'N');
  assert.equal(Number(det.slice(79, 92)), 50000);
  assert.equal(Number(det.slice(96, 109)), 0);
  assert.equal(Number(det.slice(109, 113)), 2025);
  // Y la cabecera arrastra el signo del total.
  assert.equal(det.length, 500);
  assert.equal(f.contenido.split('\r\n')[0].slice(144, 145), 'N');
  // El 193 no admite negativos en ninguno de sus importes.
  const p193 = { nombre: 'Ana Pérez Gil', nif: '12345672P', provincia: '08', clave: 'A', naturaleza: '02', base: -100, retenciones: -19, pct: 19 };
  assert.throws(() => fichero193(yo, 2026, { perceptores: [p193] }), /no admite importes negativos/);
  // Y declara el porcentaje que manda el diseño para esa clave y naturaleza, no el que se haya grabado.
  assert.throws(() => fichero193(yo, 2026, { perceptores: [{ ...p193, base: 100, retenciones: 19, clave: 'C', naturaleza: '06', pct: 19 }] }), /exige el 24 %/);
  const ok193 = fichero193(yo, 2026, { perceptores: [{ ...p193, base: 100, retenciones: 24, clave: 'C', naturaleza: '06', pct: 24 }] });
  assert.equal(Number(ok193.contenido.split('\r\n')[1].slice(164, 168)), 2400);
});

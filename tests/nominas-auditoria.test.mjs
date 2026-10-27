// Regresiones de la auditoría fiscal del 23 de octubre de 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'next/dist/build/swc/index.js';
import { PDFDocument, PDFRawStream } from 'pdf-lib';
import * as nominas from '../lib/nominas.js';
import * as calculos from '../lib/calculos.js';
import * as formato from '../lib/formato.js';
import * as huecos from '../lib/huecos.js';
import { traductor } from '../lib/i18n.js';
import { mesEnIdioma } from '../lib/textos/mes.js';
import { baseMensual, nominaCotizacion } from '../lib/cotizacion.js';
import { retencionTrabajo } from '../lib/retencionIrpf.js';
import { filasRecibo, reciboNominaPdf } from '../lib/reciboNomina.js';

const { anualDe, nominaCompleta, limpiarCotizacion, limpiarDatos145, SS_EMPRESA, SS_TRABAJADOR, calculoNomina } = nominas;
const empleado = (extra = {}) => ({
  nombre: 'Ana', nif: '12345678Z', bruto: 2000, horasSemana: 40, irpfPct: 12,
  cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: true }),
  datos145: limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 3 }, '12345678Z'),
  ...extra,
});

test('F2-09: alta en septiembre, 8.000 € previstos y retención cero', () => {
  const e = empleado({ alta: '2026-09-01' });
  const n = nominaCompleta(e, { bruto: 2000, mes: '2026-09' });
  assert.equal(anualDe(e, 2026), 8000);
  assert.equal(n.detalle.irpf.anual, 8000);
  assert.equal(n.irpfPct, 0);
  assert.equal(n.importes.irpf, 0);
  assert.equal(n.detalle.irpf.calculado, 0);
});

test('F2-09: año completo conserva el tipo; bajas, extras y año de la nómina', () => {
  const normal = nominaCompleta(empleado(), { bruto: 2000, mes: '2026-09' });
  const completo = nominaCompleta(empleado({ alta: '2025-10-01', baja: '2027-03-31' }), { bruto: 2000, mes: '2026-09' });
  assert.equal(normal.irpfPct, 13.51);
  assert.deepEqual(completo.importes, normal.importes);
  assert.equal(completo.detalle.irpf.anual, 24000);
  const e = empleado({ alta: '2026-09-01' });
  assert.equal(nominaCompleta(e, { bruto: 2000, mes: '2027-01' }).detalle.irpf.anual, 24000);
  assert.equal(nominaCompleta(e, { bruto: 2000, mes: '2027-01' }).irpfPct, 13.51);
  const baja = empleado({ baja: '2026-04-30' });
  assert.equal(nominaCompleta(baja, { bruto: 2000, mes: '2026-04' }).detalle.irpf.anual, 8000);
  const extras = empleado({ alta: '2026-09-01', cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: false }) });
  assert.equal(anualDe(extras, 2026), 9333.33); // Cuatro sueldos y 4/12 de las dos pagas.
  assert.equal(anualDe(empleado({ alta: '2027-01-01' }), 2026), 0);
  assert.equal(anualDe(empleado({ baja: '2025-12-31' }), 2026), 0);
});

test('F2-09: meses incompletos, días inclusivos y cotizaciones por el mismo periodo', () => {
  const e = empleado({ bruto: 4000, alta: '2026-07-16', baja: '2026-12-15' });
  const meses = 16 / 31 + 4 + 15 / 31;
  assert.equal(anualDe(e, 2026), 20000);
  const cuotas = nominaCotizacion({ bruto: 4000, prorrateadas: true }).cuotas.trabajador.total;
  const esperado = retencionTrabajo({ ...e.datos145, nif: e.nif, retribuciones: 20000, cotizaciones: calculos.r2(cuotas * meses) });
  const n = nominaCompleta(e, { bruto: 4000, mes: '2026-07' });
  assert.equal(n.irpfPct, esperado.tipo);
  assert.equal(n.detalle.irpf.base, esperado.base);
  assert.equal(anualDe(empleado({ alta: '2024-02-15', baja: '2024-02-29' }), 2024), 1034.48);
  assert.equal(nominaCompleta(e, { bruto: 4000, mes: '2026-07', irpfPct: 18 }).irpfPct, 18);
});

test('F2-10: grupo 7, media jornada, 650 € y 88 horas, mínimos de 755,04 €', () => {
  const e = empleado({ bruto: 650, horasSemana: 20 });
  const n = nominaCompleta(e, { bruto: 650, mes: '2026-10', horas: 88 });
  assert.deepEqual([n.detalle.base, n.detalle.baseAT, n.detalle.horas], [755.04, 755.04, 88]);
  assert.deepEqual([n.detalle.cuotas.trabajador.contingenciasComunes, n.detalle.cuotas.trabajador.desempleo], [35.49, 11.7]);
  assert.equal(nominaCompleta(e, { bruto: 650, mes: '2026-10' }).detalle.base, 712.2);
});

test('F2-10: mínimos horarios por grupo, AT por hora, topes y validación', () => {
  const minimas = [1198, 994, 865, 858, 858, 858, 858, 858, 858, 858, 858];
  minimas.forEach((minima, i) => {
    const n = baseMensual({ remuneracion: 0, grupo: i + 1, parcial: .5, horas: 100 });
    assert.equal(n.base, minima);
    assert.equal(n.baseAT, 858); // AT: mínimo común de 8,58 €/hora (art. 38.3).
  });
  const alto = baseMensual({ remuneracion: 6000, parcial: .5, horas: 88 });
  assert.deepEqual([alto.base, alto.baseAT], [5101.2, 5101.2]);
  assert.equal(baseMensual({ remuneracion: 0, parcial: .5, horas: 0 }).base, 0);
  assert.equal(baseMensual({ remuneracion: 0, parcial: 1, horas: 88 }).base, 1424.4);
  for (const horas of [-1, NaN, Infinity, '88', null]) {
    assert.match(nominaCotizacion({ bruto: 650, parcial: .5, horas }).error, /horas/);
  }
});



const simplificada = (extra = {}) => ({ mes: '2026-10', empleadoNombre: 'Ana', bruto: 2000, irpfPct: 12, ssTrabajadorPct: SS_TRABAJADOR, ssEmpresaPct: SS_EMPRESA, ...extra });
test('F2-11: recibo simplificado desglosado, temporal y ajustes sin alterar el neto', () => {
  for (const n of [simplificada(), simplificada({ temporal: true, ssTrabajadorPct: 6.55 }), simplificada({ ssTrabajadorPct: 7 }), simplificada({ bruto: 1424.4 })]) {
    const r = filasRecibo(n);
    assert.deepEqual(r.aportacionTrabajador.slice(0, 4).map((f) => f.porcentaje), [4.7, n.temporal ? 1.6 : 1.55, .1, .15]);
    assert.equal(calculos.r2(r.aportacionTrabajador.reduce((s, f) => s + f.importe, 0)), calculoNomina(n).ssTrabajador);
    assert.equal(calculos.r2(r.deducciones.reduce((s, f) => s + f.importe, 0)), r.totalDeducir);
    assert.equal(r.liquido, calculoNomina(n).neto);
    assert.equal(r.nota, 'Nómina simplificada: cálculo aproximado, no sustituye al recibo oficial');
  }
  assert.equal(filasRecibo(simplificada(), { cotizacion: { temporal: true } }).aportacionTrabajador[1].porcentaje, 1.6);
});

test('F2-11: el PDF simplificado incluye la nota y sigue cabiendo en una página', async () => {
  const bytes = await reciboNominaPdf({ nomina: simplificada() });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const contenido = pdf.context.enumerateIndirectObjects().filter(([, obj]) => obj instanceof PDFRawStream)
    .map(([, obj]) => inflateSync(obj.getContents()).toString()).join('\n');
  const nota = Buffer.from('Nómina simplificada: cálculo aproximado, no sustituye al recibo oficial', 'latin1').toString('hex');
  assert.ok(contenido.toLowerCase().includes(nota));
  const completa = filasRecibo({ ...nominaCompleta(empleado(), { bruto: 2000, mes: '2026-10' }), mes: '2026-10' });
  assert.equal(completa.nota, '');
});

test('F2-20: el 32,15 % de empresa coincide con las cuotas completas sobre 2.000 €', () => {
  assert.equal(SS_EMPRESA, 32.15);
  const simple = calculoNomina(simplificada());
  const completa = calculoNomina(nominaCompleta(empleado(), { bruto: 2000, mes: '2026-10' }));
  assert.deepEqual([simple.ssEmpresa, simple.coste], [643, 2643]);
  assert.equal(simple.ssEmpresa, completa.ssEmpresa);
  // El nuevo valor por defecto no modifica nóminas ya guardadas con otro porcentaje.
  assert.equal(calculoNomina(simplificada({ ssEmpresaPct: 31.65 })).ssEmpresa, 633);
});

// Renderiza solo los componentes autorizados, sustituyendo navegación y servicios externos.
const require = createRequire(import.meta.url);
function cargarJsx(ruta, sustituciones) {
  const codigo = readFileSync(new URL(ruta, import.meta.url), 'utf8');
  const { code } = transformSync(codigo, { filename: ruta, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => {
    if (Object.hasOwn(sustituciones, id)) return sustituciones[id];
    if (['react', 'react/jsx-runtime'].includes(id)) return require(id);
    throw new Error(`Dependencia sin sustituir: ${id}`);
  }, modulo, modulo.exports);
  return modulo.exports;
}

// El idioma de la app (components/Idioma.js, lib/idiomaServidor.js): en castellano, el texto tal cual y con sus huecos rellenos.
const es = traductor(null, 'es');
const idiomaCliente = { '@/components/Idioma': { useT: () => es }, '@/lib/huecos': huecos };
const idiomaServidor = { '@/lib/idiomaServidor': { textos: async () => es, idiomaActual: async () => 'es' }, '@/lib/huecos': huecos, '@/lib/textos/mes': { mesEnIdioma } };
const datosNomina = () => cargarJsx('../components/DatosNomina.js', { '@/lib/nominas': nominas, ...idiomaCliente });
test('F2-11: solo las fichas nuevas tienen nómina completa marcada al abrir el formulario', () => {
  for (const e of [undefined, empleado({ cotizacion: undefined })]) {
    let estado = 0;
    const { FormEmpleado } = cargarJsx('../components/Nominas.js', {
      react: { ...React, useState: (inicial) => [estado++ === 1 ? true : inicial, () => {}] },
      'next/navigation': { useRouter: () => ({}) }, './Acciones': {}, '@/lib/transicion': {},
      '@/lib/nominas': nominas, '@/lib/calculos': calculos, '@/lib/formato': formato, './DatosNomina': datosNomina(), ...idiomaCliente,
    });
    const html = renderToStaticMarkup(React.createElement(FormEmpleado, { empleado: e, hoy: '2026-10-23' }));
    assert.equal(/type="checkbox"[^>]*checked=""/.test(html), !e);
    assert.equal(html.includes('Grupo de cotización'), !e);
  }
});

test('F2-10 y F2-14: nota de las horas del registro de jornada y referencia legal en el formulario', () => {
  const { Cotizacion } = datosNomina();
  const html = renderToStaticMarkup(React.createElement(Cotizacion, { valor: {}, cambiar: () => {}, parcial: true }));
  assert.match(html, /horas fichadas del mes en el registro de jornada/);
  assert.match(html, /Sin fichajes, la base mínima se calcula en proporción a la jornada/);
  assert.match(html, /disposición adicional cuarta de la Ley 42\/2006/);
  assert.doesNotMatch(html, /61\.ª/);
});

test('F2-19: el 111 se muestra con el próximo hábil, incluidos enero y el cambio de año', async () => {
  const Vacio = () => null;
  for (const [hoy, esperado] of [['2024-07-15', '21 de octubre'], ['2023-12-15', '22 de enero'], ['2026-10-23', '20 de enero']]) {
    const n = simplificada({ mes: hoy.slice(0, 7) });
    const { default: Pagina } = cargarJsx('../app/nominas/page.js', {
      '@/components/Vacio': Vacio, '@/components/Ir': Vacio, '@/components/Volver': Vacio, '@/components/SinBD': Vacio,
      '@/lib/auth': { requerir: async () => ({}) }, '@/lib/redis': { leer: async (_, clave) => clave === 'nominas' ? [n] : [] },
      '@/lib/calculos': calculos, '@/lib/formato': { ...formato, hoy: () => hoy }, '@/lib/nominas': nominas,
      '@/lib/historialNominas': { equipoPorFecha: () => ({ actuales: [], futuras: [], bajas: [] }), historialNominas: (_, anio) => ({ anios: [anio], anio, meses: [] }) },
      '@/components/Nominas': { FormEmpleado: Vacio, GenerarMes: Vacio }, '@/lib/jornada': {}, '../nominas.css': {}, '@/app/mk.css': {}, ...idiomaServidor,
    });
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }));
    assert.ok(html.includes(`Hasta el ${esperado}.`), html);
  }
});

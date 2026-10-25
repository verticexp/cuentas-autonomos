import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'next/dist/build/swc/index.js';
import { PDFDocument } from 'pdf-lib';
import { calcularFiniquito, mesesIndemnizacion } from '../lib/finiquito.js';
import * as nominas from '../lib/nominas.js';
import * as calculos from '../lib/calculos.js';
import { filasRecibo, reciboNominaPdf } from '../lib/reciboNomina.js';

const { nominaCompleta, limpiarCotizacion, calculoNomina, modelo111, gastoDeNomina, basesNominasCsv, calculoIT } = nominas;
const e = (extra = {}) => ({ id: 'e1', nombre: 'Ana Pérez', nif: '12345678Z', naf: '001234567890', alta: '2026-01-01', bruto: 1500, irpfPct: 10, horasSemana: 40, cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: false, temporal: true }), ...extra });
const opciones = { baja: '2026-08-31', causa: 'temporal', vacacionesDisfrutadas: 5 };
const junio = { ...nominaCompleta(e(), { bruto: 3000, pagaExtra: 1500, mes: '2026-06' }), id: 'junio', mes: '2026-06', empleado: 'e1', pagada: true };

test('finiquito temporal: ocho meses, pagas semestrales, vacaciones y retención histórica', () => {
  const n = calcularFiniquito(e(), opciones, [junio]);
  assert.equal(n.error, undefined);
  // 21.000 €/año, 57,5342465753 €/día; 8/12 × 12 = 8 días de indemnización.
  // Julio-agosto: 62/184 × 1.500 = 505,43 de paga; junio ya está en su nómina.
  // Vacaciones: 30 × 243/365 − 5 = 14,97260274 días × 21.000/365 = 861,44 €.
  assert.equal(n.finiquito.mesesAntiguedad, 8);
  assert.deepEqual(n.finiquito.lineas.map((l) => l.importe), [1500, 505.43, 861.44, 460.27, 0]);
  // Base 2.866,87: cuotas redondeadas por concepto 134,74 + 45,87 + 2,87 + 4,30 = 187,78.
  assert.equal(n.detalle.base, 2866.87);
  assert.equal(n.importes.ssTrabajador, 187.78);
  assert.equal(n.importes.irpf, 332.71);
  assert.equal(calculoNomina(n).neto, 2806.65);
  assert.equal(n.finiquito.diasAltaVacaciones, 15);
  assert.match(n.finiquito.avisos.join(' '), /SILTRA/);
});

test('despido objetivo: tres años y cuatro meses, indemnización de 20 días/año', () => {
  const n = calcularFiniquito(e({ alta: '2023-01-01' }), { ...opciones, baja: '2026-04-30', causa: 'objetivo' });
  // 40 meses × 20/12 × 21.000/365 = 3.835,6164 €, inferior a 21.000 (12 mensualidades).
  assert.equal(n.finiquito.mesesAntiguedad, 40);
  assert.equal(n.finiquito.indemnizacion, 3835.62);
  assert.equal(mesesIndemnizacion('2023-01-01', '2026-05-01'), 41); // Fracción de mes al superior.
});

test('despido improcedente: diez años sin tope y treinta años con tope de 24 mensualidades', () => {
  const diez = calcularFiniquito(e({ alta: '2017-01-01' }), { ...opciones, baja: '2026-12-31', causa: 'improcedente' });
  // 33 × 10 × 21.000/365 = 18.986,30 €, inferior a 42.000 €.
  assert.equal(diez.finiquito.indemnizacion, 18986.3);
  assert.equal(diez.finiquito.indemnizacionExenta, 0); // Sin conciliación, todo sujeto a IRPF.
  const conciliado = calcularFiniquito(e({ alta: '2017-01-01' }), { ...opciones, baja: '2026-12-31', causa: 'improcedente', conciliacion: true });
  assert.equal(conciliado.finiquito.indemnizacionExenta, 18986.3);
  const treinta = calcularFiniquito(e({ alta: '1997-01-01' }), { ...opciones, baja: '2026-12-31', causa: 'improcedente' });
  // 990 días superan las 24 mensualidades: 21.000/12 × 24 = 42.000 €.
  assert.equal(treinta.finiquito.indemnizacion, 42000);
  assert.match(treinta.finiquito.avisos.join(' '), /45 días/);
});

test('indemnización limitada fiscalmente a 180.000 €, exenta de cotizar; otras causas a cero', () => {
  const n = calcularFiniquito(e({ alta: '1997-01-01', bruto: 20000 }), { ...opciones, baja: '2026-12-31', causa: 'improcedente', conciliacion: true, vacacionesDisfrutadas: 30 });
  assert.deepEqual([n.finiquito.indemnizacion, n.finiquito.indemnizacionExenta, n.finiquito.indemnizacionSujeta], [560000, 180000, 380000]);
  assert.equal(n.detalle.base, 5101.2);
  const corto = calcularFiniquito(e({ alta: '2026-08-01' }), { ...opciones, baja: '2026-08-20' });
  assert.equal(corto.detalle.cuotas.empresa.contratoCorto, 33.62);
  for (const causa of ['voluntaria', 'prueba', 'disciplinario']) assert.equal(calcularFiniquito(e(), { ...opciones, causa }).finiquito.indemnizacion, 0);
});

test('sin salario duplicado, pagas prorrateadas, devengo anual y fechas imposibles', () => {
  const empleado = e({ cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: true }) });
  const ordinaria = { ...nominaCompleta(empleado, { bruto: 1500, mes: '2026-08' }), mes: '2026-08', empleado: 'e1' };
  const n = calcularFiniquito(empleado, { ...opciones, causa: 'voluntaria' }, [ordinaria]);
  assert.deepEqual(n.finiquito.lineas.slice(0, 2).map((l) => l.importe), [0, 0]);
  const anual = calcularFiniquito(e({ alta: '2025-01-01' }), { ...opciones, devengoPagas: 'anual' }, [junio]);
  // Próxima paga de junio: 62/365; próxima de diciembre: 243/365, 1.253,42 €.
  assert.equal(anual.finiquito.lineas[1].importe, 1253.42);
  const pagoReal = calcularFiniquito(e({ alta: '2025-01-01' }), { ...opciones, devengoPagas: 'anual' }, [{ ...junio, pagado: '2026-06-20' }]);
  assert.equal(pagoReal.finiquito.lineas[1].importe, 1294.52); // 72/365 de junio y 243/365 de diciembre.
  for (const datos of [{ baja: '2026-02-30' }, { baja: '2025-12-31' }, { causa: 'invalida' }, { vacacionesDisfrutadas: Infinity }, { vacacionesDisfrutadas: -1 }]) assert.ok(calcularFiniquito(e(), { ...opciones, ...datos }).error);
});

const itEmpleado = e({ bruto: 3000, cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: true }) });
const itComun = { baja: '2026-04-01', alta: '2026-04-25', tipo: 'comun', baseAnterior: 3000, baseATAnterior: 3000 };

test('IT común de 25 días: 0/60/75, empresa y pago delegado, IRPF y bases mantenidas', () => {
  const n = nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04', it: itComun });
  // BR=3.000/30=100. Días 1–3:0; 4–20:17×60=1.020; 21–25:5×75=375.
  // Empresa 4–15:12×60=720; delegado 16–20:300 + 375=675. Salario:5×100=500.
  assert.deepEqual(n.detalle.it.tramos, { sinPrestacion: 3, al60: 17, al75: 5, salarioAccidente: 0 });
  assert.deepEqual([n.detalle.it.empresa, n.detalle.it.pagoDelegado, n.detalle.it.prestacion], [720, 675, 1395]);
  assert.deepEqual([n.importes.bruto, n.importes.irpf, n.importes.ssTrabajador, n.detalle.base], [1895, 189.5, 195, 3000]);
  // Gasto: 1.895 + 964,50 SS empresa − 675 delegado = 2.184,50 €.
  assert.equal(gastoDeNomina({ ...n, mes: '2026-04' }).base, 2184.5);
  const mejorada = nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04', it: { ...itComun, complementoPct: 100 } });
  assert.equal(mejorada.detalle.it.complemento, 1105);
  assert.equal(mejorada.importes.bruto, 3000);
});

test('IT por accidente de trabajo: diez días, día del accidente pagado y nueve al 75 %', () => {
  const it = { ...itComun, alta: '2026-04-10', tipo: 'profesional', baseATAnterior: 3200, horasExtraMesAnterior: 200, horasExtraAnteriores: 3650 };
  const n = nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04', it });
  // BR=(3.200−200)/30 + 3.650/365=110. Delegado=9×110×75%=742,50.
  // Salario de 21 días: día del accidente + 20 días posteriores a la IT = 2.100.
  assert.equal(n.detalle.it.baseReguladora, 110);
  assert.deepEqual([n.detalle.it.empresa, n.detalle.it.pagoDelegado, n.detalle.it.salarioTrabajado], [0, 742.5, 2100]);
  assert.equal(n.importes.bruto, 2842.5);
  assert.deepEqual([n.detalle.base, n.detalle.baseAT, n.detalle.it.diasCotizacion], [3000, 3060, 9]); // El día del accidente cotiza por su salario, sin duplicarlo.
  assert.equal(n.detalle.it.tramos.salarioAccidente, 1);
  const sinHistorico = calculoIT(itEmpleado, { ...it, horasExtraAnteriores: undefined, mes: '2026-04' });
  assert.match(sinHistorico.avisos.join(' '), /No hay horas extra del año anterior/);
});

test('IT continuada: tramos desde el inicio original, divisor diario y validación', () => {
  const it = calculoIT(itEmpleado, { ...itComun, baja: '2026-03-20', alta: '', mes: '2026-04' });
  assert.deepEqual([it.tramos.al60, it.tramos.al75, it.empresa, it.pagoDelegado], [8, 22, 180, 1950]);
  const diario = calculoIT(e({ cotizacion: limpiarCotizacion({ grupo: 8 }) }), { ...itComun, baja: '2026-03-01', alta: '2026-03-10', baseAnterior: 2800, mes: '2026-03' });
  assert.equal(diario.baseReguladora, 100); // Febrero tiene 28 días para salario diario.
  for (const cambio of [{ baja: '2026-02-30' }, { alta: '2026-03-31' }, { baseAnterior: Infinity }, { tipo: 'otra' }, { complementoPct: 101 }]) assert.ok(calculoIT(itEmpleado, { ...itComun, mes: '2026-04', ...cambio }).error);
});

test('atrasos de otro año: importe separado, tipo del mes y liquidación complementaria', () => {
  const empleado = e({ alta: '2024-01-01', cotizacion: limpiarCotizacion({ grupo: 7, prorrateadas: true }) });
  const n = nominaCompleta(empleado, { bruto: 1500, mes: '2026-04', atrasos: { importe: 200, meses: ['2025-11', '2025-12'] } });
  // 1.500+200=1.700; retiene el 10%=170. Dos bases de atrasos de 100, 6,50 € de SS cada una.
  assert.equal(n.importes.bruto, 1700);
  assert.equal(n.importes.irpf, 170);
  assert.equal(n.importes.ssTrabajador, 110.5);
  assert.equal(n.detalle.base, 1500); // Los 200 no consumen el tope del mes de abril.
  assert.deepEqual(n.detalle.atrasos.liquidaciones.map((l) => l.base), [100, 100]);
  assert.match(n.detalle.avisos.join(' '), /14.2.b LIRPF/);
  assert.match(n.detalle.avisos.join(' '), /L03/);
  for (const meses of [[], ['2026-04'], ['2025-13'], ['2025-11', '2025-11']]) assert.ok(nominaCompleta(empleado, { bruto: 1500, mes: '2026-04', atrasos: { importe: 200, meses } }).error);
});

test('CSV con dos empleados: BOM, cabecera, decimales, NAF con ceros y fila completa', () => {
  const empleados = [itEmpleado, e({ id: 'e2', nombre: 'Luis; López', naf: '009876543210' })];
  const n = { ...nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04', it: itComun }), mes: '2026-04', empleado: 'e1', empleadoNombre: itEmpleado.nombre };
  const segunda = { ...nominaCompleta(empleados[1], { bruto: 1500, mes: '2026-04' }), mes: '2026-04', empleado: 'e2', empleadoNombre: empleados[1].nombre };
  const csv = basesNominasCsv([n, segunda], empleados, '2026-04');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lineas = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lineas.length, 3);
  assert.equal(lineas[0], 'NAF;NIF;Nombre;Grupo de cotización;Contrato;Coeficiente de parcialidad;Días cotizados;Base contingencias comunes;Base AT/EP;Horas extra fuerza mayor;Horas extra resto;Base horas extra;Días IT;Tipo IT;Cuota trabajador;Cuota empresa;Pago delegado IT;Cuotas incluyen provisión L03');
  assert.equal(lineas[1], '001234567890;12345678Z;Ana Pérez;7;indefinido;1,00;30;3000,00;3000,00;0,00;0,00;0,00;25;comun;195,00;964,50;675,00;No');
  assert.ok(lineas[2].includes('"Luis; López"'));
  assert.throws(() => basesNominasCsv([{ ...n, detalle: undefined }], empleados, '2026-04'), /simplificadas/);
});

test('finiquito: recibo y gasto cuadran; el 111 suma solo percepciones sujetas', async () => {
  const n = { ...calcularFiniquito(e(), opciones, [junio]), id: 'f1', pagada: true };
  const c = calculoNomina(n), r = filasRecibo(n, e());
  assert.equal(r.totalDevengado, 3327.14);
  assert.equal(calculos.r2(r.totalDevengado - r.totalDeducir), r.liquido);
  assert.equal(r.bases.irpf, n.importes.bruto);
  assert.equal(r.percepcionesNoSalariales[0].importe, 460.27);
  assert.equal(modelo111([n], 2026, 3).percepciones, 3327.14);
  assert.equal(gastoDeNomina(n).base, c.coste);
  assert.equal(gastoDeNomina(n).cuentaIndemnizacion, '641');
  const pdf = await PDFDocument.load(await reciboNominaPdf({ nomina: n, empleado: e() }));
  assert.ok(pdf.getPageCount() >= 1);
});

// Las rutas se ejecutan con Redis y sesión simulados: validación, permisos y cierres antes de escribir.
const require = createRequire(import.meta.url);
function cargarRuta(ruta, sustituciones) {
  const { code } = transformSync(readFileSync(new URL(ruta, import.meta.url), 'utf8'), { filename: ruta, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } });
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => {
    if (Object.hasOwn(sustituciones, id)) return sustituciones[id];
    throw new Error(`Dependencia sin sustituir: ${id}`);
  }, modulo, modulo.exports);
  return modulo.exports;
}
function entorno({ cerrado = false, denegado = false, existentes = [junio] } = {}) {
  const escritos = [], permisos = [], cierres = [];
  const almacen = { empleados: [e()], nominas: [...existentes], jornada: [] };
  class Ocupado extends Error {}
  const dependencias = {
    '@/lib/cierres': { comprobarCierre: async (...args) => { cierres.push(args); return cerrado ? 'Trimestre cerrado' : null; } },
    '@/lib/app': { mensajePlan: () => '' },
    '@/lib/redis': { guardar: async (_, tipo, dato) => { escritos.push({ tipo, dato }); almacen[tipo] ||= []; const i = almacen[tipo].findIndex((n) => n.id === dato.id); if (i >= 0) almacen[tipo][i] = dato; else almacen[tipo].push(dato); }, leer: async (_, tipo) => almacen[tipo] || [], leerUno: async (_, tipo, id) => almacen[tipo].find((n) => n.id === id) },
    '@/lib/enlacesBanco': {}, '@/lib/api': { usuarioApi: async (op) => { permisos.push(op.permiso); return denegado ? { res: new Response('', { status: 403 }) } : { u: { empresa: 'uno' } }; }, cuerpo: async (r) => r.json(), error: (s, status = 400) => Response.json({ error: s }, { status }) },
    '@/lib/calculos': calculos, '@/lib/empresa': { actividadesDe: () => [], actividadValida: () => '' }, '@/lib/nominas': nominas,
    '@/lib/finiquito': { calcularFiniquito }, '@/lib/jornada': { extrasNomina: () => null, resumenMes: () => ({}) },
    '@/lib/trabajos': { secundarios: async () => {} }, '@/lib/formato': { hoy: () => '2026-08-31' }, '@/lib/usoPlan': { usarFuncion: async () => null }, '@/lib/cerrojo': { conCerrojo: async (_, fn) => fn(), Ocupado },
  };
  const ruta = cargarRuta('../app/api/nominas/route.js', dependencias);
  const req = (body) => new Request('http://localhost/api/nominas', { method: 'POST', body: JSON.stringify(body) });
  return { ruta, req, escritos, permisos, cierres, almacen, dependencias };
}

test('API finiquito: vista previa sin escrituras, guardado especial, gasto y fecha de baja', async () => {
  const t = entorno();
  const b = { tipo: 'finiquito', empleado: 'e1', datos: opciones };
  const previo = await t.ruta.POST(t.req(b));
  assert.equal(previo.status, 200); assert.equal(t.escritos.length, 0);
  const r = await t.ruta.POST(t.req({ ...b, guardar: true }));
  assert.equal(r.status, 200);
  assert.deepEqual(t.escritos.map((s) => s.tipo), ['nominas', 'gastos', 'empleados']);
  assert.equal(t.escritos[0].dato.tipo, 'finiquito');
  assert.equal(t.escritos[2].dato.baja, opciones.baja);
  assert.ok(t.permisos.every((p) => p === 'nominas'));
  assert.equal((await t.ruta.POST(t.req({ ...b, guardar: true }))).status, 409);
});

test('API: finiquito, IT y atrasos respetan el cierre; importes y fechas imposibles se rechazan', async () => {
  const n = { ...nominaCompleta(e(), { bruto: 1500, mes: '2026-08' }), mes: '2026-08', id: 'n1', empleado: 'e1', completa: true, bruto: 1500 };
  const t = entorno({ cerrado: true, existentes: [n] });
  assert.equal((await t.ruta.POST(t.req({ tipo: 'finiquito', empleado: 'e1', datos: opciones, guardar: true }))).status, 409);
  for (const cambios of [{ atrasos: { importe: 100, meses: ['2026-07'] } }, { it: { ...itComun, baja: '2026-08-01', alta: '2026-08-25', baseAnterior: 1750 } }]) {
    assert.equal((await t.ruta.PATCH(t.req({ id: 'n1', ...cambios }))).status, 409);
  }
  assert.equal(t.escritos.length, 0);
  const denegado = entorno({ denegado: true });
  assert.equal((await denegado.ruta.POST(denegado.req({ tipo: 'finiquito' }))).status, 403);
  const abierto = entorno({ existentes: [n] });
  for (const cambios of [{ bruto: 'Infinity' }, { bruto: null }, { bruto: 1e309 }, { pagaExtra: null }, { it: { ...itComun, baja: '2026-02-30' } }, { atrasos: { importe: -1, meses: ['2025-01'] } }, { irpfPct: 101 }]) assert.equal((await abierto.ruta.PATCH(abierto.req({ id: 'n1', ...cambios }))).status, 400);
  assert.equal(abierto.escritos.length, 0);
});

test('API CSV: permiso nominas, descarga privada y nombre del mes', async () => {
  const n = { ...nominaCompleta(e(), { bruto: 1500, mes: '2026-08' }), mes: '2026-08', empleado: 'e1', empleadoNombre: 'Ana' };
  const t = entorno({ existentes: [n] });
  const ruta = cargarRuta('../app/api/nominas/bases/route.js', t.dependencias);
  const r = await ruta.GET(new Request('http://localhost/api/nominas/bases?mes=2026-08'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.match(r.headers.get('Content-Disposition'), /bases-2026-08.csv/);
  assert.equal(new Uint8Array(await r.arrayBuffer())[0], 0xEF);
});


test('privacidad: agrupar conserva indemnización exenta y descuento del pago delegado en el coste', () => {
  const fini = { ...calcularFiniquito(e(), { ...opciones, causa: 'objetivo' }, [junio]), id: 'f1' };
  const it = { ...nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04', it: itComun }), mes: '2026-04', empleado: 'e2' };
  const grupos = nominas.agruparNominas([fini, it]);
  assert.equal(calculos.r2(grupos.reduce((s, n) => s + calculoNomina(n).coste, 0)), calculos.r2(calculoNomina(fini).coste + calculoNomina(it).coste));
  assert.ok(grupos.every((n) => !n.detalle));
});

test('horas extra en CSV: número separado de la base y fuerza mayor con su cuota propia', () => {
  const empleado = e({ cotizacion: limpiarCotizacion({ grupo: 7, prorrateadas: true }) });
  const n = { ...nominaCompleta(empleado, { bruto: 1800, horasExtra: 200, horasExtraFuerzaMayor: 100, numeroHorasExtra: 10, numeroHorasExtraFuerzaMayor: 5, mes: '2026-04' }), mes: '2026-04', empleado: 'e1', empleadoNombre: empleado.nombre };
  const recibo = filasRecibo(n, empleado);
  assert.equal(recibo.aportacionTrabajador.find((f) => f.concepto === 'Horas extra de fuerza mayor').porcentaje, 2);
  assert.equal(n.detalle.cuotas.trabajador.horasExtra, 11.4); // 200×4,7 % + 100×2 %.
  const fila = basesNominasCsv([n], [empleado], '2026-04').split('\r\n')[1].split(';');
  assert.deepEqual(fila.slice(9, 12), ['5,00', '10,00', '300,00']);
});

test('IT en febrero completo y parcial en mes de 31 días: cotización mensual de 30 días', () => {
  const febrero = nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-02', it: { ...itComun, baja: '2026-02-01', alta: '2026-02-28' } });
  assert.deepEqual([febrero.detalle.it.diasCotizacion, febrero.detalle.it.salarioTrabajado, febrero.detalle.base], [30, 0, 3000]);
  const mayo = nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-05', it: { ...itComun, baja: '2026-05-01', alta: '2026-05-25' } });
  assert.deepEqual([mayo.detalle.it.diasCotizacion, mayo.detalle.it.salarioTrabajado, mayo.detalle.base], [25, 500, 3000]);
});

test('API IT: referencia del inicio del proceso y corrección repetida sin sumar dos veces los atrasos', async () => {
  const anterior = { ...nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-03' }), mes: '2026-03', empleado: 'e1', id: 'marzo' };
  const n = { ...nominaCompleta(itEmpleado, { bruto: 3000, mes: '2026-04' }), mes: '2026-04', empleado: 'e1', id: 'abril', completa: true, bruto: 3000 };
  const t = entorno({ existentes: [anterior, n] });
  t.almacen.empleados[0] = itEmpleado;
  const cambios = { id: 'abril', it: { baja: '2026-04-01', alta: '2026-04-25', tipo: 'comun', baseAnterior: 999 }, atrasos: { importe: 100, meses: ['2026-03'] } };
  assert.equal((await t.ruta.PATCH(t.req(cambios))).status, 200);
  const primera = t.almacen.nominas.find((n) => n.id === 'abril');
  assert.equal(primera.detalle.it.baseAnterior, 3000); // La referencia guardada prevalece sobre el dato manual.
  assert.equal(primera.importes.bruto, 1995);
  assert.equal((await t.ruta.PATCH(t.req({ id: 'abril', atrasos: cambios.atrasos }))).status, 200);
  assert.deepEqual(t.almacen.nominas.find((n) => n.id === 'abril').importes, primera.importes);
});


test('API empleados: rechaza fechas imposibles y una baja anterior al alta; respeta el cierre', async () => {
  for (const datos of [{ alta: '2026-02-30' }, { baja: '2025-12-31' }]) {
    const t = entorno();
    const ruta = cargarRuta('../app/api/empleados/route.js', { ...t.dependencias, '@/lib/validacion': { importeEscrito: (v, defecto = NaN) => v === undefined || v === '' ? defecto : Number(v) }, '@/lib/planes': {} });
    assert.equal((await ruta.PATCH(t.req({ ...e(), ...datos }))).status, 400);
    assert.equal(t.escritos.length, 0);
  }
  const t = entorno({ cerrado: true });
  const ruta = cargarRuta('../app/api/empleados/route.js', { ...t.dependencias, '@/lib/validacion': { importeEscrito: (v, defecto = NaN) => v === undefined || v === '' ? defecto : Number(v) }, '@/lib/planes': {} });
  assert.equal((await ruta.PATCH(t.req({ ...e(), baja: '2026-08-31' }))).status, 409);
  assert.equal(t.escritos.length, 0);
});

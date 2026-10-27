// Primer uso: alta en tres pasos, tarjeta «¿Vienes de otro programa?», guías de importación por origen, estados vacíos con
// la transición de la app y de la contabilidad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGENES, guiaDe, origenValido } from '../lib/importarOrigen.js';
import { alPulsar } from '../lib/transicion.js';

const leer = (archivo) => readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');

test('el alta tiene tres pasos y ya no hay un paso de revisión', () => {
  const s = leer('components/Cuestionario.js');
  const pasos = s.slice(s.indexOf('const pasos = ['), s.indexOf('const p = pasos[paso]'));
  assert.deepEqual([...pasos.matchAll(/\n {6}corto: '([^']+)'/g)].map((m) => m[1]), ['Tu negocio', 'Tus datos', 'Impuestos']);
  assert.equal([...pasos.matchAll(/\n {6}titulo:/g)].length, 3);
  assert.doesNotMatch(s, /Tus modelos|todosPasos|slice\(2\)/);
  // El último botón crea la cuenta y una línea resume lo elegido y los modelos que le tocan.
  assert.match(s, /alta-resumen-linea[\s\S]*resumenLinea/);
  assert.match(s, /modelosDe\(limpiarFiscal\(fiscal\)\)/);
  // Sigue pidiendo lo de siempre: forma, territorio, actividades con IVA y retención, datos y regímenes especiales.
  for (const pregunta of ['¿Dónde presentas tus impuestos?', 'Retención de IRPF', 'Epígrafe del IAE', 'Razón social', 'IBAN para cobrar', 'Tengo un régimen especial de IVA', 'Situaciones especiales', 'Para el borrador de la renta', 'Fecha de constitución de la sociedad']) assert.ok(s.includes(pregunta), pregunta);
  // Antes de crear se vuelve al primer paso que haya quedado incompleto.
  assert.match(s, /pasos\.findIndex\(\(x\) => !x\.listo\)/);
});

test('el alta ya no ofrece «Importar mis datos» suelto: lleva la tarjeta con los tres orígenes', () => {
  const s = leer('components/Cuestionario.js');
  assert.doesNotMatch(s, /Importar mis datos/);
  assert.match(s, /<VienesDeOtroPrograma \/>/);
  // El botón de la primera factura sube como el resto de enlaces al formulario.
  assert.match(s, /<Ir className="boton" href="\/facturas\/nueva" tipo="subir">/);
  const r = leer('app/page.js');
  assert.match(r, /\{sinDatos && puede\(u, 'empresa'\) && <VienesDeOtroPrograma \/>\}/);
  const c = leer('components/VienesDeOtroPrograma.js');
  assert.match(c, /¿Vienes de otro programa\?/);
  assert.match(c, /<Ir href=\{`\/ajustes\/importar\?origen=\$\{o\.id\}`\} tipo="adelante"/);
});

test('Holded, Quipu y otro programa o Excel: cada uno con su guía y sin rutas de menú inventadas', () => {
  assert.deepEqual(ORIGENES.map((o) => o.id), ['holded', 'quipu', 'otro']);
  assert.deepEqual(ORIGENES.map((o) => o.nombre), ['Holded', 'Quipu', 'Otro programa o Excel']);
  for (const o of ORIGENES) {
    assert.ok(o.titulo && o.nota && o.resumen && o.corto, o.id);
    assert.ok(o.pasos.length >= 3, o.id);
    // Indicaciones generales: nada de «Menú › Ventas › Exportar».
    assert.doesNotMatch([o.titulo, o.nota, ...o.pasos].join(' '), /[›>→]/, o.id);
  }
  assert.match(guiaDe('holded').pasos.join(' '), /facturas de venta/);
  assert.match(guiaDe('quipu').pasos.join(' '), /facturas emitidas/);
  assert.match(guiaDe('otro').pasos.join(' '), /Excel/);
  assert.equal(origenValido('quipu'), 'quipu');
  assert.equal(origenValido('<script>'), null);
  assert.equal(origenValido(undefined), null);
  assert.equal(origenValido(['holded']), null);
  // La pantalla de importar recibe el origen de la dirección y lo valida en el servidor.
  assert.match(leer('app/ajustes/[seccion]/page.js'), /origenValido\(\(await searchParams\)\?\.origen\)/);
  assert.match(leer('components/Importar.js'), /export default function Importar\(\{ origen: origenInicial = null \}\)/);
});

test('las acciones de los estados vacíos entran con la transición de la app', () => {
  const s = leer('components/Vacio.js');
  assert.match(s, /import Ir from '\.\/Ir'/);
  assert.doesNotMatch(s, /next\/link/);
  assert.match(s, /valor\.tipo \|\| \(esFormulario\(valor\.href\) \? 'subir' : 'adelante'\)/);
});

test('un ancla de la misma pantalla no se anima, una pantalla nueva sí', () => {
  globalThis.location = new URL('http://localhost:3063/nominas?x=1');
  const evento = () => ({ metaKey: false, ctrlKey: false, shiftKey: false, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  const enlace = (href) => { const e = evento(); try { alPulsar({}, href, 'adelante')(e); } catch { /* sin documento: la transición no llega a empezar */ } return e.defaultPrevented; };
  assert.equal(enlace('#anadir-empleado'), false);
  assert.equal(enlace('/nominas?x=1#anadir-empleado'), false);
  assert.equal(enlace('/facturas/nueva'), true);
  assert.equal(enlace('/nominas?x=2#anadir-empleado'), true, 'otra búsqueda es otra vista');
  assert.equal(enlace('/jornada#algo'), true);
});

test('Contabilidad: sin asientos hay una explicación y las acciones que la llenan, no tablas a cero', () => {
  const s = leer('app/contabilidad/page.js');
  assert.match(s, /const sinAsientos = !d\.asientos\.length, anioVacio = !d\.diario\.length/);
  for (const [vista, texto] of [['pyg', 'tu cuenta de resultados'], ['balance', 'el balance'], ['diario', 'el libro diario'], ['sumas', 'las sumas y saldos de cada cuenta'], ['mayor', 'el libro mayor de cada cuenta']]) {
    assert.ok(s.includes(`vacioContable('${texto}')`), vista);
  }
  assert.match(s, /ver === 'pyg' && anioVacio/);
  assert.match(s, /ver === 'balance' && sinAsientos/);
  assert.match(s, /ver === 'sumas' && anioVacio/);
  assert.match(s, /\{!sinAsientos && <section className="bloque">\s*<h2 className="grupo-t">Balance de pymes/);
  // Libros registro: sin anotaciones, nada de «0 anotaciones» ni botón de descarga vacío.
  assert.match(s, /!libros\.resumen\.ingresos && !libros\.resumen\.gastos && !libros\.resumen\.bienes/);
  assert.match(s, /Aún no hay nada que anotar en \$\{anio\}/);
});

test('Mi despacho: escribir a varios sin clientes explica cómo conseguirlos', () => {
  const s = leer('app/despacho/mensajes/varios/page.js');
  assert.match(s, /!filas\.length \? <Vacio icono="usuarios" titulo=(?:"Aún no tienes clientes a quienes escribir"|\{tr\('Aún no tienes clientes a quienes escribir'\)\})/);
  assert.match(s, /href: '\/despacho\/ajustes', texto: (?:'Invitar a un cliente'|tr\('Invitar a un cliente'\))/);
});

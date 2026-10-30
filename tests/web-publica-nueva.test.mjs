// Web pública: prueba social y datos legales preparados pero vacíos, comparativas, guías fiscales, calendario, rutas y
// sitemap. Lo que no hay datos para mostrar no se muestra; lo que se muestra no contradice la página de precios.
import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { PUBLICO } from '../lib/rutasPublicas.js';
import { desvioApp } from '../lib/app.js';
import { PLANES } from '../components/web/datos.js';
import * as social from '../data/web-social.js';
import { GUIAS, PUBLICOS, REVISION_GUIAS, guia } from '../data/web-guias.js';
import { FECHA_VERIFICACION, RIVALES } from '../data/web-comparativas.js';
import { casosValidos, gestoriasValidas, notaValida, opinionesValidas, pruebaSocial } from '../lib/webSocial.js';
import { datosDeclaracion, identidadLegal } from '../lib/webLegal.js';
import { calendarioSociedad, plazoTrimestre, plazosAnuales, siguienteHabil } from '../lib/webCalendario.js';
import { preciosFisquo, rellenar } from '../lib/webComparativa.js';
import { jsonLd, metaPagina } from '../lib/webMeta.js';

test('prueba social: los datos entregados están vacíos y no se muestra nada', () => {
  assert.deepEqual([social.opiniones, social.casos, social.gestorias], [[], [], []]);
  assert.equal(social.notaFundador, null);
  const s = pruebaSocial();
  assert.equal(s.hay, false);
  assert.deepEqual([s.opiniones, s.casos, s.gestorias, s.nota], [[], [], [], null]);
});

test('prueba social: una entrada incompleta o con una ruta peligrosa no llega a la web', () => {
  assert.deepEqual(opinionesValidas([{ nombre: 'Ana', texto: '' }, { nombre: '', texto: 'Hola' }, null, {}]), []);
  const [o] = opinionesValidas([{ nombre: ' Ana ', negocio: 'Estudio', ciudad: 'Vigo', texto: ' Muy útil ', foto: '//malo.example/x.jpg' }]);
  assert.deepEqual([o.nombre, o.texto, o.foto], ['Ana', 'Muy útil', '']);
  assert.equal(opinionesValidas([{ nombre: 'Ana', texto: 'ok', foto: '/web/ana.jpg' }])[0].foto, '/web/ana.jpg');
  assert.equal(opinionesValidas([{ nombre: 'Ana', texto: 'ok', foto: 'javascript:alert(1)' }])[0].foto, '');
  assert.deepEqual(casosValidos([{ empresa: 'X', problema: 'p' }, { empresa: 'X', problema: 'p', resultado: 'r' }]).length, 1);
  assert.deepEqual(gestoriasValidas([{ nombre: '' }, { nombre: 'Pons', logo: 'http://x.example/l.svg' }]), [{ nombre: 'Pons', logo: '' }]);
  assert.equal(notaValida({ nombre: 'A', texto: '' }), null);
  assert.equal(notaValida(null), null);
  assert.equal(pruebaSocial({ opiniones: [{ nombre: 'Ana', texto: 'ok' }] }).hay, true);
});

test('identidad legal: vacía no publica nada y necesita titular, NIF y domicilio', () => {
  // La sociedad real ya está, con la declaración firmada el 26-10-2026.
  assert.deepEqual([identidadLegal().nif, identidadLegal().registro.hoja], ['B05814041', 'B-665709']);
  assert.equal(datosDeclaracion(undefined, {}).lugar, 'Parets del Vallès (Barcelona)');
  assert.equal(identidadLegal({ titular: 'Fisquo SL', nif: '', domicilio: 'Calle 1' }), null);
  assert.equal(identidadLegal({ titular: 'Fisquo SL', nif: 'B00000000', domicilio: '   ' }), null);
  const e = identidadLegal({ titular: 'Fisquo SL', nif: 'B00000000', domicilio: 'Calle 1, Valencia', registro: { nombre: 'RM Valencia', tomo: '12', folio: '', hoja: 'V-1' } });
  assert.deepEqual([e.titular, e.nif, e.email], ['Fisquo SL', 'B00000000', 'corporate@fisquo.com']);
  assert.deepEqual(e.registro, { nombre: 'RM Valencia', tomo: '12', hoja: 'V-1' });
  assert.equal(identidadLegal({ titular: 'A', nif: 'B', domicilio: 'C', email: 'legal@fisquo.example', registro: {} }).registro, null);
});

test('declaración responsable: sin NIF o sin titular sigue «completándose»; con todo, se publica', () => {
  const completa = { titular: 'Fisquo SL', nif: 'B00000000', domicilio: 'Calle 1', declaracion: { fecha: '2 de febrero de 2027', lugar: 'Valencia' } };
  assert.ok(datosDeclaracion(completa, {}));
  assert.equal(datosDeclaracion({ ...completa, nif: '' }, {}), null);
  assert.equal(datosDeclaracion({ ...completa, titular: '' }, {}), null);
  assert.equal(datosDeclaracion({ ...completa, declaracion: { fecha: '', lugar: 'Valencia' } }, {}), null);
  // Las variables FISQUO_* de siempre siguen valiendo de respaldo.
  const env = { FISQUO_RAZON: 'R', FISQUO_NIF: 'N', FISQUO_DIRECCION: 'D', FISQUO_DECLARACION_FECHA: 'F', FISQUO_DECLARACION_LUGAR: 'L' };
  assert.equal(datosDeclaracion({}, env).razon, 'R');
  assert.equal(datosDeclaracion({}, { ...env, FISQUO_NIF: '' }), null);
});

test('rutas nuevas: públicas sin sesión, ocultas en la app de iOS y sin abrir nombres parecidos', () => {
  for (const r of ['/demo', '/guias', '/guias/modelo-303', '/comparativa', '/comparativa/holded', '/aviso-legal']) assert.ok(PUBLICO.test(r), r);
  for (const r of ['/demos', '/guiass', '/comparativas', '/aviso-legales', '/comparativa-x']) assert.ok(!PUBLICO.test(r), r);
  const APP = 'Mozilla/5.0 (iPhone) FisquoApp/1.0';
  for (const ruta of ['/demo', '/guias/modelo-130', '/comparativa/quipu', '/aviso-legal']) assert.equal(desvioApp({ ua: APP, ruta, conSesion: false }), '/login', ruta);
});

test('sitemap: incluye guías, comparativas y demo; /aviso-legal solo si hay datos legales', async () => {
  const { default: sitemap } = await import('../app/sitemap.js');
  const urls = sitemap().map((x) => x.url);
  for (const r of ['/demo', '/guias', '/comparativa', ...GUIAS.map((g) => `/guias/${g.slug}`), '/comparativa/holded', '/comparativa/quipu']) assert.ok(urls.includes(`https://www.fisquo.com${r}`), r);
  assert.ok(urls.includes('https://www.fisquo.com/aviso-legal')); // ya hay titular, NIF y domicilio
  assert.equal(new Set(urls).size, urls.length);
});

test('comparativas: precios de los rivales comprobados el 23-10-2026 y los de Fisquo salen de la oferta pública', () => {
  assert.equal(FECHA_VERIFICACION, '2026-10-23');
  const por = Object.fromEntries(RIVALES.map((r) => [r.slug, r]));
  assert.deepEqual([por.holded.desde, por.holded.hasta, por.quipu.desde, por.quipu.hasta], [15, 199, 17, 59]);
  const p = preciosFisquo();
  assert.deepEqual(p.aut, PLANES.aut.map((x) => x.p));
  assert.deepEqual([p.aut.join('/'), p.pym.join('/'), p.min, p.max], ['9/12/20', '25/32/55', 9, 55]);
  for (const r of RIVALES) {
    // Los precios del rival escritos en sus textos son los de sus datos, y nada queda sin sustituir.
    const textos = [r.intro, ...r.publicado, ...r.convieneRival.flat(), ...r.convieneFisquo.flat(), ...r.faqs.flat()].map((t) => rellenar(t));
    for (const t of textos) assert.doesNotMatch(t, /[{}]/);
    assert.match(textos.join(' '), new RegExp(`${r.desde} a ${r.hasta} €`));
    assert.match(rellenar(r.intro), /de 9 a 55 €/);
  }
  assert.equal(rellenar('{aut}-{pym}-{min}-{max}'), '9-25-9-55');
});

test('guías: para autónomos y para pymes, con norma, fecha de revisión, llamada final y todos los bloques conocidos', () => {
  assert.deepEqual(GUIAS.map((g) => g.slug), ['modelo-303', 'modelo-130', 'calendario-fiscal-autonomo-2026-2027', 'factura-simplificada',
    'verifactu', 'modelo-111', 'modelo-115', 'como-hacer-una-factura', 'gastos-deducibles-autonomo',
    'calendario-fiscal-sociedad-2026-2027', 'impuesto-sociedades-200-202', 'retenciones-111-115-190-180', 'cuentas-anuales-sociedad']);
  assert.match(REVISION_GUIAS, /^2026-10-\d\d$/);
  assert.ok(GUIAS.every((g) => !g.revision || g.revision >= REVISION_GUIAS), 'una guía no puede revisarse antes que el conjunto');
  // Cada guía en un grupo del índice, y ningún grupo vacío: tantas de pymes como de autónomos, como mínimo.
  const de = (p) => GUIAS.filter((g) => g.para === p).length;
  assert.ok(GUIAS.every((g) => PUBLICOS.some(([id]) => id === g.para)));
  assert.ok(de('pymes') >= de('autonomos') && de('todos') > 0);
  const CONOCIDOS = ['p', 'ul', 'ol', 'pasos', 'nota', 'tabla', 'ejemplo', 'plazos', 'anuales', 'calendarioSociedad'];
  for (const g of GUIAS) {
    assert.ok(g.normas.length >= 2 && g.faqs.length >= 2 && g.cta.titulo && g.cta.sub, g.slug);
    assert.ok(g.descripcion.length <= 160, `${g.slug}: descripción larga (${g.descripcion.length})`);
    assert.equal(new Set(g.secciones.map((s) => s.id)).size, g.secciones.length, `${g.slug}: ids repetidos`);
    for (const r of g.relacionadas) assert.ok(guia(r) && r !== g.slug, `${g.slug} → ${r}`);
    for (const s of g.secciones) for (const b of s.bloques) assert.ok(CONOCIDOS.some((k) => k in b), `${g.slug}/${s.id}: bloque desconocido`);
  }
  const todo = JSON.stringify(GUIAS);
  // Lo que el encargo dice sobre Verifactu, sin darlo por hecho lo que no está en el BOE.
  assert.match(todo, /Real Decreto-ley 15\/2025/);
  assert.match(todo, /1 de enero de 2027/);
  assert.match(todo, /1 de julio de 2027/);
  assert.match(todo, /5 de octubre de 2026/);
  assert.match(todo, /no estaba publicado en el BOE/);
  assert.match(todo, /Real Decreto 1619\/2012/);
});

test('calendario de la sociedad: las fechas de la app, con el 111 del 4T el 20 de enero, el 202, el 200 y el Registro', async () => {
  const f = Object.fromEntries((await calendarioSociedad(2027)).map((p) => [p.fecha, p]));
  assert.match(f['2027-01-20'].texto, /^111 y 115 del 4T$/);
  assert.match(f['2027-02-01'].texto, /303 y 349 del 4T y 390; 190 y 180/); // el 30 y el 31 de enero de 2027 son fin de semana
  assert.match(f['2027-04-20'].texto, /202$/);
  assert.match(f['2027-12-20'].texto, /^202$/);
  assert.match(f['2027-07-26'].texto, /^200/); // el 25 de julio de 2027 es domingo
  assert.ok(f['2027-07-26'].domicilia < '2027-07-26');
  assert.equal(f['2027-03-31'].texto, 'formular las cuentas anuales del año anterior (los administradores)');
  assert.equal(f['2027-06-30'].texto, 'aprobar las cuentas anuales en junta de socios');
  assert.equal(f['2027-07-30'].domicilia, null);
  assert.ok(!Object.values(f).some((p) => /130|la renta/.test(p.texto)), 'una sociedad no presenta el 130 ni la renta');
});

test('calendario: último día hábil, domiciliación y resúmenes anuales de 2026 y 2027', () => {
  const t = (a, n) => plazoTrimestre(a, n);
  assert.deepEqual([t(2026, 1).fin, t(2026, 2).fin, t(2026, 3).fin], ['2026-04-20', '2026-07-20', '2026-10-20']);
  assert.deepEqual([t(2026, 1).domicilia, t(2026, 3).domicilia, t(2026, 4).domicilia], ['2026-04-15', '2026-10-15', '2027-01-27']);
  // El 30 de enero de 2027 es sábado: pasa al lunes 1 de febrero. El 30 de enero de 2028 es domingo: lunes 31.
  assert.deepEqual([t(2026, 4).limite, t(2026, 4).fin, t(2026, 4).trasladado], ['2027-01-30', '2027-02-01', true]);
  assert.deepEqual([t(2027, 4).fin, t(2027, 4).domicilia], ['2028-01-31', '2028-01-26']);
  assert.deepEqual([t(2027, 1).fin, t(2027, 2).fin, t(2027, 3).fin], ['2027-04-20', '2027-07-20', '2027-10-20']);
  assert.deepEqual(plazosAnuales(2026).map((p) => [p.modelo, p.fin]), [['390', '2027-02-01'], ['190', '2027-02-01'], ['180', '2027-02-01'], ['347', '2027-03-01']]);
  assert.equal(siguienteHabil('2026-10-12'), '2026-10-13'); // Fiesta Nacional
  assert.equal(siguienteHabil('2027-01-06'), '2027-01-07'); // Reyes
  assert.equal(siguienteHabil('2027-03-26'), '2027-03-29'); // Viernes Santo y fin de semana
});

test('metadatos: título absoluto con la marca, canónica con el dominio y JSON-LD que no cierra el script', () => {
  const m = metaPagina({ titulo: 'Guías', descripcion: 'Texto', ruta: '/guias' });
  assert.deepEqual([m.title.absolute, m.alternates.canonical, m.description], ['Guías · Fisquo', 'https://www.fisquo.com/guias', 'Texto']);
  assert.equal(m.openGraph, undefined, 'definir openGraph haría perder la imagen de opengraph-image');
  assert.ok(!jsonLd({ a: '</script><script>alert(1)' }).includes('</script>'));
});

// Ficheros de presentación que faltaban: 123, 193 (capital mobiliario), 216 (no residentes) y 232 (vinculadas).
// Se comprueban contra el diseño de registro oficial: longitudes exactas, posiciones de cada campo y los errores que
// tienen que saltar cuando falta un dato que la AEAT exige y Fisquo no puede inventar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fichero123, fichero216 } from '../lib/ficheroAeat.js';
import { fichero193 } from '../lib/ficherosInformativas.js';
import { fichero232 } from '../lib/ficheroVinculadas.js';

const YO = { nif: 'B00000000', nombre: 'AURORA PRODUCCIONES S.L.' };
const CONTACTO = { ...YO, telefono: '600111222', contacto: 'Ana Ruiz Soler', email: 'ana@aurora.test' };
// El cuerpo del sobre <T...>: lo que va entre </AUX> y la etiqueta de cierre.
const cuerpo = (contenido) => contenido.slice(contenido.indexOf('</AUX>') + 6, -18);
// Un campo por su posición del diseño (que empieza en 1) y su longitud.
const campo = (registro, pos, lon) => registro.slice(pos - 1, pos - 1 + lon);

test('123: la página tiene 600 posiciones y las casillas van donde dice DR123e24', () => {
  const c = { '01': 2, '02': 1, '03': 3, '04': 10000, '05': 5000, '06': 15000, '07': 1900, '08': 950, '09': 2850, '12': 2850, '14': 2850 };
  const r = fichero123(YO, 2026, 4, c);
  const p = cuerpo(r.contenido);
  assert.equal(p.length, 600);
  assert.equal(campo(p, 1, 11), '<T12301000>');
  assert.equal(campo(p, 13, 1), 'I');
  assert.equal(campo(p, 14, 9), 'B00000000');
  assert.equal(campo(p, 23, 80).trim(), 'AURORA PRODUCCIONES S L');
  assert.equal(campo(p, 103, 4), '2026');
  assert.equal(campo(p, 107, 2), '4T');
  assert.equal(campo(p, 109, 15), '000000000000002', 'casilla 01, número de pagos de dividendos');
  assert.equal(campo(p, 139, 15), '000000000000003', 'casilla 03, total de pagos');
  assert.equal(campo(p, 154, 17), '00000000001000000', 'casilla 04, base de dividendos');
  assert.equal(campo(p, 239, 17), '00000000000285000', 'casilla 09, total de retenciones');
  assert.equal(campo(p, 324, 17), '00000000000285000', 'casilla 14, resultado a ingresar');
  assert.equal(campo(p, 589, 12), '</T12301000>');
  assert.equal(r.resultado, 2850);
  // El sobre lleva el modelo, el ejercicio y el periodo, y cierra con la misma etiqueta.
  assert.ok(r.contenido.startsWith('<T123020264T0000><AUX>'), r.contenido.slice(0, 30));
  assert.ok(r.contenido.endsWith('</T123020264T0000>'), r.contenido.slice(-20));
});

test('123: sin retenciones la declaración es negativa', () => {
  const c = { '01': 0, '02': 0, '03': 0, '04': 0, '05': 0, '06': 0, '07': 0, '08': 0, '09': 0, '12': 0, '14': 0 };
  const r = fichero123(YO, 2026, 1, c);
  assert.equal(r.tipo, 'N');
  assert.equal(campo(cuerpo(r.contenido), 13, 1), 'N');
});

test('216: 600 posiciones, los números de rentas son enteros y las bases, céntimos', () => {
  const c = Object.fromEntries(['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'].map((k) => [k, 0]));
  Object.assign(c, { '06': 2, '07': 2, '09': 8000, '10': 8000, '12': 1520, '13': 1520, '15': 1, '16': 1, '18': 3000, '19': 3000, '21': 1520 });
  const r = fichero216(YO, 2026, 2, { c });
  const p = cuerpo(r.contenido);
  assert.equal(p.length, 600);
  assert.equal(campo(p, 1, 11), '<T21601000>');
  assert.equal(campo(p, 107, 2), '2T');
  assert.equal(campo(p, 126, 17), '00000000000000002', 'casilla 06, número de rentas: entero, no céntimos');
  assert.equal(campo(p, 177, 17), '00000000000800000', 'casilla 09, base: en céntimos');
  assert.equal(campo(p, 245, 17), '00000000000152000', 'casilla 13, retenciones');
  assert.equal(campo(p, 296, 17), '00000000000000001', 'casilla 16, rentas sin retención');
  assert.equal(campo(p, 347, 17), '00000000000300000', 'casilla 19, base sin retención');
  assert.equal(campo(p, 381, 17), '00000000000152000', 'casilla 21, a ingresar');
  assert.equal(campo(p, 589, 12), '</T21601000>');
});

const PERCEPTORES_193 = [
  { nif: '00000007F', nombre: 'Laura Puig Ferrer', clave: 'A', naturaleza: '02', base: 12000, retenciones: 2280, provincia: '08' },
  { nif: 'B00000026', nombre: 'Agencia Brisa Incentivos S.L.', clave: 'B', naturaleza: '03', base: 4000, retenciones: 760, provincia: '28' },
];

test('193: registros de 500 bytes y campos del emisor en las claves A, B y D', () => {
  const r = fichero193(CONTACTO, 2026, { perceptores: PERCEPTORES_193 });
  const [tipo1, ...detalles] = r.contenido.split('\r\n');
  assert.equal(detalles.length, 2);
  for (const l of [tipo1, ...detalles]) assert.equal(l.length, 500);

  // Tipo 1: totales del declarante.
  assert.equal(campo(tipo1, 1, 1), '1');
  assert.equal(campo(tipo1, 2, 3), '193');
  assert.equal(campo(tipo1, 136, 9), '000000002', 'número de perceptores');
  assert.equal(campo(tipo1, 145, 15), '000000001600000', 'base: 12.000 + 4.000');
  assert.equal(campo(tipo1, 160, 15), '000000000304000', 'retenciones: 2.280 + 760');
  assert.equal(campo(tipo1, 175, 15), '000000000304000', 'retenciones ingresadas: aquí, todas');

  // Tipo 2 del primer perceptor.
  const d = detalles[0];
  assert.equal(campo(d, 1, 1), '2');
  assert.equal(campo(d, 18, 9), '00000007F');
  assert.equal(campo(d, 36, 40).trim(), 'PUIG FERRER LAURA', 'persona física: apellidos delante');
  assert.equal(campo(d, 76, 1), ' ', 'perceptor mediador en blanco');
  assert.equal(campo(d, 77, 2), '08');
  assert.equal(campo(d, 79, 1), '1', 'clave código: el emisor tiene NIF');
  assert.equal(campo(d, 80, 12), 'B00000000   ', 'código emisor: el NIF del declarante');
  assert.equal(campo(d, 92, 1), 'A');
  assert.equal(campo(d, 93, 2), '02');
  assert.equal(campo(d, 95, 1), '1', 'pago: como emisor');
  assert.equal(campo(d, 96, 1), 'O', 'tipo código: otra identificación');
  assert.equal(campo(d, 122, 1), '1', 'percepción dineraria');
  assert.equal(campo(d, 123, 13), '0000001200000');
  assert.equal(campo(d, 136, 3), '   ', 'blancos entre el importe y las reducciones');
  assert.equal(campo(d, 139, 13), '0000000000000', 'sin reducciones');
  assert.equal(campo(d, 152, 13), '0000001200000', 'base de retenciones');
  assert.equal(campo(d, 165, 4), '1900', 'el 19 % se escribe 1900');
  assert.equal(campo(d, 169, 13), '0000000228000');
});

test('193: el porcentaje es el último aplicado en el año, no la media de las retenciones', () => {
  // Diseño del 193, posiciones 165-168: «Si se hubiera aplicado más de un porcentaje a lo largo del año, se indicará
  // exclusivamente el último de ellos»; las retenciones (169-181) son el importe total, así que los dos campos no
  // tienen por qué reproducirse entre sí.
  const r = fichero193(CONTACTO, 2026, { perceptores: [{ ...PERCEPTORES_193[0], base: 10000, retenciones: 1700, pct: 15 }] });
  const d = r.contenido.split('\r\n')[1];
  assert.equal(campo(d, 165, 4), '1500');
  assert.equal(campo(d, 169, 13), '0000000170000');
  // Con decimales, dos enteros y dos decimales.
  assert.equal(campo(fichero193(CONTACTO, 2026, { perceptores: [{ ...PERCEPTORES_193[0], pct: 7.6 }] }).contenido.split('\r\n')[1], 165, 4), '0760');
  // Sin porcentaje guardado (pagos de antes de que se anotara), el general del capital mobiliario.
  const { pct, ...sinPct } = { ...PERCEPTORES_193[0], pct: 19 };
  assert.equal(campo(fichero193(CONTACTO, 2026, { perceptores: [sinPct] }).contenido.split('\r\n')[1], 165, 4), '1900');
  assert.ok(pct);
});

test('193: el porcentaje que el diseño fija para una naturaleza no se contradice en silencio', () => {
  // La 06 y la 08 van al 24 %, la 01 al 15 % y la 15 al 7 %: si el pago lleva otro, el fichero lo dice.
  const c = (naturaleza, pct) => ({ ...PERCEPTORES_193[0], clave: 'C', naturaleza, pct, retenciones: 2280 });
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: [c('06', 19)] }), /exige el 24 %/);
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: [c('01', 19)] }), /exige el 15 %/);
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: [c('15', 19)] }), /exige el 7 %/);
  assert.equal(campo(fichero193(CONTACTO, 2026, { perceptores: [c('06', 24)] }).contenido.split('\r\n')[1], 165, 4), '2400');
  // Las naturalezas sin porcentaje fijo admiten el que lleve el pago.
  assert.equal(campo(fichero193(CONTACTO, 2026, { perceptores: [c('12', 19)] }).contenido.split('\r\n')[1], 165, 4), '1900');
});

test('193: avisa de lo que la AEAT exige y Fisquo no tiene', () => {
  const sinProvincia = [{ ...PERCEPTORES_193[0], provincia: '' }];
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: sinProvincia }), /código postal/);
  const claveMala = [{ ...PERCEPTORES_193[0], clave: 'Z' }];
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: claveMala }), /Clave del 193/);
  const negativo = [{ ...PERCEPTORES_193[0], base: -100 }];
  assert.throws(() => fichero193(CONTACTO, 2026, { perceptores: negativo }), /negativos/);
});

const DOMICILIOS = new Map([['B00000026', '08006 Barcelona'], ['00000007F', '08014 Barcelona']]);
const M232 = {
  obligado: true,
  cuadroII: null,
  filas: [
    { tipo: 'servicios', lado: 'P', importe: 300000, nombre: 'Agencia Brisa Incentivos S.L.', nif: 'B00000026', pais: '', letra: 'd' },
    { tipo: 'alquileres', lado: 'P', importe: 24000, nombre: 'Laura Puig Ferrer', nif: '00000007F', pais: '', letra: 'a' },
  ],
  paraisos: [{ nombre: 'Offshore Services Ltd', nif: '', pais: 'KY', lado: 'P', importe: 15000 }],
};

test('232: página 01 de 1.500 y página 02 de 3.500, con los cuadros donde dice dr232e17v14', () => {
  const r = fichero232(YO, 2026, M232, { domicilios: DOMICILIOS });
  const c = cuerpo(r.contenido);
  assert.equal(r.paginas, 2);
  assert.equal(c.length, 5000);
  const [p1, p2] = [c.slice(0, 1500), c.slice(1500)];

  assert.equal(campo(p1, 1, 11), '<T23201000>');
  assert.equal(campo(p1, 12, 1), ' ', 'la primera página no es complementaria');
  assert.equal(campo(p1, 14, 9), 'B00000000');
  assert.equal(campo(p1, 103, 4), '2026');
  assert.equal(campo(p1, 107, 2), '0A');
  assert.equal(campo(p1, 109, 1), '1', 'ejercicio de 12 meses dentro del año natural');
  assert.equal(campo(p1, 110, 8), '01012026');
  assert.equal(campo(p1, 118, 8), '31122026');
  assert.equal(campo(p1, 126, 4), '0000', 'el CNAE se elige en la Sede');
  assert.equal(campo(p1, 1489, 12), '</T23201000>');

  // Cuadro I, primer registro (121 posiciones desde la 144).
  assert.equal(campo(p1, 144, 15), 'B00000026      ');
  assert.equal(campo(p1, 159, 1), 'J', 'persona jurídica');
  assert.equal(campo(p1, 160, 60).trim(), 'AGENCIA BRISA INCENTIVOS S L');
  assert.equal(campo(p1, 240, 1), 'D', 'tabla A: sociedad del mismo grupo');
  assert.equal(campo(p1, 241, 2), '08', 'provincia del domicilio');
  assert.equal(campo(p1, 243, 2), '06', 'tabla C: servicios entre vinculadas');
  assert.equal(campo(p1, 245, 1), 'P');
  assert.equal(campo(p1, 246, 2), '  ', 'método de valoración: en blanco, se elige en la Sede');
  assert.equal(campo(p1, 248, 17), '00000000030000000');
  // Segundo registro, 121 posiciones más allá.
  assert.equal(campo(p1, 265, 15), '00000007F      ');
  assert.equal(campo(p1, 280, 1), 'F', 'persona física');
  assert.equal(campo(p1, 361, 1), 'A', 'tabla A: socio o partícipe');
  assert.equal(campo(p1, 364, 2), '08', 'tabla C: alquileres');
  // Cuadro II vacío: sin NIF en su primer hueco.
  assert.equal(campo(p1, 824, 15).trim(), '');

  // Página 02: cuadro III.
  assert.equal(campo(p2, 1, 11), '<T23202000>');
  assert.equal(campo(p2, 13, 50).trim(), 'PAGOS POR COMPRAS Y SERVICIOS');
  assert.equal(campo(p2, 63, 60).trim(), 'OFFSHORE SERVICES LTD');
  assert.equal(campo(p2, 143, 1), 'O', 'sin NIF español no se sabe si es física o jurídica');
  assert.equal(campo(p2, 144, 2), 'KY');
  assert.equal(campo(p2, 146, 17), '00000000001500000');
  assert.equal(campo(p2, 1813, 1), ' ', 'la tenencia de valores no se calcula');
  assert.equal(campo(p2, 3489, 12), '</T23202000>');
});

test('232: más de cinco vinculadas abren una página complementaria', () => {
  const filas = Array.from({ length: 7 }, (_, i) => ({ ...M232.filas[0], importe: 1000 * (i + 1) }));
  const r = fichero232(YO, 2026, { ...M232, filas, paraisos: [] }, { domicilios: DOMICILIOS });
  const c = cuerpo(r.contenido);
  assert.equal(r.paginas, 2);
  assert.equal(c.length, 3000);
  assert.equal(campo(c.slice(0, 1500), 12, 1), ' ');
  assert.equal(campo(c.slice(1500), 12, 1), 'C', 'la segunda página va marcada como complementaria');
  // El sexto registro es el primero de la segunda página: su importe va en la 248 (144 + 104).
  assert.equal(campo(c.slice(1500), 248, 17), '00000000000600000');
});

test('232: más de doce operaciones con paraísos abren otra página 02', () => {
  const paraisos = Array.from({ length: 13 }, (_, i) => ({ ...M232.paraisos[0], importe: 100 * (i + 1) }));
  const r = fichero232(YO, 2026, { ...M232, paraisos }, { domicilios: DOMICILIOS });
  assert.equal(r.paginas, 3, 'una página 01 y dos páginas 02');
  assert.equal(cuerpo(r.contenido).length, 1500 + 3500 * 2);
});

test('232: no inventa lo que no sabe', () => {
  assert.throws(() => fichero232(YO, 2026, { ...M232, obligado: false }, { domicilios: DOMICILIOS }), /no hay obligación/i);
  const otra = { ...M232, filas: [{ ...M232.filas[0], letra: '' }] };
  assert.throws(() => fichero232(YO, 2026, otra, { domicilios: DOMICILIOS }), /vinculación concreta/);
  assert.throws(() => fichero232(YO, 2026, M232, { domicilios: new Map() }), /código postal/);
  const tipoRaro = { ...M232, filas: [{ ...M232.filas[0], tipo: 'otra cosa' }] };
  assert.throws(() => fichero232(YO, 2026, tipoRaro, { domicilios: DOMICILIOS }), /Tipo de operación/);
});

test('232: una contraparte de fuera lleva su país donde iría la provincia', () => {
  const fuera = { ...M232, paraisos: [], filas: [{ ...M232.filas[0], nif: 'FR12345678901', pais: 'FR' }] };
  const p1 = cuerpo(fichero232(YO, 2026, fuera, { domicilios: new Map() }).contenido);
  assert.equal(campo(p1, 241, 2), 'FR');
  assert.equal(campo(p1, 159, 1), 'O', 'un NIF que no es español no decide la personalidad');
});

test('232: una sociedad constituida ese año declara su periodo real', () => {
  const r = fichero232(YO, 2026, { ...M232, paraisos: [] }, { domicilios: DOMICILIOS, constitucion: '2026-04-15' });
  const p1 = cuerpo(r.contenido);
  assert.equal(campo(p1, 109, 1), '3', 'ejercicio inferior a 12 meses');
  assert.equal(campo(p1, 110, 8), '15042026');
  assert.equal(campo(p1, 118, 8), '31122026');
});

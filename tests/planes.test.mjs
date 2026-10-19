import test from 'node:test';
import assert from 'node:assert/strict';
import { escrituraLibre, importe, limitesDe, sinFuncion, sinHueco, soloLectura } from '../lib/planes.js';
import { claveDePrecio, planTrasSuscripcion } from '../lib/suscripcion.js';

const HOY = new Date('2026-03-15T12:00:00.000Z');
const prueba = (tipo, nombre, hasta = '2026-03-20') => ({ tipo, nombre, hasta });

test('importe: mensual el de la web y anual 12 meses con el 30 % de descuento, en céntimos', () => {
  assert.equal(importe('aut', 'Pro', 'mes'), 1200);
  assert.equal(importe('aut', 'Pro', 'anio'), 10080);
  assert.equal(importe('gra', 'Plus', 'anio'), 92400);
  assert.equal(importe('aut', 'Pro', 'semana'), null);
  assert.equal(importe('aut', 'Oro', 'mes'), null);
});

test('la clave del precio cambia si cambia el importe', () => {
  assert.equal(claveDePrecio('aut', 'Pro', 'anio'), 'netto_aut_pro_anio_10080');
});

test('en la prueba, lo máximo de su tipo; pagado, lo de su plan; sin plan, sin límites', () => {
  assert.equal(limitesDe(prueba('aut', 'Esencial')).plan, 'Plus');
  assert.equal(sinFuncion(prueba('aut', 'Esencial'), 'nominas'), null);
  assert.match(sinFuncion({ ...prueba('aut', 'Esencial'), pagado: true }, 'asistente'), /plan Esencial/);
  assert.equal(sinFuncion({ ...prueba('aut', 'Pro'), pagado: true }, 'asistente'), null);
  assert.match(sinFuncion({ ...prueba('aut', 'Pro'), pagado: true }, 'nominas'), /nóminas/);
  assert.equal(sinFuncion({ ...prueba('pym', 'Esencial'), pagado: true }, 'nominas'), null);
  assert.equal(limitesDe(null), null);
  assert.equal(sinFuncion(undefined, 'asistente'), null);
});

test('usuarios y empleados: cabe uno más hasta el límite', () => {
  const pyme = { ...prueba('pym', 'Esencial'), pagado: true };
  assert.equal(sinHueco(pyme, 'usuarios', 2), null);
  assert.match(sinHueco(pyme, 'usuarios', 3), /admite 3 usuarios/);
  assert.match(sinHueco({ ...prueba('aut', 'Pro'), pagado: true }, 'empleados', 0), /nóminas no van/);
  assert.equal(sinHueco({ ...prueba('gra', 'Plus'), pagado: true }, 'usuarios', 10000), null);
  assert.equal(sinHueco(null, 'usuarios', 99), null);
});

test('solo lectura: prueba acabada sin pagar; nunca con pago ni sin plan', () => {
  assert.equal(soloLectura(prueba('aut', 'Pro', '2026-03-14'), HOY), true);
  assert.equal(soloLectura(prueba('aut', 'Pro', '2026-03-15'), HOY), false);
  assert.equal(soloLectura({ ...prueba('aut', 'Pro', '2026-01-01'), pagado: true }, HOY), false);
  assert.equal(soloLectura(null, HOY), false);
});

test('en solo lectura se puede pagar, salir y cambiar de empresa, pero no escribir datos', () => {
  for (const r of ['/api/suscripcion', '/api/logout', '/api/empresas', '/api/bloqueo']) assert.equal(escrituraLibre(r), true, r);
  for (const r of ['/api/cuenta', '/api/facturas', '/api/gastos', '/api/suscripciones-falsas', '/api/stripe']) assert.equal(escrituraLibre(r), false, r);
});

test('suscripción viva: pagado con su plan; cancelada o impagada: solo lectura desde hoy', () => {
  const antes = prueba('aut', 'Esencial', '2026-04-10');
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'trialing', metadata: { empresa: 'e1', tipo: 'aut', nombre: 'Pro', periodo: 'anio' } };
  const viva = planTrasSuscripcion(antes, sub, HOY);
  assert.deepEqual(viva, { tipo: 'aut', nombre: 'Pro', hasta: '2026-04-10', periodo: 'anio', cliente: 'cus_1', suscripcion: 'sub_1', estado: 'trialing', pagado: true });
  assert.equal(soloLectura(viva, HOY), false);
  const baja = planTrasSuscripcion(viva, { ...sub, status: 'canceled' }, HOY);
  assert.equal(baja.pagado, false);
  assert.equal(baja.hasta, '2026-03-14');
  assert.equal(soloLectura(baja, HOY), true);
  assert.equal(planTrasSuscripcion(viva, { ...sub, status: 'past_due' }, HOY).pagado, true);
  // Metadatos raros: se queda el plan que tenía.
  assert.equal(planTrasSuscripcion(antes, { ...sub, metadata: { tipo: 'aut', nombre: 'Oro' } }, HOY).nombre, 'Esencial');
});

test('perderia: lo usado en la prueba que no entra en su plan, y el plan más barato que lo cubre', async () => {
  const { perderia, planQueLoIncluye } = await import('../lib/planes.js');
  const esencial = { tipo: 'aut', nombre: 'Esencial', hasta: '2026-03-20' };
  const uso = { asistente: '2', conciliacion: '14' };
  assert.deepEqual(perderia(esencial, uso, { usuarios: 1 }).map((x) => x.texto), ['La conciliación automática (14 movimientos conciliados)', 'El asistente IA (2 preguntas)']);
  assert.equal(planQueLoIncluye(esencial, uso, { usuarios: 1 }).n, 'Pro');
  assert.equal(planQueLoIncluye(esencial, { ...uso, nominas: 1 }, { usuarios: 1, empleados: 1 }).n, 'Plus');
  assert.equal(planQueLoIncluye({ ...esencial, nombre: 'Pro' }, uso, { usuarios: 2 }), null);
  const pyme = { tipo: 'pym', nombre: 'Esencial' };
  assert.equal(planQueLoIncluye(pyme, {}, { usuarios: 5, empleados: 2 }).n, 'Pro');
  assert.equal(planQueLoIncluye({ tipo: 'gra', nombre: 'Esencial' }, {}, { empleados: 900 }), null);
});

test('avisos a 7, 3, el último día y al acabar; el texto dice lo que perdería', async () => {
  const { avisoDelDia, textoAviso } = await import('../lib/planes.js');
  assert.deepEqual([8, 7, 4, 3, 2, 1, 0, null].map(avisoDelDia), [null, 'semana', null, 'tres', null, 'ultimo', 'fin', null]);
  const plan = { tipo: 'aut', nombre: 'Esencial' };
  const t = textoAviso({ aviso: 'tres', plan, nombre: 'Ana López', hasta: '20 de marzo', perdidas: [{ texto: 'El asistente IA (2 preguntas)' }], recomendado: { n: 'Pro', p: 12 }, enlace: 'https://x/ajustes/plan?contratar=1' });
  assert.equal(t.asunto, 'Tu prueba de Netto acaba dentro de 3 días');
  assert.match(t.mensaje, /Hola Ana,/);
  assert.match(t.mensaje, /· El asistente IA \(2 preguntas\)/);
  assert.match(t.mensaje, /plan Pro \(12 €\/mes \+ IVA\)/);
  assert.match(t.mensaje, /no se te cobra nada/);
  const fin = textoAviso({ aviso: 'fin', plan, hasta: '20 de marzo', enlace: 'e' });
  assert.match(fin.mensaje, /No se ha borrado nada/);
  assert.doesNotMatch(fin.mensaje, /no se te cobra/);
});

test('plan Fundador: sin plan o con plan.fundador, gratis de por vida, sin prueba, límites ni solo lectura', async () => {
  const { diasPrueba, esFundador } = await import('../lib/prueba.js');
  const { perderia } = await import('../lib/planes.js');
  const regalado = { ...prueba('aut', 'Esencial', '2026-01-01'), fundador: true };
  assert.equal(esFundador(null), true);
  assert.equal(esFundador(regalado), true);
  assert.equal(esFundador(prueba('aut', 'Pro')), false);
  assert.equal(diasPrueba(regalado, HOY), null);
  assert.equal(soloLectura(regalado, HOY), false);
  assert.equal(limitesDe(regalado), null);
  assert.equal(sinFuncion(regalado, 'nominas'), null);
  assert.equal(sinHueco(regalado, 'usuarios', 99), null);
  assert.deepEqual(perderia(regalado, { nominas: 3 }, { usuarios: 9 }), []);
  assert.equal(soloLectura(prueba('aut', 'Esencial', '2026-01-01'), HOY), true);
});

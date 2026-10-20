import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCIONES, limitesDe, planQueLoIncluye, sinFuncion } from '../lib/planes.js';
import { nuevoPlan } from '../lib/prueba.js';
import { PLANES } from '../components/web/datos.js';

const pagado = (tipo, nombre) => ({ ...nuevoPlan(tipo, nombre), pagado: true });
const todas = Object.keys(FUNCIONES);
const AUT_PRO = ['conciliacion', 'revision', 'cartera', 'tesoreria', 'asistente', 'inventario', 'albaranes', 'analisis'];

test('versión 3: reparto de módulos y capacidad de los seis planes', () => {
  const matriz = {
    aut: { Esencial: [1, 0, []], Pro: [1, 0, AUT_PRO], Plus: [2, 1, [...AUT_PRO, 'proyectos', 'nominas']] },
    pym: { Esencial: [2, 3, ['conciliacion', 'revision', 'nominas']], Pro: [8, 15, todas], Plus: [15, 30, todas] },
  };
  for (const [tipo, planes] of Object.entries(matriz)) for (const [nombre, [usuarios, empleados, funciones]] of Object.entries(planes)) {
    const plan = pagado(tipo, nombre), l = limitesDe(plan);
    assert.equal(plan.version, 3);
    assert.equal(l.usuarios, usuarios, `${tipo} ${nombre}: usuarios`);
    assert.equal(l.empleados, empleados, `${tipo} ${nombre}: empleados`);
    for (const f of todas) assert.equal(sinFuncion(plan, f) === null, funciones.includes(f), `${tipo} ${nombre}: ${f}`);
  }
});

test('ningún plan de autónomo tiene remesas SEPA', () => {
  for (const { n } of PLANES.aut) assert.ok(sinFuncion(pagado('aut', n), 'remesas'), n);
});

test('Pyme Pro incluye todo lo de Autónomo Plus y cuesta más', () => {
  const autPlus = limitesDe(pagado('aut', 'Plus')), pymPro = limitesDe(pagado('pym', 'Pro'));
  for (const f of autPlus.funciones) assert.ok(pymPro.funciones.includes(f), f);
  assert.ok(pymPro.usuarios >= autPlus.usuarios && pymPro.empleados >= autPlus.empleados);
  const precio = (tipo, n) => PLANES[tipo].find((p) => p.n === n).p;
  assert.ok(precio('pym', 'Pro') > precio('aut', 'Plus'));
  assert.ok(precio('pym', 'Pro') - precio('pym', 'Esencial') < 10);
});

test('cada plan incluye todo lo del anterior de su tipo', () => {
  for (const tipo of ['aut', 'pym']) for (let i = 1; i < PLANES[tipo].length; i++) {
    const antes = limitesDe(pagado(tipo, PLANES[tipo][i - 1].n)), ahora = limitesDe(pagado(tipo, PLANES[tipo][i].n));
    for (const f of antes.funciones) assert.ok(ahora.funciones.includes(f), `${tipo} ${ahora.plan}: ${f}`);
    assert.ok(ahora.usuarios >= antes.usuarios && ahora.empleados >= antes.empleados);
  }
});

test('la prueba es el Plus de su tipo y el aviso recomienda el plan que lo cubre', () => {
  assert.equal(sinFuncion(nuevoPlan('aut', 'Esencial'), 'proyectos'), null);
  assert.ok(sinFuncion(nuevoPlan('aut', 'Esencial'), 'remesas'));
  assert.equal(planQueLoIncluye(nuevoPlan('aut', 'Esencial'), { conciliacion: 3, asistente: 1 }).n, 'Pro');
  assert.equal(planQueLoIncluye(nuevoPlan('aut', 'Esencial'), { proyectos: 1 }).n, 'Plus');
  assert.equal(planQueLoIncluye(nuevoPlan('pym', 'Esencial'), { tesoreria: 1 }).n, 'Pro');
  assert.equal(planQueLoIncluye(nuevoPlan('pym', 'Esencial'), { conciliacion: 5, nominas: 2 }), null);
});

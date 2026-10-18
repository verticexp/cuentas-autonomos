import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCIONES, limitesDe, perderia, planQueLoIncluye, plazasDe, sinFuncion, sinHueco, sinPlaza, funcionDeRuta } from '../lib/planes.js';
import { nuevoPlan } from '../lib/prueba.js';
import { PERFILES } from '../lib/permisos.js';
import { planTrasSuscripcion } from '../lib/suscripcion.js';

const pagado = (tipo, nombre) => ({ ...nuevoPlan(tipo, nombre), pagado: true });
const gestor = { id: 'g', rol: 'miembro', permisos: PERFILES.find((p) => p.id === 'gestoria').permisos };
const admin = { id: 'a', rol: 'admin' };
const empleado = { id: 'b', rol: 'miembro', permisos: ['facturas', 'facturar'] };

test('los seis planes nuevos cumplen el reparto de módulos y capacidad', () => {
  const matriz = {
    aut: { Esencial: [1, 0, []], Pro: [1, 0, Object.keys(FUNCIONES).filter((f) => f !== 'nominas')], Plus: [3, 2, Object.keys(FUNCIONES)] },
    pym: { Esencial: [3, 5, ['conciliacion', 'nominas']], Pro: [8, 15, Object.keys(FUNCIONES)], Plus: [15, 30, Object.keys(FUNCIONES)] },
  };
  for (const [tipo, planes] of Object.entries(matriz)) for (const [nombre, [usuarios, empleados, funciones]] of Object.entries(planes)) {
    const plan = pagado(tipo, nombre), l = limitesDe(plan);
    assert.equal(l.usuarios, usuarios); assert.equal(l.empleados, empleados);
    for (const funcion of Object.keys(FUNCIONES)) assert.equal(sinFuncion(plan, funcion) === null, funciones.includes(funcion), `${tipo} ${nombre}: ${funcion}`);
    assert.equal(sinHueco(plan, 'usuarios', usuarios - 1), null);
    assert.ok(sinHueco(plan, 'usuarios', usuarios));
  }
});

test('las altas nuevas prueban Plus y Business no es contratable mediante registro', () => {
  for (const tipo of ['aut', 'pym']) {
    const plan = nuevoPlan(tipo, 'Esencial');
    assert.equal(plan.version, 2);
    for (const funcion of Object.keys(FUNCIONES)) assert.equal(sinFuncion(plan, funcion), null);
  }
  for (const tipo of ['gra', 'business', '__proto__', 'constructor']) assert.equal(nuevoPlan(tipo, 'Pro'), null);
});

test('una gestoría no consume plaza interna, pero sus permisos no permiten eludir el cupo', () => {
  const plan = pagado('aut', 'Pro');
  assert.deepEqual(plazasDe([admin, gestor]), { usuarios: 2, usuariosInternos: 1, gestorias: 1 });
  assert.equal(sinPlaza(plan, [admin], gestor), null);
  assert.match(sinPlaza(plan, [admin, gestor], empleado), /admite 1 usuarios/);
  assert.match(sinPlaza(plan, [admin, gestor], { ...gestor, id: 'g2' }), /admite 1 usuarios/);
  assert.match(sinPlaza(plan, [admin, gestor], { ...gestor, rol: 'admin' }, 'g'), /admite 1 usuarios/);
  assert.match(sinPlaza(plan, [admin, gestor], { ...gestor, permisos: [...gestor.permisos, 'facturar'] }, 'g'), /admite 1 usuarios/);
  assert.equal(sinPlaza(plan, [admin, gestor], gestor, 'g'), null);
  // Se permite corregir una cuenta que ya está por encima del cupo sin aumentar su uso.
  assert.equal(sinPlaza(plan, [admin, empleado, gestor], empleado, 'b'), null);
});

test('el aviso de fin de prueba cuenta usuarios internos y recomienda Pro por módulos reales', () => {
  const plan = nuevoPlan('aut', 'Esencial');
  assert.deepEqual(perderia(plan, {}, plazasDe([admin, gestor])), []);
  assert.equal(planQueLoIncluye(plan, { remesas: 1, albaranes: 2, proyectos: 1 }, plazasDe([admin, gestor])).n, 'Pro');
  assert.equal(planQueLoIncluye(plan, {}, plazasDe([admin, empleado, gestor])).n, 'Plus');
  assert.equal(planQueLoIncluye(nuevoPlan('pym', 'Esencial'), { tesoreria: 1, asistente: 1 }).n, 'Pro');
});

test('los contratos anteriores conservan módulos y capacidad tras avisos de Stripe', () => {
  const antiguo = { tipo: 'pym', nombre: 'Esencial', pagado: true };
  const sub = { id: 'sub_test', status: 'active', customer: 'cus_test', metadata: { tipo: 'pym', nombre: 'Esencial', periodo: 'mes' } };
  const actualizado = planTrasSuscripcion(antiguo, sub);
  for (const funcion of Object.keys(FUNCIONES)) assert.equal(sinFuncion(actualizado, funcion), null);
  assert.equal(limitesDe({ tipo: 'aut', nombre: 'Pro', pagado: true }).usuarios, 2);
  assert.equal(limitesDe({ tipo: 'gra', nombre: 'Plus', pagado: true }).usuarios, Infinity);
  const nuevo = planTrasSuscripcion(pagado('pym', 'Esencial'), sub);
  assert.equal(nuevo.version, 2);
  assert.ok(sinFuncion(nuevo, 'asistente'));
});

test('las rutas protegidas distinguen módulos, lecturas históricas y coincidencias parciales', () => {
  for (const [ruta, metodo, funcion] of [
    ['/api/remesas', 'POST', 'remesas'], ['/api/albaranes', 'POST', 'albaranes'], ['/api/albaranes', 'DELETE', 'albaranes'],
    ['/api/albaranes/pdf', 'GET', null], ['/albaranes/nuevo', 'GET', 'albaranes'], ['/albaranes/123', 'GET', null],
    ['/api/gastos/revision', 'POST', 'revision'], ['/api/jornada', 'PATCH', 'nominas'], ['/api/jornada/exportar', 'GET', null],
    ['/api/remesas-falso', 'POST', null], ['/api/exportar/todo', 'GET', null], ['/api/gastos', 'POST', null], ['/analisis?anio=2026', 'GET', 'analisis'],
  ]) assert.equal(funcionDeRuta(ruta, metodo), funcion, ruta);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cambioDePlan, estadoEmpresa, mensualDe, resumenAdmin } from '../lib/admin.js';

const HOY = new Date('2026-10-19T12:00:00Z');
const empresa = (id, plan, creada = '2026-10-01') => ({ id, nombre: id, creada: `${creada}T10:00:00Z`, emisor: { nif: 'X' }, plan });

test('estado de cada empresa: fundador, prueba, caducada, pago, impago y cancelada', () => {
  assert.equal(estadoEmpresa(empresa('a'), HOY), 'fundador');
  assert.equal(estadoEmpresa(empresa('b', { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-01', fundador: true }), HOY), 'fundador');
  assert.equal(estadoEmpresa(empresa('c', { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-01' }), HOY), 'prueba');
  assert.equal(estadoEmpresa(empresa('d', { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-01' }), HOY), 'caducada');
  assert.equal(estadoEmpresa(empresa('e', { tipo: 'aut', nombre: 'Pro', pagado: true, estado: 'active' }), HOY), 'pago');
  assert.equal(estadoEmpresa(empresa('f', { tipo: 'aut', nombre: 'Pro', pagado: true, estado: 'past_due' }), HOY), 'impago');
  assert.equal(estadoEmpresa(empresa('g', { tipo: 'aut', nombre: 'Pro', pagado: false, suscripcion: 'sub_1', hasta: '2026-10-10' }), HOY), 'cancelada');
});

test('ingresos al mes: el anual se reparte en 12; fundador y pruebas no cuentan', () => {
  assert.equal(mensualDe({ tipo: 'aut', nombre: 'Pro', periodo: 'mes' }), 1200);
  assert.equal(mensualDe({ tipo: 'aut', nombre: 'Pro', periodo: 'anio' }), 840);
  const r = resumenAdmin({
    hoy: HOY,
    empresas: [
      empresa('fund'),
      empresa('pago', { tipo: 'aut', nombre: 'Pro', periodo: 'mes', pagado: true, estado: 'active' }, '2026-08-01'),
      empresa('anual', { tipo: 'aut', nombre: 'Pro', periodo: 'anio', pagado: true, estado: 'active' }, '2026-08-01'),
      empresa('caduca', { tipo: 'aut', nombre: 'Pro', hasta: '2026-09-01' }, '2026-08-02'),
      empresa('prueba', { tipo: 'pym', nombre: 'Plus', hasta: '2026-10-22' }, '2026-10-17'),
      { ...empresa('baja', { tipo: 'aut', nombre: 'Pro', pagado: true, estado: 'active' }), baja: { fecha: '2026-10-01' } },
    ],
    usuarios: [{ id: 'u1', empresa: 'pago', emailVerificado: true }, { id: 'u2', empresa: 'pago' }, { id: 'u3', empresa: 'prueba' }],
    actividad: { '2026-10-18': { usuarios: ['u1'], empresas: ['pago'] }, '2026-10-19': { usuarios: ['u1', 'u3'], empresas: ['pago', 'prueba'] } },
  });
  assert.equal(r.kpis.empresas, 5);
  assert.equal(r.kpis.mrr, 2040);
  assert.equal(r.kpis.conversion, 67);
  assert.equal(r.kpis.altasMes, 1);
  assert.equal(r.kpis.activosHoy, 2);
  assert.equal(r.kpis.activos7, 2);
  assert.equal(r.kpis.verificados, 1);
  assert.equal(r.kpis.pruebasQueAcabanEn7, 1);
  assert.equal(r.porEstado.fundador, 1);
  assert.equal(r.filas.find((f) => f.id === 'pago').personas, 2);
  assert.equal(r.altas.length, 12);
  assert.equal(r.altas.at(-1).desde, '2026-10-19'); // hoy es lunes: la alta del sábado 17 va en la semana anterior
  assert.deepEqual(r.altas.slice(-2).map((a) => a.n), [1, 0]);
});

test('acciones del panel: regalar y quitar Fundador, alargar la prueba', () => {
  const prueba = empresa('p', { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-10' });
  const regalada = cambioDePlan(prueba, 'fundador', { hoy: HOY });
  assert.equal(regalada.plan.fundador, true);
  assert.equal(estadoEmpresa({ plan: regalada.plan }, HOY), 'fundador');
  const quitada = cambioDePlan({ plan: regalada.plan }, 'quitar-fundador', { hoy: HOY });
  assert.deepEqual(quitada.plan, prueba.plan);
  assert.match(cambioDePlan(empresa('vieja'), 'quitar-fundador').error, /anterior/);
  assert.match(cambioDePlan(empresa('s', { tipo: 'aut', nombre: 'Pro', pagado: true, suscripcion: 'sub_1' }), 'fundador').error, /Stripe/);
  // Caducada: se alarga desde ayer, así no regala días ya pasados.
  assert.equal(cambioDePlan(prueba, 'alargar', { dias: 7, hoy: HOY }).plan.hasta, '2026-10-25');
  assert.equal(cambioDePlan(empresa('q', { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-30' }), 'alargar', { dias: 15, hoy: HOY }).plan.hasta, '2026-11-14');
  assert.ok(cambioDePlan(prueba, 'alargar', { dias: 200, hoy: HOY }).error);
  assert.ok(cambioDePlan(prueba, 'borrar').error);
});

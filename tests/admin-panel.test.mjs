import test from 'node:test';
import assert from 'node:assert/strict';
import { cambioDePlan, estadoEmpresa, historialPagoTrasCambio, mensualDe, resumenAdmin } from '../lib/admin.js';

const HOY = new Date('2026-10-19T12:00:00Z');
const empresa = (id, plan, creada = '2026-10-01') => ({ id, nombre: id, creada: `${creada}T10:00:00Z`, emisor: { nif: 'X' }, plan });

const dePago = { tipo: 'aut', nombre: 'Pro', pagado: true, estado: 'active' };
const cambioPago = (fecha, antes, despues) => ({ fecha: `${fecha}T12:00:00.000Z`, antes, despues });

test('bajas: empresas que pagaban, incluidas las dadas de baja; base real del día 1, sin nuevas altas ni duplicados', () => {
  const empresas = [
    empresa('sigue', dePago, '2026-08-01'),
    { ...empresa('cancelada', { ...dePago, pagado: false }, '2026-08-01'), historialPagoAdmin: [cambioPago('2026-10-05', true, false)] },
    { ...empresa('baja', dePago, '2026-08-01'), baja: { fecha: '2026-10-08' }, historialPagoAdmin: [cambioPago('2026-10-08', true, false)] },
    { ...empresa('reactivada', dePago, '2026-08-01'), historialPagoAdmin: [cambioPago('2026-10-02', true, false), cambioPago('2026-10-03', false, true), cambioPago('2026-10-04', true, false), cambioPago('2026-10-05', false, true)] },
    // Se registró antes, pero solo empezó a pagar este mes: no pertenece a la base del día 1.
    { ...empresa('convertida', dePago, '2026-08-01'), historialPagoAdmin: [cambioPago('2026-10-03', false, true)] },
    empresa('alta-nueva', dePago, '2026-10-02'),
    { ...empresa('vieja-baja', dePago, '2026-07-01'), baja: { fecha: '2026-09-15' }, historialPagoAdmin: [cambioPago('2026-09-15', true, false)] },
    empresa('fundador', { ...dePago, fundador: true }, '2026-08-01'),
    empresa('prueba', { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-01' }, '2026-08-01'),
  ];
  const { kpis: k } = resumenAdmin({ empresas, hoy: HOY, bajasDesde: '2026-09-01T00:00:00.000Z' });
  assert.equal(k.bajasMes, 3);
  assert.equal(k.bajasPct, 75, '3 empresas distintas sobre las 4 que pagaban el día 1');
  assert.equal(k.bajasDesde, '2026-09-01');
});

test('bajas: sin historia no se inventan fechas; primer mes parcial y base cero dan porcentaje nulo', () => {
  const e = { ...empresa('baja', dePago, '2026-08-01'), baja: { fecha: '2026-10-02' } };
  const sinHistoria = resumenAdmin({ empresas: [e], hoy: HOY });
  assert.equal(sinHistoria.kpis.bajasMes, 0);
  assert.equal(sinHistoria.kpis.bajasDesde, null);
  assert.equal(sinHistoria.kpis.bajasPct, null);
  e.historialPagoAdmin = [cambioPago('2026-10-02', true, false), cambioPago('2026-11-01', true, false)];
  const parcial = resumenAdmin({ empresas: [e], hoy: HOY, bajasDesde: '2026-10-02T10:00:00.000Z' }).kpis;
  assert.equal(parcial.bajasMes, 1);
  assert.equal(parcial.bajasPct, null);
  assert.equal(parcial.bajasDesde, '2026-10-02');
  assert.equal(resumenAdmin({ hoy: HOY, bajasDesde: '2026-09-01T00:00:00.000Z' }).kpis.bajasPct, null);
  assert.equal(resumenAdmin({ empresas: [empresa('sigue', dePago, '2026-08-01')], hoy: HOY, bajasDesde: '2026-09-01T00:00:00.000Z' }).kpis.bajasPct, 0);
});

test('bajas: no cuenta pruebas de Stripe, Fundador ni licencias de gestoría; los reintentos de cobro no son bajas', () => {
  for (const plan of [undefined, { ...dePago, fundador: true }, { ...dePago, estado: 'trialing' }, { ...dePago, pagado: false }, { ...dePago, porDespacho: 'd1' }]) {
    const antes = empresa('e', plan), despues = { ...antes, baja: { fecha: HOY.toISOString() } };
    assert.deepEqual(historialPagoTrasCambio(antes, despues, HOY), []);
  }
  const antes = empresa('pago', dePago);
  assert.deepEqual(historialPagoTrasCambio(antes, { ...antes, plan: { ...dePago, estado: 'past_due' } }, HOY), []);
  const despues = { ...antes, plan: { ...dePago, pagado: false, estado: 'canceled' } };
  despues.historialPagoAdmin = historialPagoTrasCambio(antes, despues, HOY);
  assert.deepEqual(despues.historialPagoAdmin, [{ fecha: HOY.toISOString(), antes: true, despues: false }]);
  assert.deepEqual(historialPagoTrasCambio(despues, { ...despues, baja: { fecha: HOY.toISOString() } }, HOY), despues.historialPagoAdmin);
});

test('bajas: el cambio de mes respeta el límite exacto y no arrastra bajas del mes anterior', () => {
  const e = { ...empresa('baja', { ...dePago, pagado: false }, '2026-08-01'), historialPagoAdmin: [
    cambioPago('2026-09-30', true, false), cambioPago('2026-09-30', false, true),
    { fecha: '2026-10-01T00:00:00.000Z', antes: true, despues: false },
  ] };
  const octubre = resumenAdmin({ empresas: [e], hoy: HOY, bajasDesde: '2026-09-01T00:00:00.000Z' }).kpis;
  assert.equal(octubre.bajasMes, 1);
  assert.equal(octubre.bajasPct, 100);
  const noviembre = resumenAdmin({ empresas: [e], hoy: new Date('2026-11-02T12:00:00Z'), bajasDesde: '2026-09-01T00:00:00.000Z' }).kpis;
  assert.equal(noviembre.bajasMes, 0);
  assert.equal(noviembre.bajasPct, null);
});

test('bajas: una nueva conversión que se cancela cuenta en el total, pero no en el porcentaje de la base del día 1', () => {
  const empresas = [
    empresa('sigue', dePago, '2026-08-01'),
    { ...empresa('nueva', { ...dePago, pagado: false }, '2026-08-01'), historialPagoAdmin: [cambioPago('2026-10-03', false, true), cambioPago('2026-10-04', true, false)] },
  ];
  const { kpis: k } = resumenAdmin({ empresas, hoy: HOY, bajasDesde: '2026-09-01T00:00:00.000Z' });
  assert.equal(k.bajasMes, 1);
  assert.equal(k.bajasPct, 0);
  assert.equal(k.bajasMesParcial, false);
});

test('hoja del 16-11: semanas cerradas con límites exactos, sin duplicar bajas ni arrastrar las del lunes', () => {
  const empresas = [
    { ...empresa('baja', { ...dePago, pagado: false }, '2026-08-01'), historialPagoAdmin: [cambioPago('2026-11-09', true, false), cambioPago('2026-11-10', false, true), cambioPago('2026-11-11', true, false)] },
    { ...empresa('domingo', dePago, '2026-08-01'), baja: { fecha: '2026-11-15' }, historialPagoAdmin: [{ fecha: '2026-11-15T23:59:59.999Z', antes: true, despues: false }] },
    { ...empresa('lunes', { ...dePago, pagado: false }, '2026-08-01'), historialPagoAdmin: [{ fecha: '2026-11-16T00:00:00.000Z', antes: true, despues: false }] },
  ];
  const hoy = new Date('2026-11-16T08:00:00.000Z');
  const r = resumenAdmin({ empresas, hoy, bajasDesde: '2026-11-06T10:00:00.000Z' });
  assert.deepEqual(r.bajasSemanas.at(-2), { desde: '2026-11-09', hasta: '2026-11-16', n: 2, completa: true });
  assert.deepEqual(r.bajasSemanas.at(-1), { desde: '2026-11-16', hasta: '2026-11-23', n: 1, completa: false });
  assert.equal(r.bajasSemanas.at(-3).completa, false);
  assert.equal(r.kpis.bajasMes, 3);
  assert.equal(r.kpis.bajasMesParcial, true);
  const sinHistoria = resumenAdmin({ empresas, hoy });
  assert.ok(sinHistoria.bajasSemanas.every((s) => s.n === 0 && !s.completa));
  const parcial = resumenAdmin({ empresas, hoy, bajasDesde: '2026-11-11T10:00:00.000Z' });
  assert.deepEqual(parcial.bajasSemanas.at(-2), { desde: '2026-11-09', hasta: '2026-11-16', n: 2, completa: false });
});

test('altas de prueba: cerrar una cuenta no borra su alta; regalos, Fundador, despacho y fechas futuras no cuentan', () => {
  const prueba = { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-30' };
  const r = resumenAdmin({ hoy: HOY, empresas: [
    empresa('prueba', prueba, '2026-10-13'),
    { ...empresa('cerrada', prueba, '2026-10-14'), baja: { fecha: '2026-10-15' } },
    empresa('convertida', dePago, '2026-10-15'),
    empresa('fundador', undefined, '2026-10-16'),
    empresa('regalada', { ...prueba, fundador: true }, '2026-10-16'),
    empresa('licencia', { ...dePago, porDespacho: { id: 'd' } }, '2026-10-16'),
    empresa('despacho', { ...prueba, despacho: true }, '2026-10-16'),
    empresa('futura', prueba, '2026-10-20'),
  ] });
  assert.equal(r.kpis.altasMes, 3);
  assert.deepEqual(r.altas.slice(-2).map((s) => s.n), [3, 0]);
});

test('prueba de Stripe: acceso habilitado no significa ingresos ni conversión de pago', () => {
  const e = empresa('stripe', { ...dePago, estado: 'trialing' });
  assert.equal(estadoEmpresa(e, HOY), 'prueba');
  const r = resumenAdmin({ empresas: [e], hoy: HOY });
  assert.equal(r.kpis.mrr, 0);
  assert.equal(r.kpis.conversion, null);
  assert.equal(r.porEstado.pago, 0);
  assert.equal(r.porEstado.prueba, 1);
});

test('ingreso mensual sin IVA: descuentos vigentes, anual dividido entre doce y exclusión de gratis e impagos', () => {
  const empresas = [
    empresa('mensual', { ...dePago, descuento: { pct: 25, hasta: '2026-10-20' } }),
    empresa('anual', { ...dePago, periodo: 'anio', descuento: { cent: 1200 } }),
    empresa('gratis', { ...dePago, fundador: true }),
    empresa('impago', { ...dePago, estado: 'past_due' }),
    empresa('licencia', { ...dePago, porDespacho: { id: 'd' } }),
  ];
  const r = resumenAdmin({ empresas, hoy: HOY });
  assert.equal(r.kpis.mrr, 900 + 740);
  assert.equal(r.kpis.arr, 1640 * 12);
  assert.equal(mensualDe({ ...dePago, descuento: { pct: 25, hasta: '2026-10-18' } }, HOY), 1200);
});

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
  assert.equal(r.kpis.altasMes, 2, 'el alta de la empresa que se dio de baja se conserva');
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

test('planes que no cuadran: sociedad con plan de Autónomos por NIF, nombre o forma; Fundador y sin plan no cuentan', () => {
  const aut = { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-01' };
  const con = (id, extra, plan = aut) => ({ ...empresa(id, plan), emisor: { nif: '12345678Z', nombre: 'Ana Pérez' }, ...extra });
  const r = resumenAdmin({
    hoy: HOY,
    empresas: [
      con('bien', {}),
      con('nif', { emisor: { nif: 'B12345678', nombre: 'Ana Pérez' } }),
      con('nombre', { emisor: { nif: '12345678Z', nombre: 'Talleres Pérez, S.L.' } }),
      con('forma', { fiscal: { tipo: 'sociedad' } }),
      con('todo', { emisor: { nif: 'ES-B12345678', nombre: 'Acme SA' }, fiscal: { tipo: 'sociedad' } }),
      con('pyme', { emisor: { nif: 'B12345678', nombre: 'Acme SL' }, fiscal: { tipo: 'sociedad' } }, { tipo: 'pym', nombre: 'Plus', hasta: '2026-11-01' }),
      con('regalo', { emisor: { nif: 'B12345678', nombre: 'Acme SL' } }, { ...aut, fundador: true }),
      con('antigua', { emisor: { nif: 'B12345678', nombre: 'Acme SL' } }, null),
    ],
  });
  const fila = (id) => r.filas.find((f) => f.id === id);
  assert.equal(fila('bien').forma, '');
  assert.equal(fila('nif').forma, 'no-cuadra');
  assert.equal(fila('nif').motivoForma, 'NIF de sociedad');
  assert.equal(fila('nombre').motivoForma, 'Nombre de sociedad');
  assert.equal(fila('forma').motivoForma, 'Forma: sociedad');
  assert.equal(fila('todo').motivoForma, 'NIF de sociedad · Nombre de sociedad · Forma: sociedad');
  for (const id of ['pyme', 'regalo', 'antigua']) assert.equal(fila(id).forma, '', id);
  assert.equal(r.kpis.formaNoCuadra, 4);
});

test('admin: cambiar el plan solo sin Stripe y con un plan que exista', async () => {
  const { cambioDePlan } = await import('../lib/admin.js');
  const prueba = { plan: { tipo: 'aut', nombre: 'Esencial', hasta: '2026-11-01' } };
  assert.deepEqual(cambioDePlan(prueba, 'plan', { tipo: 'aut', nombre: 'Pro' }).plan, { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-01' });
  assert.equal(cambioDePlan(prueba, 'plan', { tipo: 'pym', nombre: 'Plus' }).plan.tipo, 'pym');
  assert.match(cambioDePlan(prueba, 'plan', { tipo: 'aut', nombre: 'Esencial' }).error, /Ya tiene/);
  assert.match(cambioDePlan(prueba, 'plan', { tipo: 'aut', nombre: 'Oro' }).error, /no existe/);
  assert.match(cambioDePlan(prueba, 'plan', { tipo: 'gra', nombre: 'Esencial' }).error, /no existe/);
  assert.match(cambioDePlan({ plan: { ...prueba.plan, pagado: true, suscripcion: 'sub_1' } }, 'plan', { tipo: 'aut', nombre: 'Pro' }).error, /Stripe/);
  assert.match(cambioDePlan({ plan: { ...prueba.plan, fundador: true } }, 'plan', { tipo: 'aut', nombre: 'Pro' }).error, /Fundador/);
  assert.match(cambioDePlan({ plan: { tipo: 'pym', nombre: 'Esencial' }, emisor: { nif: 'B12345674' } }, 'plan', { tipo: 'aut', nombre: 'Pro' }).error, /sociedad/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { COTIZACION_2026, baseMensual, solidaridad, cuotas, nominaCotizacion } from '../lib/cotizacion.js';

test('cotización 2026: las constantes están congeladas también por dentro', () => {
  const comprobar = (objeto) => {
    assert.ok(Object.isFrozen(objeto));
    for (const valor of Object.values(objeto)) {
      if (valor && typeof valor === 'object') comprobar(valor);
    }
  };
  comprobar(COTIZACION_2026);
  assert.throws(() => { COTIZACION_2026.tipos.mei.empresa = 0; }, TypeError);
  assert.equal(COTIZACION_2026.baseMaxima, 5101.20);
  assert.equal(COTIZACION_2026.topeMinimoAT, 1424.40);
});

test('bases mensuales: mínimos por grupo y máximo, con tope AT independiente', () => {
  assert.deepEqual(baseMensual({ remuneracion: 1200 }), {
    remuneracion: 1200, base: 1424.40, baseAT: 1424.40,
    minima: 1424.40, maxima: 5101.20, exceso: 0,
  });
  const minimas = [1989.30, 1649.70, 1435.20, 1424.40, 1424.40, 1424.40, 1424.40];
  minimas.forEach((minima, i) => {
    const resultado = baseMensual({ remuneracion: 0, grupo: i + 1 });
    assert.equal(resultado.base, minima);
    assert.equal(resultado.minima, minima);
    assert.equal(resultado.baseAT, 1424.40);
  });
  assert.deepEqual(baseMensual({ remuneracion: 6000 }), {
    remuneracion: 6000, base: 5101.20, baseAT: 5101.20,
    minima: 1424.40, maxima: 5101.20, exceso: 898.80,
  });
  assert.equal(baseMensual({ remuneracion: 2000, grupo: 1, dias: 28 }).base, 2000);
});

test('bases diarias: grupos 8 a 11, días de 1 a 31', () => {
  for (const grupo of [8, 9, 10, 11]) {
    // 47,48 × 28 = 1.329,44; 170,04 × 28 = 4.761,12.
    const baja = baseMensual({ remuneracion: 1200, grupo, dias: 28 });
    assert.equal(baja.base, 1329.44);
    assert.equal(baja.minima, 1329.44);
    assert.equal(baja.maxima, 4761.12);
    // También la mínima de AT/EP va por días en estos grupos (47,48 × 28): el mismo mínimo diario que la de comunes.
    assert.equal(baja.baseAT, 1329.44);
    const alta = baseMensual({ remuneracion: 6000, grupo, dias: 31 });
    assert.equal(alta.minima, 1471.88);
    assert.equal(alta.maxima, 5271.24);
    assert.equal(alta.base, 5271.24);
    assert.equal(alta.baseAT, 5271.24);
    assert.equal(alta.exceso, 728.76);
    assert.equal(baseMensual({ remuneracion: 0, grupo, dias: 1 }).base, 47.48);
    assert.equal(baseMensual({ remuneracion: 6000, grupo }).base, 5101.20);
  }
});

test('pagas extra: se añade la prorrata una sola vez para cotizar', () => {
  // 2.000 + (2 × 2.000) / 12 = 2.333,33.
  const resultado = baseMensual({ remuneracion: 2000, pagasExtraAnuales: 4000 });
  assert.equal(resultado.remuneracion, 2333.33);
  assert.equal(resultado.base, 2333.33);
  assert.equal(resultado.baseAT, 2333.33);
  assert.equal(baseMensual({ remuneracion: 2333.33, pagasExtraAnuales: 4000, prorrateadas: true }).base, 2333.33);
  // La prorrata también puede generar exceso sujeto a solidaridad.
  assert.equal(baseMensual({ remuneracion: 5000, pagasExtraAnuales: 2400 }).exceso, 98.80);
});

test('cuotas: indefinido de 2.000 €, desglose completo', () => {
  // Empresa: 2.000 × (23,60; 5,50; 0,20; 0,60; 0,75; 1,50) %
  // = 472 + 110 + 4 + 12 + 15 + 30 = 643 €.
  // Trabajador: 2.000 × (4,70; 1,55; 0,10; 0,15) %
  // = 94 + 31 + 2 + 3 = 130 €.
  assert.deepEqual(cuotas({ base: 2000, baseAT: 2000 }), {
    empresa: { contingenciasComunes: 472, desempleo: 110, fogasa: 4, formacion: 12, mei: 15, at: 30, horasExtra: 0, solidaridad: 0, total: 643 },
    trabajador: { contingenciasComunes: 94, desempleo: 31, formacion: 2, mei: 3, horasExtra: 0, solidaridad: 0, total: 130 },
  });
});

test('cuotas: temporal, desempleo 6,70 % empresa y 1,60 % trabajador', () => {
  const resultado = cuotas({ base: 2000, baseAT: 2000, temporal: true });
  assert.equal(resultado.empresa.desempleo, 134);
  assert.equal(resultado.trabajador.desempleo, 32);
  assert.equal(resultado.empresa.total, 667);
  assert.equal(resultado.trabajador.total, 131);
});

test('solidaridad: retribución de 6.000 € y 9.000 €, solo la parte de cada tramo', () => {
  // 6.000: 510,12 × 0,96 % + 388,68 × 1,04 % = 8,94 empresa;
  //        510,12 × 0,19 % + 388,68 × 0,21 % = 1,79 trabajador.
  assert.deepEqual(solidaridad(898.80), { empresa: 8.94, trabajador: 1.79 });
  // 9.000: 510,12 × 0,96 % + 2.040,48 × 1,04 % + 1.348,20 × 1,22 % = 42,57;
  //        510,12 × 0,19 % + 2.040,48 × 0,21 % + 1.348,20 × 0,24 % = 8,49.
  // Se redondea cada cuota de solidaridad después de sumar sus tramos.
  assert.deepEqual(solidaridad(3898.80), { empresa: 42.57, trabajador: 8.49 });
  for (const [bruto, empresa, trabajador] of [[6000, 8.94, 1.79], [9000, 42.57, 8.49]]) {
    const resultado = nominaCotizacion({ bruto });
    assert.equal(resultado.cuotas.empresa.solidaridad, empresa);
    assert.equal(resultado.cuotas.trabajador.solidaridad, trabajador);
  }
});

test('solidaridad: cero, límites y primer céntimo de cada tramo', () => {
  assert.deepEqual(solidaridad(0), { empresa: 0, trabajador: 0 });
  assert.deepEqual(solidaridad(0.01), { empresa: 0, trabajador: 0 });
  assert.deepEqual(solidaridad(510.12), { empresa: 4.90, trabajador: 0.97 });
  assert.deepEqual(solidaridad(510.13), { empresa: 4.90, trabajador: 0.97 });
  assert.deepEqual(solidaridad(2550.60), { empresa: 26.12, trabajador: 5.25 });
  assert.deepEqual(solidaridad(2550.61), { empresa: 26.12, trabajador: 5.25 });
});

test('cuotas: horas extra normales y por fuerza mayor, AT configurable', () => {
  // Horas: 100 × 23,60 % + 200 × 12 % = 47,60 empresa;
  //        100 × 4,70 % + 200 × 2 % = 8,70 trabajador.
  const resultado = cuotas({ base: 2000, baseAT: 2300, horasExtra: 100, horasExtraFuerzaMayor: 200, atPct: 2 });
  assert.equal(resultado.empresa.horasExtra, 47.60);
  assert.equal(resultado.trabajador.horasExtra, 8.70);
  assert.equal(resultado.empresa.contingenciasComunes, 472);
  assert.equal(resultado.empresa.mei, 15);
  assert.equal(resultado.empresa.desempleo, 126.50);
  assert.equal(resultado.empresa.fogasa, 4.60);
  assert.equal(resultado.empresa.formacion, 13.80);
  assert.equal(resultado.trabajador.desempleo, 35.65);
  assert.equal(resultado.trabajador.formacion, 2.30);
  assert.equal(resultado.empresa.at, 46);
  assert.equal(resultado.empresa.total, 725.50);
  assert.equal(resultado.trabajador.total, 143.65);
  assert.equal(cuotas({ base: 2000, baseAT: 2000, atPct: 0 }).empresa.at, 0);
  assert.equal(cuotas({ base: 2000, baseAT: 2000, horasExtra: 100 }).empresa.horasExtra, 23.60);
  assert.equal(cuotas({ base: 2000, baseAT: 2000, horasExtraFuerzaMayor: 200 }).trabajador.horasExtra, 4);
});

test('totales: suman cuotas ya redondeadas', () => {
  // Sobre 1.424,40: empresa 336,16 + 78,34 + 2,85 + 8,55 + 10,68 + 21,37 = 457,95.
  // Aplicar el porcentaje conjunto daría 457,94 y perdería un céntimo.
  const resultado = cuotas({ base: 1424.40, baseAT: 1424.40 });
  assert.equal(resultado.empresa.total, 457.95);
  assert.equal(resultado.trabajador.total, 92.59);
});

test('nómina: bases, cuotas, coste y Seguridad Social del trabajador', () => {
  const resultado = nominaCotizacion({ bruto: 2000 });
  assert.equal(resultado.base, 2000);
  assert.equal(resultado.costeEmpresa, 2643);
  assert.equal(resultado.seguridadSocialTrabajador, 130);
  const extras = nominaCotizacion({ bruto: 2000, pagasExtraAnuales: 4000 });
  assert.equal(extras.base, 2333.33);
  // Empresa: 550,67 + 128,33 + 4,67 + 14 + 17,50 + 35 = 750,17.
  // Trabajador: 109,67 + 36,17 + 2,33 + 3,50 = 151,67.
  assert.equal(extras.costeEmpresa, 2750.17);
  assert.equal(extras.seguridadSocialTrabajador, 151.67);
  const horas = nominaCotizacion({ bruto: 2300, horasExtra: 100, horasExtraFuerzaMayor: 200, atPct: 2 });
  assert.equal(horas.remuneracion, 2300);
  assert.equal(horas.base, 2000);
  assert.equal(horas.baseAT, 2300);
  assert.equal(horas.costeEmpresa, 3025.50);
  assert.equal(horas.seguridadSocialTrabajador, 143.65);
  // Las horas cuentan para AT incluso si comunes sube por el mínimo del grupo.
  const minimo = nominaCotizacion({ bruto: 1800, grupo: 1, horasExtra: 100 });
  assert.equal(minimo.base, 1989.30);
  assert.equal(minimo.baseAT, 1800);
  const alta = nominaCotizacion({ bruto: 6000, horasExtra: 1000 });
  assert.equal(alta.base, 5000);
  assert.equal(alta.baseAT, 5101.20);
  assert.equal(alta.exceso, 898.80);
  assert.equal(nominaCotizacion({ bruto: 2000, temporal: true }).cuotas.empresa.desempleo, 134);
});

test('validación: importes, grupos, días y opciones incorrectos devuelven error', () => {
  const error = (resultado) => {
    assert.deepEqual(Object.keys(resultado), ['error']);
    assert.equal(typeof resultado.error, 'string');
    assert.ok(resultado.error.length);
  };
  const invalidos = [-1, NaN, Infinity, -Infinity, '2000', null, true, {}, []];
  for (const remuneracion of [...invalidos, undefined]) error(baseMensual({ remuneracion }));
  for (const pagasExtraAnuales of invalidos) error(baseMensual({ remuneracion: 2000, pagasExtraAnuales }));
  for (const grupo of [0, 12, 1.5, '7', NaN, Infinity, null]) error(baseMensual({ remuneracion: 2000, grupo }));
  for (const dias of [0, 32, 1.5, '30', NaN, Infinity, null]) error(baseMensual({ remuneracion: 2000, dias }));
  error(baseMensual({ remuneracion: 2000, prorrateadas: 'false' }));
  for (const exceso of [...invalidos, undefined]) error(solidaridad(exceso));
  for (const campo of ['base', 'baseAT', 'exceso', 'atPct', 'horasExtra', 'horasExtraFuerzaMayor']) {
    for (const valor of invalidos) error(cuotas({ base: 2000, baseAT: 2000, [campo]: valor }));
  }
  error(cuotas());
  error(cuotas({ base: 2000, baseAT: 2000, temporal: 'false' }));
  for (const bruto of [...invalidos, undefined]) error(nominaCotizacion({ bruto }));
  error(nominaCotizacion({ bruto: 2000, horasExtra: 1500, horasExtraFuerzaMayor: 501 }));
  error(nominaCotizacion({ bruto: 2000, horasExtra: -1 }));
  error(nominaCotizacion({ bruto: 2000, horasExtraFuerzaMayor: Infinity }));
  error(nominaCotizacion({ bruto: 2000, grupo: 12 }));
  error(nominaCotizacion({ bruto: 2000, atPct: -1 }));
  error(nominaCotizacion({ bruto: 2000, pagasExtraAnuales: -1 }));
  error(nominaCotizacion({ bruto: 2000, dias: 0 }));
  assert.equal(nominaCotizacion({ bruto: 0 }).base, 1424.40);
  // La suma decimal 0,10 + 0,20 no debe superar un bruto de 0,30 por precisión binaria.
  assert.equal(nominaCotizacion({ bruto: 0.30, horasExtra: 0.10, horasExtraFuerzaMayor: 0.20 }).base, 1424.40);
});

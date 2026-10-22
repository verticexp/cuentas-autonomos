import test from 'node:test';
import assert from 'node:assert/strict';
import { IRPF_2026, limpiar145, retencionTrabajo, regularizar } from '../lib/retencionIrpf.js';

// NIF de prueba: obligatorio según VALIDACIONES A y C.1 del documento.
const trabajador = (cambios = {}) => ({
  nif: '12345678Z', nacimiento: 1990, situacionFamiliar: 3,
  situacion: 'activo', contrato: 'general', retribuciones: 30000, cotizaciones: 1905,
  ...cambios,
});
const calcular = (cambios) => retencionTrabajo(trabajador(cambios));
const cerca = (real, esperado) => assert.ok(Math.abs(real - esperado) < 1e-8, `${real} ≠ ${esperado}`);

test('parámetros: congelación recursiva de tablas, tramos y mínimos', () => {
  const comprobar = (x) => {
    assert.ok(Object.isFrozen(x));
    for (const valor of Object.values(x)) if (valor && typeof valor === 'object') comprobar(valor);
  };
  comprobar(IRPF_2026);
  assert.throws(() => { IRPF_2026.escala[0].tipo = 99; }, TypeError);
});

test('soltero, 30.000 €: todas las magnitudes y truncado del tipo', () => {
  // OTROSGASTOS=2.000; GASTOS=1.905+2.000=3.905; RNT=30.000−1.905=28.095.
  // RED20=0; RNTREDU=BASE=26.095; mínimo=5.550; exento hasta 15.876.
  // CUOTA1=4.225,50+5.895×30%=5.994; CUOTA2=5.550×19%=1.054,50.
  // Límite=14.124×43%=6.073,32; cuota=4.939,50; tipo=TRUNCAR(16,465)=16,46.
  // IMPORTE=30.000×16,46%=4.938 (no 4.939,50).
  const r = calcular();
  assert.deepEqual(r, {
    gastos: 3905, otrosGastos: 2000, incrementoMovilidad: 0, incrementoDiscapacidad: 0,
    rendimientoNeto: 28095, reduccion20: 0, rendimientoReducido: 26095,
    reducciones: { pensionista: 0, descendientes: 0, desempleado: 0, pensionConyuge: 0 },
    minimo: { contribuyente: 5550, descendientes: 0, ascendientes: 0, discapacidad: 0, total: 5550 },
    base: 26095, limiteExcluyente: 15876, exento: false,
    cuotaBase: 5994, cuotaMinimo: 1054.5, limiteCuota: 6073.32,
    cuota: 4939.5, cuotaTerritorial: 4939.5, minoracionVivienda: 0,
    tipoPrevio: 16.46, tipo: 16.46, importe: 4938,
  });
});

test('situación 1, dos hijos por entero, uno menor de 3, 22.000 €', () => {
  // Cotizaciones=1.400; RNT=20.600; RED20=0; base=18.600.
  // MINDES=2.400+2.700+2.800=7.900; mínimo=13.450.
  // Escala(base)=3.841,50; escala(mínimo)=2.605,50; cuota=1.236.
  // Límite=(22.000−18.694)×43%=1.421,58; tipo=5,61%; importe=1.234,20.
  const r = calcular({ situacionFamiliar: 1, retribuciones: 22000, cotizaciones: 1400,
    descendientes: [{ nacimiento: 2025, porEntero: true }, { nacimiento: 2018, porEntero: true }] });
  assert.deepEqual([r.gastos, r.rendimientoNeto, r.reduccion20, r.rendimientoReducido, r.base], [3400, 20600, 0, 18600, 18600]);
  assert.deepEqual(r.minimo, { contribuyente: 5550, descendientes: 7900, ascendientes: 0, discapacidad: 0, total: 13450 });
  assert.deepEqual([r.limiteExcluyente, r.cuotaBase, r.cuotaMinimo, r.cuota, r.tipo, r.importe], [18694, 3841.5, 2605.5, 1236, 5.61, 1234.2]);
});

test('situación 2, cónyuge sin rentas y un hijo compartido, 40.000 €', () => {
  // RNT=40.000−2.540=37.460; base=35.460; mínimo=5.550+2.400/2=6.750.
  // CUOTA1=8.725,50+260×37%=8.821,70; CUOTA2=1.282,50; cuota=7.539,20.
  // No límite 43% (>35.200); tipo=18,84%; importe=7.536.
  const r = calcular({ situacionFamiliar: 2, nifConyuge: '87654321X', retribuciones: 40000,
    cotizaciones: 2540, descendientes: [{ nacimiento: 2018 }] });
  assert.deepEqual([r.gastos, r.rendimientoNeto, r.reduccion20, r.base, r.minimo.total], [4540, 37460, 0, 35460, 6750]);
  assert.equal(r.limiteCuota, null);
  cerca(r.cuota, 7539.2);
  assert.deepEqual([r.tipo, r.importe], [18.84, 7536]);
});

test('TABLA 1: todos los límites, inclusive el umbral y los incrementos de pensión/paro', () => {
  // En cada umbral RETRIB≤TABLA1+PENSION+DESEM, cuota=tipo=importe=0 (contrato general).
  const limites = [[1, 1, 17644], [1, 2, 18694], [2, 0, 17197], [2, 1, 18130],
    [2, 2, 19262], [3, 0, 15876], [3, 1, 16342], [3, 2, 16867]];
  for (const [situacionFamiliar, hijos, limite] of limites) {
    for (const [situacion, incremento] of [['activo', 0], ['pensionista', 600], ['desempleado', 1200]]) {
      const d = { situacionFamiliar, situacion, contrato: situacion === 'activo' ? 'general' : '',
        nifConyuge: situacionFamiliar === 2 ? '87654321X' : '', retribuciones: limite + incremento,
        descendientes: Array.from({ length: hijos }, () => ({ nacimiento: 2015 })) };
      const r = calcular(d);
      assert.deepEqual([r.limiteExcluyente, r.exento, r.cuota, r.tipo, r.importe], [limite + incremento, true, 0, 0, 0]);
      assert.equal(calcular({ ...d, retribuciones: limite + incremento + 0.01 }).exento, false);
    }
  }
});

test('salario inferior al límite excluyente, contrato general', () => {
  // 15.000−952,50=14.047,50; RED20=7.302; base=14.047,50−2.000−7.302=4.745,50.
  // 15.000≤15.876: exento, cuota=tipo=importe=0.
  const r = calcular({ retribuciones: 15000, cotizaciones: 952.5 });
  assert.deepEqual([r.rendimientoNeto, r.reduccion20, r.base, r.exento, r.tipo, r.importe], [14047.5, 7302, 4745.5, true, 0, 0]);
});

test('contrato inferior al año: sueldo bajo no exento y mínimo del 2%', () => {
  // RNT=16.000−1.016=14.984; RED20=7.302−132×1,75=7.071; base=5.913.
  // Cuota previa=(5.913−5.550)×19%=68,97; límite=124×43%=53,32.
  // Tipo previo=0,33%; mínimo=2%; importe=320.
  const r = calcular({ contrato: 'inferiorAnio', retribuciones: 16000, cotizaciones: 1016 });
  assert.equal(r.exento, false);
  assert.deepEqual([r.reduccion20, r.base, r.cuota, r.tipoPrevio, r.tipo, r.importe], [7071, 5913, 53.32, 0.33, 2, 320]);
});

test('los mínimos se aplican incluso tras EXENTOS; especial 15% y manuales sin mínimo', () => {
  // 10.000≤15.876: CUOTA=0; se salta a etiqueta 1; mínimo temporal 2%, especial 15%.
  // MANUALES no figura en las condiciones de tipos mínimos: 0%.
  for (const [contrato, tipo, importe] of [['inferiorAnio', 2, 200], ['especial', 15, 1500], ['manuales', 0, 0]]) {
    const r = calcular({ contrato, retribuciones: 10000 });
    assert.deepEqual([r.exento, r.cuota, r.tipo, r.importe], [true, 0, tipo, importe]);
  }
});

test('pensionista de 75 años y desempleado: reducciones distintas', () => {
  // Pensión: 25.000−2.000=23.000; PENSION=600; base=22.400; mínimo=5.550+1.150+1.400=8.100.
  // CUOTA=4.885,50−1.539=3.346,50; tipo=13,38%; importe=3.345.
  const p = calcular({ nacimiento: 1951, situacion: 'pensionista', contrato: '', retribuciones: 25000, cotizaciones: 0 });
  assert.deepEqual([p.reducciones.pensionista, p.reducciones.desempleado, p.base, p.minimo.contribuyente, p.cuota, p.tipo, p.importe], [600, 0, 22400, 8100, 3346.5, 13.38, 3345]);
  // Paro: base=23.000−1.200=21.800; cuota inicial=4.705,50−1.054,50=3.651.
  // Límite=(25.000−15.876−1.200)×43%=3.407,32 →13,62%; importe=3.405.
  const d = calcular({ situacion: 'desempleado', contrato: '', retribuciones: 25000, cotizaciones: 0 });
  assert.deepEqual([d.reducciones.desempleado, d.base, d.cuota, d.tipo, d.importe], [1200, 21800, 3407.32, 13.62, 3405]);
});

test('ascendiente mayor de 75 con discapacidad ≥65%, dividido entre dos', () => {
  // MINAS=1.150/2+1.400/2=1.275; MINDIS=9.000/2+3.000/2=6.000.
  // Mínimo=12.825; CUOTA2=2.365,50+375×24%=2.455,50.
  // Cuota=5.994−2.455,50=3.538,50; tipo=11,79%; importe=3.537.
  const r = calcular({ ascendientes: [{ nacimiento: 1940, discapacidad: '65', convivencia: 2 }] });
  assert.deepEqual(r.minimo, { contribuyente: 5550, descendientes: 0, ascendientes: 1275, discapacidad: 6000, total: 12825 });
  assert.deepEqual([r.cuota, r.tipo, r.importe], [3538.5, 11.79, 3537]);
});

test('componentes de ascendientes: redondeo al terminar cada suma y orden independiente', () => {
  // Dos ascendientes /9: REDONDEAR1(2×1.150/9)=255,56.
  // Discapacidad: REDONDEAR1(2×3.000/9)=666,67 (no 666,66).
  const a = [{ nacimiento: 1960, discapacidad: '33a65', convivencia: 9 },
    { nacimiento: 1959, discapacidad: '33a65', convivencia: 9 }];
  const r = calcular({ ascendientes: a });
  assert.equal(r.minimo.ascendientes, 255.56);
  assert.equal(r.minimo.discapacidad, 666.67);
  // Un ascendiente de 66 y otro de 76 /3: 766,67+466,67=1.233,34; discapacidad 9.000/3+3.000/3=4.000.
  const mezcla = [{ nacimiento: 1960, convivencia: 3 }, { nacimiento: 1950, discapacidad: '65', convivencia: 3 }];
  const m = calcular({ ascendientes: mezcla }).minimo;
  cerca(m.ascendientes, 1233.34);
  assert.equal(m.discapacidad, 4000);
  assert.deepEqual(calcular({ ascendientes: [...mezcla].reverse() }).minimo, m);
});

test('400.000 €: último tramo de la escala', () => {
  // RNT=400.000−4.000=396.000; base=394.000.
  // CUOTA1=125.901,50+(394.000−300.000)×47%=170.081,50.
  // Cuota=169.027; tipo=TRUNCAR(42,25675)=42,25%; importe=169.000.
  const r = calcular({ retribuciones: 400000, cotizaciones: 4000 });
  assert.deepEqual([r.rendimientoNeto, r.base, r.cuotaBase, r.cuota, r.tipo, r.importe], [396000, 394000, 170081.5, 169027, 42.25, 169000]);
});

test('art. 20: tramos, fronteras y REDONDEAR1 (0,005 hacia arriba)', () => {
  // RNT=RETRIB−1.000; RED20 no descuenta los otros gastos de 2.000.
  // 14.852,01: 7.302−0,01×1,75=7.301,9825 →7.301,98.
  // 14.900,02: 7.302−48,02×1,75=7.217,965 →7.217,97.
  // 17.673,52: 7.302−2.821,52×1,75=2.364,34.
  // 17.673,53: 2.364,34−0,01×1,14=2.364,3286 →2.364,33.
  // 18.000: 2.364,34−326,48×1,14=1.992,1528 →1.992,15.
  // 19.747,49: 2.364,34−2.073,97×1,14=0,0142 →0,01; 19.747,50: 0.
  for (const [neto, reduccion] of [[14852, 7302], [14852.01, 7301.98], [14900.02, 7217.97],
    [17673.52, 2364.34], [17673.53, 2364.33], [18000, 1992.15], [19747.49, 0.01], [19747.5, 0]]) {
    const r = calcular({ retribuciones: neto + 1000, cotizaciones: 1000 });
    cerca(r.rendimientoNeto, neto);
    assert.equal(r.reduccion20, reduccion);
  }
});

test('gastos por discapacidad y movilidad geográfica del trabajador activo', () => {
  // 33–65: otros gastos=2.000+3.500=5.500; base=22.595; mínimo=8.550.
  // Cuota=4.944−1.624,50=3.319,50; tipo=11,06%; importe=3.318.
  const a = calcular({ discapacidad: '33a65' });
  assert.deepEqual([a.otrosGastos, a.base, a.minimo.total, a.cuota, a.tipo, a.importe], [5500, 22595, 8550, 3319.5, 11.06, 3318]);
  // Con movilidad reducida y geográfica: 2.000+7.750+2.000=11.750.
  // Base=16.345; mínimo=11.550; cuota=3.300,30−2.194,50=1.105,80 →3,68%; 1.104.
  const b = calcular({ discapacidad: '33a65', movilidadReducida: true, movilidadGeografica: true });
  assert.deepEqual([b.otrosGastos, b.incrementoMovilidad, b.incrementoDiscapacidad, b.base, b.minimo.total], [11750, 2000, 7750, 16345, 11550]);
  cerca(b.cuota, 1105.8);
  assert.deepEqual([b.tipo, b.importe], [3.68, 1104]);
  // ≥65: otros gastos=9.750; mínimo=5.550+9.000+3.000=17.550.
  // Base=18.345; cuota=3.780,30−3.589,50=190,80 →0,63%; 189.
  const c = calcular({ discapacidad: '65' });
  assert.deepEqual([c.otrosGastos, c.minimo.total, c.tipo, c.importe], [9750, 17550, 0.63, 189]);
  // Otra situación: los 3.000 de mínimo permanecen, el incremento de gastos desaparece.
  assert.equal(calcular({ discapacidad: '33a65', situacion: 'otra', contrato: '' }).incrementoDiscapacidad, 0);
});

test('otros gastos limitados por RETRIB−COTIZACIONES y rendimientos no negativos', () => {
  // 1.000−900=100: sólo caben 100 de otros gastos; RNTREDU=max(0,100−100−7.302)=0.
  const a = calcular({ retribuciones: 1000, cotizaciones: 900 });
  assert.deepEqual([a.otrosGastos, a.gastos, a.rendimientoNeto, a.rendimientoReducido, a.base], [100, 1000, 100, 0, 0]);
  // Cotizaciones mayores que retribución: otros gastos=0; RNT y base=0.
  const b = calcular({ retribuciones: 100, cotizaciones: 150 });
  assert.deepEqual([b.otrosGastos, b.gastos, b.rendimientoNeto, b.base], [0, 150, 0, 0]);
});

test('IRREGULAR1, IRREGULAR2 y pensión compensatoria se descuentan en su orden', () => {
  // RNT=60.000−9.000−3.000−4.000=44.000; RNTREDU=42.000; CONYUGE=2.000 →BASE=40.000.
  // CUOTA=8.725,50+4.800×37%−1.054,50=9.447 →15,74%; importe=9.444.
  const r = calcular({ retribuciones: 60000, irregulares: 9000, irregulares2: 3000, cotizaciones: 4000, pensionConyuge: 2000 });
  assert.deepEqual([r.rendimientoNeto, r.rendimientoReducido, r.base, r.cuota, r.tipo, r.importe], [44000, 42000, 40000, 9447, 15.74, 9444]);
  // Una pensión que absorbe el rendimiento reducido deja base=0.
  assert.equal(calcular({ pensionConyuge: 50000 }).base, 0);
});

test('descendientes ordenados por nacimiento, prorrateos, cuarto hijo y reducción de 600', () => {
  // Orden: 2010 (mitad), 2012 (entero), 2014 (mitad), 2016 (mitad).
  // MINDES=1.200+2.700+2.000+2.250=8.150; total=13.700.
  // HIJOS=600; base=26.095−600=25.495; cuota=5.814−2.665,50=3.148,50.
  // Tipo=10,49%; importe=3.147. El límite excluyente sigue usando la columna «2 o más».
  const descendientes = [{ nacimiento: 2016 }, { nacimiento: 2012, porEntero: true },
    { nacimiento: 2014 }, { nacimiento: 2010 }];
  const r = calcular({ descendientes });
  assert.deepEqual([r.minimo.descendientes, r.minimo.total, r.reducciones.descendientes, r.base, r.cuota, r.tipo, r.importe], [8150, 13700, 600, 25495, 3148.5, 10.49, 3147]);
  assert.equal(r.limiteExcluyente, 16867);
});

test('adopción reciente, frontera de 3 años y descendiente de 25 con discapacidad', () => {
  // Nacido 2006, adoptado 2025, mitad: 2.400/2+2.800/2=2.600.
  assert.equal(calcular({ descendientes: [{ nacimiento: 2006, adopcion: 2025 }] }).minimo.descendientes, 2600);
  // En 2023 ya son 3 años: no incremento, tanto por nacimiento como adopción.
  assert.equal(calcular({ descendientes: [{ nacimiento: 2023 }] }).minimo.descendientes, 1200);
  assert.equal(calcular({ descendientes: [{ nacimiento: 2006, adopcion: 2023 }] }).minimo.descendientes, 1200);
  // A los 25 con discapacidad: 1.200 de descendiente y 1.500 por discapacidad.
  const r = calcular({ descendientes: [{ nacimiento: 2001, discapacidad: '33a65' }] });
  assert.deepEqual([r.minimo.descendientes, r.minimo.discapacidad], [1200, 1500]);
});

test('discapacidad y asistencia de descendientes: computar también tras familiares sin discapacidad', () => {
  // Dos hijos: mayor sin discapacidad mitad=1.200; menor discapacidad65 entero=2.700.
  // MINDIS=9.000+3.000=12.000; total=5.550+3.900+12.000=21.450.
  const r = calcular({ descendientes: [{ nacimiento: 2010 }, { nacimiento: 2015, discapacidad: '65', porEntero: true }] });
  assert.deepEqual([r.minimo.descendientes, r.minimo.discapacidad, r.minimo.total], [3900, 12000, 21450]);
  // Mismo menor con 33–65 y movilidad: discapacidad3.000+asistencia3.000=6.000.
  assert.equal(calcular({ descendientes: [{ nacimiento: 2010 },
    { nacimiento: 2015, discapacidad: '33a65', movilidadReducida: true, porEntero: true }] }).minimo.discapacidad, 6000);
});

test('incrementos de edad del contribuyente al cumplir 65 y 75, no un año después', () => {
  // 64:5.550; 65:5.550+1.150=6.700; 74:6.700; 75:6.700+1.400=8.100.
  for (const [nacimiento, minimo] of [[1962, 5550], [1961, 6700], [1952, 6700], [1951, 8100]]) {
    assert.equal(calcular({ nacimiento }).minimo.contribuyente, minimo);
  }
});

test('anualidades: escalas separadas e incremento del mínimo de 1.980 €', () => {
  // Base=26.095; alimentos=4.000: escala(22.095)=4.794; escala(4.000)=760.
  // CUOTA1=5.554; CUOTA2=escala(5.550+1.980)=1.430,70; cuota=4.123,30.
  // Tipo=13,74%; importe=4.122.
  const r = calcular({ alimentos: 4000 });
  assert.equal(r.cuotaBase, 5554);
  cerca(r.cuotaMinimo, 1430.7);
  cerca(r.cuota, 4123.3);
  assert.deepEqual([r.tipo, r.importe], [13.74, 4122]);
  // Si alimentos≥base, se usa la escala ordinaria y no se suman 1.980 al mínimo.
  for (const alimentos of [26095, 30000]) assert.equal(calcular({ alimentos }).cuota, 4939.5);
});

test('límite del 43%, cuota sin redondeo adicional y umbral de 35.200', () => {
  // 18.000, cotizaciones0: RED20=1.992,15; base=14.007,85.
  // CUOTA1=2.365,50+1.557,85×24%=2.739,384; cuota inicial=1.684,884.
  // Límite=(18.000−15.876)×43%=913,32 →tipo5,07%; importe912,60.
  const r = calcular({ retribuciones: 18000, cotizaciones: 0 });
  cerca(r.cuotaBase, 2739.384);
  cerca(r.cuota, 913.32);
  assert.deepEqual([r.tipo, r.importe], [5.07, 912.6]);
  // Hasta 35.200 inclusive se calcula el límite; por encima no.
  assert.notEqual(calcular({ retribuciones: 35200 }).limiteCuota, null);
  assert.equal(calcular({ retribuciones: 35200.01 }).limiteCuota, null);
});

test('vivienda: minoración antes del tipo, truncada a céntimos y umbral estricto', () => {
  // MINOPAGO=30.000×2%=600; cuota útil=4.939,50−600=4.339,50.
  // Tipo=14,46%; importe=4.338.
  const r = calcular({ prestamoVivienda: true });
  assert.deepEqual([r.minoracionVivienda, r.tipo, r.importe], [600, 14.46, 4338]);
  // 33.007,19×2%=660,1438 →TRUNCAR=660,14; a 33.007,20 es error de entrada.
  assert.equal(calcular({ retribuciones: 33007.19, prestamoVivienda: true }).minoracionVivienda, 660.14);
  assert.match(calcular({ retribuciones: 33007.2, prestamoVivienda: true }).error, /33.007,20/);
  // Cuota0−minoración negativa se limita a0.
  assert.equal(calcular({ retribuciones: 15000, prestamoVivienda: true }).tipo, 0);
});

test('Ceuta/Melilla y La Palma: residencia Y rendimientos, reducción del 60% antes de vivienda', () => {
  // CUOTA=4.939,50; bonificada=4.939,50×40%=1.975,80.
  // Tipo6,58%; importe1.974. Con vivienda:1.975,80−600=1.375,80 →4,58%; 1.374.
  for (const residencia of ['ceutaMelilla', 'laPalma']) {
    const r = calcular({ residencia, rendimientosTerritorio: true });
    cerca(r.cuotaTerritorial, 1975.8);
    assert.deepEqual([r.cuota, r.tipo, r.importe], [4939.5, 6.58, 1974]);
    const v = calcular({ residencia, rendimientosTerritorio: true, prestamoVivienda: true });
    assert.deepEqual([v.tipo, v.importe], [4.58, 1374]);
    assert.equal(calcular({ residencia }).tipo, 16.46);
  }
  assert.equal(calcular({ residencia: 'general', rendimientosTerritorio: true }).tipo, 16.46);
  // Temporales y especiales: mínimos 0,80% y6%, incluso si cuota0 por exención.
  for (const [contrato, tipo, importe] of [['inferiorAnio', 0.8, 80], ['especial', 6, 600]]) {
    const r = calcular({ residencia: 'laPalma', rendimientosTerritorio: true, contrato, retribuciones: 10000 });
    assert.deepEqual([r.tipo, r.importe], [tipo, importe]);
  }
});

test('normalización: números en texto, NIF, valores opcionales y ausencia de mutación', () => {
  const entrada = trabajador({ nif: ' 12345678z ', nacimiento: '1990', situacionFamiliar: '3',
    retribuciones: '30000.00', descendientes: [{ nacimiento: 2025 }, { nacimiento: 2010, porEntero: true }] });
  const copia = structuredClone(entrada);
  const d = limpiar145(entrada);
  assert.equal(d.nif, '12345678Z');
  assert.deepEqual([d.nacimiento, d.situacionFamiliar, d.retribuciones, d.discapacidad, d.irregulares2], [1990, 3, 30000, 'no', 0]);
  assert.deepEqual(d.descendientes.map((h) => [h.nacimiento, h.porEntero]), [[2010, true], [2025, false]]);
  assert.equal(d.rendimientosTerritorio, false);
  assert.deepEqual(entrada, copia);
  assert.deepEqual(limpiar145(d), d);
});

test('validaciones obligatorias, importes, contratos, familia y rangos', () => {
  // Cada entrada infringe una validación de C.1–21 o un dominio de DATOS DE ENTRADA.
  const invalidos = [
    [{ nif: undefined }, /NIF/], [{ nif: 'B12345678' }, /persona física/],
    [{ nacimiento: undefined }, /nacimiento/], [{ nacimiento: 0 }, /nacimiento/],
    [{ nacimiento: 1905 }, /1906/], [{ nacimiento: 2027 }, /2026/], [{ nacimiento: 1990.5 }, /nacimiento/],
    [{ situacionFamiliar: undefined }, /Situación familiar/], [{ situacionFamiliar: 4 }, /Situación familiar/],
    [{ situacionFamiliar: 2 }, /cónyuge/], [{ nifConyuge: '87654321X' }, /no debe/],
    [{ situacionFamiliar: 2, nifConyuge: 'B12345678' }, /persona física/],
    [{ situacion: undefined }, /Situación laboral/], [{ contrato: undefined }, /contrato/],
    [{ situacion: 'pensionista' }, /contrato/], [{ situacion: 'otra', contrato: '', movilidadGeografica: true }, /Movilidad geográfica/],
    [{ retribuciones: 0 }, /obligatorias/], [{ retribuciones: -1 }, /no negativo/],
    [{ retribuciones: Infinity }, /finito/], [{ retribuciones: NaN }, /finito/],
    [{ retribuciones: null }, /número/], [{ retribuciones: true }, /número/], [{ retribuciones: '' }, /número/],
    [{ cotizaciones: -1 }, /no negativo/], [{ irregulares2: -1 }, /no negativo/],
    [{ irregulares: 90000.01, retribuciones: 400000 }, /90.000/], [{ irregulares: 9000.01 }, /30%/],
    [{ discapacidad: 'otra' }, /Discapacidad/], [{ movilidadReducida: true }, /Movilidad reducida/],
    [{ discapacidad: '65', movilidadReducida: true }, /Movilidad reducida/],
    [{ movilidadGeografica: 'N' }, /verdadero o falso/], [{ residencia: 'otra' }, /Residencia/],
    [{ situacionFamiliar: 1 }, /al menos un descendiente/],
    [{ descendientes: [{ nacimiento: 2001 }] }, /25 o más/],
    [{ descendientes: [{ nacimiento: 2010, movilidadReducida: true }] }, /Movilidad reducida/],
    [{ descendientes: [{ nacimiento: 2010, adopcion: 2009 }] }, /anterior/],
    [{ ascendientes: [{ nacimiento: 1962 }] }, /menores de 65/],
    [{ ascendientes: [{ nacimiento: 1940, movilidadReducida: true }] }, /Movilidad reducida/],
    ...[0, 10, 1.5].map((convivencia) => [{ ascendientes: [{ nacimiento: 1940, convivencia }] }, /Convivencia/]),
    [{ ascendientes: null }, /lista/], [{ descendientes: [null] }, /Datos/],
    [{ descendientes: Array.from({ length: 17 }, () => ({ nacimiento: 2015 })) }, /máximo 16/],
    [{ ascendientes: Array.from({ length: 7 }, () => ({ nacimiento: 1940 })) }, /máximo 6/],
    [{ descendientes: Array.from({ length: 10 }, () => ({ nacimiento: 2025 })) }, /superior a 9/],
  ];
  for (const [cambio, mensaje] of invalidos) {
    assert.match(limpiar145(trabajador(cambio)).error ?? '', mensaje, JSON.stringify(cambio));
    assert.match(calcular(cambio).error ?? '', mensaje);
  }
  assert.match(retencionTrabajo(null).error, /obligatorios/);
  // IRREGULAR1 permite exactamente90.000 y30%; discapacidad permite ascendientes de64.
  assert.equal(calcular({ retribuciones: 300000, irregulares: 90000 }).error, undefined);
  assert.equal(calcular({ ascendientes: [{ nacimiento: 1962, discapacidad: '33a65' }] }).error, undefined);
});

test('regularización general: cuota nueva menos retenido, sobre retribución pendiente', () => {
  // Cuota anual nueva4.939,50; percibido15.000; retenido2.000; pendiente15.000.
  // TIPOREG=TRUNCAR((4.939,50−2.000)/15.000×100)=19,59%.
  // Pendiente2.938,50; total anual=2.938,50+2.000=4.938,50.
  const r = regularizar(trabajador(), { percibido: 15000, retenido: 2000 });
  assert.deepEqual([r.pendiente, r.cuota, r.tipoAnual, r.importeAnual, r.tipo, r.importePendiente, r.importe], [15000, 4939.5, 16.46, 4938, 19.59, 2938.5, 4938.5]);
});

test('regularización: vivienda sólo sobre lo pendiente y bonificación territorial', () => {
  // CAUSA11: MINOPAGO=(30.000−15.000)×2%=300 (no600).
  // (4.939,50−2.000−300)/15.000×100 →17,59%; importe=2.638,50+2.000=4.638,50.
  const r = regularizar(trabajador({ prestamoVivienda: true }), { percibido: 15000, retenido: 2000 });
  assert.deepEqual([r.minoracionVivienda, r.tipo, r.importe], [300, 17.59, 4638.5]);
  // Cuota territorial1.975,80; retenido1.000; pendiente15.000 →6,50%; total=1.975.
  const t = regularizar(trabajador({ residencia: 'laPalma', rendimientosTerritorio: true }), { percibido: 15000, retenido: 1000 });
  assert.deepEqual([t.tipo, t.importe], [6.5, 1975]);
});

test('regularización: límites máximo, mínimo y exceso ya retenido sin devolución', () => {
  // Cuota169.027; quedan1.000; tipo teórico16.902,7% →47%; pendiente470; anual470.
  const r = regularizar(trabajador({ retribuciones: 400000, cotizaciones: 4000 }), { percibido: 399000, retenido: 0 });
  assert.deepEqual([r.tipo, r.importePendiente, r.importe], [47, 470, 470]);
  // Territorio estable (RENCEMEA=S): máximo19%; 1.000×19%=190.
  const t = regularizar(trabajador({ retribuciones: 400000, cotizaciones: 4000, residencia: 'laPalma', rendimientosTerritorio: true }), { percibido: 399000, retenido: 0 });
  assert.deepEqual([t.tipo, t.importe], [19, 190]);
  // Ya retenidos5.000>cuota4.939,50: tipo0; anual5.000, no devolución.
  const e = regularizar(trabajador(), { percibido: 15000, retenido: 5000 });
  assert.deepEqual([e.tipo, e.importePendiente, e.importe], [0, 0, 5000]);
  // Con contrato especial sigue el mínimo15%: pendiente15.000×15%=2.250; total7.250.
  const m = regularizar(trabajador({ contrato: 'especial' }), { percibido: 15000, retenido: 5000 });
  assert.deepEqual([m.tipo, m.importe], [15, 7250]);
});

test('regularización: valida percibido y retenido y propaga los errores del145', () => {
  for (const contexto of [null, [], {}, { percibido: 0, retenido: 0 }, { percibido: 30000, retenido: 0 },
    { percibido: 30001, retenido: 0 }, { percibido: 10000, retenido: -1 },
    { percibido: NaN, retenido: 0 }, { percibido: 10000, retenido: Infinity }]) {
    assert.equal(typeof regularizar(trabajador(), contexto).error, 'string');
  }
  assert.equal(typeof regularizar(trabajador()).error, 'string');
  assert.match(regularizar(trabajador({ nacimiento: 0 }), { percibido: 10000, retenido: 0 }).error, /nacimiento/);
});

test('importe final: REDONDEAR1 de medios céntimos y truncado sin residuo binario', () => {
  // Contrato especial: 10.000,10×15%=1.500,015 →1.500,02.
  assert.equal(calcular({ contrato: 'especial', retribuciones: 10000.10 }).importe, 1500.02);
  // Temporal: 10.000,25×2%=200,005 →200,01.
  assert.equal(calcular({ contrato: 'inferiorAnio', retribuciones: 10000.25 }).importe, 200.01);
  // (4.939,50−4.910,50)/10.000×100=0,29 exacto; no debe bajar a0,28.
  assert.equal(regularizar(trabajador(), { percibido: 20000, retenido: 4910.5 }).tipo, 0.29);
});

// Casos independientes en euros; no se usan las funciones probadas para calcular los esperados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { asientosCierreApertura, CUENTAS, generarAsientos, mayor, sumasYSaldos } from '../lib/asientos.js';
import { balanceOficial, cambiosPatrimonio, csvPymes, cuentasAnuales, ESTRUCTURA_BALANCE, filasPygOficial, pygOficial, TOTALES_BALANCE } from '../lib/cuentasAnuales.js';
import { cuadreBanco, exportarDiario, informe } from '../lib/contabilidad.js';
import { leerZip } from '../lib/zip.js';

const apunte = (fecha, concepto, pares, origen) => ({ fecha, concepto, lineas: pares.map(([cuenta, n]) => ({ cuenta, debe: Math.max(n, 0), haber: Math.max(-n, 0) })), ...(origen ? { origen: { tipo: origen } } : {}) });
const cuadrado = (a) => assert.equal(a.lineas.reduce((s, l) => s + Math.round(l.debe * 100) - Math.round(l.haber * 100), 0), 0, a.concepto);
const fin = '2025-12-31', hoy = '2026-02-10';
const sociedad = [
  // Activo inicial: clientes 250 + caja 20 + bancos 1.640 = 1.910.
  // Fondos y ajustes 1.220 + deudas especiales 90 + proveedores 600 = 1.910.
  apunte('2025-01-01', 'Apertura manual', [['430101', 120], ['430102', 80], ['430103', 50], ['570', 20], ['572', 1640], ['100', -1000], ['112', -100], ['1140', -50], ['133', -40], ['130', -30], ['150', -70], ['502', -20], ['400101', -300], ['400102', -200], ['400103', -100]], 'apertura'),
  apunte('2025-06-01', 'Ventas', [['572', 1000], ['705', -1000]]),
  apunte('2025-06-02', 'Subvención financiera', [['572', 40], ['746', -40]]),
  apunte('2025-06-03', 'Activación financiera', [['572', 10], ['7690', -10]]),
  apunte('2025-06-04', 'Convenio de acreedores', [['572', 20], ['7691', -20]]),
  apunte('2025-06-05', 'Otros ingresos financieros', [['572', 30], ['7692', -30]]),
  apunte('2025-06-06', 'Otros gastos financieros', [['669', 5], ['572', -5]]),
  apunte(fin, 'Impuesto sobre beneficios', [['630', 200], ['4752', -200]], 'cierre'),
  // Resultado: ventas 1.000 + financiero 95 − impuesto 200 = 895.
  apunte(fin, 'Regularización', [['705', 1000], ['746', 40], ['7690', 10], ['7691', 20], ['7692', 30], ['669', -5], ['630', -200], ['129', -895]], 'regularizacion'),
];
// No se inventan significados para subcuentas: este plan de prueba declara la 1140
// como capitalización y clasifica expresamente los ingresos especiales sin cuenta PGC propia.
const opciones = {
  cuentas: { ...CUENTAS, 1140: 'Reserva de capitalización' },
  vencimientos: { '430101': { fecha: '2027-03-01', cicloExplotacion: true }, '430102': { fecha: '2027-03-01' }, '400101': { fecha: '2027-03-01', cicloExplotacion: true }, '400102': { fecha: '2027-03-01' } },
  clasificacion: { '746': '13.a', '7690': '18.a', '7691': '18.b' },
};
const aplanar = (ns) => ns.flatMap((n) => [n, ...aplanar(n.hijos || [])]);

test('PYMES: todas las casillas del balance y la PyG, incluidas las nuevas y los totales', () => {
  const codigos = [...aplanar(ESTRUCTURA_BALANCE.activo), TOTALES_BALANCE[0], ...aplanar(ESTRUCTURA_BALANCE.pasivo), TOTALES_BALANCE[1]].map((n) => n.codigo);
  assert.deepEqual(codigos, '11000 11100 11200 11300 11400 11500 11600 11700 12000 12200 12300 12380 12381 12382 12370 12390 12400 12500 12600 12700 10000 20000 21000 21100 21110 21120 21200 21300 21350 21360 21400 21500 21600 21700 21800 22000 23000 31000 31100 31200 31220 31230 31290 31300 31400 31500 31600 31700 32000 32200 32300 32320 32330 32390 32400 32500 32580 32581 32582 32590 32600 32700 30000'.split(' '));
  assert.deepEqual(filasPygOficial().map((n) => n.codigo), '40100 40200 40300 40400 40500 40600 40700 40800 40900 41000 41100 41300 49100 41400 41430 41490 41500 41600 41700 41800 42100 42110 42120 42130 49200 49300 41900 49500'.split(' '));
  sociedad.forEach(cuadrado);
  const b = balanceOficial(sociedad, fin, opciones), p = pygOficial(sociedad, '2025-01-01', fin, opciones);
  assert.equal(b.activo, 3005); assert.equal(b.pasivo, 3005); // 10000 = 30000.
  for (const [id, n] of Object.entries({ 'A.VII': 80, 'B.II.1.a': 120, 'B.II.1.b': 50, 'PA1.III.1': 50, 'PA1.III.2': 100, PA2: 40, PA3: 30, 'PB.VI': 200, 'PB.VII': 70, 'PC.IV.1.a': 300, 'PC.IV.1.b': 100, 'PC.VI': 20, 'PA1.VII': 895 })) assert.equal(b.v[id], n, id);
  assert.deepEqual([p.A, p.B, p.C, p.D], [1000, 95, 1095, 895]);
  // La 7692 (otros ingresos financieros) va a la 13.b y la 669 (otros gastos financieros) a la 14, como en el modelo.
  assert.deepEqual([p.v['13.a'], p.v['13.b'], p.v[14], p.v[18], p.v['18.a'], p.v['18.b'], p.v['18.c'], p.v[19]], [40, 30, -5, 30, 10, 20, 0, -200]);
  assert.equal(b.v['PA1.VII'], p.D); // Casillas 21700 = 49500, tras regularizar.
});

test('sin vencimiento ni reserva de capitalización declarada: corto plazo y otras reservas, sin perder saldos', () => {
  const b = balanceOficial(sociedad, fin);
  assert.deepEqual([b.v['B.II.1.a'], b.v['B.II.1.b'], b.v['PC.IV.1.a'], b.v['PC.IV.1.b']], [0, 250, 0, 600]);
  assert.deepEqual([b.v['PA1.III.1'], b.v['PA1.III.2'], b.v['A.VII'], b.v['PB.VI']], [0, 150, 0, 0]);
  assert.equal(b.activo, b.pasivo);
  const c = cuentasAnuales({ asientos: sociedad, gastos: [], empresa: {}, anio: 2025 });
  assert.match(c.memoria[9], /200,00 €/); // El impuesto ahora se lee de la línea 19.
  assert.equal(c.ecpn.final.ajustes, 40); assert.equal(c.ecpn.final.subvenciones, 30);
  assert.equal(c.ecpn.final.total, 2115);
  assert.equal(cambiosPatrimonio(sociedad, 2025).final.total, c.bal[0].v.PA);
});

test('CSV PYMES: UTF-8 con BOM, cabecera, coma decimal, casillas vacías y comparativo', () => {
  const c = { anio: 2025, bal: [balanceOficial(sociedad, fin, opciones), balanceOficial([], '2024-12-31')], pyg: [pygOficial(sociedad, '2025-01-01', fin, opciones), pygOficial([], '2024-01-01', '2024-12-31')] };
  const texto = csvPymes(c), filas = texto.slice(1).trimEnd().split('\r\n');
  assert.deepEqual([...Buffer.from(texto).subarray(0, 3)], [239, 187, 191]);
  assert.equal(filas[0], 'código;concepto;ejercicio 2025;ejercicio 2024');
  assert.ok(filas.includes('10000;TOTAL ACTIVO (A + B);3005,00;0,00'));
  assert.ok(filas.includes('49500;D) RESULTADO DEL EJERCICIO (C + 19);895,00;0,00'));
  assert.ok(filas.includes('41900;19. Impuestos sobre beneficios;-200,00;0,00'));
  assert.ok(filas.includes('11100;I. Inmovilizado intangible;0,00;0,00'));
  assert.equal(filas.length, 92);
});

test('cierre y apertura: cuadran, son inversos, respetan fechas y no mutan la fuente de saldos', () => {
  const copia = structuredClone(sociedad), bal = balanceOficial(sociedad, fin), sumas = sumasYSaldos(sociedad, 2025), m = mayor(sociedad, '572', 2025);
  const diario25 = asientosCierreApertura(sociedad, 2025, hoy), diario26 = asientosCierreApertura(sociedad, 2026, hoy);
  const cierre = diario25.at(-1), apertura = diario26[0];
  assert.equal(cierre.fecha, fin); assert.equal(cierre.origen.tipo, 'cierre-contable');
  assert.equal(apertura.fecha, '2026-01-01'); assert.equal(apertura.origen.tipo, 'apertura-contable');
  cuadrado(cierre); cuadrado(apertura);
  assert.deepEqual(apertura.lineas, cierre.lineas.map((l) => ({ cuenta: l.cuenta, debe: l.haber, haber: l.debe })));
  // Tras la regularización el cierre salda TODAS las cuentas 1–5, incluida la 129 (895).
  const saldos = {};
  for (const a of diario25) for (const l of a.lineas) saldos[l.cuenta] = (saldos[l.cuenta] || 0) + l.debe - l.haber;
  assert.ok(Object.values(saldos).every((n) => n === 0));
  assert.deepEqual(sociedad, copia);
  assert.deepEqual(balanceOficial(sociedad, fin), bal); assert.deepEqual(sumasYSaldos(sociedad, 2025), sumas); assert.deepEqual(mayor(sociedad, '572', 2025), m);
  assert.deepEqual(asientosCierreApertura(diario25, 2025, hoy), diario25); // Idempotencia del diario.
  assert.ok(!asientosCierreApertura(sociedad, 2025, fin).some((a) => a.origen?.tipo === 'cierre-contable'));
});

test('una apertura manual el 1 de enero impide otra automática; sin saldo no se inventa apertura', () => {
  const manual = { ...apunte('2026-01-01', 'Apertura de la empresa', [['572', 100], ['100', -100]], 'apertura'), apertura: true };
  const d = asientosCierreApertura([...sociedad, manual], 2026, hoy);
  assert.equal(d.filter((a) => a.origen?.tipo === 'apertura').length, 1);
  assert.ok(!d.some((a) => a.origen?.tipo === 'apertura-contable'));
  assert.deepEqual(asientosCierreApertura([], 2026, hoy), []);
  // Si no cuadra, el diario sale igual, sin el asiento de cierre (la pantalla no se rompe).
  const incompleto = asientosCierreApertura([apunte('2025-01-01', 'Incompleto', [['572', 10]])], 2025, hoy);
  assert.ok(!incompleto.some((a) => a.origen?.tipo === 'cierre-contable'));
});

test('informe: añade cierre solo a diario, conserva asientos, mayor, sumas y cuentas anuales', () => {
  const datos = { fiscal: { tipo: 'sociedad', iva: 'general' }, manuales: [{ ...apunte('2025-01-01', 'Apertura', [['572', 1000], ['100', -1000]]), apertura: true }], facturas: [{ id: 'f', numero: 1, fecha: '2025-06-01', base: 1000, ivaPct: 0, cobrada: true }] };
  const base = generarAsientos(datos, hoy), d = informe(datos, 2025, '', hoy, { cuenta: '572' });
  assert.deepEqual(d.asientos, base); assert.equal(d.diario.at(-1).origen.tipo, 'cierre-contable');
  assert.deepEqual(d.sumas, sumasYSaldos(base, 2025)); assert.deepEqual(d.mayor, mayor(base, '572', 2025));
  const c = cuentasAnuales({ asientos: d.asientos, gastos: [], empresa: {}, anio: 2025 });
  assert.equal(c.bal[0].activo, 2000); assert.equal(c.bal[0].pasivo, 2000);
  assert.equal(c.bal[0].v['PA1.VII'], 790); // Microempresa en 2025: IS 21 % de 1.000 = 210.
  assert.equal(c.pyg[0].D, 790);
});

// ContaSol sale en un .ods (ZIP sin comprimir) y ContaPlus en un .zip: su content.xml o su XDiario.txt, como texto.
const aTexto = (s) => { if (typeof s === 'string') return s; const z = leerZip(Buffer.from(s)); return (z['content.xml'] || z['XDiario.txt']).toString('utf8'); };
test('exportación A3, ContaPlus y ContaSol: regularización antes de cierre y apertura al principio', () => {
  const conAplicacion = [...sociedad, apunte('2026-01-01', 'Aplicación del resultado', [['129', 895], ['120', -895]], 'cierre')];
  for (const formato of ['a3', 'contaplus', 'contasol']) {
    const texto = aTexto(exportarDiario(conAplicacion, { anio: 2025, formato, fecha: hoy }));
    const filas = formato === 'contasol' ? [...texto.matchAll(/<table:table-row>.*?<\/table:table-row>/g)].map(([f]) => f) : texto.trimEnd().split('\r\n');
    const conceptos = filas.map((f) => formato === 'a3' ? f.slice(69, 99).trim() : formato === 'contaplus' ? f.slice(54, 79).trim() : [...f.matchAll(/string"><text:p>([^<]*)/g)][0][1]);
    const ultimo = conceptos.at(-1);
    assert.match(ultimo, /Cierre contable de 2025/);
    assert.ok(conceptos.some((c) => /Regularizaci[oó]n/.test(c)));
    const apertura = aTexto(exportarDiario(conAplicacion, { anio: 2026, formato, fecha: hoy }));
    assert.ok(apertura.indexOf('Apertura contable de 2026') < apertura.indexOf('Aplicaci'));
  }
});

test('cuadre 572: saldo fechado, caja aparte y diferencia explicada por comisión pendiente', () => {
  // Apertura: bancos 1.000 + caja 50 = capital 1.050. Extracto: 970 tras comisión de 30 sin conciliar.
  // Un apunte posterior de 200 NO puede cambiar la comparación del día 15.
  const asientos = [apunte('2026-01-01', 'Apertura', [['57200001', 1000], ['570', 50], ['100', -1050]]), apunte('2026-01-20', 'Ingreso posterior', [['572', 200], ['705', -200]])];
  const movimientos = [{ id: 'p', fecha: '2026-01-15', importe: -30, estado: 'pendiente' }, { fecha: '2026-01-16', importe: 99, estado: 'pendiente' }, { fecha: '2026-01-10', importe: 100, estado: 'emparejado' }, { fecha: '2026-01-11', importe: -10, estado: 'ignorado' }];
  const entrada = { asientos, saldo: { fecha: '2026-01-15', importe: 970, banco: true }, movimientos };
  const copia = structuredClone(entrada), d = cuadreBanco(entrada);
  assert.deepEqual([d.fecha, d.contable, d.caja, d.real, d.diferencia, d.probable, d.sinExplicar], ['2026-01-15', 1000, 50, 970, -30, -30, 0]);
  assert.deepEqual(d.pendientes, { cantidad: 1, importe: -30 }); assert.deepEqual(entrada, copia);
  assert.equal(cuadreBanco({}), null);
  assert.equal(cuadreBanco({ saldo: { fecha: '2026-01-15', importe: 100 } }), null); // Saldo manual, sin banco ni extractos.
  assert.deepEqual(cuadreBanco({ conectado: true }), { sinSaldo: true });
  assert.deepEqual(cuadreBanco({ movimientos }), { sinSaldo: true });
  assert.equal(cuadreBanco({ ...entrada, hasta: '2025-12-31' }), null);
});

test('cuadre: pagos sin banco y cobros parciales externos, sin duplicar lo ya liquidado ni efectivo', () => {
  const facturas = [{ id: 'f', fecha: '2026-01-02', base: 500, ivaPct: 0, pagos: [{ fecha: '2026-01-03', importe: 100, metodo: 'stripe' }, { fecha: '2026-01-04', importe: 50, metodo: 'stripe', liquidado: 'liquidado' }, { fecha: '2026-02-01', importe: 80, metodo: 'manual' }] }, { fecha: '2026-01-02', caja: { efectivo: 10 }, base: 10, ivaPct: 0, cobrada: true }];
  const gastos = [{ id: 'g', fecha: '2026-01-05', base: 40, ivaPct: 0, pagado: '2026-01-05' }, { fecha: '2026-01-06', base: 99, ivaPct: 0, pendiente: true }];
  const d = cuadreBanco({ saldo: { fecha: '2026-01-15', importe: 0, banco: true }, facturas, gastos });
  assert.equal(d.cobrosSinBanco, 100); assert.equal(d.pagosSinBanco, 40); assert.equal(d.probable, -60);
  const antiguo = cuadreBanco({ saldo: { fecha: '2026-01-15', importe: 0, banco: true }, facturas, movimientos: [{ id: 'antiguo', fecha: '2026-01-10', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f' } }] });
  assert.equal(antiguo.cobrosSinBanco, 0);
});

// Ruta real con dobles de autenticación, Redis y PDF: prueba el CSV y su control de acceso sin servicios externos.
test('GET cuentas-anuales: mismos permisos, validación, CSV descargable y sin invocar PDF', async () => {
  const estado = { permiso: '', denegado: false, pdf: 0 };
  globalThis.__contabilidad95 = estado;
  const dobles = {
    '@/lib/redis': `export const leer=async(u,k)=>k==='asientos'?[{fecha:'2025-01-01',concepto:'Apertura',apertura:true,lineas:[{cuenta:'572',debe:1000,haber:0},{cuenta:'100',debe:0,haber:1000}]}]:[]; export const leerUno=async()=>null; export const guardar=async()=>{};`,
    '@/lib/api': `const s=globalThis.__contabilidad95; export const usuarioApi=async(o)=>{s.permiso=o.permiso;return s.denegado?{res:new Response(null,{status:403})}:{u:{id:'prueba',fiscal:{tipo:'sociedad'}}};}; export const error=(m)=>Response.json({error:m},{status:400}); export const cuerpo=async()=>({});`,
    '@/lib/cuentasAnualesPdf': `export const cuentasAnualesPdf=async()=>{globalThis.__contabilidad95.pdf++;return new Uint8Array();};`,
    '@/lib/auditoria': `export const auditar=async()=>{};`,
    '@/lib/limite': `export const pasado=async()=>false; export const respuesta429=()=>new Response(null,{status:429});`,
  };
  const modulo = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  let fuente = await readFile(new URL('../app/api/cuentas-anuales/route.js', import.meta.url), 'utf8');
  fuente = fuente.replace(/from '(@\/lib\/[^']+)'/g, (_, nombre) => `from '${dobles[nombre] ? modulo(dobles[nombre]) : new URL('../' + nombre.slice(2) + '.js', import.meta.url).href}'`);
  try {
    const { GET } = await import(modulo(fuente));
    const req = (q) => ({ nextUrl: new URL('https://fisquo.test/api/cuentas-anuales?' + q) });
    const r = await GET(req('anio=2025&formato=pymes'));
    assert.equal(estado.permiso, 'resumen'); assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'text/csv; charset=utf-8');
    assert.match(r.headers.get('Content-Disposition'), /balance-pyg-pymes-2025\.csv/);
    const bytes = new Uint8Array(await r.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
    assert.match(Buffer.from(bytes).toString('utf8'), /10000;TOTAL ACTIVO \(A \+ B\);1000,00;0,00/);
    assert.equal(estado.pdf, 0);
    assert.equal((await GET(req('anio=2025.5&formato=pymes'))).status, 400);
    assert.equal((await GET(req('anio=2025&formato=otro'))).status, 400);
    estado.denegado = true; assert.equal((await GET(req('anio=2025&formato=pymes'))).status, 403);
  } finally { delete globalThis.__contabilidad95; }
});

test('lector de exportaciones: el mismo cierre en todos los formatos, sin escrituras ni datos de otra empresa', async () => {
  const usuario = { id: 'empresa-prueba', fiscal: { tipo: 'sociedad', iva: 'general' } };
  const lecturas = [];
  globalThis.__lectorContabilidad95 = { lecturas, usuario,
    asientos: [{ fecha: '2025-01-01', concepto: 'Apertura manual', apertura: true, lineas: [{ cuenta: '572', debe: 1000, haber: 0 }, { cuenta: '100', debe: 0, haber: 1000 }] }],
    facturas: [{ id: 'f', fecha: '2025-06-01', numero: 1, base: 1000, ivaPct: 0, cobrada: true }],
  };
  const modulo = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  const redis = modulo(`export const leer=async(u,k)=>{const s=globalThis.__lectorContabilidad95;if(u!==s.usuario)throw Error('Empresa distinta');s.lecturas.push(k);return s[k]||[];};`);
  let fuente = await readFile(new URL('../lib/contabilidad.js', import.meta.url), 'utf8');
  fuente = fuente.replace(/(from |import\()'(\.\/[^']+)'/g, (_, prefijo, ruta) => `${prefijo}'${ruta === './redis.js' ? redis : new URL('../lib/' + ruta.slice(2), import.meta.url).href}'`);
  try {
    const { diarioConCierreDe } = await import(modulo(fuente));
    for (const formato of ['a3', 'contaplus', 'contasol']) {
      const r = await diarioConCierreDe(usuario, { anio: 2025, formato, fecha: hoy });
      assert.equal(r.error, undefined);
      assert.match(aTexto(r.contenido), /Regularizaci[oó]n de 2025/);
      assert.match(formato === 'contasol' ? aTexto(r.contenido).split('<table:table-row>').at(-1) : aTexto(r.contenido).split('\r\n').at(-2), /Cierre contable de 2025/);
    }
    assert.equal(lecturas.length, 24); // Ocho colecciones de esta empresa por exportación; solo existe «leer» en el doble.
  } finally { delete globalThis.__lectorContabilidad95; }
});

// Crea (o rehace desde cero) la empresa de demo: una S.L. de sonido e iluminación para eventos,
// con dos años de facturas, gastos (con categorías del plan contable y bienes de inversión que se amortizan), clientes
// ficticios, el saldo del banco y Verifactu en modo pruebas.
// Uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… DEMO_PASSWORD=… node scripts/demo.mjs
// Si la demo ya existe, DEMO_PASSWORD es opcional: sin ella se conserva la contraseña que tiene.
import { randomBytes, scryptSync } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { numeroFactura, siguienteNumero } from '../lib/calculos.js';
import { borradorSociedades, modelo202 } from '../lib/modelos.js';
import { asientoApertura, generarAsientos, mayor } from '../lib/asientos.js';
import { idMovimiento } from '../lib/banco.js';
import { importes } from '../lib/calculos.js';

const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token, DEMO_PASSWORD: password } = process.env;
if (!url || !token) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const EMAIL = process.env.DEMO_EMAIL || 'demo@verticexp.com';
const r = new Redis({ url, token });
const P = 'cuentas:';

// Si ya existe, se reutilizan sus ids (y su contraseña, si no se da otra) y se borran sus datos.
const previo = await r.hget(`${P}emails`, EMAIL);
const passPrevia = previo && (await r.hget(`${P}usuarios`, previo))?.pass;
if (password ? password.length < 8 : !passPrevia) throw new Error('DEMO_PASSWORD de al menos 8 caracteres');
// Mismo formato de contraseña que lib/auth.js.
const sal = randomBytes(16).toString('hex');
const pass = password ? `${sal}:${scryptSync(password, sal, 64).toString('hex')}` : passPrevia;
const id = previo || randomBytes(4).toString('hex');
await r.del(...['facturas', 'gastos', 'clientes', 'registros', 'verifactu', 'saldo', 'asientos', 'banco', 'bancos', 'cuentasAnuales'].map((n) => `${P}${n}:${id}`));

const ACTIVIDADES = [
  { id: 'sonido-e-iluminacion', nombre: 'Sonido e iluminación', serie: '', ivaPct: 21, irpfPct: 0 },
  { id: 'alquiler-de-equipos', nombre: 'Alquiler de equipos', serie: 'A', ivaPct: 21, irpfPct: 0 },
  { id: 'dj-y-musica', nombre: 'DJ y música en vivo', serie: 'M', ivaPct: 21, irpfPct: 0 },
];
const ahora = new Date().toISOString();
const empresa = {
  id, nombre: 'Sonora Eventos S.L.', creada: ahora, pendiente: false, verifactu: 'pruebas',
  emisor: { nombre: 'SONORA EVENTOS S.L.', nif: 'B00000000', direccion: 'C/ de la Marina, 19', ciudad: '08005 Barcelona', iban: 'ES91 2100 0418 4502 0005 1332', plazo: 30 },
  actividades: ACTIVIDADES,
  fiscal: { tipo: 'sociedad', iva: 'general', retenidas: false, trabajadores: true, alquiler: true, intracom: false },
};
await r.hset(`${P}empresas`, { [id]: empresa });
await r.hset(`${P}usuarios`, { [id]: { id, nombre: 'Demo', email: EMAIL, admin: false, creado: ahora, empresa: id, rol: 'admin', pass } });
await r.hset(`${P}emails`, { [EMAIL]: id });

// Generador con semilla: la demo sale siempre igual.
let semilla = 7;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const entre = (a, b) => Math.round((a + azar() * (b - a)) / 5) * 5;
const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
const dia = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const CLIENTES = [
  { nombre: 'Hotel Mirador del Port S.A.', nif: 'A00000001', direccion: 'Passeig de Colom, 12', ciudad: '08002 Barcelona' },
  { nombre: 'Agencia Brisa Incentivos S.L.', nif: 'B00000002', direccion: 'C/ de Balmes, 210', ciudad: '08006 Barcelona' },
  { nombre: 'Celebra Bodas y Eventos S.L.', nif: 'B00000003', direccion: 'Av. Diagonal, 455', ciudad: '08036 Barcelona' },
  { nombre: 'Ajuntament de Vilamar', nif: 'P0800000A', direccion: 'Plaça Major, 1', ciudad: '08390 Vilamar' },
  { nombre: 'Beach Club Levante S.L.', nif: 'B00000004', direccion: 'Passeig Marítim, 30', ciudad: '08005 Barcelona' },
  { nombre: 'Congresos Mediterrània S.L.', nif: 'B00000005', direccion: 'C/ de Pujades, 77', ciudad: '08005 Barcelona' },
  { nombre: 'Fundació Música Viva', nif: 'G00000006', direccion: 'C/ del Rec, 15', ciudad: '08003 Barcelona' },
  { nombre: 'Laura Puig Ferrer', nif: '00000007T', direccion: 'C/ de Sants, 102', ciudad: '08014 Barcelona' },
];
const CONCEPTOS = {
  'sonido-e-iluminacion': ['Sonorización e iluminación de evento corporativo', 'Montaje técnico de sonido para congreso', 'Iluminación escénica para gala', 'Técnico de sonido y equipo para boda'],
  'alquiler-de-equipos': ['Alquiler de equipo de sonido (fin de semana)', 'Alquiler de focos LED y mesa de luces', 'Alquiler de pantalla LED 3x2 m'],
  'dj-y-musica': ['Sesión de DJ (4 horas) con equipo', 'Música en vivo para cóctel', 'DJ para fiesta de empresa'],
};
const IMPORTES = { 'sonido-e-iluminacion': [900, 4800], 'alquiler-de-equipos': [180, 1200], 'dj-y-musica': [350, 1100] };
// Más trabajo de mayo a septiembre y en diciembre.
const EVENTOS_MES = [3, 3, 4, 5, 8, 10, 11, 7, 9, 6, 5, 8];

const facturas = [];
const gastos = [];
const hoy = new Date().toISOString().slice(0, 10);
const inicio = new Date(Date.UTC(new Date().getUTCFullYear() - 2, new Date().getUTCMonth(), 1));
for (let d = inicio; d.toISOString().slice(0, 10) <= hoy; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const dias = [];
  for (let i = 0; i < EVENTOS_MES[m - 1]; i++) dias.push(1 + Math.floor(azar() * 28));
  for (const n of dias.sort((a, b) => a - b)) {
    const fecha = dia(y, m, n);
    if (fecha > hoy) continue;
    const a = elegir(ACTIVIDADES);
    const [min, max] = IMPORTES[a.id];
    const numero = siguienteNumero(facturas, y, a.serie);
    const antig = (Date.parse(hoy) - Date.parse(fecha)) / 864e5;
    facturas.push({
      id: `${a.serie}${y}-${numero}`, numero, anio: y, ...(a.serie ? { serie: a.serie } : {}), fecha, actividad: a.id,
      cliente: elegir(CLIENTES), concepto: elegir(CONCEPTOS[a.id]), base: entre(min, max), ivaPct: 21, irpfPct: 0, nota: '',
      cobrada: antig > 75 ? azar() > 0.03 : antig > 30 ? azar() > 0.5 : false,
    });
  }
  const g = (dd, concepto, base, ivaPct = 21, actividad = 'sonido-e-iluminacion', extra = {}) => {
    const fecha = dia(y, m, dd);
    if (fecha <= hoy) gastos.push({ id: `demo-${gastos.length + 1}`, fecha, actividad, concepto, base, ivaPct, ...extra });
  };
  g(1, 'Alquiler del almacén', 950);
  g(5, 'Gestoría', 180);
  g(5, 'Seguro de responsabilidad civil', 62, 0);
  g(8, 'Teléfono e internet', 75);
  g(10, 'Software y suscripciones', 48);
  g(28, 'Nóminas y Seguridad Social', 4200 + EVENTOS_MES[m - 1] * 150, 0);
  g(15, 'Combustible furgoneta', entre(120, 380));
  if (azar() > 0.6) g(18, 'Publicidad en Instagram y Google', entre(80, 300));
  if (azar() > 0.7) g(20, 'Material y equipos (cables, lámparas, consumibles)', entre(150, 900), 21, 'alquiler-de-equipos');
  if (m === 3 || m === 10) g(22, 'Equipo de sonido nuevo (altavoces)', entre(2500, 6000), 21, 'alquiler-de-equipos', { proveedor: 'Audio Pro Barcelona S.L.', inversion: { tipo: 'electronicos' } });
  // Gastos de otras partidas, para que la cuenta de pérdidas y ganancias tenga de todo.
  g(3, 'Comisiones bancarias', 18, 0);
  g(12, 'Intereses del préstamo de la furgoneta', 95, 0, 'sonido-e-iluminacion', { proveedor: 'CaixaBank' });
  if (m % 2 === 0) g(14, 'Transporte de equipos a eventos', entre(150, 450), 21, 'sonido-e-iluminacion', { proveedor: 'Transportes Ràpid S.L.' });
  if (m === 2 || m === 8) g(16, 'Mantenimiento y revisión de la furgoneta', entre(220, 520));
  if (m === 6) g(10, 'IBI y tasa de basuras del almacén', 640, 0);
  if (EVENTOS_MES[m - 1] >= 8) g(24, 'Técnicos de montaje subcontratados', entre(900, 2200), 21, 'sonido-e-iluminacion', { proveedor: 'Montajes Escénicos BCN S.L.', categoria: '607' });
}

// Bienes de inversión: no se restan enteros, se amortizan (lib/amortizaciones.js).
const hace = (meses, d = 10) => { const x = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - meses, d)); return x.toISOString().slice(0, 10); };
const bien = (fecha, concepto, proveedor, base, tipo, actividad = 'sonido-e-iluminacion') =>
  gastos.push({ id: `demo-bien-${gastos.length + 1}`, fecha, actividad, concepto, proveedor, base, ivaPct: 21, inversion: { tipo } });
bien(hace(22, 4), 'Furgoneta Renault Master para el transporte de equipos', 'Garatge Martí S.A.', 28500, 'transporte');
bien(hace(20, 15), 'Mesa de luces y 24 focos LED robotizados', 'Stage Light Iberia S.L.', 9800, 'electronicos');
bien(hace(14, 7), 'Dos portátiles para el control de sonido', 'Apple Distribution International', 4200, 'informatica');
bien(hace(9, 20), 'Estanterías y mobiliario del almacén', 'Ikea Ibérica S.A.', 1850, 'mobiliario');
bien(hace(5, 3), 'Herramientas de montaje (taladros, escaleras)', 'Leroy Merlin España S.L.', 680, 'utiles');
bien(hace(2, 18), 'Disco duro para las sesiones', 'PcComponentes S.L.', 240, 'informatica');

// Una rectificativa de ejemplo: devolución parcial de una factura del año pasado.
const orig = facturas.find((f) => f.anio === new Date().getUTCFullYear() - 1 && f.base > 1500);
if (orig) {
  const fecha = dia(orig.anio, Number(orig.fecha.slice(5, 7)), Math.min(28, Number(orig.fecha.slice(8)) + 10));
  const numero = siguienteNumero(facturas, orig.anio, 'R');
  facturas.push({ ...orig, id: `R${orig.anio}-${numero}`, numero, serie: 'R', fecha, base: -200, concepto: 'Descuento por reducción de horario del evento', cobrada: true,
    rectifica: { id: orig.id, numero: numeroFactura(orig), fecha: orig.fecha } });
}

const porId = (xs) => Object.fromEntries(xs.map((x) => [x.id, x]));
await r.hset(`${P}facturas:${id}`, porId(facturas));
await r.hset(`${P}gastos:${id}`, porId(gastos));
// Trimestres ya presentados (los que tienen el plazo pasado), el Impuesto sobre Sociedades de los años cerrados y sus 202.
const Y = Number(hoy.slice(0, 4));
const pagos130 = {}, pagos202 = {}, cuotaIS = {};
for (let y = Y - 2; y <= Y; y++) for (let t = 1; t <= 4; t++) {
  const plazo = t === 4 ? `${y + 1}-01-30` : `${y}-${['04', '07', '10'][t - 1]}-20`;
  if (plazo < hoy) (pagos130[y] ||= {})[t] = 0;
}
for (let y = Y - 2; y < Y; y++) if (`${y + 1}-07-25` < hoy) cuotaIS[y] = borradorSociedades(facturas, gastos, y).cuota;
for (let y = Y - 1; y <= Y; y++) for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha < hoy) (pagos202[y] ||= {})[x.p] = x.pago;
await r.hset(`${P}empresas`, { [id]: { ...empresa, pagos130, pagos202, cuotaIS } });

// Contabilidad: apertura (capital y lo que había en el banco), el préstamo de la furgoneta y sus cuotas de principal.
const primera = [...facturas, ...gastos].map((x) => x.fecha).sort()[0];
const furgo = gastos.find((g) => g.inversion?.tipo === 'transporte');
const asientos = [{ id: 'demo-apertura', ...asientoApertura({ fecha: primera, banco: 15000, capital: 3000 }, true) }];
asientos.push({ id: 'demo-prestamo', fecha: furgo.fecha, concepto: 'Préstamo para la furgoneta (CaixaBank)', lineas: [{ cuenta: '572', debe: 24000, haber: 0 }, { cuenta: '170', debe: 0, haber: 19200 }, { cuenta: '520', debe: 0, haber: 4800 }] });
for (let d = new Date(`${furgo.fecha.slice(0, 7)}-12T00:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d.setUTCMonth(d.getUTCMonth() + 1)) {
  const f = d.toISOString().slice(0, 10);
  if (f <= furgo.fecha) continue;
  asientos.push({ id: `demo-cuota-${f}`, fecha: f, concepto: 'Cuota del préstamo de la furgoneta (principal)', lineas: [{ cuenta: '520', debe: 400, haber: 0 }, { cuenta: '572', debe: 0, haber: 400 }] });
  // Cada año, lo que toca devolver en los 12 meses siguientes pasa del largo al corto plazo.
  if (f.slice(5, 7) === furgo.fecha.slice(5, 7) && f.slice(0, 4) > furgo.fecha.slice(0, 4)) asientos.push({ id: `demo-reclasif-${f}`, fecha: f, concepto: 'Préstamo: traspaso a corto plazo', lineas: [{ cuenta: '170', debe: 4800, haber: 0 }, { cuenta: '520', debe: 0, haber: 4800 }] });
}
await r.hset(`${P}asientos:${id}`, porId(asientos));

// El saldo del banco, el mismo que da la contabilidad (así cuadra la cuenta 572 con el banco).
const banco = mayor(generarAsientos({ facturas, gastos, manuales: asientos, fiscal: empresa.fiscal, pagos130, pagos202, cuotaIS }, hoy), '57', Y).final;
await r.set(`${P}saldo:${id}`, { importe: banco, fecha: hoy });
await r.hset(`${P}clientes:${id}`, porId(CLIENTES.map((c) => ({ id: c.nombre.toUpperCase(), ...c }))));
// Extracto del último mes y medio, sin emparejar: los cobros de facturas pendientes y los pagos de gastos (Netto los
// sugiere), y algunos cargos que no están en Netto (salen en Gastos › En revisión o para decir qué son en Banco).
const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 45 * 864e5).toISOString().slice(0, 10);
const mas = (f, d) => new Date(Date.parse(`${f}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
const movs = [];
const mov = (fecha, importe, concepto, contraparte = '') => { if (fecha <= hoy && fecha >= desde) movs.push({ fecha, importe: Math.round(importe * 100) / 100, concepto, contraparte }); };
for (const f of facturas.filter((x) => !x.cobrada && x.fecha >= mas(desde, -30)).slice(0, 4)) mov(mas(f.fecha, 12), importes(f).total, `TRANSFERENCIA FACTURA ${numeroFactura(f)}`, f.cliente.nombre);
for (const g of gastos.filter((x) => x.fecha >= desde && !x.inversion && !/Nóminas/.test(x.concepto))) mov(g.fecha, -(g.base * (1 + g.ivaPct / 100)), `RECIBO ${g.concepto.toUpperCase()}`, g.proveedor || '');
const m1 = hoy.slice(0, 8);
mov(`${m1}02`, -86.9, 'COMPRA TARJETA AMAZON MARKETPLACE', 'AMAZON EU SARL');
mov(`${m1}04`, -142.35, 'PAGO TPV LEROY MERLIN', 'LEROY MERLIN');
mov(mas(desde, 10), -64.2, 'COMPRA TARJETA REPSOL', 'ESTACION REPSOL');
mov(mas(desde, 5), -15, 'COMISION MANTENIMIENTO CUENTA');
mov(mas(desde, 12), -1000, 'TRASPASO A CUENTA PROPIA');
const conIds = movs.map((m, i) => ({ id: idMovimiento('extracto', m, i), cuenta: 'extracto', estado: 'pendiente', ...m }));
await r.hset(`${P}banco:${id}`, porId(conIds));
await r.hset(`${P}bancos:${id}`, { extracto: { id: 'extracto', nombre: 'CaixaBank', origen: 'extracto', subido: hoy, saldo: banco, fechaSaldo: hoy } });

console.log(`Demo lista: ${EMAIL} · ${facturas.length} facturas · ${gastos.length} gastos · desde ${inicio.toISOString().slice(0, 10)}`);

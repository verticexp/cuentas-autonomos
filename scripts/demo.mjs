// Crea (o rehace desde cero) la empresa de demo: una S.L. de sonido e iluminación para eventos, con dos años de todo lo
// que hace la app: facturas (series, rectificativa, recurrentes, presupuestos, ventas a la UE), gastos (alquiler con
// retención, compras a la UE, dietas, bienes de inversión que se amortizan, pagos con vencimiento), empleados con sus
// nóminas y su registro de jornada, dividendos, inventario, pedidos y albaranes, remesas SEPA, el banco, la contabilidad,
// dos personas más del equipo con sus permisos y Verifactu en modo pruebas.
// Uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… DEMO_PASSWORD=… node scripts/demo.mjs
// Si la demo ya existe, DEMO_PASSWORD es opcional: sin ella se conserva la contraseña que tiene.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { numeroFactura, siguienteNumero, limpiarLineas, baseLinea, importes, r2 } from '../lib/calculos.js';
import { borradorSociedades, modelo202 } from '../lib/modelos.js';
import { asientoApertura, generarAsientos, mayor } from '../lib/asientos.js';
import { idMovimiento } from '../lib/banco.js';
import { inventario } from '../lib/inventario.js';
import { limpiarCierre } from '../lib/caja.js';
import { limpiarDoc, siguiente, albaranDePedido, facturaDeAlbaranes, limpiarPedidoProv, gastoDeRecepcion, estadoPedido, enCamino } from '../lib/albaranes.js';
import { ibanValido, identificadorAcreedor } from '../lib/sepa.js';
import { claveProveedor } from '../lib/proveedores.js';
import { limpiarProyecto } from '../lib/proyectos.js';
import { calculoNomina, fechaPagoNomina, gastoDeNomina, limpiarCotizacion, limpiarDatos145, nominaCompleta } from '../lib/nominas.js';
import { extrasNomina, laborables, resumenMes, validar } from '../lib/jornada.js';
import { calcularDieta, conceptoDieta } from '../lib/dietas.js';
import { limpiarPago, plazo123 } from '../lib/capitalMobiliario.js';
import { plantillaDe } from '../lib/recurrentes.js';
import { baseSenal, numeroPresupuesto } from '../lib/presupuestos.js';
import { VERSION_PERMISOS } from '../lib/permisos.js';
import { escribirIndices } from './indicesDemo.mjs';

const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token, DEMO_PASSWORD: password } = process.env;
if (!url || !token) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const EMAIL = (process.env.DEMO_EMAIL || 'demo@verticexp.com').trim().toLowerCase();
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
// Los datos de antes se borran justo antes de escribir los nuevos (tras las comprobaciones de integridad).

const ACTIVIDADES = [
  { id: 'sonido-e-iluminacion', nombre: 'Sonido e iluminación', serie: '', ivaPct: 21, irpfPct: 0 },
  { id: 'alquiler-de-equipos', nombre: 'Alquiler de equipos', serie: 'A', ivaPct: 21, irpfPct: 0 },
  { id: 'dj-y-musica', nombre: 'DJ y música en vivo', serie: 'M', ivaPct: 21, irpfPct: 0 },
];
ACTIVIDADES.push({ id: 'tienda-de-material', nombre: 'Tienda de material', serie: 'T', ivaPct: 21, irpfPct: 0 });
const actividadesEventos = ACTIVIDADES.filter((a) => a.id !== 'tienda-de-material');
const ahora = new Date().toISOString();
const empresa = {
  id, nombre: process.env.DEMO_EMPRESA || 'Sonora Eventos S.L.', creada: ahora, pendiente: false, verifactu: 'pruebas',
  emisor: { nombre: (process.env.DEMO_EMPRESA || 'SONORA EVENTOS S.L.').toUpperCase(), nif: 'B00000000', direccion: 'C/ de la Marina, 19', ciudad: '08005 Barcelona', iban: 'ES91 2100 0418 4502 0005 1332', plazo: 30, bic: 'CAIXESBBXXX', acreedorSepa: identificadorAcreedor('B00000000') },
  actividades: ACTIVIDADES,
  fiscal: { tipo: 'sociedad', iva: 'general', retenidas: false, trabajadores: true, alquiler: true, intracom: true, inventario: true },
};

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
const IMPORTES = { 'sonido-e-iluminacion': [1600, 6400], 'alquiler-de-equipos': [260, 1400], 'dj-y-musica': [450, 1300] };
// Más trabajo de mayo a septiembre y en diciembre.
const EVENTOS_MES = [3, 3, 4, 5, 8, 10, 11, 7, 9, 6, 5, 8];

const facturas = [];
const gastos = [];
const albaranes = [], pedidosProv = [], domiciliaciones = [], cuentasProv = [], remesas = [];
const hoy = new Date().toISOString().slice(0, 10);
const mas = (f, d) => new Date(Date.parse(`${f}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
const antes = (d) => mas(hoy, -d);
const creado = (fecha) => `${fecha}T10:00:00.000Z`;
const inicio = new Date(Date.UTC(new Date().getUTCFullYear() - 2, new Date().getUTCMonth(), 1));
for (let d = inicio; d.toISOString().slice(0, 10) <= hoy; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const dias = [];
  for (let i = 0; i < EVENTOS_MES[m - 1]; i++) dias.push(1 + Math.floor(azar() * 28));
  for (const n of dias.sort((a, b) => a - b)) {
    const fecha = dia(y, m, n);
    if (fecha > hoy) continue;
    const a = elegir(actividadesEventos);
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
  // El almacén es alquilado: la empresa retiene el 19 % al propietario (modelos 115 y 180).
  g(1, 'Alquiler del almacén', 950, 21, 'sonido-e-iluminacion', { proveedor: 'Finques Poblenou S.L.', proveedorNif: 'B00000301', alquiler: true });
  g(5, 'Gestoría', 180);
  g(5, 'Seguro de responsabilidad civil', 62, 0);
  g(8, 'Teléfono e internet', 75);
  g(10, 'Software y suscripciones', 48);
  // Material comprado en Alemania dos veces al año: sin IVA en la factura, lo autoliquida Sonora (303 y 349).
  if (m === 4 || m === 11) g(9, 'Micrófonos y accesorios (Musikhaus Thomann)', 780 + m * 15, 0, 'alquiler-de-equipos', { proveedor: 'Musikhaus Thomann GmbH', proveedorNif: 'DE000000001', origen: 'ue', ivaAuto: 21 });
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

// Inventario: material que también venden (cables, lámparas, pilas…), con su stock inicial, compras cada pocos meses
// y ventas sueltas. Los servicios del catálogo no llevan stock.
const PRODUCTOS = [
  { id: 'a1b2c3d4e501', nombre: 'Cable XLR 10 m', sku: 'XLR-10', precio: 24, ivaPct: 21, coste: 9.5, minimo: 20, maximo: 60, proveedor: 'Audio Pro Barcelona S.L.' },
  { id: 'a1b2c3d4e502', nombre: 'Lámpara LED PAR 64', sku: 'PAR64-LED', precio: 89, ivaPct: 21, coste: 42, minimo: 6, maximo: 20, proveedor: 'Stage Light Iberia S.L.' },
  { id: 'a1b2c3d4e503', nombre: 'Pilas AA (pack de 24)', sku: 'PIL-AA24', precio: 14, ivaPct: 21, coste: 6.2, minimo: 10, maximo: 40, proveedor: 'Suministros Vega S.L.' },
  { id: 'a1b2c3d4e504', nombre: 'Cinta gaffer negra 50 m', sku: 'GAF-50', precio: 18, ivaPct: 21, coste: 7.8, minimo: 12, maximo: 36, proveedor: 'Suministros Vega S.L.' },
  { id: 'a1b2c3d4e505', nombre: 'Micrófono inalámbrico de mano', sku: 'MIC-UHF', precio: 210, ivaPct: 21, coste: 128, minimo: 2, maximo: 6, proveedor: 'Audio Pro Barcelona S.L.' },
  { id: 'a1b2c3d4e506', nombre: 'Montaje y desmontaje (hora)', precio: 45, ivaPct: 21, servicio: true },
];
const inicioInv = facturas.map((f) => f.fecha).sort()[0];
const ajustesStock = [
  [0, 40, 9.5], [1, 12, 42], [2, 25, 6.2], [3, 30, 7.8], [4, 4, 128],
].map(([i, cantidad, coste]) => ({ id: `demo-ini-${i}`, producto: PRODUCTOS[i].id, fecha: inicioInv, cantidad, motivo: 'inicial', coste }));
ajustesStock.push({ id: 'demo-rotura-1', producto: PRODUCTOS[1].id, fecha: dia(Number(hoy.slice(0, 4)) - 1, 8, 20), cantidad: -1, motivo: 'rotura', nota: 'Se cayó en un montaje' });
// Ventas sueltas de material, con su producto en cada línea.
for (let k = 0; k < 26; k++) {
  const fecha = new Date(Date.parse(`${inicioInv}T12:00:00Z`) + (k + 1) * 26 * 864e5).toISOString().slice(0, 10);
  if (fecha > hoy) break;
  const y = Number(fecha.slice(0, 4));
  const lineas = [PRODUCTOS[k % 5], PRODUCTOS[(k + 2) % 5]].map((p, j) => ({ concepto: p.nombre, cantidad: p.minimo > 10 ? 4 + ((k + j) % 5) : 1 + ((k + j) % 2), precio: p.precio, dto: 0, ivaPct: 21, producto: p.id }));
  const base = Math.round(lineas.reduce((s, l) => s + l.cantidad * l.precio, 0) * 100) / 100;
  const a = ACTIVIDADES[1];
  const numero = siguienteNumero(facturas, y, a.serie);
  facturas.push({ id: `${a.serie}${y}-${numero}`, numero, anio: y, serie: a.serie, fecha, actividad: a.id, cliente: elegir(CLIENTES), concepto: `${lineas[0].concepto} y 1 más`, base, ivaPct: 21, irpfPct: 0, nota: '', lineas, cobrada: (Date.parse(hoy) - Date.parse(fecha)) / 864e5 > 30 });
}
// Compras de reposición cada dos meses: lo que esté cerca del mínimo, hasta el máximo (como haría la tienda).
for (let k = 1; k * 60 < (Date.parse(hoy) - Date.parse(inicioInv)) / 864e5; k++) {
  const fecha = new Date(Date.parse(`${inicioInv}T12:00:00Z`) + k * 60 * 864e5).toISOString().slice(0, 10);
  const inv = inventario({ productos: PRODUCTOS, facturas, gastos, ajustes: ajustesStock, albaranes }, { hoy: fecha });
  const pedir = inv.productos.filter((p) => p.stock <= p.minimo * 1.5);
  for (const prov of [...new Set(pedir.map((p) => p.proveedor))]) {
    const items = pedir.filter((p) => p.proveedor === prov);
    const stock = items.map((p) => ({ producto: p.id, cantidad: Math.max(1, p.maximo - Math.max(0, p.stock)), coste: Math.round(p.coste * (1 + k * 0.01) * 100) / 100 }));
    const base = Math.round(stock.reduce((s2, l) => s2 + l.cantidad * l.coste, 0) * 100) / 100;
    gastos.push({ id: `demo-compra-${k}-${items[0].id}`, fecha, actividad: 'alquiler-de-equipos', concepto: `Reposición: ${items.map((p) => p.nombre).join(', ')}`.slice(0, 140), proveedor: prov, base, ivaPct: 21, categoria: '600', stock });
  }
}

// Pedidos a proveedor: una recepción parcial y material en camino.
for (const [i, indices, fecha] of [[0, [2, 3], antes(23)], [1, [1], antes(2)]]) {
  const proveedor = PRODUCTOS[indices[0]].proveedor;
  const datos = limpiarPedidoProv({ fecha, proveedor, lineas: indices.map((j) => ({ producto: PRODUCTOS[j].id, cantidad: j === 1 ? 8 : 18, coste: PRODUCTOS[j].coste })) }, PRODUCTOS);
  assert.ok(!datos.error, datos.error);
  const p = { id: `demo-pp-${i + 1}`, numero: i + 1, anio: Number(fecha.slice(0, 4)), ...datos, creado: creado(fecha), por: id };
  pedidosProv.push(p);
  if (i === 0) {
    const fecha = antes(20);
    const recibido = p.lineas.map((l, j) => ({ ...l, cantidad: l.cantidad - (j === 0 ? 1 : 0) }));
    const datos = gastoDeRecepcion(p, { fecha, recibido, ivaPct: 21, actividad: 'alquiler-de-equipos' });
    assert.ok(!datos.error, datos.error);
    const g = { id: 'demo-pedido-gasto-1', ...datos };
    gastos.push(g);
    Object.assign(p, { recibido: fecha, gasto: g.id });
  }
}

// Stock disponible en la fecha, reservando también las ventas posteriores ya generadas.
const disponible = (fecha) => {
  const datos = { productos: PRODUCTOS, facturas, gastos, ajustes: ajustesStock, albaranes };
  const inv = inventario(datos, { hoy: fecha });
  const futuros = inventario(datos, { hoy }).movimientos.filter((m) => m.fecha > fecha);
  return inv.productos.map((p) => ({ ...p, disponible: Math.floor(Math.min(p.stock, ...futuros.filter((m) => m.producto === p.id).map((m) => m.stock))) }));
};
const linea = (p, cantidad) => ({ concepto: p.nombre, producto: p.id, cantidad, precio: p.precio, dto: 0, ivaPct: 21 });
const servicio = (cantidad = 2) => ({ concepto: 'Montaje y desmontaje (hora)', cantidad, precio: 45, dto: 0, ivaPct: 21 });
const material = (fecha, cantidad = 2) => disponible(fecha).filter((p) => p.disponible >= cantidad).sort((a, b) => b.disponible - a.disponible).slice(0, 2).map((p) => linea(p, cantidad));
const doc = (b, tipo) => {
  const datos = limpiarDoc(b, tipo);
  assert.ok(!datos.error, datos.error);
  if (tipo === 'albaran') {
    const stock = disponible(b.fecha);
    for (const producto of new Set(datos.lineas.map((l) => l.producto).filter(Boolean))) {
      const cantidad = datos.lineas.filter((l) => l.producto === producto).reduce((s, l) => s + l.cantidad, 0);
      assert.ok(cantidad <= stock.find((p) => p.id === producto).disponible, `Stock para ${producto} en ${b.fecha}`);
    }
  }
  const anio = Number(b.fecha.slice(0, 4));
  const numero = siguiente(albaranes, tipo, anio);
  const n = albaranes.filter((d) => d.tipo === tipo).length + 1;
  const d = { id: `demo-${tipo === 'pedido' ? 'ped' : 'alb'}-${n}`, numero, anio, ...datos, creado: creado(b.fecha), por: id };
  albaranes.push(d);
  return d;
};
// Hotel: dos entregas y una factura agrupada, sin volver a sacar stock.
{
  const fecha = antes(40);
  const lineas = [...material(fecha), servicio(4)];
  assert.equal(lineas.length, 3);
  const p = doc({ fecha, cliente: CLIENTES[0], lineas }, 'pedido');
  const primera = albaranDePedido(p, albaranes, antes(38));
  primera.lineas = primera.lineas.map((l) => ({ ...l, cantidad: l.cantidad / 2 }));
  const a1 = doc(primera, 'albaran');
  const a2 = doc(albaranDePedido(p, albaranes, antes(35)), 'albaran');
  const datos = facturaDeAlbaranes([a1, a2]);
  assert.ok(!datos.error, datos.error);
  const fechaFactura = antes(34), y = Number(fechaFactura.slice(0, 4));
  const numero = siguienteNumero(facturas, y, 'A');
  const lineasFactura = limpiarLineas(datos.lineas);
  const f = { id: `A${y}-${numero}`, numero, anio: y, serie: 'A', fecha: fechaFactura, actividad: 'alquiler-de-equipos', cliente: datos.cliente, lineas: lineasFactura, base: r2(lineasFactura.reduce((s, l) => s + baseLinea(l), 0)), ivaPct: 21, irpfPct: 0, concepto: `${lineasFactura[0].concepto} y ${lineasFactura.length - 1} más`, nota: datos.nota, cobrada: true, cobro: { fecha: antes(30), metodo: 'manual' } };
  facturas.push(f);
  a1.factura = a2.factura = f.id;
  assert.equal(estadoPedido(p, albaranes).estado, 'servido');
}
// Congreso parcialmente servido y boda pendiente con entrega prevista.
{
  const fecha = antes(12);
  const p = doc({ fecha, cliente: CLIENTES[5], lineas: [...material(fecha), servicio()] }, 'pedido');
  assert.equal(p.lineas.length, 3);
  const a = albaranDePedido(p, albaranes, antes(10));
  a.lineas = a.lineas.slice(0, 2).map((l, i) => ({ ...l, cantidad: i === 0 ? 1 : l.cantidad }));
  doc(a, 'albaran');
  assert.equal(estadoPedido(p, albaranes).estado, 'parcial');
  doc({ fecha: antes(5), entrega: mas(hoy, 6), cliente: CLIENTES[2], lineas: [...material(antes(5)), servicio()] }, 'pedido');
}
// Dos entregas del Beach Club pendientes de agrupar en factura.
for (const fecha of [mas(hoy, -Math.min(8, Number(hoy.slice(8)) - 1)), hoy]) {
  doc({ fecha, cliente: CLIENTES[4], lineas: [...material(fecha, 1), servicio(1)] }, 'albaran');
}

// Dieciséis sábados de tienda, con tiques correlativos y dos importaciones de SumUp.
const ultimoSabado = antes((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 1) % 7);
let tique = 1001;
for (let k = 0; k < 16; k++) {
  const fecha = mas(ultimoSabado, (k - 15) * 7);
  const candidatos = disponible(fecha).filter((p) => p.disponible > 0);
  const cantidadProductos = 2 + Math.floor(azar() * 3);
  const unidades = candidatos.sort((a, b) => b.disponible - a.disponible).slice(0, cantidadProductos).map((p) => ({ producto: p.id, cantidad: Math.min(p.disponible, 1 + Math.floor(azar() * 2)) }));
  assert.ok(unidades.length >= 2, `Material del cierre ${fecha}`);
  const venta = r2(unidades.reduce((s, u) => s + u.cantidad * PRODUCTOS.find((p) => p.id === u.producto).precio * 1.21, 0));
  const total = r2(venta + entre(420, 900));
  const efectivo = r2(total * (0.3 + azar() * 0.1)), otros = k % 4 === 0 ? 15 : 0;
  const hasta = tique + 12 + Math.floor(azar() * 15);
  const datos = limpiarCierre({ fecha, porIva: [{ pct: 21, total }], efectivo, otros, unidades, desde: String(tique), hasta: String(hasta), proyecto: 'Tienda Poblenou', ...(k >= 14 ? { importado: 'sumup' } : {}) }, PRODUCTOS);
  assert.ok(!datos.error, datos.error);
  const y = Number(fecha.slice(0, 4)), n = siguienteNumero(facturas, y, 'Z');
  facturas.push({ id: `Z${y}-${n}`, numero: n, anio: y, serie: 'Z', ...datos, actividad: 'tienda-de-material' });
  tique = hasta + 1;
}

// Una venta grande hace unos días deja dos productos bajo mínimo (para ver «Qué pedir»).
{
  const fecha = new Date(Date.parse(`${hoy}T12:00:00Z`) - 3 * 864e5).toISOString().slice(0, 10);
  const stock = disponible(fecha);
  const st = (i) => stock.find((p) => p.id === PRODUCTOS[i].id).disponible;
  const lineas = [[0, Math.max(0, st(0) - PRODUCTOS[0].minimo + 4)], [4, Math.max(0, st(4) - 1)]].filter(([, cantidad]) => cantidad > 0).map(([i, cantidad]) => ({ concepto: PRODUCTOS[i].nombre, cantidad, precio: PRODUCTOS[i].precio, dto: 0, ivaPct: 21, producto: PRODUCTOS[i].id }));
  const y = Number(fecha.slice(0, 4));
  const numero = siguienteNumero(facturas, y, 'A');
  facturas.push({ id: `A${y}-${numero}`, numero, anio: y, serie: 'A', fecha, actividad: 'alquiler-de-equipos', cliente: CLIENTES[5], concepto: `${lineas[0].concepto}${lineas.length > 1 ? ` y ${lineas.length - 1} más` : ''}`, base: Math.round(lineas.reduce((x, l) => x + l.cantidad * l.precio, 0) * 100) / 100, ivaPct: 21, irpfPct: 0, nota: '', lineas, cobrada: false });
}

// Una rectificativa de ejemplo: devolución parcial de una factura del año pasado.
const orig = facturas.find((f) => f.anio === new Date().getUTCFullYear() - 1 && f.base > 1500);
if (orig) {
  const fecha = dia(orig.anio, Number(orig.fecha.slice(5, 7)), Math.min(28, Number(orig.fecha.slice(8)) + 10));
  const numero = siguienteNumero(facturas, orig.anio, 'R');
  facturas.push({ ...orig, id: `R${orig.anio}-${numero}`, numero, serie: 'R', fecha, base: -200, concepto: 'Descuento por reducción de horario del evento', cobrada: true,
    rectifica: { id: orig.id, numero: numeroFactura(orig), fecha: orig.fecha } });
}

// IBAN ficticios con entidades reales y control calculado mediante módulo 97.
const ibanDemo = (entidad, n) => {
  const oficina = '0418', numero = String(n).padStart(10, '0');
  const control = (texto) => {
    const pesos = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
    const d = 11 - [...texto].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return d === 11 ? 0 : d === 10 ? 1 : d;
  };
  const cuenta = `${entidad}${oficina}${control(`00${entidad}${oficina}`)}${control(numero)}${numero}`;
  let resto = 0;
  for (const c of `${cuenta}142800`) resto = (resto * 10 + Number(c)) % 97;
  const iban = `ES${String(98 - resto).padStart(2, '0')}${cuenta}`;
  assert.ok(ibanValido(iban));
  return iban;
};
const clientesSepa = [CLIENTES[0], CLIENTES[1], CLIENTES[5]];
for (const [i, c] of clientesSepa.entries()) {
  domiciliaciones.push({ id: c.nombre.toUpperCase(), nombre: c.nombre, iban: ibanDemo(['2100', '0182', '0049'][i], 100001 + i), mandato: { referencia: `SONORA-${c.nif}-01`, fecha: antes(365) }, usado: i !== 2 });
}
// Los contratos anteriores están liquidados; quedan tres recibos nuevos por cobrar.
for (const f of facturas.filter((f) => !f.cobrada && clientesSepa.some((c) => c.nif === f.cliente.nif))) {
  f.cobrada = true;
  f.cobro = { fecha: f.fecha, metodo: 'manual' };
}
for (let k = 0; k < 3; k++) {
  const fecha = antes([65, 35, 7][k]), y = Number(fecha.slice(0, 4));
  const docs = [];
  for (const cliente of clientesSepa.slice(0, k === 2 ? 3 : 2)) {
    const numero = siguienteNumero(facturas, y, 'A');
    const f = { id: `A${y}-${numero}`, numero, anio: y, serie: 'A', fecha, actividad: 'alquiler-de-equipos', cliente, concepto: 'Cuota mensual de mantenimiento y alquiler técnico', base: entre(280, 650), ivaPct: 21, irpfPct: 0, nota: '', cobrada: k < 2 };
    if (k < 2) f.cobro = { fecha: mas(fecha, 5), metodo: 'sepa', importe: importes(f).total };
    facturas.push(f);
    docs.push(f);
  }
  if (k < 2) {
    const remesaId = `demo-remesa-${k + 1}`, cobro = mas(fecha, 5);
    remesas.push({ id: remesaId, tipo: 'cobros', fecha: cobro, creada: creado(mas(cobro, -2)), total: r2(docs.reduce((s, f) => s + importes(f).total, 0)), numero: docs.length, docs: docs.map((f) => f.id), msgId: remesaId, por: id });
  }
}
// Tres proveedores tienen cuenta y gastos pendientes recientes para una nueva remesa.
const proveedoresSepa = [PRODUCTOS[0].proveedor, PRODUCTOS[1].proveedor, PRODUCTOS[2].proveedor];
const pagados = [];
for (const [i, proveedor] of proveedoresSepa.entries()) {
  const base = entre(90, 240);
  const g = { id: `demo-sepa-pago-${i + 1}`, fecha: antes(44), proveedor, concepto: 'Revisión y mantenimiento de material', base, ivaPct: 21, actividad: 'alquiler-de-equipos', pagado: antes(32) };
  gastos.push(g);
  pagados.push(g);
  gastos.push({ ...g, id: `demo-sepa-pendiente-${i + 1}`, fecha: antes(9 + i), pagado: undefined, pendiente: true, concepto: 'Consumibles y mantenimiento del equipo', base: entre(120, 360) });
}
// Mismo NIF para cada proveedor en todos sus gastos y pedidos.
const nifsProv = new Map();
for (const g of gastos.filter((g) => g.proveedor)) {
  if (!nifsProv.has(g.proveedor)) nifsProv.set(g.proveedor, g.proveedorNif || `B${String(nifsProv.size + 1).padStart(7, '0')}X`);
  g.proveedorNif ||= nifsProv.get(g.proveedor);
}
for (const p of pedidosProv) p.proveedorNif = nifsProv.get(p.proveedor);
for (const [i, proveedor] of proveedoresSepa.entries()) {
  const g = gastos.find((g) => g.proveedor === proveedor);
  cuentasProv.push({ id: claveProveedor(g), nombre: proveedor, iban: ibanDemo(['2100', '0182', '0049'][i], 200001 + i) });
}
remesas.push({ id: 'demo-remesa-3', tipo: 'pagos', fecha: antes(32), creada: creado(antes(34)), total: r2(pagados.reduce((s, g) => s + importes(g).base + importes(g).iva, 0)), numero: pagados.length, docs: pagados.map((g) => g.id), msgId: 'demo-remesa-3', por: id });
const recientes = gastos.filter((g) => g.proveedorNif && g.fecha >= antes(30)).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
assert.equal(recientes.length, 4);
for (const [i, g] of recientes.entries()) {
  g.numero = `AP-${g.fecha.slice(0, 4)}-${String(412 + i).padStart(4, '0')}`;
  g.efactura = i % 2 ? 'ubl' : 'facturae';
}

// Centros de coste del festival, el contrato anual y la tienda.
const festival = facturas.filter((f) => f.fecha.startsWith(hoy.slice(0, 4)) && f.cliente.nif === CLIENTES[3].nif);
for (const f of festival) f.proyecto = limpiarProyecto('Festival de Vilamar');
for (const f of facturas.filter((f) => f.fecha.startsWith(hoy.slice(0, 4)) && f.cliente.nif === CLIENTES[0].nif)) f.proyecto = limpiarProyecto('Hotel Mirador · contrato anual');
const relacionados = gastos.filter((g) => g.fecha.startsWith(hoy.slice(0, 4)) && /Técnicos de montaje|Transporte de equipos/.test(g.concepto));
const distanciaFestival = (g) => Math.min(...festival.map((f) => Math.abs(Date.parse(f.fecha) - Date.parse(g.fecha))));
for (const g of relacionados.sort((a, b) => distanciaFestival(a) - distanciaFestival(b)).slice(0, 4)) g.proyecto = limpiarProyecto('Festival de Vilamar');
const mesesTienda = new Set(facturas.filter((f) => f.caja).map((f) => f.fecha.slice(0, 7)));
for (const g of gastos.filter((g) => g.concepto === 'Alquiler del almacén' && mesesTienda.has(g.fecha.slice(0, 7)))) g.proyecto = limpiarProyecto('Tienda Poblenou');

// ---- Equipo: empleados con nómina completa (cotización 2026 y, en uno, el IRPF del modelo 145), un temporal de verano
// que ya causó baja, una persona a media jornada que cobra las horas extra del registro de jornada, y dos de ellas con
// cuenta en Fisquo (Marta factura; Aina solo ficha).
const nifDni = (n) => `${String(n).padStart(8, '0')}${'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23]}`;
const Ya = Number(hoy.slice(0, 4));
const ultimoDiaMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
// Las dos cuentas del equipo, solo en la demo de siempre (otra DEMO_EMAIL, como la cuenta simulada, no las toca).
const CON_EQUIPO = EMAIL === 'demo@verticexp.com';
const EMAIL_MARTA = CON_EQUIPO ? 'marta-demo@verticexp.com' : '', EMAIL_AINA = CON_EQUIPO ? 'aina-demo@verticexp.com' : '';
const empleado = (b) => {
  const cotizacion = limpiarCotizacion(b.cotizacion);
  assert.ok(!cotizacion.error, cotizacion.error);
  const datos145 = b.datos145 ? limpiarDatos145(b.datos145, b.nif) : undefined;
  assert.ok(!datos145?.error, datos145?.error);
  return { irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 32.15, email: '', horasSemana: 40, precioHoraExtra: 0, baja: '', ...b, cotizacion, ...(datos145 ? { datos145 } : {}) };
};
const empleados = [
  empleado({ id: 'demo-emp-marta', nombre: 'Marta Soler Puig', nif: nifDni(39123456), naf: '081234567890', puesto: 'Coordinadora de eventos y ventas', alta: '2021-03-01', bruto: 2150, email: EMAIL_MARTA,
    cotizacion: { grupo: 5, pagas: 2, prorrateadas: true, atPct: 1.5 }, datos145: { nacimiento: 1987, situacionFamiliar: 3, situacion: 'activo', contrato: 'general' } }),
  empleado({ id: 'demo-emp-jordi', nombre: 'Jordi Vidal Roca', nif: nifDni(46234567), naf: '081234567891', puesto: 'Comercial y técnico de sonido', alta: '2022-09-01', bruto: 1950, irpfPct: 13,
    cotizacion: { grupo: 8, pagas: 2, prorrateadas: true, atPct: 1.5 } }),
  empleado({ id: 'demo-emp-pau', nombre: 'Pau Ribas Serra', nif: nifDni(47345678), naf: '081234567892', puesto: 'Técnico de iluminación', alta: '2023-05-15', bruto: 1600, irpfPct: 10,
    cotizacion: { grupo: 8, pagas: 2, prorrateadas: false, atPct: 1.5 } }),
  empleado({ id: 'demo-emp-aina', nombre: 'Aina Costa Martí', nif: nifDni(48456789), naf: '081234567893', puesto: 'Auxiliar de almacén y tienda', alta: hace(10, 1), bruto: 820, irpfPct: 2, horasSemana: 20, precioHoraExtra: 13.5, email: EMAIL_AINA,
    cotizacion: { grupo: 10, pagas: 2, prorrateadas: true, atPct: 1.5 } }),
  empleado({ id: 'demo-emp-sergi', nombre: 'Sergi Mas Pons', nif: nifDni(49567890), naf: '081234567894', puesto: 'Técnico de montaje (temporada de verano)', alta: `${Ya - 1}-06-01`, baja: `${Ya - 1}-09-30`, bruto: 1550, irpfPct: 6,
    cotizacion: { grupo: 9, pagas: 2, prorrateadas: true, atPct: 1.5, temporal: true } }),
];
const activoEn = (e, mes) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes);

// Registro de jornada de los últimos tres meses y lo que va del actual (hasta ayer): jornada partida con pausa para
// comer; los días de evento, Jordi sale tarde; Aina, además, hace los sábados de la tienda (horas extra que se pagan).
const jornada = [];
const mesesJornada = [3, 2, 1, 0].map((k) => hace(k, 1).slice(0, 7));
const sabadosTienda = new Set(facturas.filter((f) => f.caja).map((f) => f.fecha));
const hm = (fecha, minutos) => `${fecha}T${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
const fichaje = (e, fecha, entrada, salida, pausas = [], extra = {}) => {
  const v = validar({ entrada: hm(fecha, entrada), salida: hm(fecha, salida), pausas: pausas.map(([a, b]) => ({ inicio: hm(fecha, a), fin: hm(fecha, b) })) });
  assert.ok(!v.error, v.error);
  jornada.push({ id: `${e.id}-${v.entrada}`, empleado: e.id, fecha, ...v, por: id, ...extra });
};
for (let t = Date.parse(`${mesesJornada[0]}-01T12:00:00Z`); new Date(t).toISOString().slice(0, 10) < hoy; t += 864e5) {
  const fecha = new Date(t).toISOString().slice(0, 10), n = Number(fecha.slice(8, 10));
  for (const e of empleados.filter((x) => activoEn(x, fecha.slice(0, 7)) && x.alta <= fecha)) {
    if (e.id === 'demo-emp-aina' && sabadosTienda.has(fecha)) { fichaje(e, fecha, 600, 840); continue; }
    if (!laborables(fecha, fecha)) continue;
    if (e.id === 'demo-emp-aina') { fichaje(e, fecha, 540, 780); continue; }
    const entrada = 480 + (n % 3) * 5;
    const tarde = e.id === 'demo-emp-jordi' && n % 9 === 0;
    fichaje(e, fecha, entrada, tarde ? 1170 : entrada + 510, [[810, 840]]);
  }
}
// Una salida corregida (se olvidó de fichar) y un día apuntado a mano, con su anotación para la Inspección.
{
  const f = jornada.find((x) => x.empleado === 'demo-emp-pau' && x.fecha.startsWith(mesesJornada[1]));
  f.cambios = [{ cuando: `${mas(f.fecha, 1)}T09:12:00.000Z`, por: id, porNombre: 'Demo', motivo: 'Se olvidó de fichar la salida' }];
  const g = jornada.find((x) => x.empleado === 'demo-emp-marta' && x.fecha.startsWith(mesesJornada[2]));
  g.manual = 'Trabajó desde la feria de proveedores y lo apuntó al volver';
}

// Nóminas de cada mes cerrado, como las genera Nóminas (app/api/nominas): las pagas extra de Pau en junio y diciembre;
// las horas del registro de jornada (y las extra de Aina) desde que hay registro. Todas pagadas el último día del mes.
const MESES_PAGAS = { 1: [12], 2: [6, 12], 3: [3, 6, 12], 4: [3, 6, 9, 12] };
const nominas = [];
for (let k = 24; k >= 1; k--) {
  const mes = hace(k, 1).slice(0, 7);
  for (const e of empleados.filter((x) => activoEn(x, mes))) {
    const x = jornada.some((f) => f.fecha.startsWith(mes)) ? extrasNomina(resumenMes(jornada, e, mes), e) : null;
    const pagaExtra = !e.cotizacion.prorrateadas && (MESES_PAGAS[e.cotizacion.pagas] || []).includes(Number(mes.slice(5, 7))) ? e.bruto : 0;
    const c = nominaCompleta(e, { bruto: r2(e.bruto + pagaExtra + (x?.importe || 0)), pagaExtra, horasExtra: x?.importe || 0, mes, ...(x?.horas?.trabajadas ? { horas: r2(x.horas.trabajadas / 60) } : {}) });
    assert.ok(!c.error, `${e.nombre} ${mes}: ${c.error}`);
    const n = { id: `demo-nom-${mes}-${e.id.slice(9)}`, mes, empleado: e.id, empleadoNombre: e.nombre, pagada: true, pagado: ultimoDiaMes(mes), ...(x ? { horas: x.horas } : {}), ...(x?.importe ? { extras: { importe: x.importe, precio: e.precioHoraExtra } } : {}), bruto: c.importes.bruto, ...c, completa: true };
    nominas.push(n);
    gastos.push(gastoDeNomina(n, 'sonido-e-iluminacion'));
  }
}
assert.ok(nominas.some((n) => n.extras?.importe > 0), 'Faltan horas extra en las nóminas de Aina');
assert.ok(nominas.some((n) => n.detalle.pagaExtra > 0), 'Falta una paga extra');
assert.ok(nominas.some((n) => n.detalle.irpf.calculado !== null), 'Falta el IRPF calculado con el 145');

// Dietas y kilometraje del equipo (lo exento, sin IVA).
for (const [fecha, d, persona, motivo] of [
  [hace(19, 12), { tipo: 'manutencion', dias: 3, pernocta: true, extranjero: true }, 'Marta Soler', 'Feria Prolight + Sound (Fráncfort)'],
  [hace(15, 6), { tipo: 'manutencion', dias: 2, pernocta: true }, 'Pau Ribas', 'Montaje del festival de Girona'],
  [hace(7, 22), { tipo: 'km', km: 184 }, 'Jordi Vidal', 'Visita técnica en Sitges y Vilanova'],
  [hace(3, 14), { tipo: 'manutencion', dias: 2, pernocta: true }, 'Jordi Vidal', 'Boda en el Empordà'],
  [hace(1, 9), { tipo: 'km', km: 96 }, 'Marta Soler', 'Visitas a clientes del Maresme'],
]) {
  const c = calcularDieta({ ...d, quien: 'empleado', fecha });
  assert.ok(!c.error, c.error);
  const { base, ivaPct, ...dieta } = c;
  gastos.push({ id: `demo-dieta-${gastos.length + 1}`, fecha, actividad: 'sonido-e-iluminacion', concepto: [conceptoDieta(c), persona, motivo].join(' · ').slice(0, 140), base, ivaPct, dieta: { ...dieta, persona, motivo } });
}

// Pagos a proveedores con vencimiento: dos facturas recibidas sin pagar, una ya vencida.
gastos.push({ id: 'demo-vence-1', fecha: antes(41), actividad: 'sonido-e-iluminacion', concepto: 'Transporte de equipos al congreso', proveedor: 'Transportes Ràpid S.L.', base: 385, ivaPct: 21, pendiente: true, vence: antes(11), numero: `TR-${hoy.slice(0, 4)}-0388` });
gastos.push({ id: 'demo-vence-2', fecha: antes(6), actividad: 'sonido-e-iluminacion', concepto: 'Montaje de escenario y truss', proveedor: 'Montajes Escénicos BCN S.L.', base: 1240, ivaPct: 21, categoria: '607', pendiente: true, vence: mas(hoy, 24), numero: `ME-${hoy.slice(0, 4)}-0127` });
for (const g of gastos.filter((g) => g.pendiente && !g.vence)) g.vence = mas(g.fecha, 30);

// Ventas a un festival de Francia (servicios a una empresa de la UE: sin IVA, al 303 y al 349), cada julio.
const CLIENTE_UE = { nombre: 'Les Nuits du Sud SARL', nif: 'FR12000000001', direccion: '14 Quai du Port', ciudad: '13002 Marseille', pais: 'FR' };
for (const y of [Ya - 2, Ya - 1, Ya]) {
  const fecha = dia(y, 7, 8);
  if (fecha < facturas.map((f) => f.fecha).sort()[0] || fecha > hoy) continue;
  const numero = siguienteNumero(facturas, y, 'A');
  facturas.push({ id: `A${y}-${numero}`, numero, anio: y, serie: 'A', fecha, actividad: 'alquiler-de-equipos', cliente: CLIENTE_UE, concepto: 'Alquiler de equipo de sonido para festival en Marsella', base: 4200 + (y - Ya + 2) * 300, ivaPct: 0, irpfPct: 0, operacion: 'servicios-ue', nota: 'Autoliquidación: inversión del sujeto pasivo (art. 196 Directiva 2006/112/CE)', cobrada: true, cobro: { fecha: mas(fecha, 20), metodo: 'manual' } });
}

// Facturas recurrentes: el equipo de sonido fijo del Beach Club, cada día 5 desde hace un año (las de antes, cobradas
// con tarjeta), y el mantenimiento de la Fundació, en pausa desde que acabó su temporada.
const recurrentes = [];
for (const [rid, cliente, concepto, base, dia5, desde, hasta, activa] of [
  ['demo-rec-beach', CLIENTES[4], 'Alquiler mensual del equipo de sonido instalado', 380, 5, 12, 0, true],
  ['demo-rec-fundacio', CLIENTES[6], 'Mantenimiento técnico mensual de la sala', 240, 1, 16, 5, false],
]) {
  const emitidas = [];
  for (let k = desde; k >= hasta; k--) {
    const fecha = hace(k, dia5);
    if (fecha > hoy) continue;
    const y = Number(fecha.slice(0, 4)), numero = siguienteNumero(facturas, y, 'A');
    const f = { id: `A${y}-${numero}`, numero, anio: y, serie: 'A', fecha, actividad: 'alquiler-de-equipos', cliente, concepto, base, ivaPct: 21, irpfPct: 0, nota: '', cobrada: k > 1, ...(k > 1 ? { cobro: { fecha, metodo: 'manual' } } : {}) };
    facturas.push(f);
    emitidas.push(f);
  }
  const ultima = emitidas.at(-1).fecha.slice(0, 7);
  recurrentes.push({ id: rid, origen: emitidas[0].id, plantilla: plantillaDe(emitidas[0]), dia: dia5, enviar: activa, activa, ultima, creada: creado(emitidas[0].fecha) });
}

// Presupuestos: uno facturado (el del festival), uno con la señal facturada y la boda por hacer, uno pendiente con varios
// conceptos, uno rechazado y otro caducado.
const presupuestos = [];
const presupuesto = (b) => {
  const anio = Number(b.fecha.slice(0, 4)), numero = siguienteNumero(presupuestos, anio, 'P');
  const p = { id: `P${anio}-${numero}`, numero, anio, serie: 'P', actividad: 'sonido-e-iluminacion', ivaPct: 21, irpfPct: 0, nota: '', senalPct: 0, validez: 15, estado: 'pendiente', token: randomBytes(18).toString('base64url'), facturas: [], ...b };
  presupuestos.push(p);
  return p;
};
{
  const fest = facturas.filter((f) => f.cliente.nif === CLIENTES[3].nif && f.fecha.startsWith(String(Ya)) && !f.serie).sort((a, b) => b.base - a.base)[0]
    || facturas.filter((f) => f.cliente.nif === CLIENTES[3].nif && !f.serie).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const p = presupuesto({ fecha: mas(fest.fecha, -30), cliente: fest.cliente, concepto: fest.concepto, base: fest.base, validez: 30, estado: 'aceptado', respuesta: { fecha: `${mas(fest.fecha, -24)}T11:20:00.000Z`, nombre: 'Montse Riera (Ajuntament de Vilamar)' } });
  p.facturas.push({ id: fest.id, numero: numeroFactura(fest), tipo: 'resto', base: fest.base });
  fest.presupuesto = { id: p.id, numero: numeroPresupuesto(p) };
}
presupuesto({ fecha: antes(62), cliente: CLIENTES[7], concepto: 'DJ y sonido para celebración familiar', base: 690, actividad: 'dj-y-musica' });
presupuesto({ fecha: antes(48), cliente: CLIENTES[0], concepto: 'Iluminación de fachada para la cena de gala', base: 3200, estado: 'rechazado', respuesta: { fecha: `${antes(44)}T17:05:00.000Z`, nombre: 'Dirección de eventos (Hotel Mirador)' } });
{
  const p = presupuesto({ fecha: antes(22), cliente: CLIENTES[2], concepto: 'Sonido, iluminación y DJ para boda en Sant Pol', base: 4800, senalPct: 30, validez: 20, estado: 'aceptado', respuesta: { fecha: `${antes(20)}T19:42:00.000Z`, nombre: 'Celebra Bodas y Eventos' }, entrega: mas(hoy, 21) });
  const fecha = antes(19), y = Number(fecha.slice(0, 4)), numero = siguienteNumero(facturas, y, '');
  const base = baseSenal(p);
  const f = { id: `${y}-${numero}`, numero, anio: y, fecha, actividad: 'sonido-e-iluminacion', cliente: p.cliente, concepto: `Señal del 30 % según presupuesto ${numeroPresupuesto(p)}: ${p.concepto}`, base, ivaPct: 21, irpfPct: 0, nota: '', cobrada: true, cobro: { fecha: antes(16), metodo: 'manual' }, presupuesto: { id: p.id, numero: numeroPresupuesto(p) } };
  facturas.push(f);
  p.facturas.push({ id: f.id, numero: numeroFactura(f), tipo: 'senal', base });
}
{
  const lineas = [
    { concepto: 'Sonorización de auditorio (2 días)', cantidad: 2, precio: 1450, dto: 0, ivaPct: 21 },
    { concepto: 'Microfonía inalámbrica para ponentes', cantidad: 6, precio: 85, dto: 10, ivaPct: 21 },
    { concepto: 'Técnico de sonido (jornada)', cantidad: 2, precio: 320, dto: 0, ivaPct: 21 },
  ];
  presupuesto({ fecha: antes(4), cliente: CLIENTES[5], concepto: `${lineas[0].concepto} y 2 más`, lineas, base: r2(lineas.reduce((s, l) => s + baseLinea(l), 0)), validez: 30 });
}

// Dividendos del año pasado (aprobadas las cuentas, en julio) e intereses del préstamo de una socia: retención del 19 %
// (modelos 123 y 193).
const capital = [];
for (const [fecha, tipo, nombre, dni, bruto] of [
  [`${Ya - 1}-12-20`, 'intereses', 'Clara Font Ruiz', 38987654, 360],
  [`${hoy >= `${Ya}-07-15` ? Ya : Ya - 1}-07-15`, 'dividendos', 'Pere Sala Vidal', 39876543, 4800],
  [`${hoy >= `${Ya}-07-15` ? Ya : Ya - 1}-07-15`, 'dividendos', 'Clara Font Ruiz', 38987654, 3200],
]) {
  const p = limpiarPago({ fecha, tipo, perceptor: { nombre, nif: nifDni(dni) }, bruto, nota: tipo === 'dividendos' ? 'Reparto del resultado aprobado en junta' : 'Préstamo de la socia al 4,5 %' });
  assert.ok(!p.error, p.error);
  capital.push({ id: `demo-capital-${capital.length + 1}`, ...p, creado: creado(fecha) });
}

// Numeración correlativa: dentro de cada serie y año, los números siguen el orden de las fechas (art. 6.1.a del
// Reglamento de facturación). Lo de arriba se genera por partes; aquí se ordena y se ponen al día las referencias.
{
  const nuevo = new Map();
  const grupos = Map.groupBy(facturas, (f) => `${f.serie || ''}|${f.anio}`);
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
    lista.forEach((f, i) => { const antes = f.id; f.numero = i + 1; f.id = `${f.serie || ''}${f.anio}-${f.numero}`; nuevo.set(antes, f.id); });
  }
  const porIdF = new Map(facturas.map((f) => [f.id, f]));
  for (const f of facturas) if (f.rectifica) { const o = porIdF.get(nuevo.get(f.rectifica.id)); f.rectifica = { ...f.rectifica, id: o.id, numero: numeroFactura(o) }; }
  for (const a of albaranes) if (a.factura) a.factura = nuevo.get(a.factura);
  for (const r of remesas.filter((x) => x.tipo === 'cobros')) r.docs = r.docs.map((d) => nuevo.get(d));
  for (const p of presupuestos) p.facturas = p.facturas.map((x) => { const f = porIdF.get(nuevo.get(x.id)); return { ...x, id: f.id, numero: numeroFactura(f) }; });
  for (const r of recurrentes) r.origen = nuevo.get(r.origen);
}

// Integridad de los datos generados, antes de escribir nada en la base de datos.
const stockFinal = inventario({ productos: PRODUCTOS, facturas, gastos, ajustes: ajustesStock, albaranes }, { hoy });
for (const p of stockFinal.productos) assert.ok(p.stock >= 0, `Stock negativo: ${p.nombre}`);
for (const c of [empresa.emisor, ...domiciliaciones, ...cuentasProv]) assert.ok(ibanValido(c.iban), `IBAN inválido: ${c.nombre}`);
const idsFacturas = new Set(facturas.map((f) => f.id));
assert.equal(idsFacturas.size, facturas.length, 'Ids de factura repetidos');
for (const a of albaranes.filter((a) => a.factura)) assert.ok(idsFacturas.has(a.factura), `Factura inexistente: ${a.factura}`);
for (const remesa of remesas.filter((r) => r.tipo === 'cobros')) for (const docId of remesa.docs) {
  const f = facturas.find((f) => f.id === docId);
  assert.ok(f?.cobrada && f.cobro?.metodo === 'sepa', `Recibo sin cobrar: ${docId}`);
}
assert.ok(stockFinal.bajos.some((p) => p.proveedor === PRODUCTOS[0].proveedor && !enCamino(pedidosProv)[p.id]), 'Falta material de Audio Pro por pedir');
for (const p of presupuestos) for (const x of p.facturas) assert.ok(idsFacturas.has(x.id), `Factura del presupuesto inexistente: ${x.id}`);
for (const r of recurrentes) assert.ok(idsFacturas.has(r.origen), `Origen de la recurrente inexistente: ${r.origen}`);
for (const f of facturas.filter((f) => f.rectifica)) assert.ok(idsFacturas.has(f.rectifica.id), `Rectifica una factura inexistente: ${f.rectifica.id}`);
for (const lista of Map.groupBy(facturas, (f) => `${f.serie || ''}|${f.anio}`).values()) {
  const orden = [...lista].sort((a, b) => a.numero - b.numero);
  orden.forEach((f, i) => { assert.equal(f.numero, i + 1, `Hueco en la numeración: ${f.id}`); if (i) assert.ok(orden[i - 1].fecha <= f.fecha, `Numeración fuera de orden: ${f.id}`); });
}
assert.ok(gastos.some((g) => g.alquiler) && gastos.some((g) => g.origen === 'ue') && gastos.some((g) => g.dieta) && facturas.some((f) => f.operacion === 'servicios-ue'));

const porId = (xs) => Object.fromEntries(xs.map((x) => [x.id, x]));
await r.hset(`${P}empresas`, { [id]: empresa });
await r.hset(`${P}usuarios`, { [id]: { id, nombre: 'Demo', email: EMAIL, admin: false, creado: ahora, empresa: id, rol: 'admin', pass } });
await r.hset(`${P}emails`, { [EMAIL]: id });
// Dos personas del equipo con cuenta: Marta (Facturación) y Aina (solo ficha su jornada), con la contraseña de la demo.
for (const [email, nombre, permisos] of CON_EQUIPO ? [[EMAIL_MARTA, 'Marta Soler', ['facturas', 'facturar']], [EMAIL_AINA, 'Aina Costa', []]] : []) {
  const uid = (await r.hget(`${P}emails`, email)) || randomBytes(4).toString('hex');
  const m = { rol: 'miembro', permisos, pv: VERSION_PERMISOS };
  await r.hset(`${P}usuarios`, { [uid]: { id: uid, nombre, email, admin: false, creado: ahora, empresa: id, ...m, empresas: { [id]: m }, pass } });
  await r.hset(`${P}emails`, { [email]: uid });
}
// Los enlaces públicos de los presupuestos de antes dejan de abrir.
const tokensAntes = Object.values((await r.hgetall(`${P}presupuestos:${id}`)) || {}).map((p) => p.token).filter(Boolean);
if (tokensAntes.length) await r.hdel(`${P}presupuesto-enlaces`, ...tokensAntes);
await r.del(...['facturas', 'gastos', 'clientes', 'registros', 'verifactu', 'saldo', 'asientos', 'banco', 'bancos', 'cuentasAnuales', 'productos', 'stock', 'albaranes', 'pedidosProv', 'domiciliaciones', 'cuentasProv', 'fichasProv', 'remesas', 'empleados', 'nominas', 'jornada', 'presupuestos', 'recurrentes', 'capital'].map((n) => `${P}${n}:${id}`));
await r.hset(`${P}facturas:${id}`, porId(facturas));
await r.hset(`${P}gastos:${id}`, porId(gastos));
await r.hset(`${P}albaranes:${id}`, porId(albaranes));
await r.hset(`${P}pedidosProv:${id}`, porId(pedidosProv));
await r.hset(`${P}domiciliaciones:${id}`, porId(domiciliaciones));
await r.hset(`${P}cuentasProv:${id}`, porId(cuentasProv));
await r.hset(`${P}remesas:${id}`, porId(remesas));
await r.hset(`${P}empleados:${id}`, porId(empleados));
await r.hset(`${P}nominas:${id}`, porId(nominas));
await r.hset(`${P}jornada:${id}`, porId(jornada));
await r.hset(`${P}presupuestos:${id}`, porId(presupuestos));
await r.hset(`${P}presupuesto-enlaces`, Object.fromEntries(presupuestos.map((p) => [p.token, { empresa: id, id: p.id }])));
await r.hset(`${P}recurrentes:${id}`, porId(recurrentes));
await r.hset(`${P}capital:${id}`, porId(capital));
// Los índices, ya hechos: así la app no los reconstruye documento a documento (scripts/indicesDemo.mjs).
for (const [col, docs] of [['facturas', facturas], ['gastos', gastos], ['presupuestos', presupuestos]]) await escribirIndices(r, P, id, col, docs);
// Trimestres ya presentados (los que tienen el plazo pasado), el Impuesto sobre Sociedades de los años cerrados y sus 202.
const Y = Number(hoy.slice(0, 4));
const pagos130 = {}, pagos202 = {}, cuotaIS = {};
for (let y = Y - 2; y <= Y; y++) for (let t = 1; t <= 4; t++) {
  const plazo = t === 4 ? `${y + 1}-01-30` : `${y}-${['04', '07', '10'][t - 1]}-20`;
  if (plazo < hoy) (pagos130[y] ||= {})[t] = 0;
}
for (let y = Y - 2; y < Y; y++) if (`${y + 1}-07-25` < hoy) cuotaIS[y] = borradorSociedades(facturas, gastos, y).cuota;
for (let y = Y - 1; y <= Y; y++) for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha < hoy) (pagos202[y] ||= {})[x.p] = x.pago;
// Retenciones de dividendos e intereses (123) presentadas en su plazo.
const pres123 = {};
for (const p of capital) { const y = Number(p.fecha.slice(0, 4)), t = Math.ceil(Number(p.fecha.slice(5, 7)) / 3); if (plazo123(y, t) < hoy) (pres123[y] ||= {})[t] = true; }
await r.hset(`${P}empresas`, { [id]: { ...empresa, pagos130, pagos202, cuotaIS, pres123 } });

// Contabilidad: apertura (capital y lo que había en el banco: con un colchón para las nóminas), el préstamo de la
// furgoneta y sus cuotas de principal.
const primera = [...facturas, ...gastos].map((x) => x.fecha).sort()[0];
const furgo = gastos.find((g) => g.inversion?.tipo === 'transporte');
const asientos = [{ id: 'demo-apertura', ...asientoApertura({ fecha: primera, banco: 45000, capital: 3000 }, true) }];
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
const banco = mayor(generarAsientos({ facturas, gastos, nominas, capital, manuales: asientos, fiscal: empresa.fiscal, pagos130, pagos202, cuotaIS, pres123, productos: PRODUCTOS, ajustes: ajustesStock, albaranes }, hoy), '572', Y).final;
await r.set(`${P}saldo:${id}`, { importe: banco, fecha: hoy });
await r.hset(`${P}productos:${id}`, porId(PRODUCTOS));
await r.hset(`${P}stock:${id}`, porId(ajustesStock));
// Fichas: forma de cobro, plazo, comercial, zona y riesgo máximo (lib/terceros.js). Sin límite en el ayuntamiento y la fundación.
const FICHAS_CLIENTE = {
  A00000001: { formaCobro: 'transferencia', plazo: 30, comercial: 'Marta Soler', zona: 'Barcelona ciudad', riesgoMax: 20000 },
  B00000002: { formaCobro: 'domiciliacion', plazo: 30, comercial: 'Marta Soler', zona: 'Barcelona ciudad', riesgoMax: 12000 },
  B00000003: { formaCobro: 'transferencia', plazo: 15, comercial: 'Jordi Vidal', zona: 'Barcelona ciudad', riesgoMax: 6000 },
  P0800000A: { formaCobro: 'transferencia', plazo: 60, comercial: 'Jordi Vidal', zona: 'Costa del Maresme' },
  B00000004: { formaCobro: 'tarjeta', plazo: 0, comercial: 'Jordi Vidal', zona: 'Barcelona ciudad', riesgoMax: 3000 },
  B00000005: { formaCobro: 'domiciliacion', plazo: 30, comercial: 'Marta Soler', zona: 'Barcelona ciudad', riesgoMax: 15000 },
  G00000006: { formaCobro: 'transferencia', plazo: 45, comercial: 'Jordi Vidal', zona: 'Costa del Maresme' },
  '00000007T': { formaCobro: 'bizum', plazo: 0, comercial: 'Marta Soler', zona: 'Barcelona ciudad', riesgoMax: 1500 },
};
await r.hset(`${P}clientes:${id}`, porId([...CLIENTES, CLIENTE_UE].map((c) => ({ id: c.nombre.toUpperCase(), ...c, ...FICHAS_CLIENTE[c.nif] }))));
await r.hset(`${P}fichasProv:${id}`, porId(cuentasProv.map((c, i) => ({ id: c.id, nombre: c.nombre, formaPago: 'transferencia', plazo: [30, 45, 60][i % 3], comercial: 'Marta Soler', zona: 'Barcelona ciudad' }))));
// Extracto del último mes y medio, sin emparejar: los cobros de facturas pendientes y los pagos de gastos (Fisquo los
// sugiere), y algunos cargos que no están en Fisquo (salen en Gastos › En revisión o para decir qué son en Banco).
const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 45 * 864e5).toISOString().slice(0, 10);
const movs = [];
const mov = (fecha, importe, concepto, contraparte = '') => { if (fecha <= hoy && fecha >= desde) movs.push({ fecha, importe: Math.round(importe * 100) / 100, concepto, contraparte }); };
for (const f of facturas.filter((x) => !x.cobrada && !domiciliaciones.some((d) => d.id === x.cliente.nombre.toUpperCase()) && x.fecha >= mas(desde, -30)).slice(0, 4)) mov(mas(f.fecha, 12), importes(f).total, `TRANSFERENCIA FACTURA ${numeroFactura(f)}`, f.cliente.nombre);
for (const g of gastos.filter((x) => (x.pagado || x.fecha) >= desde && !x.pendiente && !x.inversion && !x.nomina && !x.dieta)) mov(g.pagado || g.fecha, -importes(g).total, `RECIBO ${g.concepto.toUpperCase()}`, g.proveedor || '');
// Las nóminas, una transferencia por persona, y los seguros sociales del mes, a final del mes siguiente.
for (const n of nominas) mov(fechaPagoNomina(n), -calculoNomina(n).neto, `TRANSFERENCIA NOMINA ${n.empleadoNombre.toUpperCase()}`, n.empleadoNombre);
for (const [mes, ns] of Map.groupBy(nominas, (n) => n.mes)) mov(ultimoDiaMes(mas(`${mes}-28`, 8).slice(0, 7)), -r2(ns.reduce((s, n) => s + calculoNomina(n).seguros, 0)), 'TGSS COTIZACION REGIMEN GENERAL', 'TESORERIA GENERAL SEGURIDAD SOCIAL');
for (const f of facturas.filter((f) => f.cobro?.metodo === 'sepa')) mov(f.cobro.fecha, f.cobro.importe, `COBRO REMESA ${numeroFactura(f)}`, f.cliente.nombre);
for (const f of facturas.filter((f) => f.caja).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-2)) mov(f.fecha, f.caja.tarjeta, 'LIQUIDACION TPV SUMUP', 'SUMUP');
const m1 = hoy.slice(0, 8);
mov(`${m1}02`, -86.9, 'COMPRA TARJETA AMAZON MARKETPLACE', 'AMAZON EU SARL');
mov(`${m1}04`, -142.35, 'PAGO TPV LEROY MERLIN', 'LEROY MERLIN');
mov(mas(desde, 10), -64.2, 'COMPRA TARJETA REPSOL', 'ESTACION REPSOL');
mov(mas(desde, 5), -15, 'COMISION MANTENIMIENTO CUENTA');
mov(mas(desde, 12), -1000, 'TRASPASO A CUENTA PROPIA');
const conIds = movs.map((m, i) => ({ id: idMovimiento('extracto', m, i), cuenta: 'extracto', estado: 'pendiente', ...m }));
await r.hset(`${P}banco:${id}`, porId(conIds));
await r.hset(`${P}bancos:${id}`, { extracto: { id: 'extracto', nombre: 'CaixaBank', origen: 'extracto', subido: hoy, saldo: banco, fechaSaldo: hoy } });

console.log(`Demo lista: ${EMAIL} · ${facturas.length} facturas · ${gastos.length} gastos · ${nominas.length} nóminas · ${jornada.length} fichajes · ${presupuestos.length} presupuestos · desde ${inicio.toISOString().slice(0, 10)}`);
for (let y = Y - 2; y <= Y; y++) {
  const { base } = borradorSociedades(facturas, gastos, y);
  console.log(`  · ${y}: beneficio antes de impuestos ${base} €`);
  assert.ok(base > 0, `La demo tiene pérdidas en ${y}`);
}

// Crea (o rehace desde cero) la gestoría de demostración de «Mi despacho» con sus clientes: para enseñar el panel a
// gestorías y, entrando con demo@verticexp.com, la app como la ve un cliente.
// - Gestoría Ferrer (demo): titular gestoria-demo@verticexp.com y gestor gestor-demo@verticexp.com, con su propia empresa
//   (facturando la cuota mensual a sus clientes).
// - Clientes: Sonora Eventos S.L. (la demo de scripts/demo.mjs, que hay que crear antes) y seis más con dos años de datos:
//   autónomos de varios oficios, uno en Canarias (IGIC), uno en Navarra (foral) y una S.L. con la licencia pagada por el
//   despacho. Trimestres presentados y cerrados, uno por revisar, otro con cambios tras el cierre, preguntas y respuestas,
//   cartera repartida entre el titular y el gestor, y el registro de lo que ha hecho el despacho en cada cliente.
// Las cuentas de la gestoría usan la misma contraseña que la demo. El despacho va marcado como demo: ningún cliente de
// verdad puede unirse a él (lib/despachos.js) ni activar su cobro.
// Uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/demo-despacho.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { siguienteNumero, importes, r2, resumenAnual } from '../lib/calculos.js';
import { indiceDe, claves } from '../lib/fichas.js';
import { limpiarCierre } from '../lib/caja.js';
import { idCuota } from '../lib/cuotas.js';
import { VERSION_PLAN } from '../lib/prueba.js';
import { asientoApertura, generarAsientos, mayor } from '../lib/asientos.js';
import { borradorSociedades, modelo202 } from '../lib/modelos.js';
import { escribirIndices } from './indicesDemo.mjs';

const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = process.env;
if (!url || !token) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const r = new Redis({ url, token });
const P = 'cuentas:';
const CODIGO = 'DEMO-FERRER';
const DEMO = (process.env.DEMO_EMAIL || 'demo@verticexp.com').trim().toLowerCase();
const TITULAR = 'gestoria-demo@verticexp.com';
const GESTOR = 'gestor-demo@verticexp.com';

// La demo del cliente (scripts/demo.mjs) da la empresa principal y la contraseña de todas.
const idDemo = await r.hget(`${P}emails`, DEMO);
const usuarioDemo = idDemo && (await r.hget(`${P}usuarios`, idDemo));
if (!usuarioDemo?.pass) throw new Error(`Falta la demo del cliente (${DEMO}): ejecuta antes scripts/demo.mjs`);
const sonora = await r.hget(`${P}empresas`, usuarioDemo.empresa);
assert.ok(sonora, 'La demo no tiene empresa');

const ahora = new Date().toISOString();
const hoy = ahora.slice(0, 10);
const Y = Number(hoy.slice(0, 4));
const mas = (f, d) => new Date(Date.parse(`${f}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
const dia = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fechaHora = (fecha, h = 10) => `${fecha}T${String(h).padStart(2, '0')}:15:00.000Z`;
let semilla = 11;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const entre = (a, b) => Math.round((a + azar() * (b - a)) / 5) * 5;
const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
const porId = (xs) => Object.fromEntries(xs.map((x) => [x.id, x]));

// Ids estables: al rehacer la demo se reutilizan (las sesiones de quien esté mirándola siguen valiendo).
const idDe = async (email, porDefecto) => (await r.hget(`${P}emails`, email)) || porDefecto;
const idTitular = await idDe(TITULAR, 'dgesti01');
const idGestor = await idDe(GESTOR, 'dgesto01');
const idDespacho = (await r.hget(`${P}despacho-codigos`, CODIGO)) || 'ddesp001';
const empresaDespacho = (await r.hget(`${P}usuarios`, idTitular))?.empresa || 'dgemp001';

// ---- Clientes generados (además de Sonora). tipo: autónomo o sociedad; los importes, en euros sin IVA.
const CLIENTES = [
  {
    id: 'dcli0001', contacto: 'Marta Soler', nombre: 'Marta Soler Ribas', nif: '00000101S', ciudad: '08012 Barcelona', direccion: 'C/ de Verdi, 44',
    fiscal: { tipo: 'autonomo', iva: 'general', retenidas: false }, actividad: { id: 'diseno-grafico', nombre: 'Diseño gráfico', serie: '', ivaPct: 21, irpfPct: 15 },
    clientes: ['Editorial Mar Blava S.L.', 'Cervezas del Poblenou S.L.', 'Agencia Brisa Incentivos S.L.', 'Fundació Música Viva'], ventas: [3, 6], importe: [450, 2200],
    conceptos: ['Diseño de identidad corporativa', 'Maquetación de catálogo', 'Diseño de packaging', 'Campaña gráfica para redes'],
    fijos: [['Coworking Poble Sec', 'Alquiler del puesto en el coworking', 220], ['Adobe Systems Software Ireland', 'Adobe Creative Cloud', 72], ['Movistar', 'Teléfono e internet', 45]],
    variables: [['Material de oficina e impresión', [30, 140]], ['Formación y cursos online', [40, 300]]],
    bienes: [[20, 'Ordenador iMac 27"', 'Apple Distribution International', 2399, 'informatica'], [8, 'Tableta gráfica Wacom', 'PcComponentes S.L.', 489, 'informatica']],
    cuota: 294, gestor: 'titular', plan: 'prueba', estado3T: 'revisado',
  },
  {
    id: 'dcli0002', contacto: 'Jordi Puig', nombre: 'Jordi Puig Instal·lacions', nif: '00000102Q', ciudad: '08905 L\'Hospitalet de Llobregat', direccion: 'Rambla de Just Oliveras, 70',
    fiscal: { tipo: 'autonomo', iva: 'general', retenidas: false }, actividad: { id: 'fontaneria', nombre: 'Fontanería y electricidad', serie: '', ivaPct: 21, irpfPct: 0 },
    clientes: ['Comunidad de propietarios Pere IV, 102', 'Laura Puig Ferrer', 'Restaurant Can Roca S.L.', 'Albert Mas Pons', 'Finques Diagonal S.L.'], ventas: [6, 11], importe: [120, 1900],
    conceptos: ['Reparación de fuga y cambio de llaves de paso', 'Instalación eléctrica de cocina', 'Sustitución de termo eléctrico', 'Boletín y revisión de la instalación'],
    fijos: [['Leasing Furgoneta', 'Renting de la furgoneta', 410], ['Mapfre España S.A.', 'Seguro de responsabilidad civil', 48, 0], ['Vodafone España S.A.U.', 'Teléfono móvil', 32]],
    variables: [['Material de fontanería y electricidad', [900, 2600], 'Saltoki Barcelona S.L.'], ['Combustible furgoneta', [90, 260], 'Repsol']],
    bienes: [[15, 'Herramientas (taladro percutor, detector, prensadora)', 'Würth España S.A.', 1640, 'utiles']],
    cuota: 294, gestor: 'gestor', plan: 'licencia', estado3T: 'listo',
  },
  {
    id: 'dcli0003', contacto: 'Núria Costa', nombre: 'Bar La Plaça (Núria Costa)', nif: '00000103V', ciudad: '08024 Barcelona', direccion: 'Plaça del Diamant, 3',
    fiscal: { tipo: 'autonomo', iva: 'general', retenidas: false, trabajadores: true, alquiler: true }, actividad: { id: 'bar', nombre: 'Bar y cafetería', serie: '', ivaPct: 10, irpfPct: 0 },
    caja: true, clientes: ['Associació de Veïns de Gràcia'], ventas: [1, 1], importe: [180, 420],
    conceptos: ['Catering para la asamblea de la asociación'],
    fijos: [['Inmobiliaria Gràcia S.L.', 'Alquiler del local', 1350, 21], ['Endesa Energía S.A.', 'Luz del local', 310], ['Aigües de Barcelona', 'Agua', 64, 10], ['Nóminas', 'Nóminas y Seguridad Social del camarero', 1980, 0]],
    variables: [['Bebidas y cafés', [900, 1800], 'Distribuciones Garcia S.L.'], ['Comida y producto fresco', [700, 1500], 'Mercat de l\'Abaceria']],
    bienes: [[18, 'Cafetera profesional de dos grupos', 'Hostelería Moderna S.L.', 3200, 'maquinaria']],
    cuota: 320, gestor: 'gestor', plan: 'prueba', estado3T: 'cambios',
  },
  {
    id: 'dcli0004', contacto: 'Lucía Hernández', nombre: 'Lucía Hernández Fotografía', nif: '00000104H', ciudad: '35003 Las Palmas de Gran Canaria', direccion: 'C/ Triana, 58',
    fiscal: { tipo: 'autonomo', iva: 'general', retenidas: false, territorio: 'canarias' }, actividad: { id: 'fotografia', nombre: 'Fotografía', serie: '', ivaPct: 7, irpfPct: 0 },
    clientes: ['Hotel Playa Canteras S.A.', 'Bodas Atlántico S.L.', 'Ayuntamiento de Telde', 'Carmen Suárez Déniz'], ventas: [2, 6], importe: [250, 1800],
    conceptos: ['Reportaje de boda', 'Fotografía de producto para catálogo', 'Sesión corporativa del equipo', 'Cobertura fotográfica de evento'],
    fijos: [['Cabildo Coworking', 'Estudio compartido', 180, 7], ['Telefónica de España', 'Teléfono e internet', 40, 7]],
    variables: [['Material fotográfico y revelado', [60, 420]], ['Desplazamientos entre islas', [80, 260], 'Binter Canarias S.A.', 0]],
    bienes: [[16, 'Cámara Sony A7 IV y objetivo 24-70', 'Fotocasión Canarias S.L.', 3450, 'electronicos']],
    cuota: 294, gestor: 'titular', plan: 'prueba', estado3T: 'presentado',
  },
  {
    id: 'dcli0005', contacto: 'Iñaki Etxeberria', nombre: 'Iñaki Etxeberria Consultoría', nif: '00000105L', ciudad: '31001 Pamplona', direccion: 'Calle Estafeta, 12',
    fiscal: { tipo: 'autonomo', iva: 'general', retenidas: false, territorio: 'navarra' }, actividad: { id: 'consultoria', nombre: 'Consultoría informática', serie: '', ivaPct: 21, irpfPct: 15 },
    clientes: ['Cooperativa Agraria Ribera S.Coop.', 'Talleres Arga S.L.', 'Ingeniería Baztán S.A.'], ventas: [2, 4], importe: [900, 3600],
    conceptos: ['Mantenimiento de sistemas (mensual)', 'Implantación de ERP', 'Auditoría de seguridad informática'],
    fijos: [['Amazon Web Services EMEA', 'Servidores en la nube', 85], ['Euskaltel S.A.', 'Fibra y móvil', 52]],
    variables: [['Licencias de software', [40, 600]], ['Kilometraje y aparcamiento', [30, 160], 'Parking Plaza del Castillo', 21]],
    bienes: [[11, 'Portátil Lenovo ThinkPad', 'PcComponentes S.L.', 1590, 'informatica']],
    cuota: 294, gestor: 'gestor', plan: 'prueba', estado3T: 'listo', atrasado: true,
  },
  {
    id: 'dcli0006', contacto: 'Elena Ruiz', nombre: 'Nexo Consultores S.L.', nif: 'B00000106', ciudad: '08008 Barcelona', direccion: 'Passeig de Gràcia, 92',
    fiscal: { tipo: 'sociedad', iva: 'general', retenidas: false, trabajadores: true, alquiler: true }, actividad: { id: 'consultoria-rrhh', nombre: 'Consultoría de recursos humanos', serie: '', ivaPct: 21, irpfPct: 0 },
    clientes: ['Grupo Hotelero Costa Brava S.A.', 'Logística Prat S.L.', 'Clínica Dental Sant Gervasi S.L.', 'Asociación de Comerciantes del Born'], ventas: [4, 8], importe: [1200, 5200],
    conceptos: ['Proceso de selección de personal', 'Plan de igualdad', 'Formación en liderazgo', 'Auditoría retributiva'],
    fijos: [['Passeig de Gràcia 92 S.L.', 'Alquiler de la oficina', 1650, 21], ['Nóminas', 'Nóminas y Seguridad Social', 7400, 0], ['Iberdrola Clientes S.A.U.', 'Luz de la oficina', 140]],
    variables: [['Publicidad en LinkedIn', [120, 650]], ['Viajes y dietas', [80, 540], 'Renfe Viajeros S.A.', 10]],
    bienes: [[14, 'Mobiliario de la oficina', 'Steelcase S.A.', 6200, 'mobiliario']],
    gestor: 'titular', plan: 'licencia', estado3T: 'revisado',
  },
];

const inicio = dia(Y - 2, Number(hoy.slice(5, 7)), 1);
function generar(c) {
  const facturas = [], gastos = [];
  for (let d = new Date(`${inicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const verano = [6, 7, 8].includes(m) ? 1.2 : m === 8 && !c.caja ? 0.6 : 1;
    const n = Math.round((c.ventas[0] + azar() * (c.ventas[1] - c.ventas[0])) * verano);
    for (const dd of Array.from({ length: n }, () => 1 + Math.floor(azar() * 27)).sort((a, b) => a - b)) {
      const fecha = dia(y, m, dd);
      if (fecha > hoy) continue;
      const cliente = elegir(c.clientes);
      const particular = !/S\.L\.|S\.A\.|S\.Coop|Ayuntamiento|Ajuntament|Fundació|Associació|Asociación|Comunidad|Grupo|Cooperativa|Clínica/.test(cliente);
      const numero = siguienteNumero(facturas, y, '');
      const antig = (Date.parse(hoy) - Date.parse(fecha)) / 864e5;
      facturas.push({
        id: `${y}-${numero}`, numero, anio: y, fecha, actividad: c.actividad.id, cliente: { nombre: cliente, nif: particular ? '' : `B${String(c.clientes.indexOf(cliente) + 10).padStart(7, '0')}${c.id.slice(-1)}`, ciudad: c.ciudad },
        concepto: elegir(c.conceptos), base: entre(c.importe[0], c.importe[1]), ivaPct: c.actividad.ivaPct, irpfPct: particular ? 0 : c.actividad.irpfPct, nota: '',
        cobrada: antig > 60 ? azar() > 0.04 : antig > 20 ? azar() > 0.4 : false,
      });
    }
    // Bar: un cierre de caja por semana, con IVA del 10 % (consumo en el local).
    if (c.caja) {
      for (const dd of [7, 14, 21, 28]) {
        const fecha = dia(y, m, dd);
        if (fecha > hoy) continue;
        const total = r2(entre(2600, 4200) * verano);
        const datos = limpiarCierre({ fecha, porIva: [{ pct: 10, total }], efectivo: r2(total * 0.35), otros: 0 });
        assert.ok(!datos.error, datos.error);
        const numero = siguienteNumero(facturas, y, 'Z');
        facturas.push({ id: `Z${y}-${numero}`, numero, anio: y, serie: 'Z', ...datos, actividad: c.actividad.id });
      }
    }
    const g = (dd, concepto, base, ivaPct = c.actividad.ivaPct === 7 ? 7 : 21, extra = {}) => {
      const fecha = dia(y, m, dd);
      if (fecha <= hoy) gastos.push({ id: `g-${gastos.length + 1}`, fecha, actividad: c.actividad.id, concepto, base, ivaPct, ...extra });
    };
    for (const [proveedor, concepto, base, iva] of c.fijos) g(proveedor === 'Nóminas' ? 28 : 3, concepto, base, iva, proveedor === 'Nóminas' ? {} : { proveedor });
    for (const [concepto, [a, b], proveedor, iva] of c.variables) if (azar() > 0.25) g(8 + Math.floor(azar() * 18), concepto, entre(a, b), iva, proveedor ? { proveedor } : {});
    if (c.cuota) {
      const fecha = dia(y, m, 28);
      if (fecha <= hoy) gastos.push({ id: idCuota(fecha.slice(0, 7)), fecha, actividad: c.actividad.id, concepto: 'Cuota de autónomos', base: c.cuota, ivaPct: 0, categoria: '642' });
    }
  }
  for (const [meses, concepto, proveedor, base, tipo] of c.bienes) {
    const x = new Date(Date.UTC(Y, Number(hoy.slice(5, 7)) - 1 - meses, 9)).toISOString().slice(0, 10);
    gastos.push({ id: `bien-${gastos.length + 1}`, fecha: x, actividad: c.actividad.id, concepto, proveedor, base, ivaPct: c.actividad.ivaPct === 7 ? 7 : 21, inversion: { tipo } });
  }
  // El mismo NIF para cada proveedor.
  const nifs = new Map();
  for (const x of gastos.filter((x) => x.proveedor)) {
    if (!nifs.has(x.proveedor)) nifs.set(x.proveedor, `B${String(500 + nifs.size).padStart(7, '0')}${c.id.slice(-1)}`);
    x.proveedorNif = nifs.get(x.proveedor);
  }
  return { facturas, gastos };
}

// ---- Trimestres: presentados, cerrados (con la misma huella que calcula lib/cierres.js) y el estado del último.
const FIN = ['03-31', '06-30', '09-30', '12-31'];
const plazoDe = (y, t) => (t === 4 ? `${y + 1}-01-30` : `${y}-${['04', '07', '10'][t - 1]}-20`);
const trimestres = [];
for (let y = Y - 2; y <= Y; y++) for (let t = 1; t <= 4; t++) if (`${y}-${FIN[t - 1]}` >= inicio && `${y}-${FIN[t - 1]}` < hoy) trimestres.push({ anio: y, t });
const ultimo = trimestres.at(-1);
function huella(facturas, gastos, anio, t) {
  const desde = `${anio}-${['01-01', '04-01', '07-01', '10-01'][t - 1]}`, hasta = `${anio}-${FIN[t - 1]}`;
  const lineas = (l, col, tipo) => l.filter((x) => x.fecha >= desde && x.fecha <= hasta).map((x) => { const f = indiceDe(col, x).ficha; return `${tipo}|${x.id}|${f.f}|${f.b}|${f.t}`; }).sort();
  const lf = lineas(facturas, 'facturas', 'f'), lg = lineas(gastos, 'gastos', 'g');
  return { huella: createHash('sha256').update([...lf, ...lg].join('\n')).digest('hex').slice(0, 24), facturas: lf.length, gastos: lg.length };
}
// Fecha del gasto que entra en el último trimestre después de cerrarlo (Bar La Plaça).
const FECHA_TRAS_CIERRE = `${ultimo.anio}-${FIN[ultimo.t - 1].slice(0, 2)}-26`;
const persona = (quien) => (quien === 'gestor' ? { id: idGestor, nombre: 'Pol Martí' } : { id: idTitular, nombre: 'Núria Ferrer' });

// estado del último trimestre: listo (por revisar) · revisado (cerrado) · cambios (cerrado y después cambió) · presentado.
// Si el plazo del último trimestre ya pasó, una gestoría al día lo ha presentado: lo revisado pasa a presentado (el bar,
// presentado y con cambios después) y solo el cliente marcado como atrasado sale por revisar y fuera de plazo.
const PLAZO_PASADO = plazoDe(ultimo.anio, ultimo.t) < hoy;
const estadoReal = (c) => (!PLAZO_PASADO ? c.estado3T : c.estado3T === 'listo' && !c.atrasado ? 'presentado' : c.estado3T === 'revisado' ? 'presentado' : c.estado3T);
function trimestresDe(e, facturas, gastos, estado, quien) {
  const pres303 = {}, pagos130 = {}, cierres = {};
  const autonomo = e.fiscal.tipo === 'autonomo';
  for (const { anio, t } of trimestres) {
    const esUltimo = anio === ultimo.anio && t === ultimo.t;
    const presentado = !esUltimo || estado === 'presentado' || (PLAZO_PASADO && estado === 'cambios');
    if ((presentado && plazoDe(anio, t) < hoy) || (esUltimo && presentado)) {
      (pres303[anio] ||= {})[t] = true;
      if (autonomo) (pagos130[anio] ||= {})[t] = 0; // 0: presentado con lo que calcula Fisquo
    }
    if (!esUltimo || ['revisado', 'cambios', 'presentado'].includes(estado)) {
      const cerrado = esUltimo && !PLAZO_PASADO ? mas(hoy, -2) : mas(plazoDe(anio, t), -6);
      cierres[`${anio}-${t}`] = { fecha: fechaHora(cerrado, 17), por: persona(quien), despacho: 'Gestoría Ferrer (demo)', ...huella(facturas, gastos, anio, t) };
    }
  }
  return { pres303, pagos130, cierres };
}

// ---- Escritura: se borra lo de antes de cada empresa generada (datos, índices, cierres, preguntas y registro).
const COLECCIONES = ['facturas', 'gastos', 'clientes', 'saldo', 'asientos', 'banco', 'bancos'];
// Los índices, ya hechos: así la app no los reconstruye documento a documento (scripts/indicesDemo.mjs).
const indices = async (emp, facturas, gastos) => { for (const [col, docs] of [['facturas', facturas], ['gastos', gastos], ['presupuestos', []]]) await escribirIndices(r, P, emp, col, docs); };
async function limpiar(emp) {
  const ks = [...COLECCIONES.map((n) => `${P}${n}:${emp}`), `${P}cierres:${emp}`, `${P}despacho-comentarios:${emp}`, `${P}despacho-accesos:${emp}`, `${P}despacho-peticiones:${emp}`, `${P}despacho-informes:${emp}`];
  for (const col of ['facturas', 'gastos', 'presupuestos']) ks.push(...Object.values(claves(col, emp)).map((k) => `${P}${k}`));
  await r.del(...ks);
  // El resumen guardado del panel (lib/panelCache.js) se calcularía con datos viejos el mismo día.
  let cursor = '0';
  do {
    const [sig, encontradas] = await r.scan(cursor, { match: `${P}panel:*:${emp}:*`, count: 500 });
    if (encontradas.length) await r.del(...encontradas);
    cursor = String(sig);
  } while (cursor !== '0');
}

// Contabilidad que cuadra (como scripts/demo.mjs): asiento de apertura con lo que había en el banco, el Impuesto sobre
// Sociedades de los años cerrados con sus pagos a cuenta, y el saldo del banco igual a la cuenta 572. Si con la apertura
// el banco quedaría bajo mínimos, se abre con más (un negocio real no vive en descubierto).
async function cuadrar(emp, e, facturas, gastos, { pres303 = {}, pagos130 = {} } = {}) {
  const sociedad = e.fiscal.tipo === 'sociedad';
  const cuotaIS = {}, pagos202 = {};
  if (sociedad) {
    for (let y = Y - 2; y < Y; y++) if (`${y + 1}-07-25` < hoy) cuotaIS[y] = borradorSociedades(facturas, gastos, y).cuota;
    for (let y = Y - 1; y <= Y; y++) for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha < hoy) (pagos202[y] ||= {})[x.p] = x.pago;
  }
  const primera = [...facturas, ...gastos].map((x) => x.fecha).sort()[0];
  // El autónomo vive de su negocio: cada mes saca dinero para él (cuenta 550, titular de la explotación).
  let retiradas = [];
  const conRetiradas = (importe) => {
    retiradas = [];
    if (sociedad || !importe) return;
    for (let d = new Date(`${primera.slice(0, 7)}-01T12:00:00Z`); ; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) {
      const fecha = dia(d.getUTCFullYear(), d.getUTCMonth() + 1, 30 > new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() ? 28 : 30);
      if (fecha > hoy) break;
      retiradas.push({ id: `retirada-${fecha.slice(0, 7)}`, fecha, concepto: 'Transferencia a la cuenta personal del titular', lineas: [{ cuenta: '550', debe: importe, haber: 0 }, { cuenta: '572', debe: 0, haber: importe }] });
    }
  };
  const saldo = (banco) => {
    const apertura = { id: 'apertura', ...asientoApertura({ fecha: primera, banco, capital: sociedad ? 3000 : 0 }, sociedad) };
    const todos = generarAsientos({ facturas, gastos, manuales: [apertura, ...retiradas], fiscal: e.fiscal, pres303, pagos130, pagos202, cuotaIS }, hoy);
    // El punto más bajo de la cuenta 572 en estos dos años y lo que queda hoy.
    let minimo = Infinity;
    for (let y = Y - 2; y <= Y; y++) minimo = Math.min(minimo, mayor(todos, '572', y).final);
    return { apertura, final: mayor(todos, '572', Y).final, minimo };
  };
  let banco = sociedad ? 25000 : 8000;
  let x = saldo(banco);
  // Lo que sobra por encima de unos 15.000 € se lo ha ido llevando el titular, mes a mes (en redondo).
  if (!sociedad && x.final > 15000) {
    const meses = Math.max(1, Math.round((Date.parse(hoy) - Date.parse(primera)) / (30.4 * 864e5)));
    conRetiradas(Math.floor((x.final - 15000) / meses / 50) * 50);
    x = saldo(banco);
  }
  if (x.minimo < 3000) { banco = r2(banco + 3000 - x.minimo); x = saldo(banco); }
  await r.hset(`${P}asientos:${emp}`, porId([x.apertura, ...retiradas]));
  await r.set(`${P}saldo:${emp}`, { importe: x.final, fecha: hoy });
  return { cuotaIS, pagos202, banco: x.final };
}

const desdeCliente = (i) => fechaHora(mas(inicio, 3 + i * 9), 9);
const vinculo = (c, i, licencia) => ({ id: idDespacho, nombre: 'Gestoría Ferrer (demo)', desde: desdeCliente(i), por: i % 2 ? 'codigo' : 'cliente', ...(c.gestor === 'gestor' ? { gestor: idGestor } : {}), ...(licencia ? { licencia: { desde: mas(hoy, -140) } } : {}) });
const planDe = (c) => (c.plan === 'licencia'
  ? { tipo: c.fiscal.tipo === 'sociedad' ? 'pym' : 'aut', nombre: 'Pro', version: VERSION_PLAN, periodo: 'mes', pagado: true, gestoria: CODIGO, porDespacho: { id: idDespacho, nombre: 'Gestoría Ferrer (demo)', desde: mas(hoy, -140) } }
  : { tipo: c.fiscal.tipo === 'sociedad' ? 'pym' : 'aut', nombre: 'Pro', version: VERSION_PLAN, periodo: 'mes', hasta: mas(hoy, 45), gestoria: CODIGO });

// Beneficio de cada año (ventas menos gastos, sin IVA y sin los bienes de inversión, que se amortizan): ninguna empresa de
// la demo puede salir en pérdidas.
function beneficios(facturas, gastos) {
  return [Y - 1, Y].map((y) => {
    const b = r2(facturas.filter((f) => f.fecha.startsWith(String(y))).reduce((s, f) => s + importes(f).base, 0) - gastos.filter((g) => g.fecha.startsWith(String(y)) && !g.inversion).reduce((s, g) => s + importes(g).base, 0));
    assert.ok(b > 0, `Beneficio negativo en ${y}: ${b}`);
    return `beneficio ${y} ${Math.round(b)} €`;
  }).join(', ');
}
const resumen = [];
for (const [i, c] of CLIENTES.entries()) {
  semilla = 101 + i * 37;
  const { facturas, gastos } = generar(c);
  const e = {
    id: c.id, nombre: c.nombre, creada: desdeCliente(i), pendiente: false, demo: true,
    emisor: { nombre: c.nombre.toUpperCase(), nif: c.nif, direccion: c.direccion, ciudad: c.ciudad, plazo: 30 },
    actividades: [c.actividad], fiscal: { ...c.fiscal, intracom: false }, plan: planDe(c),
  };
  const { pres303, pagos130, cierres } = trimestresDe(e, facturas, gastos, estadoReal(c), c.gestor);
  // Cambios tras el cierre: un gasto que entró después de cerrar (el ticket de una reparación).
  if (c.estado3T === 'cambios') gastos.push({ id: 'g-tras-cierre', fecha: FECHA_TRAS_CIERRE, actividad: c.actividad.id, concepto: 'Reparación de la cámara frigorífica', proveedor: 'Fred Industrial S.L.', proveedorNif: 'B0000777Z', base: 640, ivaPct: 21 });
  await limpiar(c.id);
  const conta = await cuadrar(c.id, e, facturas, gastos, { pres303, pagos130 });
  await r.hset(`${P}empresas`, { [c.id]: { ...e, pres303, pagos130, cuotaIS: conta.cuotaIS, pagos202: conta.pagos202, despachoCliente: vinculo(c, i, c.plan === 'licencia') } });
  await r.hset(`${P}facturas:${c.id}`, porId(facturas));
  await r.hset(`${P}gastos:${c.id}`, porId(gastos));
  await indices(c.id, facturas, gastos);
  await r.hset(`${P}clientes:${c.id}`, porId([...new Map(facturas.filter((f) => !f.caja).map((f) => [f.cliente.nombre.toUpperCase(), { id: f.cliente.nombre.toUpperCase(), ...f.cliente }])).values()]));
  if (Object.keys(cierres).length) await r.hset(`${P}cierres:${c.id}`, cierres);
  resumen.push(`${c.nombre}: ${facturas.length} facturas, ${gastos.length} gastos, ${beneficios(facturas, gastos)}, banco ${conta.banco} €`);
  c.datos = { facturas, gastos };
}

// ---- Sonora Eventos (la demo del cliente): cliente del despacho, con su último trimestre presentado y cerrado.
{
  await r.del(`${P}cierres:${sonora.id}`, `${P}despacho-comentarios:${sonora.id}`, `${P}despacho-accesos:${sonora.id}`, `${P}despacho-peticiones:${sonora.id}`, `${P}despacho-informes:${sonora.id}`);
  const [fs, gs] = await Promise.all([r.hgetall(`${P}facturas:${sonora.id}`), r.hgetall(`${P}gastos:${sonora.id}`)]);
  const facturas = Object.values(fs || {}), gastos = Object.values(gs || {});
  const cierres = {};
  for (const { anio, t } of trimestres) cierres[`${anio}-${t}`] = { fecha: fechaHora(anio === ultimo.anio && t === ultimo.t ? mas(hoy, -4) : mas(plazoDe(anio, t), -5), 16), por: persona('titular'), despacho: 'Gestoría Ferrer (demo)', ...huella(facturas, gastos, anio, t) };
  await r.hset(`${P}cierres:${sonora.id}`, cierres);
  const pres303 = {};
  for (const { anio, t } of trimestres) if (plazoDe(anio, t) < hoy) (pres303[anio] ||= {})[t] = true;
  // Sin plan (como la demo de siempre): todo incluido. La gestoría que lleva sus cuentas, para el email del paquete.
  await r.hset(`${P}empresas`, { [sonora.id]: { ...sonora, demo: true, pres303: { ...(sonora.pres303 || {}), ...pres303 }, gestoria: { nombre: 'Gestoría Ferrer (demo)', email: TITULAR, auto: false }, despachoCliente: { id: idDespacho, nombre: 'Gestoría Ferrer (demo)', desde: fechaHora(inicio, 9), por: 'cliente' } } });
  CLIENTES.unshift({ id: sonora.id, nombre: sonora.nombre, contacto: usuarioDemo.nombre || 'Demo', gestor: 'titular', datos: { facturas, gastos } });
}

// ---- Preguntas y respuestas entre el despacho y sus clientes, y el registro de lo que ha hecho el despacho.
const msg = (lado, quien, contacto, texto, fecha) => ({ quien: lado === 'despacho' ? quien.id : 'cliente', nombre: lado === 'despacho' ? quien.nombre : contacto, lado, texto, fecha });
const docGasto = (datos, buscar) => {
  const g = datos.gastos.filter((x) => x.fecha.startsWith(String(ultimo.anio)) && Math.ceil(Number(x.fecha.slice(5, 7)) / 3) === ultimo.t).find((x) => buscar.test(x.concepto));
  return g && { tipo: 'gasto', id: g.id, texto: `Gasto del ${g.fecha.split('-').reverse().join('/')} · ${g.proveedor || g.concepto}` };
};
const docFactura = (datos) => {
  const f = datos.facturas.filter((x) => !x.caja && x.fecha.startsWith(String(ultimo.anio)) && Math.ceil(Number(x.fecha.slice(5, 7)) / 3) === ultimo.t).sort((a, b) => b.base - a.base)[0];
  return f && { tipo: 'factura', id: f.id, texto: `Factura ${f.id} · ${f.cliente.nombre}` };
};
// Conversaciones: la general de cada cliente (doc nulo) y las preguntas sobre un documento. [lado, texto, hace cuántos días].
// leidoHasta: hace cuántos días leyó cada lado por última vez (lo posterior del otro sale como «Nuevo»).
const HILOS = {
  [sonora.id]: [
    { doc: () => null, hilo: [['despacho', `Hola, soy Núria. Ya tenemos cerrado y presentado el ${ultimo.t}T: IVA, retenciones y el pago a cuenta de Sociedades.`, 5], ['cliente', 'Perfecto, gracias. ¿Cuándo se carga en el banco?', 5], ['despacho', 'Lo domicilié para el último día del plazo. Lo verás en el banco ese día.', 5], ['despacho', 'Para el 4T: si compráis más equipo de sonido antes del 31 de diciembre, avisadme y vemos si os conviene amortizarlo este año.', 1]] },
    { doc: (d) => docGasto(d, /Técnicos de montaje|Transporte/), hilo: [['despacho', '¿Esta subcontratación tiene contrato o presupuesto firmado? Si la Agencia lo pide en una comprobación, conviene tenerlo.', 12], ['cliente', 'Sí, te lo subo como justificante esta semana.', 11], ['despacho', 'Perfecto, gracias. Lo dejo como resuelto.', 11]], resuelto: true },
  ],
  dcli0001: [
    { doc: () => null, hilo: [['cliente', 'Hola Núria, este mes he facturado bastante más. ¿Tengo que apartar algo más para el IRPF?', 6], ['despacho', 'Sí: con el 130 pagas el 20 % del beneficio del año. Te lo calcula Fisquo en el Resumen, «Para apartar».', 6]] },
    { doc: (d) => docFactura(d), hilo: [['despacho', 'Esta factura lleva retención del 15 %: ¿el cliente te ha enviado el certificado de retenciones del año pasado?', 5], ['cliente', 'Me lo mandaron en enero, lo busco y te lo paso.', 2]] },
  ],
  dcli0002: [
    { doc: (d) => docGasto(d, /Material de fontanería/), hilo: [['despacho', 'Falta el ticket de esta compra en Saltoki. ¿Puedes hacerle una foto y subirla?', 4]] },
    { doc: (d) => docGasto(d, /Combustible/), hilo: [['despacho', 'La furgoneta, ¿la usas solo para trabajar? Para deducir el 100 % del IVA del combustible tiene que ser así.', 4], ['cliente', 'Sí, solo para trabajar. Tengo otro coche para casa.', 1]] },
  ],
  dcli0003: [
    { doc: () => ({ tipo: 'gasto', id: 'g-tras-cierre', texto: `Gasto del ${FECHA_TRAS_CIERRE.split('-').reverse().join('/')} · Fred Industrial S.L.` }), hilo: [['despacho', 'Has añadido esta reparación después de que cerrara el trimestre. ¿Es de septiembre? Si es así, presento una complementaria.', 2], ['cliente', 'Sí, es del 26 de septiembre, se me pasó subirla. Perdona.', 1]] },
  ],
  dcli0004: [{ doc: () => null, hilo: [['despacho', 'Lucía, el IGIC del 3T ya está presentado en la Agencia Tributaria Canaria. Todo correcto.', 3], ['cliente', '¡Genial, gracias!', 3]] }],
  dcli0005: [{ doc: () => null, hilo: [['despacho', `Iñaki, el F-69 del ${ultimo.t}T ${PLAZO_PASADO ? "ya ha vencido" : "vence en unos días"} y aún no lo tenemos. ¿Has facturado algo a clientes de fuera de Navarra?`, 2], ['cliente', 'Perdona, se me pasó. Todo a clientes de Navarra; mañana subo las dos últimas facturas.', 0]] }],
  dcli0006: [{ doc: (d) => docGasto(d, /Viajes y dietas/), hilo: [['despacho', '¿Este viaje fue para un cliente? Indica en la nota para cuál: así queda justificado.', 7], ['cliente', 'Fue para Logística Prat, el proceso de selección de Madrid.', 6], ['despacho', 'Gracias, anotado.', 6]], resuelto: true }],
};
// El despacho tiene sin leer lo último de Marta, Jordi, el bar e Iñaki; Sonora (la demo del cliente), el último mensaje de Núria.
const LEIDO = { [sonora.id]: { despacho: 0, cliente: 2 }, dcli0001: { despacho: 4, cliente: 0 }, dcli0002: { despacho: 3, cliente: 0 }, dcli0003: { despacho: 1.5, cliente: 0 }, dcli0005: { despacho: 1, cliente: 0 } };
for (const c of CLIENTES) {
  const quien = persona(c.gestor);
  const hilos = (HILOS[c.id] || []).map((h, j) => {
    const doc = h.doc(c.datos);
    return { id: doc ? `dcom${String(j + 1).padStart(4, '0')}` : `general-${idDespacho}`, despacho: idDespacho, anio: ultimo.anio, t: ultimo.t, ...(doc ? { doc } : {}), hilo: h.hilo.map(([lado, texto, d], k) => msg(lado, quien, c.contacto, texto, fechaHora(mas(hoy, -d), 10 + k))), resuelto: Boolean(h.resuelto) };
  });
  if (hilos.length) await r.hset(`${P}despacho-comentarios:${c.id}`, porId(hilos));
  // Documentos pedidos (lib/peticionesDespacho.js): el ticket del último gasto sin justificante y, a Sonora y a Jordi, un papel más.
  const sinTicket = c.datos.gastos.filter((g) => !g.archivo && !g.nomina && g.proveedor && Number(g.base) > 0).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const peticiones = [
    ...(sinTicket ? [{ id: `dpet${c.id.slice(-4)}1`, despacho: idDespacho, tipo: 'ticket', texto: '', gasto: { id: sinTicket.id, texto: `${sinTicket.proveedor} (${sinTicket.fecha.split('-').reverse().join('/')})` }, creada: fechaHora(mas(hoy, -2), 9), por: quien, estado: 'pendiente' }] : []),
    ...({ [sonora.id]: 'Las escrituras de constitución de la sociedad', dcli0002: 'El contrato de renting de la furgoneta' }[c.id] ? [{ id: `dpet${c.id.slice(-4)}2`, despacho: idDespacho, tipo: 'documento', texto: { [sonora.id]: 'Las escrituras de constitución de la sociedad', dcli0002: 'El contrato de renting de la furgoneta' }[c.id], creada: fechaHora(mas(hoy, -1), 12), por: quien, estado: 'pendiente' }] : []),
  ];
  if (peticiones.length) await r.hset(`${P}despacho-peticiones:${c.id}`, porId(peticiones));
  const leido = LEIDO[c.id] || { despacho: 0, cliente: 0 };
  await r.del(`${P}despacho-leido:${c.id}`);
  await r.hset(`${P}despacho-leido:${c.id}`, { despacho: leido.despacho ? fechaHora(mas(hoy, -leido.despacho), 8) : ahora, cliente: leido.cliente ? fechaHora(mas(hoy, -leido.cliente), 8) : ahora });
  // Registro (lo más reciente primero): entradas, cierres, descargas y exportaciones de los últimos trimestres.
  const registro = [];
  const apunta = (fecha, accion, detalle = '') => registro.push({ fecha, quien: quien.id, nombre: quien.nombre, despacho: 'Gestoría Ferrer (demo)', despachoId: idDespacho, accion, detalle });
  for (const { anio, t } of trimestres.slice(-4)) {
    const base = mas(plazoDe(anio, t), -8);
    apunta(fechaHora(base, 9), 'Entró en tus cuentas');
    apunta(fechaHora(base, 11), `Descargó el paquete del ${t}T ${anio}`);
    if (t === 4) apunta(fechaHora(mas(base, 1), 12), 'Exportó la contabilidad', `SUENLACE.DAT · ${anio}`);
    if (!(anio === ultimo.anio && t === ultimo.t) || ['revisado', 'cambios', 'presentado'].includes(estadoReal(c)) || c.id === sonora.id) apunta(fechaHora(mas(base, 2), 17), `Revisó y cerró el ${t}T ${anio}`);
  }
  for (const h of hilos.filter((x) => x.doc)) apunta(h.hilo[0].fecha, 'Te ha preguntado por un documento', h.doc.texto);
  registro.sort((a, b) => b.fecha.localeCompare(a.fecha));
  await r.rpush(`${P}despacho-accesos:${c.id}`, ...registro);
}

// ---- El despacho: su empresa (gratis, facturando la cuota a sus clientes), sus dos personas y su ficha.
{
  const actividad = { id: 'asesoria', nombre: 'Asesoría fiscal, contable y laboral', serie: '', ivaPct: 21, irpfPct: 0 };
  const FISCAL_DESPACHO = { tipo: 'sociedad', iva: 'general', retenidas: false, trabajadores: true, alquiler: true, intracom: false };
  // Su cartera: los clientes que tiene en Fisquo y otros cuarenta y dos que aún llevan sus papeles a mano (una gestoría de
  // barrio vive de cuotas mensuales), más la campaña de la Renta en primavera y las cuentas anuales de las sociedades en julio.
  semilla = 977;
  const NOMBRES = ['Ferretería Sants', 'Fruites Marina', 'Taller Mecànic Creu Coberta', 'Perruqueria Estil', 'Clínica Dental Badal', 'Forn de Pa Can Pons', 'Farmàcia Riera', 'Autoescola Hostafrancs', 'Bodega El Tast', 'Peixateria Mar Blau', 'Floristeria Roser', 'Gimnàs Viriat', 'Llibreria Galileo', 'Òptica Vista', 'Restaurant La Brasa', 'Electrodomèstics Puig', 'Pintures Gómez', 'Acadèmia Idiomes Sants', 'Fisioteràpia Torrent', 'Joieria Martí', 'Bar Els Amics', 'Transports Badia', 'Reformes Tarradellas', 'Veterinari Sants', 'Calçats Mireia', 'Copisteria Express', 'Cerrajería Ràpid', 'Estudi Arquitectura Rius', 'Psicòloga Anna Vidal', 'Fotògraf Pau Serra', 'Disseny Web Nord', 'Advocada Laura Gil', 'Escola de Música Do', 'Bugaderia Neta', 'Pastisseria Dolça', 'Mobles Ribera', 'Informàtica Joan', 'Ioga Shanti', 'Traductora Elena Ros', 'Fusteria Valls', 'Tapisseria Comas', 'Climatització Costa'];
  const cartera = [
    ...CLIENTES.map((c) => ({ nombre: c.nombre, nif: c.nif || sonora.emisor?.nif || '', cuota: c.id === sonora.id ? 240 : c.fiscal?.tipo === 'sociedad' ? 210 : 95, sociedad: c.id === sonora.id || c.fiscal?.tipo === 'sociedad' })),
    ...NOMBRES.map((nombre, k) => ({ nombre, nif: `${k % 4 === 0 ? 'B' : ''}${String(700 + k).padStart(k % 4 === 0 ? 7 : 8, '0')}${k % 4 === 0 ? 'F' : 'D'}`, cuota: k % 4 === 0 ? entre(170, 280) : entre(75, 150), sociedad: k % 4 === 0 })),
  ];
  const facturas = [];
  const factura = (fecha, c, concepto, base) => {
    const y = Number(fecha.slice(0, 4)), numero = siguienteNumero(facturas, y, '');
    facturas.push({ id: `${y}-${numero}`, numero, anio: y, fecha, actividad: actividad.id, cliente: { nombre: c.nombre, nif: c.nif }, concepto, base, ivaPct: 21, irpfPct: 0, nota: '', cobrada: fecha < mas(hoy, -12) || azar() > 0.5 });
  };
  for (let d = new Date(`${inicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, fecha = dia(y, m, 1);
    for (const c of cartera) factura(fecha, c, `Cuota mensual de asesoría (${fecha.slice(0, 7)})`, c.cuota);
    if (m === 6) for (const c of cartera.filter((x) => !x.sociedad)) if (dia(y, 6, 25) <= hoy) factura(dia(y, 6, 25), c, `Declaración de la renta ${y - 1}`, 60);
    if (m === 7) for (const c of cartera.filter((x) => x.sociedad)) if (dia(y, 7, 28) <= hoy) factura(dia(y, 7, 28), c, `Cuentas anuales e Impuesto sobre Sociedades ${y - 1}`, 380);
  }
  const gastos = [];
  for (let d = new Date(`${inicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    for (const [dd, concepto, proveedor, base, iva] of [[1, 'Alquiler del despacho', 'Finques Sants S.L.', 980, 21], [5, 'Programa de contabilidad', 'Wolters Kluwer Tax & Accounting', 160, 21], [10, 'Teléfono e internet', 'Movistar', 65, 21], [28, 'Nóminas y Seguridad Social', '', 4300, 0]]) {
      const fecha = dia(y, m, dd);
      if (fecha <= hoy) gastos.push({ id: `g-${gastos.length + 1}`, fecha, actividad: actividad.id, concepto, base, ivaPct: iva, ...(proveedor ? { proveedor, proveedorNif: `B0000${String(dd).padStart(3, '0')}F` } : {}) });
    }
  }
  await limpiar(empresaDespacho);
  await r.hset(`${P}empresas`, { [empresaDespacho]: { id: empresaDespacho, nombre: 'Gestoría Ferrer (demo)', creada: fechaHora(inicio, 8), pendiente: false, demo: true, emisor: { nombre: 'GESTORÍA FERRER (DEMO)', nif: 'B00000100', direccion: 'C/ de Sants, 150', ciudad: '08028 Barcelona', plazo: 15 }, actividades: [actividad], fiscal: FISCAL_DESPACHO, plan: { fundador: true, despacho: true, tipo: 'pym', nombre: 'Pro', desde: inicio } } });
  await r.hset(`${P}facturas:${empresaDespacho}`, porId(facturas));
  await r.hset(`${P}gastos:${empresaDespacho}`, porId(gastos));
  await indices(empresaDespacho, facturas, gastos);
  await r.hset(`${P}clientes:${empresaDespacho}`, porId(cartera.map((c) => ({ id: c.nombre.toUpperCase(), nombre: c.nombre, nif: c.nif }))));
  // Presentados todos los trimestres con el plazo ya pasado.
  const pres303 = {};
  for (const { anio, t } of trimestres) if (plazoDe(anio, t) < hoy) (pres303[anio] ||= {})[t] = true;
  const conta = await cuadrar(empresaDespacho, { fiscal: FISCAL_DESPACHO }, facturas, gastos, { pres303 });
  const e = await r.hget(`${P}empresas`, empresaDespacho);
  await r.hset(`${P}empresas`, { [empresaDespacho]: { ...e, pres303, cuotaIS: conta.cuotaIS, pagos202: conta.pagos202 } });
  resumen.push(`Gestoría Ferrer (demo): ${facturas.length} facturas, ${gastos.length} gastos, ${beneficios(facturas, gastos)}, banco ${conta.banco} €`);

  const pass = usuarioDemo.pass;
  await r.hset(`${P}usuarios`, {
    [idTitular]: { id: idTitular, nombre: 'Núria Ferrer', email: TITULAR, admin: false, creado: fechaHora(inicio, 8), emailVerificado: true, empresa: empresaDespacho, rol: 'admin', pass, despacho: idDespacho },
    [idGestor]: { id: idGestor, nombre: 'Pol Martí', email: GESTOR, admin: false, creado: fechaHora(inicio, 8), emailVerificado: true, empresa: empresaDespacho, rol: 'miembro', permisos: [], pv: 2, pass, despacho: idDespacho },
  });
  await r.hset(`${P}emails`, { [TITULAR]: idTitular, [GESTOR]: idGestor });
  await r.hset(`${P}despachos`, { [idDespacho]: { id: idDespacho, nombre: 'Gestoría Ferrer (demo)', nif: 'B00000100', email: TITULAR, codigo: CODIGO, empresa: empresaDespacho, creado: fechaHora(inicio, 8), miembros: { [idTitular]: { rol: 'titular', desde: fechaHora(inicio, 8) }, [idGestor]: { rol: 'gestor', desde: fechaHora(mas(inicio, 30), 8) } }, soloAsignados: false, empresaPropia: true, demo: true } });
  await r.hset(`${P}despacho-codigos`, { [CODIGO]: idDespacho });
  await r.del(`${P}despacho-clientes:${idDespacho}`);
  await r.sadd(`${P}despacho-clientes:${idDespacho}`, ...CLIENTES.map((c) => c.id));
}

// Comprobación: el 130 de los autónomos sale con lo generado (si no, la demo enseñaría modelos raros).
for (const c of CLIENTES.filter((x) => x.fiscal?.tipo === 'autonomo')) {
  const res = resumenAnual(c.datos.facturas, c.datos.gastos, ultimo.anio, {}, [c.actividad.id]);
  assert.ok(res.trimestres.length === 4, `Resumen de ${c.nombre}`);
}
console.log(`Gestoría demo lista: ${TITULAR} (titular) y ${GESTOR} (gestor), con la contraseña de ${DEMO}.`);
for (const l of resumen) console.log(`  · ${l}`);

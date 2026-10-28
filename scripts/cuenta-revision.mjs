// Datos de ejemplo para la cuenta con la que Apple revisa la app de iOS (mobile/app-store/revision.md): unos meses de
// facturas (cobradas, pendientes y alguna vencida) y de gastos en la empresa que ya creó su titular. No toca el usuario,
// la contraseña ni el plan, y no hace nada si la empresa ya tiene facturas o gastos, si aún no ha acabado la bienvenida
// o si lleva Verifactu (no se inventan registros para la AEAT).
// Uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… REVISION_EMAIL=… node scripts/cuenta-revision.mjs
import assert from 'node:assert/strict';
import { Redis } from '@upstash/redis';
import { siguienteNumero } from '../lib/calculos.js';
import { escribirIndices } from './indicesDemo.mjs';

const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = process.env;
if (!url || !token) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const EMAIL = String(process.env.REVISION_EMAIL || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) throw new Error('Falta REVISION_EMAIL');
const r = new Redis({ url, token });
const P = 'cuentas:';

const uid = await r.hget(`${P}emails`, EMAIL);
if (!uid) throw new Error(`No hay ninguna cuenta con ${EMAIL}`);
const usuario = await r.hget(`${P}usuarios`, uid);
const eid = usuario?.empresa;
const empresa = eid && await r.hget(`${P}empresas`, eid);
if (!empresa) throw new Error('La cuenta no tiene empresa');
if (empresa.pendiente || !Array.isArray(empresa.actividades) || !empresa.actividades.length) throw new Error('Primero hay que acabar la bienvenida (actividades e impuestos)');
if (empresa.verifactu) throw new Error('La empresa tiene Verifactu activo: no se le meten facturas inventadas');
const [nf, ng] = await Promise.all([r.hlen(`${P}facturas:${eid}`), r.hlen(`${P}gastos:${eid}`)]);
if (nf || ng) throw new Error(`La empresa ya tiene ${nf} facturas y ${ng} gastos: no se toca`);

// Generador con semilla: sale siempre igual.
let semilla = 11;
const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const entre = (a, b) => Math.round((a + azar() * (b - a)) / 5) * 5;
const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
const hoy = new Date().toISOString().slice(0, 10);
const mas = (f, d) => new Date(Date.parse(`${f}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
const dias = (desde) => Math.round((Date.parse(hoy) - Date.parse(desde)) / 864e5);

const CLIENTES = [
  { nombre: 'Hotel Mirador del Port S.A.', nif: 'A00000001', direccion: 'Passeig de Colom, 12', ciudad: '08002 Barcelona' },
  { nombre: 'Agencia Brisa Incentivos S.L.', nif: 'B00000002', direccion: 'C/ de Balmes, 210', ciudad: '08006 Barcelona' },
  { nombre: 'Celebra Bodas y Eventos S.L.', nif: 'B00000003', direccion: 'Av. Diagonal, 455', ciudad: '08036 Barcelona' },
  { nombre: 'Congresos Mediterrània S.L.', nif: 'B00000005', direccion: 'C/ de Pujades, 77', ciudad: '08005 Barcelona' },
  { nombre: 'Fundació Música Viva', nif: 'G00000006', direccion: 'C/ del Rec, 15', ciudad: '08003 Barcelona' },
];
const CONCEPTOS = ['Diseño de identidad visual', 'Campaña para redes sociales', 'Maquetación de catálogo', 'Diseño de la web corporativa', 'Cartelería y folletos del evento', 'Mantenimiento mensual de la web'];
const actividades = empresa.actividades;
const plazo = Number(empresa.emisor?.plazo) || 30;

// Facturas de los últimos cinco meses. Cobradas las de hace más de dos meses; de las recientes, unas pendientes y, entre
// las que ya pasaron su plazo de pago, dos vencidas.
const facturas = [];
const fechas = [];
for (let atras = 150; atras >= 3; atras -= 6 + Math.floor(azar() * 8)) fechas.push(mas(hoy, -atras));
let vencidas = 0;
for (const fecha of fechas) {
  const a = elegir(actividades);
  const anio = Number(fecha.slice(0, 4)), serie = a.serie || '';
  const numero = siguienteNumero(facturas, anio, serie);
  const vence = mas(fecha, plazo);
  const cobrada = dias(fecha) > 65 || (vence < hoy && vencidas++ >= 2);
  facturas.push({
    id: `${serie}${anio}-${numero}`, numero, anio, ...(serie ? { serie } : {}), fecha, actividad: a.id,
    cliente: elegir(CLIENTES), concepto: elegir(CONCEPTOS), base: entre(350, 2400),
    ivaPct: Number(a.ivaPct ?? 21), irpfPct: Number(a.irpfPct ?? 0), nota: '', cobrada,
  });
}

// Gastos de cada mes, con su proveedor: lo que tendría un estudio pequeño.
const gastos = [];
const g = (fecha, concepto, proveedor, proveedorNif, base, ivaPct = 21) => {
  if (fecha <= hoy) gastos.push({ id: `rev-${gastos.length + 1}`, fecha, actividad: actividades[0].id, concepto, proveedor, proveedorNif, base, ivaPct });
};
for (let m = 5; m >= 0; m--) {
  const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - m, 1));
  const dia = (n) => `${d.toISOString().slice(0, 8)}${String(n).padStart(2, '0')}`;
  g(dia(1), 'Alquiler del espacio de coworking', 'Coworking Poblenou S.L.', 'B00000301', 320);
  g(dia(4), 'Adobe Creative Cloud', 'Adobe Systems Software Ireland Ltd', 'IE6364992H', 66.54);
  g(dia(8), 'Teléfono e internet', 'Telefónica de España S.A.U.', 'A82018474', 48.6);
  g(dia(12), 'Gestoría', 'Assessoria Vila S.L.', 'B00000302', 95);
  if (m % 2 === 0) g(dia(18), 'Publicidad en Instagram', 'Meta Platforms Ireland Ltd', 'IE9692928F', entre(60, 180));
  if (m === 3) g(dia(21), 'Monitor para retoque de color', 'PcComponentes S.L.', 'B73347494', 389);
  if (m === 1) g(dia(22), 'Material de oficina', 'Papereria Central S.L.', 'B00000303', 42.3);
}

assert.equal(new Set(facturas.map((f) => f.id)).size, facturas.length, 'Ids de factura repetidos');
assert.ok(facturas.some((f) => !f.cobrada && mas(f.fecha, plazo) < hoy), 'Falta una factura vencida');
assert.ok(facturas.some((f) => !f.cobrada && mas(f.fecha, plazo) >= hoy), 'Falta una factura pendiente');

const porId = (xs) => Object.fromEntries(xs.map((x) => [x.id, x]));
await r.hset(`${P}facturas:${eid}`, porId(facturas));
await r.hset(`${P}gastos:${eid}`, porId(gastos));
for (const [col, docs] of [['facturas', facturas], ['gastos', gastos]]) await escribirIndices(r, P, eid, col, docs);
console.log(`${empresa.nombre}: ${facturas.length} facturas (${facturas.filter((f) => !f.cobrada).length} sin cobrar) y ${gastos.length} gastos`);

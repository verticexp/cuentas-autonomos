// Prueba de carga (informe de capacidad): siembra 1.000 empresas ficticias en una base LOCAL vacía.
// Distribución: muchas pequeñas, algunas con 5.000 facturas en un mes con dos tercios sin cobrar (el caso peor de la
// revisión) y dos grandes con 20.000 repartidas en varios años. Un usuario administrador y una sesión por empresa.
// Uso: KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x node tests/carga/sembrar.mjs [salida.json]
import { writeFileSync } from 'node:fs';
import '../apoyo/cargador.mjs';

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.KV_REST_API_URL || '')) throw new Error('Solo contra una base local');
const R = await import('../../lib/redis.js');
const A = await import('../../lib/auth.js');
const { redis, clave } = R;

const N = Number(process.env.EMPRESAS) || 1000;
export const CLAVE_PRUEBA = 'carga-local-solo-pruebas';
const MEDIANAS = Number(process.env.MEDIANAS) || 10, GRANDES = Number(process.env.GRANDES) || 2;
const actividades = [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 15 }];
const pad = (n) => String(n).padStart(2, '0');
const factura = (i, fecha, cobrada) => ({ id: `${fecha.slice(0, 4)}-${i}`, numero: i, anio: Number(fecha.slice(0, 4)), fecha, vence: new Date(Date.parse(`${fecha}T12:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10), actividad: 'servicios',
  cliente: { nombre: `Cliente ${i % 300}`, nif: `B${String(10000000 + (i % 300)).slice(0, 8)}` }, concepto: `Servicio profesional ${i}`,
  lineas: [{ concepto: `Servicio profesional ${i}`, cantidad: 1, precio: 100 + (i % 50), ivaPct: 21 }], base: 100 + (i % 50), ivaPct: 21, irpfPct: 15, cobrada,
  emisor: { nombre: 'Empresa de prueba', nif: 'B12345674' } });
const gasto = (i, fecha) => ({ id: `g${i}`, fecha, concepto: `Compra ${i}`, proveedor: `Proveedor ${i % 40}`, base: 20 + (i % 30), ivaPct: 21, actividad: 'servicios', pendiente: i % 5 === 0 });

async function lotes(u, col, docs) {
  for (let i = 0; i < docs.length; i += 500) await redis.hset(clave(u, col), Object.fromEntries(docs.slice(i, i + 500).map((d) => [d.id, d])));
}

const sesiones = [];
const inicio = Date.now();
for (let e = 0; e < N; e++) {
  const tipo = e < GRANDES ? 'grande' : e < GRANDES + MEDIANAS ? 'mediana' : 'pequena';
  // Las 200 primeras con contraseña de prueba (para el pico de 200 inicios de sesión); solo en esta base local.
  const { usuario } = await A.crearUsuario({ nombre: `Persona ${e}`, email: `carga${e}@ejemplo.test`, empresaNombre: `Empresa ${e}`, ...(e < 200 ? { password: CLAVE_PRUEBA } : {}) });
  const u = { ...usuario, empresa: usuario.id };
  await A.actualizarEmpresa(u.empresa, { pendiente: false, emisor: { nombre: `Empresa ${e}`, nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid', plazo: 30, iban: 'ES0000000000000000000000' }, actividades, fiscal: { tipo: 'autonomo' } });
  const nF = tipo === 'grande' ? 20000 : tipo === 'mediana' ? 5000 : 40;
  const fs = Array.from({ length: nF }, (_, i) => {
    if (tipo === 'mediana') return factura(i + 1, `2026-10-${pad(1 + (i % 28))}`, i % 3 === 0); // un mes grande, 2/3 sin cobrar
    const y = 2022 + (i % 5);
    return factura(i + 1, `${y}-${pad(1 + (i % 12))}-${pad(1 + (i % 28))}`, y < 2026 || i % 4 === 0);
  });
  // Numeración correlativa por año y su contador verificado, como si se hubieran emitido con la app.
  for (const [y, f] of Object.entries(Object.groupBy(fs, (f) => f.anio))) f.forEach((x, i) => { x.numero = i + 1; x.id = `${y}-${i + 1}`; });
  const porAnio = {};
  for (const f of fs) porAnio[`-|${f.anio}`] = Math.max(porAnio[`-|${f.anio}`] || 0, f.numero);
  await lotes(u, 'facturas', fs);
  await redis.hset(clave(u, 'numeracion'), { ...porAnio, _verificado: new Date().toISOString() });
  await lotes(u, 'gastos', Array.from({ length: tipo === 'pequena' ? 20 : 2000 }, (_, i) => gasto(i, `${2024 + (i % 3)}-${pad(1 + (i % 12))}-${pad(1 + (i % 28))}`)));
  sesiones.push({ empresa: u.empresa, tipo, email: e < 200 ? `carga${e}@ejemplo.test` : null, token: await A.crearSesion(u.id) });
  if (e % 100 === 0) console.log(`${e}/${N} empresas (${Math.round((Date.now() - inicio) / 1000)} s)`);
}
writeFileSync(process.argv[2] || 'sesiones-carga.json', JSON.stringify(sesiones));
console.log(`Sembradas ${N} empresas en ${Math.round((Date.now() - inicio) / 1000)} s`);
process.exit(0);

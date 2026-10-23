// Cuenta ficticia aislada: nunca conecta con Redis de producción ni envía mensajes.
// node --import ./tests/apoyo/cargador.mjs scripts/cuenta-simulada.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar } from '../tests/apoyo/upstash-mem.mjs';
import { plantillaDe } from '../lib/recurrentes.js';
import { claves } from '../lib/fichas.js';
import { borradorSociedades, modelo202 } from '../lib/modelos.js';
import { importes, siguienteNumero } from '../lib/calculos.js';
import { identificadorAcreedor } from '../lib/sepa.js';

const s = await arrancar({ puerto: Number(process.env.SIMULADA_PUERTO || 8089) });
process.env.KV_REST_API_URL = s.url;
process.env.KV_REST_API_TOKEN = 'simulada-local';
process.env.UPSTASH_REDIS_REST_URL = s.url;
process.env.UPSTASH_REDIS_REST_TOKEN = 'simulada-local';
const email = 'direccion@aurora-eventos.example';
const password = 'Aurora-Simulada-2026!';
const empresa = 'Aurora Producciones y Eventos S.L. (SIMULADA)';
try {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/demo.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DEMO_EMAIL: email, DEMO_PASSWORD: password, DEMO_EMPRESA: empresa },
  });
  console.log(stdout.trim());
  const { redis } = await import('../lib/redis.js');
  const id = await redis.hget('emails', email);
  const usuario = await redis.hget('usuarios', id);
  await redis.hset('usuarios', { [id]: { ...usuario, nombre: 'Clara Soler (ficticia)', emailVerificado: true } });
  let emp = await redis.hget('empresas', id);
  await redis.hset('empresas', { [id]: { ...emp, emisor: { ...emp.emisor, nif: 'B12345674', acreedorSepa: identificadorAcreedor('B12345674') }, fiscal: { ...emp.fiscal, intracom: true }, verifactu: null, marca: { color: '#176B65', logo: null } } });
  // Reconstruye los índices que el script histórico no crea: las pantallas paginadas los necesitan.
  const colecciones = ['facturas', 'gastos'];
  for (const col of colecciones) {
    const docs = await redis.hgetall(`${col}:${id}`);
    for (const [key, doc] of Object.entries(docs || {})) {
      if (col === 'gastos' && doc.concepto === 'Alquiler del almacén') Object.assign(doc, { alquiler: true, proveedor: 'Inmuebles Aurora (ficticia)', proveedorNif: 'B12345674' });
      if (col === 'gastos' && doc.concepto === 'Gestoría') Object.assign(doc, { irpfPct: 15, proveedor: 'Asesora Alba Roca (ficticia)', proveedorNif: '12345678Z' });
      await redis.hset(`${col}:${id}`, { [key]: doc });
    }
  }
  const facturas = Object.values(await redis.hgetall(`facturas:${id}`));
  const clientes = Object.values(await redis.hgetall(`clientes:${id}`));
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4));
  const actividad = emp.actividades[0].id;
  // Casos explícitos para auditar IVA mixto, cobro parcial, reembolso e intracomunitarias.
  const europeo = { id: 'AURORA-UE', nombre: 'Nordlicht Kultur GmbH (ficticia)', nif: 'DE123456789', direccion: 'Musterstrasse 10', ciudad: '10115 Berlin', email: 'produccion@nordlicht.example' };
  clientes.push(europeo);
  await redis.hset(`clientes:${id}`, { [europeo.id]: europeo });
  const emitir = async (datos, serie = '') => {
    const numero = siguienteNumero(facturas, anio, serie);
    const f = { id: `${serie}${anio}-${numero}`, numero, anio, serie, fecha: hoy, actividad, cliente: clientes[0], ivaPct: 21, irpfPct: 0, cobrada: false, ...datos };
    facturas.push(f); await redis.hset(`facturas:${id}`, { [f.id]: f }); return f;
  };
  const mixta = await emitir({ concepto: 'Producción y catering (IVA mixto)', base: 300, lineas: [{ concepto: 'Producción técnica', cantidad: 1, precio: 100, ivaPct: 21 }, { concepto: 'Catering', cantidad: 1, precio: 200, ivaPct: 10 }] });
  await emitir({ concepto: 'Evento con anticipo cobrado', base: 1000, pagos: [{ fecha: hoy, importe: 200, metodo: 'transferencia' }] });
  await emitir({ concepto: 'Reembolso pendiente de producción', base: -100, rectifica: { id: mixta.id, numero: String(mixta.numero), fecha: hoy } }, 'R');
  await emitir({ concepto: 'Producción para cliente de la UE', base: 700, ivaPct: 0, cliente: europeo, operacion: 'servicios-ue' });
  for (const g of [
    { id: 'sim-servicio-ue', proveedor: 'Software Kultur Ireland (ficticia)', proveedorNif: 'IE6388047V', concepto: 'Servicio digital UE', base: 120, origen: 'ue' },
    { id: 'sim-servicio-fuera', proveedor: 'Stage Software USA (ficticia)', proveedorNif: 'US123456789', concepto: 'Servicio digital fuera de la UE', base: 80, origen: 'fuera' },
  ]) await redis.hset(`gastos:${id}`, { [g.id]: { fecha: hoy, actividad, ivaPct: 0, ...g } });
  // Los empleados y sus nóminas (con su gasto) vienen ya de scripts/demo.mjs.
  for (let i = 0; i < 16; i++) {
    const fecha = `${anio}-10-${String(1 + i % 12).padStart(2, '0')}`;
    const p = { id: `P${anio}-${i + 1}`, numero: i + 1, anio, serie: 'P', fecha: fecha > hoy ? hoy : fecha, actividad, cliente: clientes[i % clientes.length], concepto: ['Congreso Aurora', 'Festival de otoño', 'Gala solidaria', 'Boda en el Mirador'][i % 4], base: 900 + i * 375, ivaPct: 21, irpfPct: 0, estado: i % 3 === 0 ? 'aceptado' : i % 3 === 1 ? 'rechazado' : 'pendiente', senalPct: 30, validez: 30, facturas: [], token: `simulada-presupuesto-${i + 1}` };
    await redis.hset(`presupuestos:${id}`, { [p.id]: p });
    await redis.hset('presupuesto-enlaces', { [p.token]: { empresa: id, id: p.id } });
  }
  for (const [i, f] of facturas.filter((f) => !f.caja && f.serie !== 'R').slice(-4).entries()) {
    const r = { id: `sim-recurrente-${i + 1}`, origen: f.id, plantilla: plantillaDe(f), dia: 5 + i * 5, enviar: false, activa: i !== 3, ultima: hoy.slice(0, 7), creada: `${hoy}T10:00:00Z` };
    await redis.hset(`recurrentes:${id}`, { [r.id]: r });
  }
  assert.equal(await redis.hlen('usuarios'), 1);
  for (const col of ['facturas', 'gastos', 'presupuestos']) {
    const k = claves(col, id);
    assert.equal(await redis.hlen(k.ixf), await redis.hlen(`${col}:${id}`), `Índice incompleto: ${col}`);
  }
  assert.equal(await redis.hlen(`empleados:${id}`), 5);
  // Saldo contable actualizado después de sustituir costes de personal.
  const { generarAsientos, mayor } = await import('../lib/asientos.js');
  const leer = async (col) => Object.values((await redis.hgetall(`${col}:${id}`)) || {});
  const gastosFinales = await leer('gastos');
  // El extracto generado antes de enriquecer las retenciones debe usar el neto transferido.
  for (const m of await leer('banco')) {
    const g = gastosFinales.find((g) => m.concepto === `RECIBO ${g.concepto.toUpperCase()}` && m.fecha === (g.pagado || g.fecha));
    if (g) await redis.hset(`banco:${id}`, { [m.id]: { ...m, importe: -importes(g).total } });
  }
  const cuotaIS = {}, pagos202 = {};
  const nominas = await leer('nominas');
  const productos = await leer('productos'), ajustes = await leer('stock'), albaranes = await leer('albaranes');
  for (let y = anio - 2; y < anio; y++) if (`${y + 1}-07-25` < hoy) cuotaIS[y] = borradorSociedades(facturas, gastosFinales, y, { productos, ajustes, albaranes }).cuota;
  for (let y = anio - 1; y <= anio; y++) for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha < hoy) (pagos202[y] ||= {})[x.p] = x.pago;
  emp = { ...(await redis.hget('empresas', id)), cuotaIS, pagos202 };
  await redis.hset('empresas', { [id]: emp });
  const saldo = mayor(generarAsientos({ facturas, gastos: gastosFinales, nominas, capital: await leer('capital'), manuales: await leer('asientos'), fiscal: emp.fiscal, pagos130: emp.pagos130, pagos202, cuotaIS, pres123: emp.pres123, productos, ajustes, albaranes }, hoy), '572', anio).final;
  await redis.set(`saldo:${id}`, { importe: saldo, fecha: hoy });
  const bancos = await redis.hgetall(`bancos:${id}`);
  for (const [key, banco] of Object.entries(bancos || {})) await redis.hset(`bancos:${id}`, { [key]: { ...banco, saldo, fechaSaldo: hoy } });
  const resumen = {};
  for (const col of ['facturas', 'gastos', 'clientes', 'productos', 'presupuestos', 'empleados', 'nominas', 'recurrentes', 'albaranes', 'pedidosProv', 'banco', 'remesas']) resumen[col] = await redis.hlen(`${col}:${id}`);
  const copia = process.env.SIMULADA_COPIA || join(tmpdir(), 'fisquo-cuenta-simulada.json');
  await writeFile(copia, JSON.stringify({ empresa, email, resumen, datos: [...s.base.db].map(([k, v]) => [k, { ...v, ...(v.m ? { m: [...v.m] } : {}) }]) }, null, 2));
  console.log(JSON.stringify({ empresa, email, password, redis: s.url, resumen }, null, 2));
  console.log(`Cuenta en memoria preparada. Copia local: ${copia}`);
  if (process.env.SIMULADA_SALIR === '1') await s.cerrar();
  else console.log('Mantén este proceso abierto para usar la cuenta.');
} catch (e) {
  await s.cerrar();
  throw e;
}

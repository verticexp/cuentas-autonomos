// Cuenta ficticia aislada: nunca conecta con Redis de producción ni envía mensajes.
// node --import ./tests/apoyo/cargador.mjs scripts/cuenta-simulada.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { arrancar } from '../tests/apoyo/upstash-mem.mjs';
import { gastoDeNomina, SS_EMPRESA, SS_TRABAJADOR } from '../lib/nominas.js';
import { plantillaDe } from '../lib/recurrentes.js';
import { claves } from '../lib/fichas.js';
import { borradorSociedades, modelo202 } from '../lib/modelos.js';

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
  await redis.hset('empresas', { [id]: { ...emp, verifactu: null, marca: { color: '#176B65', logo: null } } });
  // Reconstruye los índices que el script histórico no crea: las pantallas paginadas los necesitan.
  const colecciones = ['facturas', 'gastos'];
  for (const col of colecciones) {
    const docs = await redis.hgetall(`${col}:${id}`);
    for (const [key, doc] of Object.entries(docs || {})) await redis.hset(`${col}:${id}`, { [key]: doc });
  }
  const facturas = Object.values(await redis.hgetall(`facturas:${id}`));
  const clientes = Object.values(await redis.hgetall(`clientes:${id}`));
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = Number(hoy.slice(0, 4));
  const actividad = emp.actividades[0].id;
  // Sustituye los costes salariales agregados por nóminas individuales: evita duplicar gastos.
  const gastos = Object.values(await redis.hgetall(`gastos:${id}`));
  for (const g of gastos.filter((g) => g.concepto === 'Nóminas y Seguridad Social')) await redis.hdel(`gastos:${id}`, g.id);
  const empleados = [
    ['Clara Soler Vidal', 'Dirección de producción', 2600, 18],
    ['Hugo Serra Costa', 'Técnico de sonido', 2200, 15],
    ['Nora Vidal Roca', 'Iluminación y vídeo', 2100, 14],
    ['Leo Martí Font', 'Logística y almacén', 1900, 12],
  ];
  for (const [i, [nombre, puesto, bruto, irpfPct]] of empleados.entries()) {
    const e = { id: `sim-empleado-${i + 1}`, nombre, nif: '', puesto, bruto, irpfPct, ssTrabajadorPct: SS_TRABAJADOR, ssEmpresaPct: SS_EMPRESA, alta: `${anio - 2}-01-01`, baja: '', email: `equipo${i + 1}@aurora-eventos.example`, horasSemana: 40, precioHoraExtra: 22 };
    await redis.hset(`empleados:${id}`, { [e.id]: e });
    for (const g of gastos.filter((g) => g.concepto === 'Nóminas y Seguridad Social')) {
      const mes = g.fecha.slice(0, 7);
      const n = { ...e, id: `${e.id}-${mes}`, empleado: e.id, empleadoNombre: nombre, mes };
      await redis.hset(`nominas:${id}`, { [n.id]: n });
      const coste = gastoDeNomina(n, actividad);
      await redis.hset(`gastos:${id}`, { [coste.id]: coste });
    }
  }
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
  assert.equal(await redis.hlen(`empleados:${id}`), 4);
  // Saldo contable actualizado después de sustituir costes de personal.
  const { generarAsientos, mayor } = await import('../lib/asientos.js');
  const leer = async (col) => Object.values((await redis.hgetall(`${col}:${id}`)) || {});
  const gastosFinales = await leer('gastos');
  const cuotaIS = {}, pagos202 = {};
  for (let y = anio - 2; y < anio; y++) if (`${y + 1}-07-25` < hoy) cuotaIS[y] = borradorSociedades(facturas, gastosFinales, y).cuota;
  for (let y = anio - 1; y <= anio; y++) for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha < hoy) (pagos202[y] ||= {})[x.p] = x.pago;
  emp = { ...(await redis.hget('empresas', id)), cuotaIS, pagos202 };
  await redis.hset('empresas', { [id]: emp });
  const saldo = mayor(generarAsientos({ facturas, gastos: gastosFinales, manuales: await leer('asientos'), fiscal: emp.fiscal, pagos130: emp.pagos130, pagos202, cuotaIS, productos: await leer('productos'), ajustes: await leer('stock'), albaranes: await leer('albaranes') }, hoy), '572', anio).final;
  await redis.set(`saldo:${id}`, { importe: saldo, fecha: hoy });
  const bancos = await redis.hgetall(`bancos:${id}`);
  for (const [key, banco] of Object.entries(bancos || {})) await redis.hset(`bancos:${id}`, { [key]: { ...banco, saldo, fechaSaldo: hoy } });
  const resumen = {};
  for (const col of ['facturas', 'gastos', 'clientes', 'productos', 'presupuestos', 'empleados', 'nominas', 'recurrentes', 'albaranes', 'pedidosProv', 'banco', 'remesas']) resumen[col] = await redis.hlen(`${col}:${id}`);
  await writeFile('/private/tmp/netto-cuenta-simulada.json', JSON.stringify({ empresa, email, resumen, datos: [...s.base.db].map(([k, v]) => [k, { ...v, ...(v.m ? { m: [...v.m] } : {}) }]) }, null, 2));
  console.log(JSON.stringify({ empresa, email, password, redis: s.url, resumen }, null, 2));
  console.log('Cuenta en memoria preparada. Mantén este proceso abierto. Copia local: /private/tmp/netto-cuenta-simulada.json');
} catch (e) {
  await s.cerrar();
  throw e;
}

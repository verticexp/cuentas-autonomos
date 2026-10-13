// Migración de la entrega de integridad (auditoría de octubre de 2026). Para cada empresa:
//   1. Copia de seguridad de sus facturas y su numeración (archivo JSON local, con datos personales: guárdalo cifrado
//      y bórralo cuando ya no haga falta).
//   2. Contadores de numeración al día con lo ya emitido (y lo borrado): ningún número se vuelve a usar.
//   3. Instantánea del emisor, la marca y el vencimiento en las facturas que no la tienen (lib/facturas.js).
//   4. Comprobación de integridad (lib/integridad.js): números repetidos, cadena Verifactu, registros huérfanos.
// Uso:
//   KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/migrar-integridad.mjs            → simula (no escribe nada)
//   … node scripts/migrar-integridad.mjs --aplicar [--copia=archivo.json]               → copia y aplica
//   … node scripts/migrar-integridad.mjs --restaurar=archivo.json                       → vuelve a lo copiado
//   --empresa=<id> limita a una empresa. Es idempotente: se puede repetir.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined);
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const { redis, leer, clave } = await import('../lib/redis.js');
const { congelarInstantaneas } = await import('../lib/facturas.js');
const { comprobarIntegridad, contadoresDe } = await import('../lib/integridad.js');

const empresas = Object.values((await redis.hgetall('empresas')) || {}).filter((e) => !arg('empresa') || e.id === arg('empresa'));
const u = (e) => ({ ...e, empresa: e.id });

if (arg('restaurar')) {
  const copia = JSON.parse(readFileSync(arg('restaurar'), 'utf8'));
  for (const [id, d] of Object.entries(copia.empresas)) {
    if (arg('empresa') && id !== arg('empresa')) continue;
    const x = { empresa: id };
    // Vuelve cada factura copiada a su versión de antes; las emitidas después de la copia no se tocan.
    if (Object.keys(d.facturas).length) await redis.hset(clave(x, 'facturas'), d.facturas);
    await redis.del(clave(x, 'numeracion'));
    if (Object.keys(d.numeracion).length) await redis.hset(clave(x, 'numeracion'), d.numeracion);
    console.log(`${id}: restauradas ${Object.keys(d.facturas).length} facturas y la numeración`);
  }
  process.exit(0);
}

const aplicar = Boolean(arg('aplicar'));
const copia = { fecha: new Date().toISOString(), empresas: {} };
const informe = [];
for (const e of empresas) {
  const x = u(e);
  const [facturas, borradas, registros, numeracion, cabeza] = await Promise.all([leer(x, 'facturas'), leer(x, 'facturasBorradas'), leer(x, 'registros'), redis.hgetall(clave(x, 'numeracion')), redis.get(clave(x, 'verifactu'))]);
  const F = facturas || [];
  copia.empresas[e.id] = { facturas: Object.fromEntries(F.map((f) => [f.id, f])), numeracion: numeracion || {} };
  const cont = contadoresDe(F, borradas || []);
  const subir = Object.fromEntries(Object.entries(cont).filter(([k, n]) => n > Number((numeracion || {})[k] || 0)));
  const sinInstantanea = F.filter((f) => !f.emisor).length;
  const antes = comprobarIntegridad({ facturas: F, borradas: borradas || [], registros: registros || [], cabeza: cabeza || '', numeracion: numeracion || {} }).filter((i) => !['sin-instantanea', 'contador-atrasado'].includes(i.tipo));
  informe.push({ empresa: e.id, nombre: e.nombre, facturas: F.length, contadores: Object.keys(subir).length, sinInstantanea, incidencias: antes });
}

if (aplicar) {
  const archivo = typeof arg('copia') === 'string' ? arg('copia') : `copia-integridad-${copia.fecha.slice(0, 19).replace(/\D/g, '')}.json`;
  if (existsSync(archivo)) throw new Error(`${archivo} ya existe: elige otro nombre`);
  writeFileSync(archivo, JSON.stringify(copia), { mode: 0o600 });
  console.log(`Copia guardada en ${archivo} (con datos personales: protégela y bórrala cuando ya no haga falta)`);
  for (const e of empresas) {
    const x = u(e);
    const F = (await leer(x, 'facturas')) || [];
    const cont = contadoresDe(F, (await leer(x, 'facturasBorradas')) || []);
    const actual = (await redis.hgetall(clave(x, 'numeracion'))) || {};
    const subir = Object.fromEntries(Object.entries(cont).filter(([k, n]) => n > Number(actual[k] || 0)));
    if (Object.keys(subir).length) await redis.hset(clave(x, 'numeracion'), subir);
    await congelarInstantaneas(x);
  }
}

// Comprobación final (tras aplicar) o la de antes (al simular).
let problemas = 0;
for (const r of informe) {
  const x = u(empresas.find((e) => e.id === r.empresa));
  const despues = aplicar ? comprobarIntegridad({
    facturas: (await leer(x, 'facturas')) || [], borradas: (await leer(x, 'facturasBorradas')) || [], registros: (await leer(x, 'registros')) || [],
    cabeza: (await redis.get(clave(x, 'verifactu'))) || '', numeracion: (await redis.hgetall(clave(x, 'numeracion'))) || {},
  }) : r.incidencias;
  problemas += despues.length;
  console.log(`${r.empresa} · ${r.nombre || ''}: ${r.facturas} facturas · ${r.contadores} contadores ${aplicar ? 'puestos al día' : 'por poner al día'} · ${r.sinInstantanea} sin instantánea${aplicar ? ' (congeladas)' : ''}`);
  for (const i of despues) console.log(`   ⚠ ${i.tipo}: ${i.detalle}`);
}
console.log(aplicar ? `\nAplicado. Incidencias que revisar a mano: ${problemas}` : `\nSimulación: no se ha escrito nada. Incidencias previas: ${problemas}. Para aplicar: --aplicar`);
process.exit(problemas && aplicar ? 2 : 0);

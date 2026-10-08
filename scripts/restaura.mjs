// Restaura una copia de scripts/copia.mjs (copia.json) en la base de datos de KV_REST_API_URL / KV_REST_API_TOKEN.
// También sirve para pasar los datos a otra base de datos. Nunca sobrescribe: las claves que ya existen se saltan.
// Sin --escribir solo cuenta lo que haría.   Uso: node scripts/restaura.mjs copia.json [--escribir]
import { readFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';

const [archivo, modo] = process.argv.slice(2);
if (!archivo) throw new Error('Uso: node scripts/restaura.mjs copia.json [--escribir]');
const escribir = modo === '--escribir';
const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false });
const { fecha, datos } = JSON.parse(await readFile(archivo, 'utf8'));

const n = { nuevas: 0, existen: 0, caducadas: 0 };
for (const [k, { tipo, valor, caduca }] of Object.entries(datos)) {
  if (!k.startsWith('cuentas:')) throw new Error(`Clave fuera de «cuentas:» en la copia: ${k}`);
  const ms = caduca ? caduca - Date.now() : 0;
  if (caduca && ms <= 0) { n.caducadas += 1; continue; }
  if (await r.exists(k)) { n.existen += 1; continue; }
  n.nuevas += 1;
  if (!escribir) continue;
  // copia.mjs guarda los hash como lista plana [campo, valor, campo, valor…].
  if (tipo === 'hash') await r.hset(k, Array.isArray(valor) ? Object.fromEntries(valor.flatMap((v, i) => (i % 2 ? [] : [[v, valor[i + 1]]]))) : valor);
  else if (tipo === 'set') await r.sadd(k, ...valor);
  else if (tipo === 'list') await r.rpush(k, ...valor);
  else if (tipo === 'string') await r.set(k, valor);
  if (ms > 0) await r.pexpire(k, ms);
}
console.log(`Copia del ${fecha}: ${n.nuevas} claves ${escribir ? 'restauradas' : 'por restaurar (añade --escribir)'}, ${n.existen} ya existían (sin tocar), ${n.caducadas} caducadas.`);

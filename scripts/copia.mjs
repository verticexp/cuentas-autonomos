// Copia de seguridad de todas las claves «cuentas:» de Redis en copia.json (la ejecuta GitHub Actions cada noche).
// Se excluyen sesiones e intentos de login: son temporales y no hace falta restaurarlos.
import { writeFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';

const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false });
const FUERA = /^cuentas:(sesion|intentos)/;

const claves = [];
let cursor = '0';
do {
  const [c, ks] = await r.scan(cursor, { match: 'cuentas:*', count: 500 });
  cursor = String(c);
  claves.push(...ks.filter((k) => !FUERA.test(k)));
} while (cursor !== '0');

const datos = {};
for (const k of claves) {
  const tipo = await r.type(k);
  if (tipo === 'hash') datos[k] = { tipo, valor: await r.hgetall(k) };
  else if (tipo === 'set') datos[k] = { tipo, valor: await r.smembers(k) };
  else if (tipo === 'string') datos[k] = { tipo, valor: await r.get(k) };
}

if (!Object.keys(datos).some((k) => k.startsWith('cuentas:facturas:'))) throw new Error('La copia no tiene facturas: algo va mal');
await writeFile('copia.json', JSON.stringify({ fecha: new Date().toISOString(), datos }, null, 1));
console.log(`Copia hecha: ${Object.keys(datos).length} claves`);

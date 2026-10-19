// node scripts/copia.mjs [--sin-cifrar]
import { writeFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';
import { hacerCopia, cifrar, verificarCopia } from '../lib/copias.js';

try {
  const opciones = process.argv.slice(2);
  if (opciones.some((x) => x !== '--sin-cifrar')) throw new Error('Uso: node scripts/copia.mjs [--sin-cifrar]');
  const clave = process.env.COPIA_CLAVE;
  if (!clave && !opciones.includes('--sin-cifrar')) throw new Error('Falta COPIA_CLAVE (32 bytes en base64). Solo para una copia explícita en claro, usa --sin-cifrar.');
  const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false });
  const copia = await hacerCopia(r);
  // Las incidencias de los datos (no de la copia) no impiden guardarla: se apuntan en copia-incidencias.txt y el
  // workflow avisa con una issue aparte.
  const verificacion = verificarCopia(copia, { tolerarIncidencias: true });
  if (!verificacion.ok) throw new Error(`La copia no verifica:\n${verificacion.errores.join('\n')}`);
  const archivo = clave ? 'copia.json.enc' : 'copia.json';
  await writeFile(archivo, clave ? cifrar(copia, clave) : JSON.stringify(copia, null, 2), { mode: 0o600 });
  const { version, fecha, huella, resumen } = copia;
  await writeFile('copia-resumen.json', JSON.stringify({ version, fecha, huella, resumen }, null, 2), { mode: 0o600 });
  console.log(`Copia hecha: ${resumen.claves} claves en ${archivo}. Resumen en copia-resumen.json.`);
  for (const aviso of verificacion.avisos) console.warn(`Aviso: ${aviso}`);
  if (verificacion.incidencias.length) {
    await writeFile('copia-incidencias.txt', `${verificacion.incidencias.join('\n')}\n`, { mode: 0o600 });
    console.warn(`Copia guardada con ${verificacion.incidencias.length} incidencias en los datos (copia-incidencias.txt).`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}

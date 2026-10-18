import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';

const anteriores = { app: process.env.ENABLE_BANKING_APP_ID, key: process.env.ENABLE_BANKING_KEY };
process.env.ENABLE_BANKING_APP_ID = 'prueba-local';
process.env.ENABLE_BANKING_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
after(() => {
  for (const [k, v] of [['ENABLE_BANKING_APP_ID', anteriores.app], ['ENABLE_BANKING_KEY', anteriores.key]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  delete globalThis.__proveedorBancoPrueba;
});
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const proveedor = modulo('export const proveedorJSON = (...args) => globalThis.__proveedorBancoPrueba(...args);');
const fuente = (await readFile(new URL('../lib/enableBanking.js', import.meta.url), 'utf8')).replace("'./llamadas.js'", JSON.stringify(proveedor));
const { cerrarSesion, movimientos } = await import(modulo(fuente));

test('revocar conserva los errores transitorios y solo da por cerrada una sesión ya inexistente', async () => {
  globalThis.__proveedorBancoPrueba = async () => { throw Object.assign(new Error('Temporal'), { status: 503 }); };
  await assert.rejects(cerrarSesion('sesion-local'), /Temporal/);
  globalThis.__proveedorBancoPrueba = async () => { throw Object.assign(new Error('No existe'), { status: 404 }); };
  assert.equal(await cerrarSesion('sesion-local'), null);
});
test('la descarga no devuelve un histórico parcial si el banco aún tiene páginas pendientes', async () => {
  let llamadas = 0;
  globalThis.__proveedorBancoPrueba = async () => ({ d: { transactions: [{ status: 'BOOK', id: ++llamadas }], continuation_key: String(llamadas) } });
  await assert.rejects(movimientos('cuenta-local', '2026-01-01'), /historial completo/);
  assert.equal(llamadas, 20);
  llamadas = 0;
  globalThis.__proveedorBancoPrueba = async () => ({ d: { transactions: [{ status: 'BOOK', id: ++llamadas }, { status: 'PDNG' }], continuation_key: llamadas < 3 ? String(llamadas) : null } });
  assert.deepEqual((await movimientos('cuenta-local', '2026-01-01')).map((m) => m.id), [1, 2, 3]);
});

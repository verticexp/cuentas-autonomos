// Extractos de varias cuentas en CSV, Excel o PDF: antes iban todos a la cuenta «extracto», así que un movimiento idéntico
// en dos bancos se tomaba por repetido y el saldo de uno pisaba el del otro (auditoría general del 19-10-2026).
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { CUENTA_EXTRACTO, aCuenta, cuentaDeExtracto, ibanDe, leerTablaBanco } from '../lib/banco.js';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === '@/lib/api') return { url: 'data:text/javascript,' + encodeURIComponent('export const usuarioApi = async () => ({ u: globalThis.__usuarioExtracto }); export const error = (error, status = 400) => Response.json({ error }, { status });'), shortCircuit: true };
  if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.js', ${JSON.stringify(new URL('../', import.meta.url).href)}).href, c);
  return next(s, c);
}`), import.meta.url);

const CAIXA = 'ES91 2100 0418 4502 0005 1332';
const SANTANDER = 'ES79 2100 0813 6101 2345 6789';

test('el IBAN (o el número de cuenta de 20 cifras) se reconoce solo si sus dígitos de control cuadran', () => {
  assert.equal(ibanDe(`IBAN: ${CAIXA}`), 'ES9121000418450200051332');
  assert.equal(ibanDe('Nº de cuenta 2100-0418-45-0200051332'), 'ES9121000418450200051332');
  assert.equal(ibanDe('ES91 2100 0418 4502 0005 1333'), null);
  assert.equal(ibanDe('Saldo 12.345,67'), null);
  const r = leerTablaBanco([['Cuenta', SANTANDER], [], ['Fecha', 'Concepto', 'Importe', 'Saldo'], ['01/09/2026', 'Cuota', -10, '90,00']]);
  assert.equal(r.cuentas[0].iban, 'ES7921000813610123456789');
  assert.equal(leerTablaBanco([['Fecha', 'Concepto', 'Importe'], ['01/09/2026', 'Cuota', -10]]).cuentas[0].iban, null);
});

test('a qué cuenta va un extracto: la elegida, la del IBAN o, si hay dudas, se pregunta', () => {
  const vieja = { id: CUENTA_EXTRACTO, nombre: 'Extracto subido', origen: 'extracto' };
  const caixa = { id: 'ext-caixa', nombre: 'CaixaBank', origen: 'extracto', iban: 'ES9121000418450200051332' };
  const n43 = { id: 'n43-123', nombre: 'Sabadell', origen: 'extracto' };
  const enable = { id: 'eb', nombre: 'BBVA', origen: 'enable', iban: 'ES7921000813610123456789' };
  // Sin cuentas o con la de siempre: como hasta ahora (las de Norma 43 y las conectadas no cuentan).
  assert.equal(cuentaDeExtracto({ cuentas: [] }).id, CUENTA_EXTRACTO);
  assert.equal(cuentaDeExtracto({ cuentas: [vieja, n43, enable] }).id, CUENTA_EXTRACTO);
  // El IBAN manda: va a su cuenta; si no hay ninguna de extracto, se crea con id fijo (dos subidas, la misma cuenta).
  assert.equal(cuentaDeExtracto({ iban: caixa.iban, cuentas: [vieja, caixa] }).id, 'ext-caixa');
  const nueva = cuentaDeExtracto({ iban: 'ES7921000813610123456789', cuentas: [caixa] });
  assert.deepEqual([nueva.nombre, nueva.nueva, nueva.id], ['Cuenta •••• 6789', true, cuentaDeExtracto({ iban: 'ES7921000813610123456789', cuentas: [] }).id]);
  // Con IBAN nuevo y una cuenta sin IBAN, puede ser la misma o no: se pregunta, salvo que ya tenga estos movimientos.
  assert.equal(cuentaDeExtracto({ iban: 'ES7921000813610123456789', cuentas: [vieja] }).elegir, true);
  assert.deepEqual(cuentaDeExtracto({ iban: 'ES7921000813610123456789', cuentas: [vieja], solapan: new Set([CUENTA_EXTRACTO]) }), { id: CUENTA_EXTRACTO, nombre: 'Extracto subido', iban: 'ES7921000813610123456789' });
  // Sin IBAN y con dos cuentas posibles, también se pregunta.
  assert.equal(cuentaDeExtracto({ cuentas: [vieja, caixa] }).elegir, true);
  // Elegida a mano: se respeta, pero no si el IBAN del archivo es de otra.
  assert.equal(cuentaDeExtracto({ elegida: CUENTA_EXTRACTO, cuentas: [vieja, caixa] }).id, CUENTA_EXTRACTO);
  assert.match(cuentaDeExtracto({ elegida: 'ext-caixa', iban: 'ES7921000813610123456789', cuentas: [vieja, caixa] }).error, /•••• 6789/);
  assert.match(cuentaDeExtracto({ elegida: CUENTA_EXTRACTO, iban: caixa.iban, cuentas: [vieja, caixa] }).error, /CaixaBank/);
  assert.match(cuentaDeExtracto({ elegida: 'otra', cuentas: [vieja] }).error, /ya no está/);
  assert.match(cuentaDeExtracto({ elegida: 'eb', cuentas: [enable] }).error, /ya no está/);
  // Nueva: con nombre, sin repetir el de otra.
  assert.match(cuentaDeExtracto({ elegida: 'nueva', nombre: '  ', cuentas: [] }).error, /nombre/);
  assert.match(cuentaDeExtracto({ elegida: 'nueva', nombre: 'caixabank', cuentas: [caixa] }).error, /Ya tienes/);
  assert.equal(cuentaDeExtracto({ elegida: 'nueva', nombre: 'Sabadell empresa', cuentas: [vieja] }).nombre, 'Sabadell empresa');
});

test('los ids de los movimientos llevan la cuenta; la de siempre conserva los suyos', () => {
  const r = leerTablaBanco([['Fecha', 'Concepto', 'Importe'], ['01/09/2026', 'Café', -2], ['01/09/2026', 'Café', -2]]);
  assert.equal(aCuenta(r, CUENTA_EXTRACTO), r.movimientos);
  const otra = aCuenta(r, 'ext-x');
  assert.deepEqual(otra.map((m) => m.cuenta), ['ext-x', 'ext-x']);
  assert.equal(new Set(otra.map((m) => m.id)).size, 2);
  assert.ok(otra.every((m) => m.id.startsWith('ext-x-') && !r.movimientos.some((x) => x.id === m.id)));
});

// ---------- La ruta /api/banco/importar con el simulador de Upstash ----------
let srv, R, POST;
const entorno = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  R = await import('../lib/redis.js');
  POST = (await import('../app/api/banco/importar/route.js')).POST;
});
after(async () => {
  delete globalThis.__usuarioExtracto;
  if (srv) await srv.cerrar();
  for (const [k, v] of [['KV_REST_API_URL', entorno.url], ['KV_REST_API_TOKEN', entorno.token]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
let n = 0;
beforeEach(() => { n += 1; globalThis.__usuarioExtracto = { id: `uvc${n}`, empresa: `evc${n}`, rol: 'admin' }; });
const u = () => globalThis.__usuarioExtracto;

// El mismo cargo (fecha, importe y concepto) en dos bancos distintos, cada uno con su saldo.
const csv = (iban, saldo) => `${iban ? `IBAN;${iban}\n\n` : ''}Fecha;Concepto;Importe;Saldo\n02/09/2026;CUOTA AUTONOMOS;-294,00;${saldo}\n`;
async function subir(texto, campos = {}) {
  const form = new FormData();
  form.set('archivo', new Blob([texto]), 'extracto.csv');
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  const res = await POST(new Request('http://localhost/api/banco/importar', { method: 'POST', body: form }));
  return { status: res.status, ...(await res.json()) };
}
const movimientos = async () => (await R.leer(u(), 'banco')) || [];
const cuentas = async () => ((await R.leer(u(), 'bancos')) || []).sort((a, b) => a.saldo - b.saldo);

test('dos CSV de cuentas distintas con un movimiento idéntico: dos cuentas, dos movimientos y dos saldos', async () => {
  const a = await subir(csv(CAIXA, '1.000,00'));
  const b = await subir(csv(SANTANDER, '2.500,00'));
  assert.deepEqual([a.status, a.nuevos, b.status, b.nuevos, b.repetidos], [200, 1, 200, 1, 0]);
  assert.notEqual(a.cuenta.id, b.cuenta.id);
  const cs = await cuentas();
  assert.deepEqual(cs.map((c) => [c.saldo, c.iban, c.nombre]), [[1000, 'ES9121000418450200051332', 'Cuenta •••• 1332'], [2500, 'ES7921000813610123456789', 'Cuenta •••• 6789']]);
  const ms = await movimientos();
  assert.deepEqual(ms.map((m) => m.cuenta).sort(), cs.map((c) => c.id).sort());
  assert.equal(b.saldo.importe, 3500);
  assert.deepEqual(await R.redis.get(R.clave(u(), 'saldo')), b.saldo);
  // Volver a subirlos no duplica nada y cada uno sigue en su cuenta.
  const otra = await subir(csv(SANTANDER, '2.500,00'));
  const otraA = await subir(csv(CAIXA, '1.000,00'));
  assert.deepEqual([otra.nuevos, otra.repetidos, otra.cuenta.id, otraA.nuevos, otraA.cuenta.id], [0, 1, b.cuenta.id, 0, a.cuenta.id]);
  assert.equal((await movimientos()).length, 2);
  assert.equal((await cuentas()).length, 2);
});

test('sin IBAN: la cuenta de siempre, una nueva con nombre y, si hay dudas, se pide elegir', async () => {
  const a = await subir(csv(null, '1.000,00'));
  assert.deepEqual([a.status, a.cuenta.id], [200, CUENTA_EXTRACTO]);
  // Los movimientos de antes (cuenta «extracto») siguen teniendo el mismo id: volver a subir no duplica.
  assert.equal((await subir(csv(null, '1.000,00'))).repetidos, 1);
  const b = await subir(csv(null, '2.500,00'), { cuenta: 'nueva', nombre: 'Sabadell' });
  assert.deepEqual([b.status, b.nuevos, b.cuenta.nombre], [200, 1, 'Sabadell']);
  assert.deepEqual((await cuentas()).map((c) => [c.nombre, c.saldo]), [['Extracto subido', 1000], ['Sabadell', 2500]]);
  // Uno nuevo sin elegir cuenta: no se sabe de cuál es.
  const duda = await subir(csv(null, '900,00').replace('CUOTA AUTONOMOS', 'RECIBO LUZ'));
  assert.deepEqual([duda.status, duda.elegir], [409, true]);
  assert.equal((await movimientos()).length, 2);
  const luz = csv(null, '900,00').replace('CUOTA AUTONOMOS', 'RECIBO LUZ');
  const elegido = await subir(luz, { cuenta: b.cuenta.id });
  assert.deepEqual([elegido.status, elegido.nuevos, elegido.cuenta.id], [200, 1, b.cuenta.id]);
  assert.deepEqual((await cuentas()).map((c) => c.saldo), [900, 1000]);
  // Ya subido antes: se reconoce por sus movimientos (el de la cuota está en las dos, así que ese sí pregunta).
  assert.deepEqual([(await subir(luz)).cuenta?.id, (await subir(csv(null, '2.500,00'))).elegir, (await movimientos()).length], [b.cuenta.id, true, 3]);
  // Elegida a mano, el IBAN del archivo se queda en la cuenta; uno que es de otra cuenta se rechaza sin tocar nada.
  assert.equal((await subir(csv(CAIXA, '5,00'), { cuenta: b.cuenta.id })).status, 200);
  const mal = await subir(csv(CAIXA, '5,00').replace('CUOTA', 'OTRA CUOTA'), { cuenta: CUENTA_EXTRACTO });
  assert.equal(mal.status, 400);
  assert.match(mal.error, /Sabadell/);
  assert.equal((await movimientos()).length, 3);
});

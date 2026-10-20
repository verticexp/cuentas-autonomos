import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { conectarVisible } from '../lib/enableBanking.js';

const anteriores = Object.fromEntries(['ENABLE_BANKING_APP_ID', 'ENABLE_BANKING_KEY', 'BANCO_DIRECTO'].map((k) => [k, process.env[k]]));
after(() => { for (const [k, v] of Object.entries(anteriores)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

test('la conexión directa es solo para el administrador de Kontix, aunque haya una lista o comodín configurados', () => {
  process.env.ENABLE_BANKING_APP_ID = 'pruebas';
  process.env.ENABLE_BANKING_KEY = 'pruebas';
  for (const lista of ['*', 'cliente@example.test', '']) {
    process.env.BANCO_DIRECTO = lista;
    assert.equal(conectarVisible({ rol: 'admin', email: 'cliente@example.test' }), false);
    assert.equal(conectarVisible({ admin: true }), true);
  }
});

const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
let llamadas = 0;
let usuario = { id: 'cliente', rol: 'admin' };
let cuenta = null, borrados = 0, falloRevocacion = false;
globalThis.__bancoDirectoPrueba = { get usuario() { return usuario; }, get cuenta() { return cuenta; }, borrar() { borrados++; }, llamar() { llamadas++; }, revocar() { if (falloRevocacion) throw new Error('Temporal'); } };
after(() => { delete globalThis.__bancoDirectoPrueba; });
async function cargar(ruta) {
  const dobles = {
    api: `export const usuarioApi=async()=>({u:globalThis.__bancoDirectoPrueba.usuario}); export const error=(error,status=400)=>Response.json({error},{status}); export const cuerpo=(req)=>req.json();`,
    redis: `export const redis={get:async()=>{globalThis.__bancoDirectoPrueba.llamar();return[]},set:async()=>{}}; export const leer=async()=>[];export const leerUno=async()=>globalThis.__bancoDirectoPrueba.cuenta;export const borrar=async()=>globalThis.__bancoDirectoPrueba.borrar();`,
    enableBanking: `export const bancoListo=()=>true; export const bancoDirectoPermitido=(u)=>Boolean(u?.admin); export const cerrarSesion=async()=>globalThis.__bancoDirectoPrueba.revocar(); export const urlApp=()=>"http://localhost"; export const listaBancos=async()=>{globalThis.__bancoDirectoPrueba.llamar();return[]};export const iniciar=async()=>{globalThis.__bancoDirectoPrueba.llamar();return "http://localhost"};`,
    bancoServidor: `export const actualizarSaldo=async()=>{};export const sincronizar=async()=>{globalThis.__bancoDirectoPrueba.llamar();return{nuevos:0,auto:0}};`,
    limite: `export const MUCHOS="Límite";export const pasado=async()=>false;`,
    permisos: `export const puede=()=>true;`,
  };
  const fuente = (await readFile(new URL(`../app/api/banco/${ruta}/route.js`, import.meta.url), 'utf8'))
    .replace(/from (['"])@\/lib\/([^'"]+)\1/g, (_, _c, nombre) => `from ${JSON.stringify(modulo(dobles[nombre]))}`);
  return import(modulo(fuente));
}

test('GET y POST de conexión y POST de sincronización bloquean a administradores de empresa sin llamar al proveedor', async () => {
  usuario = { id: 'cliente', rol: 'admin' };
  llamadas = 0;
  const conectar = await cargar('conectar');
  const sincronizar = await cargar('sincronizar');
  for (const accion of [() => conectar.GET(), () => conectar.POST(new Request('http://localhost/api/banco/conectar', { method: 'POST', body: JSON.stringify({ banco: 'Prueba' }) })),
    () => sincronizar.POST(new Request('http://localhost/api/banco/sincronizar', { method: 'POST', body: '{}' }))]) {
    const r = await accion();
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /extracto/i);
  }
  assert.equal(llamadas, 0);
});

test('los clientes pueden quitar cuentas de extractos, pero no operar sobre una conexión directa existente', async () => {
  usuario = { id: 'cliente', rol: 'admin' };
  const ruta = await cargar('conectar');
  const req = { nextUrl: new URL('http://localhost/api/banco/conectar?id=c') };
  borrados = 0;
  cuenta = { id: 'c', origen: 'enable', sesion: 's' };
  assert.equal((await ruta.DELETE(req)).status, 403);
  assert.equal(borrados, 0);
  cuenta = { id: 'c', origen: 'archivo' };
  assert.equal((await ruta.DELETE(req)).status, 200);
  assert.equal(borrados, 1);
  cuenta = null;
});

test('el administrador de Kontix conserva el acceso a la conexión y sincronización', async () => {
  usuario = { id: 'propietario', rol: 'admin', admin: true };
  llamadas = 0;
  assert.equal((await (await cargar('conectar')).GET()).status, 200);
  assert.equal((await (await cargar('sincronizar')).POST(new Request('http://localhost/api/banco/sincronizar', { method: 'POST', body: '{}' }))).status, 200);
  assert.ok(llamadas >= 2);
});

test('si el proveedor no confirma la revocación, la cuenta se conserva para reintentar', async () => {
  usuario = { id: 'propietario', rol: 'admin', admin: true };
  cuenta = { id: 'c', origen: 'enable', sesion: 's' };
  borrados = 0;
  falloRevocacion = true;
  try {
    const r = await (await cargar('conectar')).DELETE({ nextUrl: new URL('http://localhost/api/banco/conectar?id=c') });
    assert.equal(r.status, 502);
    assert.equal(borrados, 0);
    assert.match((await r.json()).error, /conserva/);
  } finally { falloRevocacion = false; cuenta = null; }
});

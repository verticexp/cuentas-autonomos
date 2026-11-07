import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { arrancar } from './apoyo/upstash-mem.mjs';

// El entorno puede prohibir puertos (EPERM), o el puerto solicitado puede estar ocupado (EADDRINUSE).
// Simulamos solo el arranque del servidor: no sustituimos Redis ni damos por verificadas sus operaciones.
for (const code of ['EPERM', 'EADDRINUSE']) {
  test(`el simulador rechaza su arranque con ${code}, sin dejar las pruebas esperando`, { timeout: 1000 }, async (t) => {
    const error = Object.assign(new Error(`listen ${code}`), { code });
    const server = new EventEmitter();
    server.listen = () => {
      queueMicrotask(() => server.emit('error', error));
      return server;
    };
    t.mock.method(http, 'createServer', () => server);
    await assert.rejects(arrancar(), (e) => e === error);
    assert.equal(server.listenerCount('error'), 0);
  });
}

test('el simulador devuelve su puerto y permite cerrarlo cuando arranca correctamente', async (t) => {
  const server = new EventEmitter();
  let cerrado = false;
  server.listen = (puerto, host, listo) => {
    assert.equal(puerto, 0);
    assert.equal(host, '127.0.0.1');
    queueMicrotask(listo);
    return server;
  };
  server.address = () => ({ port: 12345 });
  server.close = (listo) => { cerrado = true; listo(); };
  t.mock.method(http, 'createServer', () => server);
  const srv = await arrancar();
  assert.equal(srv.url, 'http://127.0.0.1:12345');
  assert.equal(server.listenerCount('error'), 0);
  await srv.cerrar();
  assert.equal(cerrado, true);
});

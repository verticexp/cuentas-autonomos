import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase, SCRIPTS } from './apoyo/upstash-mem.mjs';

let srv, L, R;
const modoAnterior = process.env.LIMITES;
before(async () => {
  // Mismo intérprete Redis que el servidor HTTP, con transporte fetch para entornos sin puertos.
  const base = crearBase();
  srv = { base, url: 'http://redis-e07.test', ganchos: { antes: null }, cerrar: async () => {} };
  const original = globalThis.fetch;
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  globalThis.fetch = async (url, opciones) => {
    if (!String(url).startsWith(srv.url)) return original(url, opciones);
    await srv.ganchos.antes?.(opciones.body);
    const uno = (cmd) => {
      try { const result = base.run(cmd); return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(result) : result }; }
      catch (e) { return { error: e.message }; }
    };
    const j = JSON.parse(opciones.body);
    return Response.json(String(url).includes('/pipeline') || String(url).includes('/multi-exec') ? j.map(uno) : uno(j));
  };
  srv.cerrar = async () => { globalThis.fetch = original; };
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [L, R] = await Promise.all([import('../lib/limite.js'), import('../lib/redis.js')]);
});
beforeEach(() => { srv.base.run(['flushdb']); process.env.LIMITES = 'activo'; });
after(async () => {
  if (modoAnterior === undefined) delete process.env.LIMITES; else process.env.LIMITES = modoAnterior;
  delete globalThis.__limitesE07;
  await srv?.cerrar();
});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const diferido = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
async function ocupado(tipo, quien, max, fn, ttl = 1000) {
  const entra = diferido(), fin = diferido();
  const trabajo = L.concurrencia(tipo, quien, max, ttl, async () => { entra.resolve(); await fin.promise; return 'terminado'; });
  await entra.promise;
  try { return await fn(); } finally { fin.resolve(); assert.equal(await trabajo, 'terminado'); }
}

test('E07: pasado usa un único EVAL con caducidad, sin renovar la ventana', async () => {
  for (const nombre of ['CONTAR_VENTANA', 'TOMAR_PLAZA', 'DEJAR_PLAZA']) assert.equal(L[nombre], SCRIPTS[nombre]);
  const cmds = [];
  srv.ganchos.antes = async (body) => { const j = JSON.parse(body); cmds.push(...(Array.isArray(j[0]) ? j : [j])); };
  try {
    assert.equal(await L.pasado('prueba', 'u1', 1, 0.2), false);
    const ttl = srv.base.run(['pttl', 'cuentas:limite:prueba:u1']);
    assert.ok(ttl > 0 && ttl <= 200);
    await dormir(15);
    assert.equal(await L.pasado('prueba', 'u1', 1, 0.2), true);
    assert.ok(srv.base.run(['pttl', 'cuentas:limite:prueba:u1']) < ttl);
    assert.deepEqual(cmds.map((c) => c[0]), ['eval', 'eval']);
  } finally { srv.ganchos.antes = null; }
});

for (const modo of ['off', 'registrar', 'activo']) {
  test(`E07: ráfaga y concurrencia en modo ${modo}`, async () => {
    process.env.LIMITES = modo;
    assert.equal(await L.rafaga('foto', 'u1', 1, 60), false);
    assert.equal(await L.rafaga('foto', 'u1', 1, 60), modo === 'activo');
    assert.equal(await L.rafaga('foto', 'u2', 1, 60), false, 'otro usuario tiene su propia ventana');
    let ejecuciones = 0;
    await ocupado('trabajo', 'empresa', 1, async () => {
      const r = await L.concurrencia('trabajo', 'empresa', 1, 1000, async () => { ejecuciones++; return 'ok'; });
      assert.deepEqual(r, modo === 'activo' ? { ocupado: true } : 'ok');
      assert.equal(ejecuciones, modo === 'activo' ? 0 : 1);
    });
    assert.equal(await L.concurrencia('trabajo', 'empresa', 1, 1000, () => 'libre'), 'libre');
    assert.equal(srv.base.run(['get', 'cuentas:concurrencia:trabajo:empresa']), null);
    if (modo === 'off') assert.equal(srv.base.db.size, 0);
  });
}

test('E07: carreras, excepción y caducidad no dejan plazas ocupadas ni liberan generaciones nuevas', async () => {
  const fin = diferido();
  let entraron = 0;
  const trabajos = Array.from({ length: 12 }, () => L.concurrencia('carrera', 'e', 2, 1000, async () => { entraron++; await fin.promise; return 'ok'; }));
  while (entraron < 2) await dormir(2);
  await dormir(15);
  fin.resolve();
  const r = await Promise.all(trabajos);
  assert.equal(r.filter((x) => x === 'ok').length, 2);
  assert.equal(r.filter((x) => x.ocupado).length, 10);
  await assert.rejects(L.concurrencia('fallo', 'e', 1, 1000, () => { throw new Error('fallo'); }), /fallo/);
  assert.equal(await L.concurrencia('fallo', 'e', 1, 1000, () => 'ok'), 'ok');
  const entra = diferido(), finViejo = diferido();
  const viejo = L.concurrencia('ttl', 'e', 1, 20, async () => { entra.resolve(); await finViejo.promise; });
  await entra.promise;
  await dormir(30);
  await ocupado('ttl', 'e', 1, async () => {
    finViejo.resolve(); await viejo;
    assert.deepEqual(await L.concurrencia('ttl', 'e', 1, 1000, () => assert.fail('sin plaza')), { ocupado: true });
  });
});

test('E07: si falla la liberación, se conserva el resultado y la plaza caduca', async () => {
  const fetchAnterior = globalThis.fetch;
  globalThis.fetch = async (url, opciones) => {
    const j = JSON.parse(opciones.body); const comandos = Array.isArray(j[0]) ? j : [j];
    if (comandos.some((c) => c[0] === 'eval' && c[1] === L.DEJAR_PLAZA)) return Response.json(comandos.map(() => ({ error: 'corte simulado al liberar' })));
    return fetchAnterior(url, opciones);
  };
  try { assert.equal(await L.concurrencia('liberar', 'e', 1, 20, () => 'completado'), 'completado'); }
  finally { globalThis.fetch = fetchAnterior; }
  assert.ok(srv.base.run(['pttl', 'cuentas:concurrencia:liberar:e']) > 0);
  await dormir(30);
  assert.equal(await L.concurrencia('liberar', 'e', 1, 1000, () => 'libre'), 'libre');
});

test('E07: una adquisición tardía renueva el TTL de las plazas que siguen trabajando', async () => {
  // TTL inicial holgado (300 ms) para que la carga del build no lo agote antes de la segunda adquisición;
  // después se espera más que ese TTL para comprobar que la renovación mantuvo viva la primera plaza.
  await ocupado('renovar', 'e', 2, async () => {
    await dormir(5);
    await ocupado('renovar', 'e', 2, async () => {
      await dormir(350);
      assert.deepEqual(await L.concurrencia('renovar', 'e', 2, 1000, () => assert.fail('sin plaza')), { ocupado: true });
      assert.ok(srv.base.run(['pttl', 'cuentas:concurrencia:renovar:e']) > 500);
    });
  }, 300);
});

test('E07: 429 uniforme, con Retry-After y mensaje castellano', async () => {
  const r = L.respuesta429(3.2, 'Espera a que termine la importación.');
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '4');
  assert.deepEqual(await r.json(), { error: 'Espera a que termine la importación.' });
});

// Se ejecutan las rutas reales con autorización y proveedores simulados. Solo se leen las rutas autorizadas.
async function ruta(archivo) {
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '(@\/[^']+|next\/server)';/g, (_, nombres, origen) => {
    if (origen === '@/lib/limite') return `import {${nombres}} from '${new URL('../lib/limite.js', import.meta.url)}';`;
    if (origen === '@/lib/stripe') return `import {${nombres}} from '${new URL('../lib/stripe.js', import.meta.url)}';`;
    const mock = nombres.split(',').map((x) => x.trim()).map((x) => `export const ${x} = globalThis.__limitesE07.${x};`).join('\n');
    return `import {${nombres}} from 'data:text/javascript,${encodeURIComponent(mock)}';`;
  });
  return import(`data:text/javascript,${encodeURIComponent(fuente)}`);
}
function preparar() {
  globalThis.__limitesE07 = {
    u: { id: 'usuario1', empresa: 'empresa1', rol: 'admin' },
    usuarioApi: async () => ({ u: globalThis.__limitesE07.u }),
    error: (error, status = 400) => Response.json({ error }, { status }),
    cuerpo: (req) => req.json(), hoy: () => '2026-10-14',
    iaLista: () => true, limpiarHistorial: () => [], preguntar: async () => ({ respuesta: 'Hola' }), usarFuncion: async () => null,
    leerTicket: async () => ({ datos: {} }), limpiarTicket: () => ({}),
    validarEntradaIA: async () => ({ inputTokens: 1000 }),
    MAX_BYTES_IA: 3 * 1024 * 1024, paginasIA: async () => ({ paginas: 1 }),
    cupoEscaneos: async () => ({ limite: 10000, usadas: 0, restantes: 10000 }),
    consumirEscaneos: async () => ({ cupo: { limite: 10000, usadas: 1, restantes: 9999 } }),
    registrarConsumoIA: async () => {}, respuestaCupo: () => Response.json({ error: 'Sin cupo' }, { status: 429 }),
    puede: () => true, TIPOS: { clientes: { permiso: 'empresa' } },
    marcarPagada: async () => {},
    fiscalDe: () => ({}), usaIgic: () => false,
  };
}
const peticion = (b) => new Request('https://fisquo.test/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' }, body: JSON.stringify(b) });

test('E07: rutas de IA usan el id de usuario, mantienen cuotas y cortan por empresa y global', async () => {
  preparar();
  for (const [archivo, tipo, max, plazas, b, cuota, diario] of [
    ['app/api/asistente/route.js', 'asistente', 6, 2, { pregunta: 'Hola' }, 'asistente', 60],
    ['app/api/gastos/ticket/route.js', 'ticket', 10, 3, { imagen: 'data:image/png;base64,YQ==' }, 'tickets', 100],
  ]) {
    srv.base.run(['flushdb']);
    const api = await ruta(archivo);
    globalThis.__limitesE07.u.id = 'usuario1';
    for (let i = 0; i < max; i++) assert.equal((await api.POST(peticion(b))).status, 200);
    const limitado = await api.POST(peticion(b));
    assert.equal(limitado.status, 429); assert.equal(limitado.headers.get('retry-after'), '60');
    globalThis.__limitesE07.u.id = 'usuario2';
    assert.equal((await api.POST(peticion(b))).status, 200, 'misma IP, otro usuario');
    // Llenar semáforo sin agotar la ráfaga de ese usuario.
    const retener = async (n, fn) => n ? ocupado(tipo, 'empresa1', plazas, () => retener(n - 1, fn)) : fn();
    await retener(plazas, async () => assert.equal((await api.POST(peticion(b))).status, 429));
    await ocupado('ia', 'global', 20, async () => {
      // Las otras 19 plazas se adquieren atómicamente igual que peticiones independientes.
      const mas = async (n) => n ? ocupado('ia', 'global', 20, () => mas(n - 1)) : assert.equal((await api.POST(peticion(b))).status, 429);
      await mas(19);
    });
    srv.base.run(['set', `cuentas:${cuota}:usuario2:2026-10-14`, diario]);
    const diaria = await api.POST(peticion(b));
    assert.equal(diaria.status, 429); assert.equal(diaria.headers.get('retry-after'), '86400');
  }
});

test('E07: exportaciones e importaciones comparten una plaza por empresa', async () => {
  preparar();
  for (const [archivo, metodo, tipo] of [
    ['app/api/exportar/todo/route.js', 'GET', 'exportar'], ['app/api/paquete/route.js', 'GET', 'exportar'], ['app/api/libros/route.js', 'GET', 'exportar'],
    ['app/api/importar/route.js', 'POST', 'importar'], ['app/api/caja/importar/route.js', 'POST', 'importar'],
  ]) {
    const api = await ruta(archivo);
    await ocupado(tipo, 'empresa1', 1, async () => {
      const req = { formData: async () => new Map([['tipo', 'clientes']]) };
      const r = await api[metodo](req);
      assert.equal(r.status, 429, archivo); assert.equal(r.headers.get('retry-after'), '5');
    });
  }
});

test('E07: login reutiliza el bloqueo de entrar, con 429 y sin contar otra vez', async () => {
  preparar();
  let intentos = 0;
  globalThis.__limitesE07.entrar = async (_email, _password, ip) => { intentos++; assert.equal(ip, '1.2.3.4'); return { bloqueado: true }; };
  const api = await ruta('app/api/login/route.js');
  const r = await api.POST({ formData: async () => new Map([['email', 'a@b.test'], ['password', 'x']]), headers: new Headers({ 'x-real-ip': '1.2.3.4' }) });
  assert.equal(intentos, 1); assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '900');
  assert.equal(srv.base.db.size, 0);
});

test('E07: el webhook Stripe sigue procesando avisos sin llamar a límites', async () => {
  preparar();
  const { createHmac } = await import('node:crypto');
  const api = await ruta('app/api/stripe/route.js');
  process.env.STRIPE_WEBHOOK_SECRET = 'secreto-prueba';
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
  const t = Math.floor(Date.now() / 1000);
  const firma = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  const comandos = [];
  srv.ganchos.antes = async (body) => comandos.push(JSON.parse(body));
  try {
    for (let i = 0; i < 25; i++) {
      const r = await api.POST(new Request('https://fisquo.test/api/stripe', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${firma}` } }));
      assert.equal(r.status, 200);
    }
    assert.deepEqual(comandos, []);
  } finally { srv.ganchos.antes = null; }
});

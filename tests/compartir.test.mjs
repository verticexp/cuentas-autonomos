import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../app/manifest.js';
import { GET as sw } from '../app/sw/route.js';
import { GET, POST } from '../app/compartir/route.js';

test('el manifest admite archivos compartidos', () => {
  assert.deepEqual(manifest().share_target, {
    action: '/compartir', method: 'POST', enctype: 'multipart/form-data',
    params: { title: 'titulo', text: 'texto', files: [{ name: 'archivos', accept: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml', '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xml'] }] },
  });
});

test('el service worker recibe el POST y limita los archivos', async () => {
  const texto = await sw().text();
  assert.match(texto, /addEventListener\('fetch'/);
  assert.match(texto, /fisquo-compartido/);
  assert.match(texto, /slice\(0, 10\)/);
  assert.match(texto, /\/gastos\/bandeja/);
  assert.match(texto, /url.origin !== self.location.origin/);
  assert.match(texto, /5 \* 1024 \* 1024/);
});

for (const metodo of [GET, POST]) {
  test(`sin service worker ${metodo.name} redirige a la bandeja`, async () => {
    const respuesta = await metodo();
    assert.equal(respuesta.status, 303);
    assert.equal(respuesta.headers.get('Location'), '/gastos/bandeja?compartido=sinsw');
  });
}

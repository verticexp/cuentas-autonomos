import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORREOS, GRUPOS, componer, enviarCorreo } from '../lib/correos.js';

for (const [id, c] of Object.entries(CORREOS)) {
  test(`${id}: ficha completa y versiones válidas`, () => {
    assert.ok(GRUPOS.includes(c.grupo));
    for (const campo of ['nombre', 'cuando', 'para']) {
      assert.equal(typeof c[campo], 'string', campo);
      assert.ok(c[campo].trim(), campo);
    }
    assert.ok(c.ejemplo && typeof c.ejemplo === 'object');
    const { asunto, html, texto } = componer(id, c.ejemplo);
    assert.ok(asunto.trim() && asunto.length <= 200);
    assert.doesNotMatch(asunto, /[\r\n]/);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(texto.trim());
  });

  test(`${id}: cabecera y pie según la marca`, () => {
    const { html, texto } = componer(id, c.ejemplo);
    const cabecera = html.match(/<p style="margin:0 0 20px;font-size:22px[^>]*>(.*?)<\/p>/)?.[1];
    if (c.marca === 'empresa') {
      assert.equal(cabecera, c.ejemplo.empresa);
      assert.ok(!html.includes('corporate@nettohq.com'));
      assert.ok(!texto.includes('corporate@nettohq.com'));
      assert.ok(!html.includes('Si tienes cualquier duda, responde a este email'));
    } else {
      assert.equal(cabecera, 'Netto');
      if (!c.interno) {
        assert.match(html, /Si tienes cualquier duda, responde a este email o escríbenos a corporate@nettohq\.com/);
        assert.match(texto, /corporate@nettohq\.com/);
      }
    }
  });

  if (c.ejemplo.url || c.ejemplo.urlPago) {
    test(`${id}: botón y enlace alternativo en HTML y texto`, () => {
      const url = c.ejemplo.url || c.ejemplo.urlPago;
      const { html, texto } = componer(id, c.ejemplo);
      assert.equal(html.split(`href="${url}"`).length - 1, 2);
      assert.ok(texto.includes(url));
    });
  }
}

test('bienvenida: escapa el HTML de los datos', () => {
  const { html } = componer('bienvenida', { ...CORREOS.bienvenida.ejemplo, nombre: '<script>x</script>', empresa: 'A & "B"' });
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; &quot;B&quot;'));
});

test('factura: convierte enlaces libres y añade el píxel solo cuando se pide', () => {
  const datos = { ...CORREOS.factura.ejemplo, mensaje: 'Consulta https://ejemplo.es/factura para pagar.' };
  const sinPixel = componer('factura', datos);
  assert.match(sinPixel.html, /<a href="https:\/\/ejemplo\.es\/factura"[^>]*>https:\/\/ejemplo\.es\/factura<\/a>/);
  assert.ok(sinPixel.texto.includes('https://ejemplo.es/factura'));
  assert.doesNotMatch(sinPixel.html, /<img\b/);
  const pixel = 'https://ejemplo.es/abierta';
  const { html } = componer('factura', datos, { pixel });
  assert.ok(html.includes(`<img src="${pixel}" width="1" height="1"`));
});

test('avisos de prueba: distingue el fin del aviso previo de cobro', () => {
  const fin = componer('prueba-fin', CORREOS['prueba-fin'].ejemplo);
  const tres = componer('prueba-tres', CORREOS['prueba-tres'].ejemplo);
  for (const contenido of [fin.html, fin.texto]) {
    assert.ok(contenido.includes('No se ha borrado nada'));
    assert.doesNotMatch(contenido, /no se te cobra/i);
  }
  for (const contenido of [tres.html, tres.texto]) assert.ok(contenido.includes('no se te cobra nada'));
});

test('enviarCorreo: falta de configuración y cuerpo enviado a Resend', async () => {
  const antes = process.env.RESEND_API_KEY;
  const contactoAntes = process.env.CONTACTO_EMAIL;
  const fetchAntes = globalThis.fetch;
  try {
    delete process.env.RESEND_API_KEY;
    const sinClave = await enviarCorreo('bienvenida', { para: 'admin@ejemplo.es', datos: CORREOS.bienvenida.ejemplo });
    assert.match(sinClave.error, /RESEND_API_KEY/);

    process.env.RESEND_API_KEY = 'x';
    delete process.env.CONTACTO_EMAIL;
    const enviados = [];
    globalThis.fetch = async (_url, opciones) => {
      enviados.push(JSON.parse(opciones.body));
      return Response.json({ id: 'correo-prueba' });
    };
    for (const id of ['bienvenida', 'factura']) {
      const r = await enviarCorreo(id, { para: 'admin@ejemplo.es', datos: CORREOS[id].ejemplo });
      assert.deepEqual(r, { id: 'correo-prueba' });
      const cuerpo = enviados.at(-1);
      assert.equal(cuerpo.text, componer(id, CORREOS[id].ejemplo).texto);
      assert.deepEqual(cuerpo.tags, [{ name: 'correo', value: id }]);
      assert.deepEqual(cuerpo.to, ['admin@ejemplo.es']);
      if (id === 'bienvenida') assert.equal(cuerpo.reply_to, 'corporate@nettohq.com');
      else assert.ok(!Object.hasOwn(cuerpo, 'reply_to'));
    }
    assert.equal(enviados.length, 2);
  } finally {
    globalThis.fetch = fetchAntes;
    if (antes === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = antes;
    if (contactoAntes === undefined) delete process.env.CONTACTO_EMAIL;
    else process.env.CONTACTO_EMAIL = contactoAntes;
  }
});

test('componer: un id inexistente lanza', () => {
  assert.throws(() => componer('correo-inexistente'), /No existe el correo/);
});

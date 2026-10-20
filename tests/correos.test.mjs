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
    const cabecera = html.match(/<p class="c-tinta" style="margin:0;font-size:26px[^>]*>(.*?)<\/p>/)?.[1];
    const logo = /<td class="c-cab"[^>]*>\s*<a [^>]*><img src="[^"]*\/correo\/netto-icono\.png"[^>]*><span[^>]*>&nbsp;&nbsp;Fisquo<\/span>/.test(html);
    assert.doesNotMatch(html, /background:#0F1F1B/i, 'sin fondos oscuros: Gmail los aclara en modo oscuro');
    assert.match(html, /\/correo\/netto-icono\.png/, 'el icono de Fisquo va en el pie');
    if (c.marca === 'empresa') {
      assert.equal(cabecera, c.ejemplo.empresa);
      assert.ok(!logo, 'en nombre de la empresa no lleva la cabecera de Fisquo');
      assert.match(html, /Enviado con <strong[^>]*>Fisquo<\/strong>/);
      assert.ok(!html.includes('corporate@nettohq.com'));
      assert.ok(!texto.includes('corporate@nettohq.com'));
      assert.ok(!html.includes('Si tienes cualquier duda, responde a este email'));
    } else {
      assert.equal(cabecera, undefined);
      assert.ok(logo, 'cabecera con el logo de Fisquo');
      if (!c.interno) {
        assert.match(html, /Si tienes cualquier duda, responde a este email o escríbenos a corporate@nettohq\.com/);
        assert.match(texto, /corporate@nettohq\.com/);
      }
    }
  });

  if (c.ejemplo.url) {
    test(`${id}: botón y enlace alternativo en HTML y texto`, () => {
      const url = c.ejemplo.url;
      const { html, texto } = componer(id, c.ejemplo);
      // Botón + enlace en texto (la bienvenida enlaza además a la web desde el logo y el pie).
      assert.ok(html.split(`href="${url}"`).length - 1 >= 2);
      assert.ok(html.includes(`>${url}</a>`));
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
  assert.doesNotMatch(sinPixel.html, /width="1" height="1"/);
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

test('sin cobro con Stripe: ni la factura ni el recordatorio llevan botón de pago', () => {
  for (const id of ['factura', 'recordatorio-cobro']) {
    const { html, texto } = componer(id, CORREOS[id].ejemplo);
    assert.doesNotMatch(html + texto, /con tarjeta|\/pagar\//i);
  }
  assert.match(componer('recordatorio-cobro', CORREOS['recordatorio-cobro'].ejemplo).texto, /Bizum al 600 123 456/);
});

test('factura: botón al portal del cliente, sin el enlace de respaldo; sin portal, sin botón', () => {
  const { html, texto } = componer('factura', CORREOS.factura.ejemplo);
  const url = CORREOS.factura.ejemplo.urlPortal;
  assert.equal(html.split(`href="${url}"`).length - 1, 1);
  assert.match(html, />Ver mis facturas<\/a>/);
  assert.ok(!html.includes('Si el botón no funciona'));
  assert.ok(texto.includes(`Ver mis facturas: ${url}`));
  const sin = componer('factura', { ...CORREOS.factura.ejemplo, urlPortal: undefined });
  assert.ok(!sin.html.includes('Ver mis facturas') && !sin.html.includes('área de cliente'));
});

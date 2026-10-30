import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosFaq, datosPortada, jsonLd } from '../lib/webMeta.js';
import { PUBLICO } from '../lib/rutasPublicas.js';

test('portada: organización, sitio y producto con los precios de entrada', () => {
  const d = datosPortada({ web: 'https://x.test', autonomo: 9, pyme: 25 });
  assert.deepEqual(d['@graph'].map((n) => n['@type']), ['Organization', 'WebSite', 'SoftwareApplication']);
  assert.deepEqual(d['@graph'][2].offers.map((o) => o.price), [9, 25]);
});

test('FAQPage con una pregunta por fila y sin poder cerrar la etiqueta script', () => {
  const d = datosFaq([['¿A?', 'Sí </script>']]);
  assert.equal(d.mainEntity[0].acceptedAnswer.text, 'Sí </script>');
  assert.ok(!jsonLd(d).includes('</script>'));
});

test('llms.txt se ve sin sesión', () => {
  assert.ok(PUBLICO.test('/llms.txt'));
  assert.ok(!PUBLICO.test('/llms.txtx'));
});

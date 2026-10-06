import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asuntoInvitacion, enviarInvitacion, htmlInvitacion } from '../lib/invitacion.js';

const datos = { nombre: 'Laura', quien: 'Marc', empresa: 'SONORA EVENTOS', url: 'https://nettohq.com/invitacion/abc_123' };

test('asunto: quién invita y a qué empresa', () => {
  assert.equal(asuntoInvitacion(datos), 'Marc te ha invitado a SONORA EVENTOS en Netto');
  assert.equal(asuntoInvitacion({ quien: 'A\r\nBcc: x@y.z', empresa: 'E' }), 'A Bcc: x@y.z te ha invitado a E en Netto');
});

test('html: botón y enlace en texto, sin imagen de seguimiento', () => {
  const h = htmlInvitacion(datos);
  assert.equal(h.split(`href="${datos.url}"`).length - 1, 2);
  assert.ok(h.includes(`>${datos.url}</a>`));
  assert.ok(h.includes('Aceptar la invitación') && h.includes('<strong>Marc</strong>') && h.includes('<strong>SONORA EVENTOS</strong>'));
  assert.ok(!/<img/i.test(h) && !h.includes('/api/abierta'));
  assert.ok(h.includes('7 días'));
});

test('sin nombre de empresa: «te ha invitado a unirte a su empresa»', () => {
  assert.equal(asuntoInvitacion({ quien: 'Marc', empresa: '' }), 'Marc te ha invitado a unirte a su empresa en Netto');
  assert.equal(asuntoInvitacion({ quien: 'Marc', empresa: '  ' }), 'Marc te ha invitado a unirte a su empresa en Netto');
  assert.ok(htmlInvitacion({ ...datos, empresa: '' }).includes('<strong>Marc</strong> te ha invitado a unirte a su empresa en Netto.'));
});

test('html: escapa nombres y empresa', () => {
  const h = htmlInvitacion({ ...datos, quien: '<script>x</script>', empresa: 'A & "B"', nombre: "O'Brien" });
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;') && h.includes('A &amp; &quot;B&quot;') && h.includes('O&#39;Brien'));
});

test('sin RESEND_API_KEY: no lanza y devuelve el aviso', async () => {
  const antes = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const r = await enviarInvitacion({ ...datos, para: 'laura@test.es' });
  assert.ok(!r.enviado && /RESEND_API_KEY/.test(r.aviso));
  if (antes !== undefined) process.env.RESEND_API_KEY = antes;
});

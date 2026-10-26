// El registro de accesos se apunta para el cliente; en la ficha del cliente de Mi despacho se lee desde el despacho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accionParaDespacho } from '../components/despachoTextos.js';

test('el registro de accesos, contado desde el despacho', () => {
  assert.equal(accionParaDespacho('Entró en tus cuentas'), 'Entró en sus cuentas');
  assert.equal(accionParaDespacho('Dejó de llevar tus cuentas'), 'Dejó de llevar sus cuentas');
  assert.equal(accionParaDespacho('Te ha preguntado por un documento'), 'Le ha preguntado por un documento');
  assert.equal(accionParaDespacho('Te ha pedido un documento'), 'Le ha pedido un documento');
  assert.equal(accionParaDespacho('Te ha enviado el informe del trimestre'), 'Le ha enviado el informe del trimestre');
  assert.equal(accionParaDespacho('Incluyó Fisquo en su cuota'), 'Incluyó Fisquo en tu cuota');
  assert.equal(accionParaDespacho('Descargó el paquete del 3T 2026'), 'Descargó el paquete del 3T 2026');
  assert.equal(accionParaDespacho(undefined), '');
});

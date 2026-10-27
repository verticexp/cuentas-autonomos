// La factura de ejemplo de Ajustes › API (lib/apiEjemplo.js) tiene que poder crearse tal cual por la API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTURA_EJEMPLO } from '../lib/apiEjemplo.js';
import { limpiar } from '../lib/facturas.js';

test('el ejemplo de la guía de Zapier, Make o n8n pasa la validación de una factura', () => {
  const d = limpiar(structuredClone(FACTURA_EJEMPLO), [{ id: 'a', nombre: 'Actividad', serie: '', ivaPct: 21, irpfPct: 0 }], true);
  assert.equal(d.error, undefined, JSON.stringify(d.errores));
  assert.equal(d.cliente.nif, 'B12345674');
});

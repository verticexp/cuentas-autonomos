import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { limpiarDoc } from '../lib/albaranes.js';
import { plantillaDe } from '../lib/recurrentes.js';

test('albarán conserva el país ISO-2 del cliente para validar su NIF extranjero', () => {
  const doc = limpiarDoc({
    fecha: '2026-10-19',
    cliente: { nombre: 'Cliente US', nif: '123456789', pais: 'us' },
    lineas: [{ concepto: 'Servicio', cantidad: 1, precio: 100, ivaPct: 0 }],
  }, 'albaran');

  assert.equal(doc.cliente.pais, 'US');
});

test('albarán rechaza más de 100 líneas con contenido en vez de perderlas', () => {
  const doc = limpiarDoc({
    fecha: '2026-10-19',
    cliente: { nombre: 'Cliente' },
    lineas: Array.from({ length: 101 }, (_, i) => ({ concepto: `Línea ${i + 1}`, cantidad: 1, precio: 10, ivaPct: 21 })),
  }, 'albaran');

  assert.deepEqual(doc, { error: 'Como mucho 100 líneas por documento' });
});

test('plantilla recurrente conserva la operación fiscal de la factura', () => {
  const plantilla = plantillaDe({
    cliente: { nombre: 'Cliente' },
    lineas: [{ concepto: 'Servicio', cantidad: 1, precio: 100, ivaPct: 0 }],
    operacion: 'isp',
  });

  assert.equal(plantilla.operacion, 'isp');
});

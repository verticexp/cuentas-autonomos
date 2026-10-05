import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { abrirZip } from '../lib/hoja.js';
import { mensajeSeguro } from '../lib/mensajes.js';

// Zip mínimo con un archivo comprimido (deflate).
function zip(nombre, datos) {
  const comp = deflateRawSync(datos);
  const n = Buffer.from(nombre);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const inicioCentral = 30 + n.length + comp.length;
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(46 + n.length, 12); fin.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, n, comp, central, n, fin]);
}

test('un xlsx normal se descomprime', () => {
  const z = abrirZip(zip('a.xml', Buffer.from('<hola/>')));
  assert.equal(z['a.xml']().toString(), '<hola/>');
});

test('bomba zip: 100 MB de ceros comprimidos no se descomprimen enteros', () => {
  const z = abrirZip(zip('bomba.xml', Buffer.alloc(100 * 1024 * 1024)));
  assert.throws(() => z['bomba.xml']());
});

test('?error= solo enseña textos de la app', () => {
  assert.equal(mensajeSeguro('Ese email ya tiene cuenta'), 'Ese email ya tiene cuenta');
  assert.equal(mensajeSeguro('Tu cuenta está bloqueada: llama al 600 000 000'), 'Algo ha fallado. Vuelve a intentarlo.');
  assert.equal(mensajeSeguro(''), '');
});

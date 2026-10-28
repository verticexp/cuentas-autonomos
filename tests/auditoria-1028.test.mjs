// Auditoría 28-10-2026 con empresas ficticias y errores a propósito: lo que se aceptaba sin decir nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { validarFactura, validarNif, formatoIvaUE } from '../lib/validacion.js';
import { avisosFiscales } from '../lib/revisionFiscal.js';

test('NIF-IVA de la UE: se exige el formato de cada país, no solo el prefijo', () => {
  for (const nif of ['FR12', 'DE12345', 'IT123', 'PT12345678', 'NL123456789', 'ATU123', 'SE123456789012']) {
    assert.equal(validarNif(nif).ok, false, nif);
  }
  for (const nif of ['FR12345678901', 'FRXX123456789', 'DE123456789', 'IT12345678901', 'PT501964843', 'NL123456789B01', 'ATU12345678', 'IE6388047V', 'IE1234567T', 'BE0123456789', 'SE123456789001', 'XI123456789', 'EL123456789']) {
    assert.equal(validarNif(nif).ok, true, nif);
    assert.equal(formatoIvaUE(nif), true, nif);
  }
  // Con el país elegido, sin prefijo: se completa y se comprueba igual.
  assert.deepEqual(validarNif('12345678901', { pais: 'FR' }), { ok: true, tipo: 'ue', pais: 'FR', nif: 'FR12345678901' });
  assert.equal(validarNif('12', { pais: 'FR' }).ok, false);
  assert.match(validarNif('123', { pais: 'GR' }).error, /prefijo EL/);
  const f = { fecha: '2026-03-10', base: 100, ivaPct: 0, irpfPct: 0, operacion: 'servicios-ue', cliente: { nombre: 'SARL', nif: 'FR12', pais: 'FR' } };
  assert.equal(validarFactura(f).ok, false);
  assert.equal(validarFactura({ ...f, cliente: { ...f.cliente, nif: 'FR12345678901' } }).ok, true);
});

test('Factura con IVA español a una empresa de la UE: Impuestos lo avisa (sin bloquearla)', () => {
  const base = { actividad: 'a', irpfPct: 0, ivaPct: 21, anio: 2026, serie: '' };
  const conIva = { ...base, id: 'f1', numero: 1, fecha: '2026-03-01', base: 1000, cliente: { nombre: 'SARL Lyon', nif: 'FR12345678901', pais: 'FR' } };
  assert.equal(validarFactura(conIva).ok, true);
  const aviso = (facturas) => avisosFiscales({ facturas, anio: 2026, hoy: '2026-10-28' }).find((a) => a.id === 'ue-con-iva');
  assert.match(aviso([conIva]).texto, /IVA español/);
  assert.equal(aviso([conIva]).href, '/facturas/f1');
  // Sin IVA (lo correcto), a un particular de la UE, a un cliente español o por la ventanilla única: nada.
  assert.equal(aviso([{ ...conIva, ivaPct: 0, operacion: 'servicios-ue' }]), undefined);
  assert.equal(aviso([{ ...conIva, cliente: { nombre: 'Jean', pais: 'FR' } }]), undefined);
  assert.equal(aviso([{ ...conIva, cliente: { nombre: 'Ana', nif: '12345678Z' } }]), undefined);
  assert.equal(aviso([{ ...conIva, oss: { pais: 'FR' }, ivaPct: 20 }]), undefined);
  // Sin el 303 (actividad exenta, recargo de equivalencia…) no aplica.
  assert.equal(avisosFiscales({ facturas: [conIva], anio: 2026, hoy: '2026-10-28', c303: false }).some((a) => a.id === 'ue-con-iva'), false);
});

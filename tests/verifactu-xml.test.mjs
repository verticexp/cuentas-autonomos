// El XML de Verifactu, validado contra los esquemas oficiales de la AEAT (tests/verifactu, descargados de su sede).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registroAlta } from '../lib/verifactu.js';
import { destinatario, sobre, xmlAlta } from '../lib/verifactuXml.js';

const conXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const ESQ = new URL('./verifactu/', import.meta.url).pathname;

// Valida el cuerpo del sobre (RegFactuSistemaFacturacion) contra SuministroLR.xsd. Devuelve '' si es válido.
function validar(xml) {
  const d = mkdtempSync(join(tmpdir(), 'vf-'));
  for (const f of ['SuministroLR.xsd', 'xmldsig-stub.xsd']) copyFileSync(join(ESQ, f), join(d, f));
  writeFileSync(join(d, 'SuministroInformacion.xsd'), readFileSync(join(ESQ, 'SuministroInformacion.xsd'), 'utf8').replace('http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd', 'xmldsig-stub.xsd'));
  const ns = /<soapenv:Envelope ([^>]+)>/.exec(xml)[1].split(' ').filter((a) => a.startsWith('xmlns:sum')).join(' ');
  const cuerpo = /<sum:RegFactuSistemaFacturacion>[\s\S]*<\/sum:RegFactuSistemaFacturacion>/.exec(xml)[0].replace('<sum:RegFactuSistemaFacturacion>', `<sum:RegFactuSistemaFacturacion ${ns}>`);
  writeFileSync(join(d, 'r.xml'), cuerpo);
  try { execFileSync('xmllint', ['--noout', '--schema', join(d, 'SuministroLR.xsd'), join(d, 'r.xml')], { stdio: 'pipe' }); return ''; } catch (err) { return String(err.stderr); }
}

const sistema = { nombre: 'Empresa de Netto SL', nif: 'B12345674', version: '1.0', instalacion: 'emp1' };
const f1 = { id: 'f1', numero: 7, anio: 2026, fecha: '2026-10-02', base: 100, ivaPct: 21, irpfPct: 15, concepto: 'Diseño & web <logo>', cliente: { nombre: 'Cliente SL', nif: 'B87654321' } };
const f2 = { id: 'f2', numero: 1, anio: 2026, serie: 'R', fecha: '2026-10-03', base: -50, ivaPct: 0, concepto: 'Abono', cliente: { nombre: 'Studio Paris', nif: 'FR12345678901' }, rectifica: { id: 'f1', numero: '07-2026', fecha: '2026-10-02' } };
const f3 = { id: 'f3', numero: 8, anio: 2026, fecha: '2026-10-04', concepto: 'Varias', cliente: { nombre: 'Athens', nif: 'EL123456789' }, lineas: [{ concepto: 'A', cantidad: 1, precio: 100, ivaPct: 21 }, { concepto: 'B', cantidad: 2, precio: 10, ivaPct: 10 }], base: 120, ivaPct: 21 };

test('XML de alta de Verifactu válido según los esquemas de la AEAT (primero, encadenado y rectificativa)', { skip: !conXmllint && 'sin xmllint' }, () => {
  const r1 = registroAlta(f1, 'B11111111', '', '2026-10-02T10:00:00+02:00');
  const r2 = registroAlta(f2, 'B11111111', r1.Huella, '2026-10-03T10:00:00+02:00');
  const r3 = registroAlta(f3, 'B11111111', r2.Huella, '2026-10-04T10:00:00+02:00');
  const xml = sobre({ nombre: 'Mi Empresa SL', nif: 'B11111111' }, [
    xmlAlta(r1, { factura: f1, emisorNombre: 'Mi Empresa SL', anterior: null, sistema, fiscal: { iva: 'general' } }),
    xmlAlta(r2, { factura: f2, emisorNombre: 'Mi Empresa SL', anterior: r1, sistema, fiscal: { iva: 'general' } }),
    xmlAlta(r3, { factura: f3, emisorNombre: 'Mi Empresa SL', anterior: r2, sistema, fiscal: { iva: 'general' } }),
  ]);
  assert.equal(validar(xml), '');
  assert.ok(xml.includes('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>') && xml.includes(`<sum1:Huella>${r1.Huella}</sum1:Huella>`));
  assert.ok(xml.includes('Diseño &amp; web &lt;logo&gt;'));
  assert.ok(xml.includes('<sum1:TipoFactura>R4</sum1:TipoFactura><sum1:TipoRectificativa>I</sum1:TipoRectificativa>'));
  assert.ok(xml.includes('<sum1:CalificacionOperacion>N2</sum1:CalificacionOperacion>')); // cliente de la UE al 0 %
  assert.ok(xml.includes('<sum1:TipoImpositivo>10</sum1:TipoImpositivo><sum1:BaseImponibleOimporteNoSujeto>20.00</sum1:BaseImponibleOimporteNoSujeto><sum1:CuotaRepercutida>2.00</sum1:CuotaRepercutida>'));
  // Los importes del XML son los mismos que entran en la huella.
  assert.ok(xml.includes(`<sum1:CuotaTotal>${r1.CuotaTotal}</sum1:CuotaTotal><sum1:ImporteTotal>${r1.ImporteTotal}</sum1:ImporteTotal>`));
  // Uno roto no pasa: la validación de verdad funciona.
  assert.notEqual(validar(xml.replace('<sum1:TipoFactura>F1</sum1:TipoFactura>', '<sum1:TipoFactura>F9</sum1:TipoFactura>')), '');
});

test('destinatario: NIF español, NIF-IVA de la UE (con el país) y de fuera', () => {
  assert.ok(destinatario({ nombre: 'A', nif: 'b-87654321' }).includes('<sum1:NIF>B87654321</sum1:NIF>'));
  assert.ok(destinatario({ nombre: 'G', nif: 'EL123456789' }).includes('<sum1:CodigoPais>GR</sum1:CodigoPais><sum1:IDType>02</sum1:IDType><sum1:ID>EL123456789</sum1:ID>'));
  assert.ok(destinatario({ nombre: 'US', nif: '12-3456789' }).includes('<sum1:IDType>04</sum1:IDType>'));
  assert.equal(destinatario({ nombre: 'Sin NIF' }), null);
});

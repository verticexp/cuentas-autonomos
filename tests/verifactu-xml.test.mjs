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

const sistema = { nombre: 'Empresa de Fisquo SL', nif: 'B12345674', version: '1.0', instalacion: 'emp1' };
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
  assert.ok(xml.includes('<sum1:NombreSistemaInformatico>Fisquo</sum1:NombreSistemaInformatico>'));
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

test('respuesta de la AEAT: estado del envío, espera, CSV y cada registro; o el error SOAP', async () => {
  const { leerRespuesta } = await import('../lib/verifactuEnvio.js');
  const ok = '<env:Envelope><env:Body><tikR:RespuestaRegFactuSistemaFacturacion><tikR:CSV>A-123</tikR:CSV><tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>'
    + '<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>B1</tik:IDEmisorFactura><tik:NumSerieFactura>01-2026</tik:NumSerieFactura></tikR:IDFactura><tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro></tikR:RespuestaLinea>'
    + '<tikR:RespuestaLinea><tikR:IDFactura><tik:NumSerieFactura>02-2026</tik:NumSerieFactura></tikR:IDFactura><tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Duplicado</tikR:DescripcionErrorRegistro></tikR:RespuestaLinea>'
    + '</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>';
  assert.deepEqual(leerRespuesta(ok), { estadoEnvio: 'ParcialmenteCorrecto', espera: 60, csv: 'A-123', lineas: [
    { numSerie: '01-2026', operacion: 'Alta', estado: 'Correcto', codigo: '', descripcion: '' }, { numSerie: '02-2026', operacion: 'Alta', estado: 'Incorrecto', codigo: '3000', descripcion: 'Duplicado' }] });
  assert.deepEqual(leerRespuesta('<env:Envelope><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].No cumple el esquema</faultstring></env:Fault></env:Body></env:Envelope>'), { fault: 'Codigo[4102].No cumple el esquema' });
});

test('subsanación, anulación y lo que viene detrás: válidos según los esquemas de la AEAT; R1 por motivo', { skip: !conXmllint && 'sin xmllint' }, async () => {
  const { registroAnulacion, tipoFactura } = await import('../lib/verifactu.js');
  const { xmlAnulacion } = await import('../lib/verifactuXml.js');
  const r1 = registroAlta(f1, 'B11111111', '', '2026-10-02T10:00:00+02:00');
  // Subsanación de un registro rechazado (RechazoPrevio X) y de uno aceptado con errores (N).
  const s1 = registroAlta(f1, 'B11111111', r1.Huella, '2026-10-02T11:00:00+02:00', { subsanacion: true, rechazoPrevio: 'X' });
  const s2 = registroAlta(f3, 'B11111111', s1.Huella, '2026-10-02T12:00:00+02:00', { subsanacion: true });
  const an = registroAnulacion(f3, 'B11111111', s2.Huella, '2026-10-02T13:00:00+02:00');
  // Un alta detrás de una anulación encadena con los datos de la factura anulada.
  const r2 = registroAlta({ ...f2, rectifica: { ...f2.rectifica, motivo: 'error' } }, 'B11111111', an.Huella, '2026-10-03T10:00:00+02:00');
  const op = { emisorNombre: 'Mi Empresa SL', sistema, fiscal: { iva: 'general' } };
  const xml = sobre({ nombre: 'Mi Empresa SL', nif: 'B11111111' }, [
    xmlAlta(r1, { ...op, factura: f1, anterior: null }),
    xmlAlta(s1, { ...op, factura: f1, anterior: r1 }),
    xmlAlta(s2, { ...op, factura: f3, anterior: s1 }),
    xmlAnulacion(an, { anterior: s2, sistema }),
    xmlAlta(r2, { ...op, factura: { ...f2, rectifica: { ...f2.rectifica, motivo: 'error' } }, anterior: an }),
  ]);
  assert.equal(validar(xml), '');
  assert.ok(xml.includes('<sum1:NombreSistemaInformatico>Fisquo</sum1:NombreSistemaInformatico>'));
  assert.ok(xml.includes('<sum1:Subsanacion>S</sum1:Subsanacion><sum1:RechazoPrevio>X</sum1:RechazoPrevio>'));
  assert.ok(xml.includes('<sum1:Subsanacion>S</sum1:Subsanacion><sum1:RechazoPrevio>N</sum1:RechazoPrevio>'));
  assert.ok(xml.includes(`<sum1:NumSerieFacturaAnulada>${an.NumSerieFacturaAnulada}</sum1:NumSerieFacturaAnulada>`));
  assert.ok(xml.includes(`<sum1:RegistroAnterior><sum1:IDEmisorFactura>B11111111</sum1:IDEmisorFactura><sum1:NumSerieFactura>${an.NumSerieFacturaAnulada}</sum1:NumSerieFactura>`));
  assert.ok(xml.includes('<sum1:TipoFactura>R1</sum1:TipoFactura>'));
  // La huella de la subsanación no incluye los campos de subsanación; la de la anulación, los de la factura anulada.
  assert.equal(s1.Huella, registroAlta(f1, 'B11111111', r1.Huella, '2026-10-02T11:00:00+02:00').Huella);
  assert.equal(tipoFactura({ serie: 'R', rectifica: {} }), 'R4');
  assert.equal(tipoFactura({ serie: 'R', rectifica: { motivo: 'incobrable' } }), 'R3');
});

test('operaciones sin IVA (E2, E5, N2, S2): válidas según los esquemas de la AEAT', { skip: !conXmllint && 'sin xmllint' }, () => {
  const base = { numero: 9, anio: 2026, fecha: '2026-10-05', base: 100, ivaPct: 0, irpfPct: 0, concepto: 'X' };
  const casos = [
    { ...base, id: 'a', cliente: { nombre: 'Kunde', nif: 'DE123456789' }, operacion: 'intracomunitaria' },
    { ...base, id: 'b', numero: 10, cliente: { nombre: 'Client', nif: '12-3456789' }, operacion: 'exportacion' },
    { ...base, id: 'c', numero: 11, cliente: { nombre: 'Kunde', nif: 'DE123456789' } },
    { ...base, id: 'd', numero: 12, cliente: { nombre: 'Obras SL', nif: 'B87654323' }, operacion: 'isp' },
  ];
  let anterior = null;
  const xmls = casos.map((f, i) => {
    const r = registroAlta(f, 'B11111111', anterior?.Huella || '', `2026-10-05T1${i}:00:00+02:00`);
    const x = xmlAlta(r, { factura: f, emisorNombre: 'Mi Empresa SL', anterior, sistema, fiscal: { iva: 'general' } });
    anterior = r;
    return x;
  });
  assert.equal(validar(sobre({ nombre: 'Mi Empresa SL', nif: 'B11111111' }, xmls)), '');
});

test('recargo de equivalencia (TipoRecargoEquivalencia y CuotaRecargoEquivalencia): válido según los esquemas de la AEAT', { skip: !conXmllint && 'sin xmllint' }, () => {
  const f = { ...f3, id: 'f4', numero: 13, recargo: true, cliente: { nombre: 'Ultramarinos Pepa', nif: '12345678Z' } };
  const r = registroAlta(f, 'B11111111', '', '2026-10-06T10:00:00+02:00');
  const xml = sobre({ nombre: 'Mi Empresa SL', nif: 'B11111111' }, [xmlAlta(r, { factura: f, emisorNombre: 'Mi Empresa SL', anterior: null, sistema, fiscal: { iva: 'general' } })]);
  assert.match(xml, /<sum1:TipoRecargoEquivalencia>5.2<\/sum1:TipoRecargoEquivalencia><sum1:CuotaRecargoEquivalencia>5.20<\/sum1:CuotaRecargoEquivalencia>/);
  assert.equal(validar(xml), '');
  assert.ok(xml.includes('<sum1:NombreSistemaInformatico>Fisquo</sum1:NombreSistemaInformatico>'));
});


test('el certificado necesita FISQUO_RAZON y FISQUO_NIF', async () => {
  const { certificadoListo } = await import('../lib/verifactuEnvio.js');
  const claves = ['VERIFACTU_P12', 'VERIFACTU_P12_CLAVE', 'FISQUO_RAZON', 'FISQUO_NIF'];
  const antes = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  try {
    for (const k of claves) delete process.env[k];
    process.env.VERIFACTU_P12 = 'certificado-de-prueba';
    process.env.VERIFACTU_P12_CLAVE = 'clave-de-prueba';
    assert.equal(certificadoListo(), false);
    process.env.FISQUO_RAZON = 'Productor actual';
    assert.equal(certificadoListo(), false);
    process.env.FISQUO_NIF = 'B87654321';
    assert.equal(certificadoListo(), true);
  } finally {
    for (const k of claves) {
      if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k];
    }
  }
});

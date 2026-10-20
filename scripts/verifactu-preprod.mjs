// Prueba de Verifactu contra el entorno de preproducción de la AEAT (prewww1.aeat.es), sin la app ni la base de datos:
// genera una cadena de registros de ejemplo con los mismos módulos que usa Fisquo (lib/verifactu.js y lib/verifactuXml.js),
// la envía con el certificado de pruebas y enseña lo que contesta la AEAT para cada registro.
//
//   VERIFACTU_P12_FICHERO=certificado.p12 VERIFACTU_P12_CLAVE=… FISQUO_RAZON='…' FISQUO_NIF=… \
//   OBLIGADO_NIF=… OBLIGADO_NOMBRE='…' node scripts/verifactu-preprod.mjs [--solo-xml]
//
// OBLIGADO_*: el emisor de las facturas de prueba (en preproducción, el titular del certificado o alguien que le haya
// apoderado). VERIFACTU_P12 (base64) vale en lugar de VERIFACTU_P12_FICHERO. VERIFACTU_SELLO=1 con certificado de sello.
// --solo-xml: no envía nada; escribe el sobre SOAP para revisarlo o validarlo contra los esquemas.
// Nunca apunta a la AEAT de verdad: la dirección es siempre la de preproducción.
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { registroAlta, registroAnulacion, horaMadrid } from '../lib/verifactu.js';
import { sobre, xmlAlta, xmlAnulacion } from '../lib/verifactuXml.js';

const RUTA = '/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
const URL_PRE = `https://${process.env.VERIFACTU_SELLO ? 'prewww10.aeat.es' : 'prewww1.aeat.es'}${RUTA}`;
const soloXml = process.argv.includes('--solo-xml');

const razon = process.env.FISQUO_RAZON;
const nifProductor = process.env.FISQUO_NIF;
const falta = ['OBLIGADO_NIF', 'OBLIGADO_NOMBRE', ...(soloXml ? [] : ['VERIFACTU_P12_CLAVE'])].filter((k) => !process.env[k]);
if (!razon) falta.push('FISQUO_RAZON');
if (!nifProductor) falta.push('FISQUO_NIF');
if (!soloXml && !process.env.VERIFACTU_P12 && !process.env.VERIFACTU_P12_FICHERO) falta.push('VERIFACTU_P12_FICHERO');
if (falta.length) { console.error(`Faltan variables: ${falta.join(', ')}`); process.exit(1); }

const nif = process.env.OBLIGADO_NIF.toUpperCase();
const sistema = { nombre: razon, nif: nifProductor, version: '1.0', instalacion: 'preprod' };
const hoy = horaMadrid().slice(0, 10);
const serie = `PRUEBA${Date.now().toString(36).toUpperCase()}`;
const cliente = { nombre: 'Cliente de pruebas SL', nif: 'B12345674' };

// Cuatro casos: factura normal, varias líneas con recargo de equivalencia, rectificativa y una anulación.
const facturas = [
  { id: '1', fecha: hoy, importada: `${serie}-1`, cliente, base: 100, ivaPct: 21, irpfPct: 0 },
  { id: '2', fecha: hoy, importada: `${serie}-2`, cliente, recargo: true, base: 110, ivaPct: 21, irpfPct: 0,
    lineas: [{ concepto: 'A', cantidad: 1, precio: 100, dto: 0, ivaPct: 21 }, { concepto: 'B', cantidad: 1, precio: 10, dto: 0, ivaPct: 10 }] },
  { id: '3', fecha: hoy, importada: `${serie}-R1`, serie: 'R', cliente, base: -20, ivaPct: 21, irpfPct: 0,
    rectifica: { numero: `${serie}-1`, fecha: hoy, motivo: 'error' } },
];
const registros = [];
let anterior = null;
for (const f of facturas) {
  const r = registroAlta(f, nif, anterior?.Huella || '');
  registros.push(xmlAlta(r, { factura: f, emisorNombre: process.env.OBLIGADO_NOMBRE, anterior, sistema, fiscal: { iva: 'general' } }));
  anterior = r;
}
const anulada = facturas[1];
const ra = registroAnulacion(anulada, nif, anterior.Huella);
registros.push(xmlAnulacion(ra, { anterior, sistema }));

const xml = sobre({ nombre: process.env.OBLIGADO_NOMBRE, nif }, registros);
if (soloXml) { process.stdout.write(`${xml}\n`); process.exit(0); }

const pfx = process.env.VERIFACTU_P12 ? Buffer.from(process.env.VERIFACTU_P12, 'base64') : readFileSync(process.env.VERIFACTU_P12_FICHERO);
const respuesta = await new Promise((ok, mal) => {
  const req = https.request(URL_PRE, { method: 'POST', timeout: 30000, pfx, passphrase: process.env.VERIFACTU_P12_CLAVE,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'Content-Length': Buffer.byteLength(xml) } }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode, cuerpo: b }));
  });
  req.on('timeout', () => req.destroy(new Error('La AEAT no ha contestado a tiempo')));
  req.on('error', mal);
  req.end(xml);
});

const v = (x, tag) => new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`).exec(x)?.[1];
console.log(`HTTP ${respuesta.status} · ${URL_PRE}`);
if (/Fault>/.test(respuesta.cuerpo)) { console.log(`Error SOAP: ${v(respuesta.cuerpo, 'faultstring')}`); process.exit(2); }
console.log(`Envío: ${v(respuesta.cuerpo, 'EstadoEnvio') || '?'} · CSV ${v(respuesta.cuerpo, 'CSV') || '—'} · esperar ${v(respuesta.cuerpo, 'TiempoEsperaEnvio') || '?'} s`);
const lineas = [...respuesta.cuerpo.matchAll(/<(?:\w+:)?RespuestaLinea>([\s\S]*?)<\/(?:\w+:)?RespuestaLinea>/g)].map(([, l]) => l);
for (const l of lineas) console.log(`  ${v(l, 'NumSerieFactura')} · ${v(l, 'TipoOperacion') || 'Alta'} · ${v(l, 'EstadoRegistro')}${v(l, 'CodigoErrorRegistro') ? ` · ${v(l, 'CodigoErrorRegistro')} ${v(l, 'DescripcionErrorRegistro')}` : ''}`);
process.exit(lineas.length && lineas.every((l) => v(l, 'EstadoRegistro') === 'Correcto') ? 0 : 3);

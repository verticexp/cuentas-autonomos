import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { comprobarNif } from '../lib/censoAeat.js';

const variables = ['VERIFACTU_P12', 'VERIFACTU_P12_CLAVE', 'CENSO_URL'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
afterEach(() => {
  mock.restoreAll();
  for (const k of variables) if (entorno[k] === undefined) delete process.env[k]; else process.env[k] = entorno[k];
});
const datos = { nif: '12345678Z', nombre: 'García Pérez, Ana' };
const respuesta = (resultado, nombre = 'GARCÍA PÉREZ, ANA') => `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><c:VNifV2Sal xmlns:c="http://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Sal.xsd"><c:Contribuyente><c:Nif>12345678Z</c:Nif><c:Nombre>${nombre}</c:Nombre><c:Resultado>${resultado}</c:Resultado></c:Contribuyente></c:VNifV2Sal></s:Body></s:Envelope>`;
const consultar = (cuerpo, status = 200) => comprobarNif(datos, { post: async () => ({ status, cuerpo }) });

test('censo: identifica el NIF y devuelve el nombre de Hacienda, con entidades XML', async () => {
  assert.deepEqual(await consultar(respuesta('IDENTIFICADO', 'ANA &amp; SOCIOS &#xC1;')), { estado: 'ok', nombreAeat: 'ANA & SOCIOS Á' });
  assert.equal((await consultar('<VNifV2Sal><Contribuyente><Nif/><Nombre/><Resultado>IDENTIFICADO</Resultado></Contribuyente></VNifV2Sal>')).estado, 'ok');
});

test('censo: rechaza NO IDENTIFICADO y todas sus variantes', async () => {
  for (const resultado of ['NO IDENTIFICADO', 'NO IDENTIFICADO-SIMILAR', 'NO IDENTIFICADO-OTRO']) assert.equal((await consultar(respuesta(resultado))).estado, 'no');
});

test('censo: reconoce baja y revocación', async () => {
  for (const resultado of ['IDENTIFICADO-BAJA', 'IDENTIFICADO-REVOCADO', 'REVOCADO']) assert.equal((await consultar(respuesta(resultado))).estado, 'baja');
});

test('censo: XML roto, SOAP Fault, estados desconocidos y errores HTTP quedan pendientes', async () => {
  for (const xml of ['', 'no es XML', respuesta('IDENTIFICADO').replace('</s:Envelope>', ''), respuesta('IDENTIFICADO').replace('</c:Contribuyente>', '</Otra>'), respuesta('IDENTIFICADO', 'ANA & SOCIOS'), respuesta('OTRO'), '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>' + respuesta('IDENTIFICADO'), '<Fault><Resultado>IDENTIFICADO</Resultado></Fault>', respuesta('IDENTIFICADO') + '<otra/>']) {
    assert.equal((await consultar(xml)).estado, 'sin-servicio', xml);
  }
  assert.equal((await consultar(respuesta('IDENTIFICADO'), 500)).estado, 'sin-servicio');
  assert.equal((await consultar(respuesta('IDENTIFICADO').replace('<c:Resultado>', '<c:Resultado a="1" a="2">'))).estado, 'sin-servicio');
  assert.equal((await consultar(respuesta('IDENTIFICADO').replace('<c:Resultado>', '<!-- comentario -- roto --><c:Resultado>'))).estado, 'sin-servicio');
  assert.equal((await comprobarNif(datos, { post: async () => { throw new Error('Sin red'); } })).estado, 'sin-servicio');
});

test('censo: escapa NIF y nombre en XML y envía el nombre tal cual en mayúsculas', async () => {
  process.env.CENSO_URL = 'https://censo.test/soap';
  let enviado;
  await comprobarNif({ nif: 'a<&"\'', nombre: 'García & Pérez <"Ana"> O\'Hara' }, { post: async (url, xml) => {
    assert.equal(url, process.env.CENSO_URL);
    enviado = xml;
    return { status: 200, cuerpo: respuesta('IDENTIFICADO') };
  } });
  assert.ok(enviado.includes('<Nif>A&lt;&amp;&quot;&apos;</Nif>'));
  assert.ok(enviado.includes('<Nombre>GARCÍA &amp; PÉREZ &lt;&quot;ANA&quot;&gt; O&apos;HARA</Nombre>'));
  assert.ok(enviado.includes('xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'));
  assert.ok(enviado.includes('<VNifV2Ent xmlns="http://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Ent.xsd">'));
});

test('censo: sin certificado o sin clave no intenta acceder a la red', async () => {
  const red = mock.method(https, 'request', () => { throw new Error('No debe usar la red'); });
  for (const [p12, clave] of [['', ''], ['certificado', ''], ['', 'clave']]) {
    process.env.VERIFACTU_P12 = p12; process.env.VERIFACTU_P12_CLAVE = clave;
    assert.equal((await comprobarNif(datos)).estado, 'sin-servicio');
  }
  assert.equal(red.mock.callCount(), 0);
});

test('censo: usa el certificado Verifactu, SOAP 1.1 y timeout de 8 segundos', async () => {
  process.env.VERIFACTU_P12 = Buffer.from('p12 de prueba').toString('base64');
  process.env.VERIFACTU_P12_CLAVE = 'clave de prueba';
  delete process.env.CENSO_URL;
  mock.method(https, 'request', (url, opciones, recibir) => {
    assert.equal(url, 'https://www1.agenciatributaria.gob.es/wlpl/BURT-JDIT/ws/VNifV2SOAP');
    assert.equal(opciones.pfx.toString(), 'p12 de prueba');
    assert.equal(opciones.passphrase, 'clave de prueba');
    assert.equal(opciones.timeout, 8000);
    assert.equal(opciones.headers.SOAPAction, '""');
    assert.equal(opciones.headers['Content-Type'], 'text/xml; charset=utf-8');
    const req = new EventEmitter();
    req.end = (xml) => {
      assert.equal(opciones.headers['Content-Length'], Buffer.byteLength(xml));
      queueMicrotask(() => {
        const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
        recibir(res); res.emit('data', respuesta('IDENTIFICADO')); res.emit('end');
      });
    };
    return req;
  });
  assert.equal((await comprobarNif(datos)).estado, 'ok');
});

test('censo: un timeout destruye la petición y devuelve sin-servicio', async () => {
  process.env.VERIFACTU_P12 = 'cHJ1ZWJh'; process.env.VERIFACTU_P12_CLAVE = 'clave';
  let destruida = false;
  mock.method(https, 'request', () => {
    const req = new EventEmitter();
    req.destroy = (e) => { destruida = true; req.emit('error', e); };
    req.end = () => queueMicrotask(() => req.emit('timeout'));
    return req;
  });
  assert.equal((await comprobarNif(datos)).estado, 'sin-servicio');
  assert.ok(destruida);
});

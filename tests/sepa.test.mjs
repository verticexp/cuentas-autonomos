import test from 'node:test';
import assert from 'node:assert/strict';
import { ibanValido, limpiarIban, formatoIban, bicDeIban, identificadorAcreedor, referenciaMandato, textoSepa, remesaCobros, remesaPagos } from '../lib/sepa.js';

const ES = 'ES9121000418450200051332';
const DE = 'DE89370400440532013000';
const acreedor = { nombre: "Peña d'Àngel & Hijos <SL>", nif: 'B12345678', iban: ES };
const deudor = { nombre: 'José Muñoz', iban: DE };
const ahora = '2026-10-13T10:30:00.000Z';
const fecha = '2026-10-15';
const recibo = (id, importe, secuencia = 'RCUR') => ({ id, importe, concepto: "Cuota d'octubre & <servicio>", deudor, mandato: { referencia: `MAND-${id}`, fecha: '2026-01-01', secuencia } });
const cobros = (recibos, extras = {}) => remesaCobros({ acreedor, fechaCobro: fecha, recibos, ahora, id: 'REM-1', ...extras });
const pago = (id, importe) => ({ id, importe, concepto: 'Diseño y programación', beneficiario: deudor });
const pagos = (lista, extras = {}) => remesaPagos({ ordenante: acreedor, fechaEjecucion: fecha, pagos: lista, ahora, id: 'PAG-1', ...extras });
const bloques = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
const valor = (xml, tag) => bloques(xml, tag)[0];

// Comprobador de etiquetas, atributos y entidades para estos documentos sin DTD.
function xmlBalanceado(xml) {
  const pila = [];
  let raices = 0, fin = 0;
  for (const m of xml.matchAll(/<[^>]*>/g)) {
    assert.doesNotMatch(xml.slice(fin, m.index), /[<>]|&(?!amp;|lt;|gt;|quot;|apos;)/);
    fin = m.index + m[0].length;
    if (m[0].startsWith('<?xml')) continue;
    const tag = /^<(\/)?([A-Za-z][A-Za-z0-9]*)([^>]*)>$/.exec(m[0]);
    assert.ok(tag, m[0]);
    if (tag[1]) {
      assert.equal(tag[3], '');
      assert.equal(pila.pop(), tag[2]);
    } else {
      assert.match(tag[3], /^(\s+[A-Za-z][A-Za-z0-9]*="[^"<>]*")*$/);
      if (!pila.length) raices++;
      pila.push(tag[2]);
    }
  }
  assert.equal(fin, xml.length);
  assert.equal(pila.length, 0);
  assert.equal(raices, 1);
}

// Oráculo independiente con enteros arbitrarios, también para longitudes incorrectas.
const numeroLetras = (s) => s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
function crearIban(pais, bban) {
  const control = 98n - BigInt(numeroLetras(bban + pais + '00')) % 97n;
  return pais + String(control).padStart(2, '0') + bban;
}

test('IBAN: normalización, formato, módulo 97 y longitudes por país SEPA', () => {
  assert.equal(limpiarIban(' es91 2100\t0418\n4502 0005 1332 '), ES);
  assert.equal(formatoIban(ES), 'ES91 2100 0418 4502 0005 1332');
  assert.equal(formatoIban(DE), 'DE89 3704 0044 0532 0130 00');
  assert.equal(formatoIban(null), '');
  for (const n of [ES, DE, formatoIban(ES).toLowerCase(), 'FR1420041010050500013M02606', 'GB82WEST12345698765432']) assert.ok(ibanValido(n), n);
  for (const n of [null, '', ES.slice(0, -1) + '3', ES + '0', 'ES91-21000418450200051332', crearIban('ES', '1'.repeat(19)), crearIban('ZZ', '1'.repeat(20))]) assert.equal(ibanValido(n), false, String(n));
  for (const [pais, longitud] of Object.entries({ AD: 24, AL: 28, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, RS: 22, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22 })) {
    assert.ok(ibanValido(crearIban(pais, '1'.repeat(longitud - 4))), pais);
    assert.equal(ibanValido(crearIban(pais, '1'.repeat(longitud - 3))), false, pais);
  }
});

test('BIC por entidad española y banco desconocido', () => {
  const entidades = { '0049': 'BSCHESMMXXX', '0075': 'BSCHESMMXXX', '0081': 'BSABESBBXXX', '0128': 'BKBKESMMXXX', '0182': 'BBVAESMMXXX', '2100': 'CAIXESBBXXX', '2038': 'CAIXESBBXXX', '0487': 'GBMNESMMXXX', '1465': 'INGDESMMXXX', '2080': 'CAGLESMMVIG', '0239': 'EVOBESMMXXX', '3058': 'CCRIES2AXXX', '2085': 'CAZRES2ZXXX', '2095': 'BASKES2BXXX', '0019': 'DEUTESBBXXX', '0073': 'OPENESMMXXX', '1491': 'TRIOESMMXXX', '0186': 'BFIVESBBXXX', '3035': 'CLPEES2MXXX', '2103': 'UCJAES2MXXX', '0030': 'ESPCESMMXXX', '0237': 'CSURES2CXXX', '0138': 'BKOAES22XXX', '3081': 'BCOEESMM081', '0061': 'BMARES2MXXX', '0133': 'MIKBESB1XXX' };
  for (const [entidad, esperado] of Object.entries(entidades)) assert.equal(bicDeIban(crearIban('ES', entidad + '0'.repeat(16))), esperado);
  assert.equal(bicDeIban(formatoIban(ES).toLowerCase()), 'CAIXESBBXXX');
  for (const iban of [DE, '', null, crearIban('ES', '9999' + '0'.repeat(16))]) assert.equal(bicDeIban(iban), '');
});

test('identificador de acreedor: control ISO 7064 independiente del sufijo', () => {
  const id = identificadorAcreedor('B12345678');
  assert.equal(id, 'ES97000B12345678');
  assert.match(id, /^ES\d{2}000B12345678$/);
  const control = 98n - BigInt(numeroLetras('B12345678ES00')) % 97n;
  assert.equal(id, `ES${String(control).padStart(2, '0')}000B12345678`);
  assert.equal(BigInt(numeroLetras(id.slice(7) + id.slice(0, 4))) % 97n, 1n);
  assert.equal(identificadorAcreedor('es b-12345678', '123'), id.slice(0, 4) + '123B12345678');
  assert.equal(identificadorAcreedor('B12345678', 'ABC'), id.slice(0, 4) + 'ABCB12345678');
  assert.equal(identificadorAcreedor(''), '');
  assert.equal(identificadorAcreedor('B12345678', '12'), '');
});

test('textos SEPA: transliteración, repertorio permitido y límites', () => {
  assert.equal(textoSepa('ÁÉÍÓÚ ü ñ ç Àèïò âêîôû'), 'AEIOU u n c Aeio aeiou');
  assert.equal(textoSepa('Œuvre Straße Øresund'), 'OEuvre Strasse Oresund');
  assert.equal(textoSepa('  A&<B>🙂@#_"\nC  '), 'AB C');
  assert.equal(textoSepa("Ab 12/?:().,'+-"), "Ab 12/?:().,'+-");
  assert.equal(referenciaMandato('á'.repeat(40)), 'a'.repeat(35));
  assert.equal(textoSepa('ñ'.repeat(150), 140).length, 140);
  assert.equal(textoSepa(null, 70), '');
});

test('cobros: FRST y RCUR separados, totales de grupo y bloque, datos SEPA', () => {
  const r = cobros([recibo('a', 10.10, 'FRST'), recibo('b', 20.20), recibo('c', 0.30)]);
  assert.equal(r.numero, 3);
  assert.equal(r.total, 30.60);
  assert.deepEqual(r.errores, []);
  xmlBalanceado(r.xml);
  assert.match(r.xml, /xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"/);
  const grupo = valor(r.xml, 'GrpHdr');
  assert.equal(valor(grupo, 'NbOfTxs'), '3');
  assert.equal(valor(grupo, 'CtrlSum'), '30.60');
  assert.match(grupo, /<OrgId><Othr><Id>ES\d{2}000B12345678<\/Id><\/Othr><\/OrgId>/);
  const partes = bloques(r.xml, 'PmtInf');
  assert.equal(partes.length, 2);
  for (const [i, secuencia, numero, total] of [[0, 'FRST', '1', '10.10'], [1, 'RCUR', '2', '20.50']]) {
    assert.equal(valor(partes[i], 'SeqTp'), secuencia);
    assert.equal(valor(partes[i], 'NbOfTxs'), numero);
    assert.equal(valor(partes[i], 'CtrlSum'), total);
    assert.match(partes[i], /<PmtMtd>DD<\/PmtMtd><BtchBookg>true<\/BtchBookg>/);
    assert.equal(valor(partes[i], 'ReqdColltnDt'), fecha);
    assert.match(partes[i], /<SvcLvl><Cd>SEPA<\/Cd><\/SvcLvl><LclInstrm><Cd>CORE<\/Cd><\/LclInstrm>/);
    assert.match(partes[i], /<SchmeNm><Prtry>SEPA<\/Prtry><\/SchmeNm>/);
  }
  assert.match(r.xml, /<InstdAmt Ccy="EUR">10.10<\/InstdAmt>/);
  assert.match(r.xml, /<MndtId>MAND-a<\/MndtId><DtOfSgntr>2026-01-01<\/DtOfSgntr>/);
  assert.match(r.xml, /<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED<\/Id><\/Othr><\/FinInstnId><\/DbtrAgt>/);
  assert.match(r.xml, /<CdtrAgt><FinInstnId><BIC>CAIXESBBXXX<\/BIC>/);
  assert.match(r.xml, /Pena d&apos;Angel  Hijos SL/);
  assert.doesNotMatch(r.xml, /<servicio>|& Hijos/);
});

test('cobros: excluye y explica cada operación inválida', () => {
  const malas = [
    { ...recibo('iban', 10), deudor: { ...deudor, iban: 'ES00' } },
    recibo('cero', 0), recibo('negativo', -1), recibo('exceso', 1000000000), recibo('infinito', Infinity), recibo('nan', NaN), recibo('booleano', true), recibo('subcentimo', 0.001),
    { ...recibo('ref', 1), mandato: { referencia: '🙂', fecha: '2026-01-01' } },
    { ...recibo('fecha', 1), mandato: { referencia: 'M', fecha: '2026-02-30' } },
    { ...recibo('secuencia', 1), mandato: { referencia: 'M', fecha: '2026-01-01', secuencia: 'OTRA' } },
  ];
  const r = cobros([recibo('valido', 5), ...malas]);
  assert.equal(r.numero, 1);
  assert.equal(r.total, 5);
  assert.deepEqual(r.errores.map((x) => x.id), malas.map((x) => x.id));
  assert.ok(r.errores.every((x) => x.error));
  assert.equal(bloques(r.xml, 'DrctDbtTxInf').length, 1);
  assert.equal(valor(r.xml, 'EndToEndId'), 'valido');
  assert.ok(cobros(malas).error);
  assert.equal(cobros(malas).errores.length, malas.length);
  assert.ok(cobros([]).error);
});

test('pagos: total exacto, XML de transferencias y BIC opcional', () => {
  const r = pagos([pago('p1', 0.1), { ...pago('p2', 0.2), beneficiario: { ...deudor, bic: 'COBADEFFXXX' } }, { ...pago('malo', 100), beneficiario: { ...deudor, iban: 'incorrecto' } }]);
  assert.equal(r.total, 0.3);
  assert.equal(r.numero, 2);
  assert.deepEqual(r.errores.map((x) => x.id), ['malo']);
  xmlBalanceado(r.xml);
  assert.match(r.xml, /pain.001.001.03/);
  assert.equal(bloques(r.xml, 'PmtInf').length, 1);
  assert.deepEqual(bloques(r.xml, 'CtrlSum'), ['0.30', '0.30']);
  assert.deepEqual(bloques(r.xml, 'NbOfTxs'), ['2', '2']);
  assert.equal(valor(r.xml, 'PmtMtd'), 'TRF');
  assert.equal(valor(r.xml, 'ReqdExctnDt'), fecha);
  const lineas = bloques(r.xml, 'CdtTrfTxInf');
  assert.doesNotMatch(lineas[0], /CdtrAgt/);
  assert.match(lineas[1], /<CdtrAgt><FinInstnId><BIC>COBADEFFXXX<\/BIC>/);
  assert.match(lineas[0], /<Amt><InstdAmt Ccy="EUR">0.10<\/InstdAmt><\/Amt>/);
  assert.equal(valor(lineas[0], 'Ustrd'), 'Diseno y programacion');
  assert.equal(pagos([pago('maximo', 999999999.99)]).total, 999999999.99);
  assert.ok(pagos([pago('cero', 0)]).error);
});

test('validaciones comunes: emisor, fechas reales y fechas pasadas', () => {
  for (const ejecutar of [
    (extras) => cobros([recibo('r', 1)], extras),
    (extras) => pagos([pago('p', 1)], extras),
  ]) {
    for (const f of ['2026-02-30', '2026-13-01', '15-10-2026', '2026-10-12', '']) assert.ok(ejecutar({ fechaCobro: f, fechaEjecucion: f }).error, f);
    assert.ok(ejecutar({ ahora: 'imposible' }).error);
    assert.ok(ejecutar({ acreedor: { ...acreedor, iban: 'malo' }, ordenante: { ...acreedor, iban: 'malo' } }).error);
    assert.ok(ejecutar({ acreedor: { ...acreedor, bic: 'MALO' }, ordenante: { ...acreedor, bic: 'MALO' } }).error);
    assert.ok(ejecutar({ acreedor: { ...acreedor, nombre: '🙂' }, ordenante: { ...acreedor, nombre: '🙂' } }).error);
    assert.ok(ejecutar({ fechaCobro: '2026-10-13', fechaEjecucion: '2026-10-13' }).xml);
  }
  assert.ok(remesaCobros().error);
  assert.ok(remesaPagos().error);
  assert.ok(cobros([recibo('r', 1)], { acreedor: { ...acreedor, nif: '' } }).error);
});

test('ids deterministas, límites, BIC explícito y todas las secuencias', () => {
  const entrada = [recibo('x'.repeat(50) + "'&", 1, 'OOFF'), recibo('final', 2, 'FNAL'), { ...recibo('recurrente', 3), mandato: { referencia: 'r'.repeat(50), fecha: '2026-01-01' } }];
  entrada[0].concepto = 'ñ'.repeat(200);
  const copia = structuredClone(entrada);
  const extras = { id: "Lote d'Àngel<&" + 'x'.repeat(50), acreedor: { ...acreedor, nombre: 'á'.repeat(100), bic: 'BSCHESMMXXX', identificador: 'ES97000B12345678' } };
  const r = cobros(entrada, extras);
  assert.deepEqual(r, cobros(entrada, extras));
  assert.deepEqual(entrada, copia);
  assert.equal(valor(r.xml, 'CreDtTm'), ahora);
  assert.match(valor(r.xml, 'MsgId'), /^Lote d&apos;Angel/);
  for (const tag of ['MsgId', 'PmtInfId', 'EndToEndId', 'MndtId']) assert.ok(bloques(r.xml, tag).every((s) => s.replace(/&apos;/g, "'").length <= 35), tag);
  assert.ok(bloques(r.xml, 'Nm').every((s) => s.length <= 70));
  assert.ok(bloques(r.xml, 'Ustrd').every((s) => s.length <= 140));
  assert.deepEqual(bloques(r.xml, 'SeqTp'), ['RCUR', 'OOFF', 'FNAL']);
  assert.match(r.xml, /<BIC>BSCHESMMXXX<\/BIC>/);
  xmlBalanceado(r.xml);
  assert.deepEqual(cobros(entrada, { id: undefined }), cobros(entrada, { id: undefined }));
  assert.notEqual(valor(cobros(entrada, { id: undefined }).xml, 'MsgId'), valor(cobros([recibo('otro', 1)], { id: undefined }).xml, 'MsgId'));
  assert.deepEqual(pagos([pago('p', 1)]), pagos([pago('p', 1)]));
  const desconocido = { ...acreedor, iban: DE };
  assert.match(cobros([recibo('r', 1)], { acreedor: desconocido }).xml, /<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED/);
  assert.match(pagos([pago('p', 1)], { ordenante: desconocido }).xml, /<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED/);
});

test('el comprobador detecta XML roto', () => {
  assert.throws(() => xmlBalanceado('<A><B></A></B>'));
  assert.throws(() => xmlBalanceado('<A>&sinEscapar</A>'));
  assert.throws(() => xmlBalanceado('<A></A><B></B>'));
});

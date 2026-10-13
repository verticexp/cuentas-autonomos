// Remesas SEPA Core y transferencias. Sin dependencias ni acceso a servicios externos.
import { r2 } from './calculos.js';

const LONGITUD = {
  AD: 24, AL: 28, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22,
  DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21,
  HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27,
  MD: 24, ME: 22, MK: 19, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24,
  RS: 22, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};
const BANCOS = {
  '0049': 'BSCHESMMXXX', '0075': 'BSCHESMMXXX', '0081': 'BSABESBBXXX',
  '0128': 'BKBKESMMXXX', '0182': 'BBVAESMMXXX', '2100': 'CAIXESBBXXX',
  '2038': 'CAIXESBBXXX', '0487': 'GBMNESMMXXX', '1465': 'INGDESMMXXX',
  '2080': 'CAGLESMMVIG', '0239': 'EVOBESMMXXX', '3058': 'CCRIES2AXXX',
  '2085': 'CAZRES2ZXXX', '2095': 'BASKES2BXXX', '0019': 'DEUTESBBXXX',
  '0073': 'OPENESMMXXX', '1491': 'TRIOESMMXXX', '0186': 'BFIVESBBXXX',
  '3035': 'CLPEES2MXXX', '2103': 'UCJAES2MXXX', '0030': 'ESPCESMMXXX',
  '0237': 'CSURES2CXXX', '0138': 'BKOAES22XXX', '3081': 'BCOEESMM081',
  '0061': 'BMARES2MXXX', '0133': 'MIKBESB1XXX',
};
const SECUENCIAS = ['FRST', 'RCUR', 'OOFF', 'FNAL'];
export const limpiarIban = (iban) => String(iban ?? '').replace(/\s/g, '').toUpperCase();
export const formatoIban = (iban) => limpiarIban(iban).match(/.{1,4}/g)?.join(' ') || '';

// El resto se calcula dígito a dígito para evitar pérdida de precisión.
function mod97(texto) {
  let resto = 0;
  for (const c of texto) {
    for (const digito of /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c) {
      resto = (resto * 10 + Number(digito)) % 97;
    }
  }
  return resto;
}

export function ibanValido(iban) {
  const n = limpiarIban(iban);
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(n)
    && n.length === LONGITUD[n.slice(0, 2)] && Number(n.slice(2, 4)) >= 2
    && Number(n.slice(2, 4)) <= 98 && mod97(n.slice(4) + n.slice(0, 4)) === 1;
}

export function bicDeIban(iban) {
  const n = limpiarIban(iban);
  return /^ES[0-9]{22}$/.test(n) ? BANCOS[n.slice(4, 8)] || '' : '';
}

export function identificadorAcreedor(nif, sufijo = '000') {
  const n = limpiarIban(nif).replace(/[.-]/g, '').replace(/^ES(?=.{9}$)/, '');
  const s = limpiarIban(sufijo);
  if (!/^[A-Z0-9]{9}$/.test(n) || !/^[A-Z0-9]{3}$/.test(s)) return '';
  return `ES${String(98 - mod97(n + 'ES00')).padStart(2, '0')}${s}${n}`;
}

export function textoSepa(s, max = Infinity) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ÆæŒœØøŁłßĐđ]/g, (c) => ({ Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', Ø: 'O', ø: 'o', Ł: 'L', ł: 'l', ß: 'ss', Đ: 'D', đ: 'd' }[c]))
    .replace(/\s/g, ' ').replace(/[^A-Za-z0-9 /?:().,'+\-]/g, '').trim().slice(0, max);
}
export const referenciaMandato = (texto) => textoSepa(texto, 35);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const e = (tag, valor) => `<${tag}>${esc(valor)}</${tag}>`;
const g = (tag, ...hijos) => `<${tag}>${hijos.filter(Boolean).join('')}</${tag}>`;
const nombre = (p) => e('Nm', textoSepa(p.nombre, 70));
const cuenta = (tag, p) => g(tag, g('Id', e('IBAN', limpiarIban(p.iban))));
const bic = (p) => limpiarIban(p.bic) || bicDeIban(p.iban);
const agente = (tag, p) => g(tag, g('FinInstnId', bic(p) ? e('BIC', bic(p)) : g('Othr', e('Id', 'NOTPROVIDED'))));
const importeXml = (centimos) => (centimos / 100).toFixed(2);
const suma = (lineas) => lineas.reduce((s, l) => s + l.centimos, 0);
const resumen = (lineas) => e('NbOfTxs', lineas.length) + e('CtrlSum', importeXml(suma(lineas)));
const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)
  && f.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(f)) && new Date(f).toISOString().slice(0, 10) === f;

function errorPersona(p, rol) {
  if (!ibanValido(p?.iban)) return `IBAN de ${rol} inválido`;
  if (!textoSepa(p.nombre, 70)) return `Nombre de ${rol} obligatorio`;
  if (bic(p) && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic(p))) return `BIC de ${rol} inválido`;
  return '';
}

// Con id y ahora explícitos el resultado es reproducible. El emisor debe usar un id por remesa.
function preparar({ emisor, fecha, lineas, id, ahora, cobros }) {
  const instante = new Date(ahora ?? Date.now());
  if (!Number.isFinite(instante.getTime())) return { error: 'Fecha actual inválida' };
  if (!fechaValida(fecha)) return { error: 'Fecha de ejecución o cobro inválida' };
  if (fecha < instante.toISOString().slice(0, 10)) return { error: 'La fecha de ejecución o cobro está en el pasado' };
  const error = errorPersona(emisor, cobros ? 'acreedor' : 'ordenante');
  if (error) return { error };
  if (!Array.isArray(lineas) || !lineas.length) return { error: 'No hay operaciones válidas' };
  const validas = [], errores = [];
  for (const [i, linea] of lineas.entries()) {
    const l = linea ?? {};
    const n = typeof l.importe === 'number' || typeof l.importe === 'string' ? Number(l.importe) : NaN;
    const centimos = Math.round(r2(n) * 100);
    let fallo = errorPersona(cobros ? l.deudor : l.beneficiario, cobros ? 'deudor' : 'beneficiario');
    if (!fallo && (!Number.isFinite(n) || n <= 0 || n > 999999999.99 || centimos <= 0)) fallo = 'Importe inválido (debe ser positivo y no superar 999999999.99)';
    if (cobros && !fallo) {
      if (!referenciaMandato(l.mandato?.referencia)) fallo = 'Referencia de mandato obligatoria';
      else if (!fechaValida(l.mandato?.fecha)) fallo = 'Fecha de mandato inválida';
      else if (!SECUENCIAS.includes(l.mandato.secuencia ?? 'RCUR')) fallo = 'Secuencia de mandato inválida';
    }
    if (fallo) errores.push({ id: l.id, error: fallo });
    else validas.push({ ...l, centimos, endId: textoSepa(l.id, 35) || `OP-${i + 1}` });
  }
  if (!validas.length) return { error: 'No hay operaciones válidas', errores };
  // La huella distingue lotes distintos generados en el mismo milisegundo.
  let huella = 2166136261;
  for (const c of JSON.stringify([emisor, fecha, validas])) huella = Math.imul(huella ^ c.charCodeAt(0), 16777619) >>> 0;
  const msgId = textoSepa(id, 35) || `${cobros ? 'DD' : 'TRF'}-${instante.toISOString().replace(/\D/g, '')}-${huella.toString(36)}`;
  return { validas, errores, msgId, creacion: instante.toISOString() };
}

const documento = (version, tag, cuerpo) => `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:${version}">${g(tag, cuerpo)}</Document>`;
const resultado = (xml, p) => ({ xml, total: suma(p.validas) / 100, numero: p.validas.length, errores: p.errores });
const pagoId = (l) => g('PmtId', e('EndToEndId', l.endId));
const concepto = (l) => textoSepa(l.concepto, 140) ? g('RmtInf', e('Ustrd', textoSepa(l.concepto, 140))) : '';
const instruido = (l) => `<InstdAmt Ccy="EUR">${importeXml(l.centimos)}</InstdAmt>`;

export function remesaCobros({ acreedor, fechaCobro, recibos, id, ahora } = {}) {
  const p = preparar({ emisor: acreedor, fecha: fechaCobro, lineas: recibos, id, ahora, cobros: true });
  if (p.error) return p;
  const identificador = textoSepa(acreedor.identificador || identificadorAcreedor(acreedor.nif), 35);
  if (!identificador) return { error: 'Identificador de acreedor o NIF obligatorio' };
  const cabecera = g('GrpHdr', e('MsgId', p.msgId), e('CreDtTm', p.creacion), resumen(p.validas),
    g('InitgPty', nombre(acreedor), g('Id', g('OrgId', g('Othr', e('Id', identificador))))));
  const bloques = SECUENCIAS.map((secuencia) => {
    const lineas = p.validas.filter((l) => (l.mandato.secuencia ?? 'RCUR') === secuencia);
    if (!lineas.length) return '';
    return g('PmtInf', e('PmtInfId', `${p.msgId.slice(0, 30)}-${secuencia}`), e('PmtMtd', 'DD'), e('BtchBookg', 'true'), resumen(lineas),
      g('PmtTpInf', g('SvcLvl', e('Cd', 'SEPA')), g('LclInstrm', e('Cd', 'CORE')), e('SeqTp', secuencia)),
      e('ReqdColltnDt', fechaCobro), g('Cdtr', nombre(acreedor)), cuenta('CdtrAcct', acreedor), agente('CdtrAgt', acreedor), e('ChrgBr', 'SLEV'),
      g('CdtrSchmeId', g('Id', g('PrvtId', g('Othr', e('Id', identificador), g('SchmeNm', e('Prtry', 'SEPA')))))),
      ...lineas.map((l) => g('DrctDbtTxInf', pagoId(l), instruido(l),
        g('DrctDbtTx', g('MndtRltdInf', e('MndtId', referenciaMandato(l.mandato.referencia)), e('DtOfSgntr', l.mandato.fecha))),
        agente('DbtrAgt', l.deudor), g('Dbtr', nombre(l.deudor)), cuenta('DbtrAcct', l.deudor), concepto(l))));
  }).join('');
  return resultado(documento('pain.008.001.02', 'CstmrDrctDbtInitn', cabecera + bloques), p);
}

export function remesaPagos({ ordenante, fechaEjecucion, pagos, id, ahora } = {}) {
  const p = preparar({ emisor: ordenante, fecha: fechaEjecucion, lineas: pagos, id, ahora, cobros: false });
  if (p.error) return p;
  const cabecera = g('GrpHdr', e('MsgId', p.msgId), e('CreDtTm', p.creacion), resumen(p.validas), g('InitgPty', nombre(ordenante)));
  const bloque = g('PmtInf', e('PmtInfId', `${p.msgId.slice(0, 31)}-TRF`), e('PmtMtd', 'TRF'), e('BtchBookg', 'true'), resumen(p.validas),
    g('PmtTpInf', g('SvcLvl', e('Cd', 'SEPA'))), e('ReqdExctnDt', fechaEjecucion),
    g('Dbtr', nombre(ordenante)), cuenta('DbtrAcct', ordenante), agente('DbtrAgt', ordenante), e('ChrgBr', 'SLEV'),
    ...p.validas.map((l) => g('CdtTrfTxInf', pagoId(l), g('Amt', instruido(l)),
      bic(l.beneficiario) && agente('CdtrAgt', l.beneficiario), g('Cdtr', nombre(l.beneficiario)), cuenta('CdtrAcct', l.beneficiario), concepto(l))));
  return resultado(documento('pain.001.001.03', 'CstmrCdtTrfInitn', cabecera + bloque), p);
}

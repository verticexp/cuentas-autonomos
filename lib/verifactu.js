// Verifactu (RD 1007/2023, Orden HAC/1177/2024): registro de cada factura con huella SHA-256 encadenada
// a la anterior y QR para cotejarla en la AEAT. Se activa por empresa (empresa.verifactu = 'pruebas' | 'real'); el envío a la AEAT va aparte.
import { createHash } from 'node:crypto';
import { importes, numeroFactura, r2 } from './calculos.js';

export const modoDe = (u) => (['pruebas', 'real'].includes(u?.verifactu) ? u.verifactu : null);
const QR = {
  pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  real: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
};

const fechaAeat = (iso) => iso.split('-').reverse().join('-');
const total = (f) => { const t = importes(f); return { cuota: t.iva.toFixed(2), importe: r2(t.base + t.iva).toFixed(2) }; };

// Fecha y hora con huso de Madrid: 2026-10-01T12:30:00+02:00
export function horaMadrid(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${p.timeZoneName.replace('GMT', '') || '+00:00'}`;
}

export const huella = (campos) => createHash('sha256')
  .update(Object.entries(campos).map(([k, v]) => `${k}=${String(v ?? '').trim()}`).join('&'), 'utf8')
  .digest('hex').toUpperCase();

// Clave de las rectificativas (art. 80 de la Ley del IVA): R1 error fundado en derecho y causas del 80 Uno, Dos y Seis
// (devoluciones, descuentos, resolución); R2 concurso (80 Tres); R3 créditos incobrables (80 Cuatro); R4 el resto.
// Sin motivo elegido, R4 (como hasta ahora). REVISAR con la asesoría qué motivo usar por defecto.
export const TIPOS_RECTIFICATIVA = { error: 'R1', concurso: 'R2', incobrable: 'R3', otros: 'R4' };
export const tipoFactura = (f) => (f.serie === 'R' || f.rectifica ? TIPOS_RECTIFICATIVA[f.rectifica?.motivo] || 'R4' : 'F1');

// Registro de alta. subsanacion: reenvío corregido de un registro aceptado con errores (rechazoPrevio 'N') o rechazado
// (rechazoPrevio 'X'). Esos dos campos van en el XML pero no en la huella.
export function registroAlta(f, nif, anterior = '', ahora = horaMadrid(), { subsanacion = false, rechazoPrevio } = {}) {
  const { cuota, importe } = total(f);
  const campos = {
    IDEmisorFactura: nif,
    NumSerieFactura: numeroFactura(f),
    FechaExpedicionFactura: fechaAeat(f.fecha),
    TipoFactura: tipoFactura(f),
    CuotaTotal: cuota,
    ImporteTotal: importe,
    Huella: anterior,
    FechaHoraHusoGenRegistro: ahora,
  };
  return { ...campos, HuellaAnterior: anterior, Huella: huella(campos), ...(subsanacion ? { Subsanacion: 'S', RechazoPrevio: rechazoPrevio || 'N' } : {}) };
}

// Registro de anulación (Orden HAC/1177/2024, art. 13): para una factura expedida por error. Va en la misma cadena; para
// encadenar el siguiente se usan los datos de la factura anulada (IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura).
export function registroAnulacion(f, nif, anterior = '', ahora = horaMadrid()) {
  const campos = {
    IDEmisorFacturaAnulada: nif,
    NumSerieFacturaAnulada: numeroFactura(f),
    FechaExpedicionFacturaAnulada: fechaAeat(f.fecha),
    Huella: anterior,
    FechaHoraHusoGenRegistro: ahora,
  };
  return { tipo: 'anulacion', ...campos, IDEmisorFactura: nif, NumSerieFactura: campos.NumSerieFacturaAnulada, FechaExpedicionFactura: campos.FechaExpedicionFacturaAnulada, HuellaAnterior: anterior, Huella: huella(campos) };
}

export const urlQr = (modo, nif, f) =>
  `${QR[modo]}?nif=${encodeURIComponent(nif)}&numserie=${encodeURIComponent(numeroFactura(f))}&fecha=${fechaAeat(f.fecha)}&importe=${total(f).importe}`;

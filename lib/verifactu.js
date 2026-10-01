// Verifactu (RD 1007/2023, Orden HAC/1177/2024): registro de cada factura con huella SHA-256 encadenada
// a la anterior y QR para cotejarla en la AEAT. Se activa con VERIFACTU=pruebas|real; el envío a la AEAT va aparte.
import { createHash } from 'node:crypto';
import { importes, numeroFactura, r2 } from './calculos.js';

export const MODO = ['pruebas', 'real'].includes(process.env.VERIFACTU) ? process.env.VERIFACTU : null;
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

export function registroAlta(f, nif, anterior = '', ahora = horaMadrid()) {
  const { cuota, importe } = total(f);
  const campos = {
    IDEmisorFactura: nif,
    NumSerieFactura: numeroFactura(f),
    FechaExpedicionFactura: fechaAeat(f.fecha),
    TipoFactura: f.serie === 'R' ? 'R4' : 'F1',
    CuotaTotal: cuota,
    ImporteTotal: importe,
    Huella: anterior,
    FechaHoraHusoGenRegistro: ahora,
  };
  return { ...campos, HuellaAnterior: anterior, Huella: huella(campos) };
}

export const urlQr = (modo, nif, f) =>
  `${QR[modo]}?nif=${encodeURIComponent(nif)}&numserie=${encodeURIComponent(numeroFactura(f))}&fecha=${fechaAeat(f.fecha)}&importe=${total(f).importe}`;

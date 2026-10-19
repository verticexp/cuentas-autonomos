import { importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, fechaTexto } from './formato.js';

export const CAMPOS_PLANTILLA = [
  ['{numero}', 'Número de factura'],
  ['{cliente}', 'Nombre del cliente'],
  ['{total}', 'Importe total de la factura'],
  ['{vencimiento}', 'Fecha de vencimiento'],
  ['{empresa}', 'Nombre de la empresa'],
];

export function rellenar(texto, f, e) {
  const campos = {
    numero: () => numeroFactura(f),
    cliente: () => f.cliente?.nombre || '',
    total: () => eur(importes(f).total),
    vencimiento: () => fechaTexto(vencimiento(f, e.plazo)),
    empresa: () => e.nombre || '',
  };
  return String(texto ?? '').replace(/\{([^{}]+)\}/g, (marcador, campo) =>
    Object.hasOwn(campos, campo) ? campos[campo]() : marcador);
}

export function asuntoFactura(f, e, envio) {
  return envio?.asunto?.trim()
    ? rellenar(envio.asunto, f, e)
    : `Factura ${numeroFactura(f)} de ${e.nombre || ''}`.trim();
}

export function mensajeFactura(f, e, envio) {
  const firma = envio?.firma?.trim() ? rellenar(envio.firma, f, e) : '';
  if (envio?.mensaje?.trim()) {
    return rellenar(envio.mensaje, f, e) + (firma ? `\n\n${firma}` : '');
  }
  return `Hola,\n\nTe adjunto la factura ${numeroFactura(f)} por ${eur(importes(f).total)}, con vencimiento el ${fechaTexto(vencimiento(f, e.plazo))}.\n\nGracias,\n${firma || e.nombre || ''}`;
}

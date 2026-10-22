import { importes, numeroFactura, vencimiento } from './calculos.js';
import { fechaTexto } from './formato.js';
import { enDivisa, formatoDoc } from './idiomas.js';

export const CAMPOS_PLANTILLA = [
  ['{numero}', 'Número de factura'],
  ['{cliente}', 'Nombre del cliente'],
  ['{total}', 'Importe total de la factura'],
  ['{vencimiento}', 'Fecha de vencimiento'],
  ['{empresa}', 'Nombre de la empresa'],
];

// En el idioma y la moneda de la factura (lib/idiomas.js): el total, en la moneda en que se factura.
const total = (f) => formatoDoc(f).dinero(importes(enDivisa(f)).total);
const vence = (f, e) => { const d = vencimiento(f, e.plazo), L = formatoDoc(f); return L.idioma === 'es' ? fechaTexto(d) : L.fecha(d); };

export function rellenar(texto, f, e) {
  const campos = {
    numero: () => numeroFactura(f),
    cliente: () => f.cliente?.nombre || '',
    total: () => total(f),
    vencimiento: () => vence(f, e),
    empresa: () => e.nombre || '',
  };
  return String(texto ?? '').replace(/\{([^{}]+)\}/g, (marcador, campo) =>
    Object.hasOwn(campos, campo) ? campos[campo]() : marcador);
}

// Sin plantilla propia de la empresa, el asunto y el mensaje van en el idioma de la factura.
const POR_DEFECTO = {
  es: { asunto: (n, em) => `Factura ${n} de ${em}`, mensaje: (n, t, v, firma) => `Hola,\n\nTe adjunto la factura ${n} por ${t}, con vencimiento el ${v}.\n\nGracias,\n${firma}` },
  en: { asunto: (n, em) => `Invoice ${n} from ${em}`, mensaje: (n, t, v, firma) => `Hello,\n\nPlease find attached invoice ${n} for ${t}, due on ${v}.\n\nThank you,\n${firma}` },
  ca: { asunto: (n, em) => `Factura ${n} de ${em}`, mensaje: (n, t, v, firma) => `Hola,\n\nT'adjunto la factura ${n} per ${t}, amb venciment el ${v}.\n\nGràcies,\n${firma}` },
  fr: { asunto: (n, em) => `Facture ${n} de ${em}`, mensaje: (n, t, v, firma) => `Bonjour,\n\nVeuillez trouver ci-joint la facture ${n} d'un montant de ${t}, à régler avant le ${v}.\n\nMerci,\n${firma}` },
  de: { asunto: (n, em) => `Rechnung ${n} von ${em}`, mensaje: (n, t, v, firma) => `Hallo,\n\nanbei erhalten Sie die Rechnung ${n} über ${t}, fällig am ${v}.\n\nVielen Dank\n${firma}` },
  it: { asunto: (n, em) => `Fattura ${n} di ${em}`, mensaje: (n, t, v, firma) => `Buongiorno,\n\nin allegato la fattura ${n} di ${t}, con scadenza il ${v}.\n\nGrazie,\n${firma}` },
  pt: { asunto: (n, em) => `Fatura ${n} de ${em}`, mensaje: (n, t, v, firma) => `Olá,\n\nem anexo, a fatura ${n} no valor de ${t}, com vencimento a ${v}.\n\nObrigado,\n${firma}` },
};
const porDefecto = (f) => POR_DEFECTO[formatoDoc(f).idioma] || POR_DEFECTO.es;

export function asuntoFactura(f, e, envio) {
  return envio?.asunto?.trim()
    ? rellenar(envio.asunto, f, e)
    : porDefecto(f).asunto(numeroFactura(f), e.nombre || '').trim();
}

export function mensajeFactura(f, e, envio) {
  const firma = envio?.firma?.trim() ? rellenar(envio.firma, f, e) : '';
  if (envio?.mensaje?.trim()) {
    return rellenar(envio.mensaje, f, e) + (firma ? `\n\n${firma}` : '');
  }
  return porDefecto(f).mensaje(numeroFactura(f), total(f), vence(f, e), firma || e.nombre || '');
}

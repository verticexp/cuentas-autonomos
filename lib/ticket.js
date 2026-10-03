// Lectura de tickets con IA (Claude): de la foto saca proveedor, fecha, base e IVA.
// Hace falta ANTHROPIC_API_KEY en Vercel; ANTHROPIC_MODEL para cambiar de modelo.
import { r2 } from './calculos.js';

export const iaLista = () => Boolean(process.env.ANTHROPIC_API_KEY);
const TIPOS = [21, 10, 4, 0];

const PROMPT = `Es la foto de un ticket o factura de gasto en España. Responde SOLO con un objeto JSON, sin texto alrededor:
{"proveedor": "nombre del comercio", "nif": "NIF/CIF del comercio o vacío", "fecha": "AAAA-MM-DD", "concepto": "qué se compró, en 2-6 palabras", "base": número sin IVA, "ivaPct": 21|10|4|0, "total": número con IVA}
Si hay varios tipos de IVA, usa el de mayor importe y pon en base la suma de bases. Si no se ve un dato, pon null.`;

// Deja la respuesta de la IA lista para el formulario (sin fiarse de ella: todo se revisa).
export function limpiarTicket(d, hoy) {
  const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
  const ivaLeido = num(d?.ivaPct);
  const ivaPct = TIPOS.includes(ivaLeido) ? ivaLeido : 21;
  let base = num(d?.base);
  const total = num(d?.total);
  if (!(base > 0) && total > 0) base = total / (1 + ivaPct / 100);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(d?.fecha || '') && d.fecha <= hoy ? d.fecha : hoy;
  const txt = (v, n) => (v ? String(v).trim().slice(0, n) : '');
  return { proveedor: txt(d?.proveedor, 80), nif: txt(d?.nif, 20), fecha, concepto: txt(d?.concepto, 140), base: base > 0 ? r2(base) : '', ivaPct };
}

export async function leerTicket(base64, tipo) {
  const r = await fetch(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: tipo, data: base64 } }, { type: 'text', text: PROMPT }] }],
    }),
  }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (!r?.ok) return { error: 'No se pudo leer el ticket. Prueba otra vez o rellénalo a mano.' };
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try { return { datos: JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)) }; } catch { return { error: 'No se entendió el ticket. Rellénalo a mano.' }; }
}

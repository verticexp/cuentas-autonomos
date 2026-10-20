// Fisquo por WhatsApp: la IA solo interpreta el mensaje. No emite nada: devuelve un pedido que se confirma antes.
// Modelo pequeño por defecto (barato); ANTHROPIC_MODEL_WHATSAPP para cambiarlo.
import { proveedorJSON } from './llamadas.js';

const HERRAMIENTAS = [
  {
    name: 'preparar_factura',
    description: 'Prepara el borrador de una factura que la persona pide emitir. No la emite: se le pide confirmación después.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre del cliente tal como lo escribe la persona' },
        lineas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              concepto: { type: 'string' },
              cantidad: { type: 'number' },
              precio: { type: 'number', description: 'Precio unitario SIN IVA en euros' },
              ivaPct: { type: 'number', description: 'Solo si la persona indica un tipo de IVA' },
            },
            required: ['concepto', 'precio'],
          },
        },
        fecha: { type: 'string', description: 'YYYY-MM-DD, solo si la persona indica otra fecha distinta de hoy' },
        email: { type: 'string', description: 'Email al que enviarla, solo si la persona lo escribe' },
      },
      required: ['cliente', 'lineas'],
    },
  },
  {
    name: 'responder',
    description: 'Contesta sin preparar factura: falta el cliente o el importe, o piden otra cosa.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
];

const sistema = (u, hoy, clientes) => `Eres Fisquo por WhatsApp, para ${u.empresaNombre || 'esta empresa'}. Hoy es ${hoy}.
Por ahora solo sabes preparar facturas. Usa siempre una herramienta:
- preparar_factura si piden una factura con cliente e importe. Los importes que den son SIN IVA salvo que digan «con IVA» o «total»: entonces calcula el precio sin IVA (divide entre 1,21 si no dicen otro tipo). No inventes conceptos: si no lo dicen, usa «Servicios profesionales».
- responder si falta el cliente o el importe (pregúntalo en una frase) o si piden otra cosa (di que de momento solo haces facturas).
Clientes guardados: ${clientes.slice(0, 200).join('; ') || 'ninguno'}.`;

export async function interpretar(u, texto, clientes, hoy) {
  const { d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL_WHATSAPP || 'claude-haiku-5-5',
      max_tokens: 600,
      system: sistema(u, hoy, clientes),
      tools: HERRAMIENTAS,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: texto }],
    }),
  }, { idempotente: true, timeoutMs: 20000 });
  const uso = (d.content || []).find((c) => c.type === 'tool_use');
  if (uso?.name === 'preparar_factura' && uso.input?.cliente && uso.input?.lineas?.length) return { pedido: uso.input };
  return { texto: uso?.input?.texto || 'No te he entendido. Prueba con algo como: «Factura a Bar Pepe de 300 € por la sesión del sábado».' };
}

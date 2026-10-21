// Fisquo por WhatsApp: la IA conversa e interpreta. Nunca emite por sí sola: elige una acción y el servidor la aplica
// (y solo se emite el borrador que la persona ya ha visto). Modelo pequeño por defecto; ANTHROPIC_MODEL_WHATSAPP para cambiarlo.
import { proveedorJSON } from './llamadas.js';

const LINEAS = {
  type: 'array',
  description: 'Todas las líneas de la factura (si cambias una, devuelve la lista completa)',
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
};
const MENSAJE = { type: 'string', description: 'Frase breve y natural para acompañar (opcional), como la diría una persona' };
const DATOS_CLIENTE = {
  type: 'object',
  description: 'Solo los datos del cliente que cambian',
  properties: { nombre: { type: 'string' }, nif: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, pais: { type: 'string', description: 'Código de 2 letras si no es España' } },
};

const HERRAMIENTAS = [
  {
    name: 'preparar_factura',
    description: 'Empieza una factura nueva que la persona pide (sustituye al borrador anterior, si lo hay).',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre del cliente tal como lo escribe la persona' },
        lineas: LINEAS,
        fecha: { type: 'string', description: 'YYYY-MM-DD, solo si indica otra fecha distinta de hoy' },
        email: { type: 'string', description: 'Email al que enviarla, solo si lo escribe' },
        mensaje: MENSAJE,
      },
      required: ['cliente', 'lineas'],
    },
  },
  {
    name: 'cambiar_borrador',
    description: 'Corrige el borrador actual: datos del cliente (NIF, dirección…), otro cliente, líneas, importes, fecha o email. Pon solo lo que cambia.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: DATOS_CLIENTE,
        otroCliente: { type: 'string', description: 'Si la factura es para otro cliente distinto, su nombre' },
        lineas: LINEAS,
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        email: { type: 'string', description: 'Nuevo email, o cadena vacía para no enviarla' },
        mensaje: MENSAJE,
      },
    },
  },
  {
    name: 'emitir',
    description: 'La persona confirma CLARAMENTE el borrador tal como está (sí, adelante, perfecto, mándala…) sin pedir ningún cambio.',
    input_schema: { type: 'object', properties: { mensaje: MENSAJE } },
  },
  {
    name: 'cancelar',
    description: 'La persona no quiere emitir el borrador.',
    input_schema: { type: 'object', properties: { mensaje: MENSAJE } },
  },
  {
    name: 'responder',
    description: 'Contestar sin tocar nada: saludos, dudas, preguntas, o falta información para preparar la factura (pregúntala).',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
];

function sistema(u, { hoy, clientes, borrador }) {
  return `Eres Fisquo, el ayudante de facturas de ${u.empresaNombre || 'esta empresa'} por WhatsApp. Hoy es ${hoy}.
Habla como una persona cercana y profesional: tutea, frases cortas, sin tecnicismos ni tono de robot; algún emoji suelto está bien. Entiende el lenguaje coloquial, faltas de ortografía y mensajes a medias, y usa la conversación anterior para entender a qué se refiere.
Siempre usas una herramienta:
- preparar_factura para una factura nueva. Los importes son SIN IVA salvo que digan «con IVA», «total» o «en mano»: entonces calcula el precio sin IVA. Si no dicen concepto, usa uno razonable por el contexto o «Servicios profesionales».
- cambiar_borrador para cualquier corrección del borrador (NIF, dirección, nombre, importe, concepto, fecha, email, otro cliente). Un «sí, pero…» con cambios es un cambio, NO una confirmación.
- emitir solo si confirman el borrador sin cambios. Ante cualquier duda, pregunta con responder.
- cancelar si no lo quieren.
- responder para todo lo demás. De momento solo preparas facturas; los datos de su propia empresa se cambian en Ajustes de Fisquo, no por aquí.
No inventes NIF, direcciones ni emails.
Clientes guardados: ${clientes.slice(0, 200).join('; ') || 'ninguno'}.
${borrador ? `Borrador pendiente de confirmar (ya se lo has enseñado):\n${JSON.stringify(borrador)}` : 'No hay ningún borrador pendiente.'}`;
}

// historial: [{ role: 'user'|'assistant', content: string }] (últimos turnos). → { accion, datos, mensaje }
export async function conversar(u, texto, { historial = [], clientes = [], borrador = null, hoy }) {
  const { d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL_WHATSAPP || 'claude-haiku-5-5',
      max_tokens: 800,
      system: sistema(u, { hoy, clientes, borrador }),
      tools: HERRAMIENTAS,
      tool_choice: { type: 'any' },
      messages: [...historial, { role: 'user', content: texto }],
    }),
  }, { idempotente: true, timeoutMs: 20000 });
  return accionDe(d.content);
}

// Respuesta de la IA → acción comprobada (lo que no encaja acaba en «responder»).
export function accionDe(content) {
  const uso = (content || []).find((c) => c.type === 'tool_use');
  const i = uso?.input || {};
  const mensaje = typeof i.mensaje === 'string' ? i.mensaje.slice(0, 500) : '';
  if (uso?.name === 'preparar_factura' && i.cliente && i.lineas?.length) return { accion: 'preparar', datos: i, mensaje };
  if (uso?.name === 'cambiar_borrador') return { accion: 'cambiar', datos: i, mensaje };
  if (uso?.name === 'emitir') return { accion: 'emitir', mensaje };
  if (uso?.name === 'cancelar') return { accion: 'cancelar', mensaje };
  return { accion: 'responder', mensaje: String(i.texto || '').slice(0, 1000) || 'Perdona, no te he pillado 😅 ¿Me lo dices de otra forma? Por ejemplo: «hazle una factura a Bar Pepe de 300 € por la sesión del sábado».' };
}

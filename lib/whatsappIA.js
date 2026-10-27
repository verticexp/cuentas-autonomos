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
const TIPO = { type: 'string', enum: ['factura', 'presupuesto'], description: 'presupuesto si piden presupuesto, oferta o «cuánto le cobraría»; si no, factura' };
const ENTREGA = { type: 'string', enum: ['correo', 'whatsapp', 'ambos'], description: 'Solo si lo dicen: whatsapp si quieren el PDF aquí para enviarlo ellos («pásamelo», «déjamelo aquí», «ya se lo mando yo»); ambos si quieren las dos cosas; correo si quieren que se lo mandes tú al cliente' };
const MENSAJE = { type: 'string', description: 'Frase breve y natural para acompañar (opcional), como la diría una persona' };
const DATOS_CLIENTE = {
  type: 'object',
  description: 'Solo los datos del cliente que cambian',
  properties: { nombre: { type: 'string' }, nif: { type: 'string' }, direccion: { type: 'string' }, ciudad: { type: 'string' }, pais: { type: 'string', description: 'Código de 2 letras si no es España' } },
};

const HERRAMIENTAS = [
  {
    name: 'preparar_factura',
    description: 'Empieza una factura o un presupuesto nuevo (sustituye al borrador anterior, si lo hay).',
    input_schema: {
      type: 'object',
      properties: {
        tipo: TIPO,
        cliente: { type: 'string', description: 'Nombre del cliente tal como lo escribe la persona' },
        lineas: LINEAS,
        fecha: { type: 'string', description: 'YYYY-MM-DD, solo si indica otra fecha distinta de hoy' },
        email: { type: 'string', description: 'Email al que enviarla, solo si lo escribe' },
        validez: { type: 'number', description: 'Presupuesto: días de validez, solo si los dicen' },
        entrega: ENTREGA,
        mensaje: MENSAJE,
      },
      required: ['tipo', 'cliente', 'lineas'],
    },
  },
  {
    name: 'cambiar_borrador',
    description: 'Corrige el borrador actual: datos del cliente (NIF, dirección…), otro cliente, líneas, importes, fecha, email, validez, cómo se entrega (correo al cliente o PDF por aquí) o pasarlo de factura a presupuesto (o al revés). Pon solo lo que cambia.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: TIPO,
        validez: { type: 'number', description: 'Días de validez del presupuesto' },
        entrega: ENTREGA,
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
    description: 'La persona confirma CLARAMENTE el borrador tal como está (sí, adelante, perfecto, mándala, hazlo…) sin pedir ningún cambio.',
    input_schema: { type: 'object', properties: { mensaje: MENSAJE } },
  },
  {
    name: 'cancelar',
    description: 'La persona no quiere emitir el borrador.',
    input_schema: { type: 'object', properties: { mensaje: MENSAJE } },
  },
  {
    name: 'consultar',
    description: 'Pregunta sobre sus cuentas: lo facturado, quién le debe, facturas pendientes o vencidas, gastos, impuestos del trimestre (IVA, IRPF), tesorería, clientes, nóminas. Las cifras las calcula Fisquo.',
    input_schema: {
      type: 'object',
      properties: { pregunta: { type: 'string', description: 'La pregunta completa y sin ambigüedades, con lo que haga falta de la conversación (cliente, periodo…)' } },
      required: ['pregunta'],
    },
  },
  {
    name: 'cambiar_gasto',
    description: 'Corrige el gasto leído de una foto que está pendiente de confirmar. Pon solo lo que cambia.',
    input_schema: {
      type: 'object',
      properties: {
        proveedor: { type: 'string' },
        concepto: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        base: { type: 'number', description: 'Base imponible SIN IVA en euros' },
        ivaPct: { type: 'number' },
        pendiente: { type: 'boolean', description: 'true si aún no lo ha pagado' },
        mensaje: MENSAJE,
      },
    },
  },
  {
    name: 'responder',
    description: 'Contestar sin tocar nada: saludos, dudas, preguntas, o falta información para preparar el documento (pregúntala).',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
];

function sistema(u, { hoy, clientes, borrador }) {
  return `Eres Fisquo, el ayudante de ${u.empresaNombre || 'esta empresa'} por WhatsApp: prepara facturas y presupuestos, apunta gastos de fotos de tickets y responde preguntas sobre sus cuentas. Hoy es ${hoy}.
Habla como una persona cercana y profesional: tutea, frases cortas, sin tecnicismos ni tono de robot; algún emoji suelto está bien. Entiende el lenguaje coloquial, faltas de ortografía y mensajes a medias (muchos vienen de notas de voz transcritas, con alguna palabra mal entendida), y usa la conversación anterior para entender a qué se refiere.
Siempre usas una herramienta:
- preparar_factura para una factura o un presupuesto nuevo (indica el tipo). Los importes son SIN IVA salvo que digan «con IVA», «total» o «en mano»: entonces calcula el precio sin IVA. Si no dicen concepto, usa uno razonable por el contexto o «Servicios profesionales».
- cambiar_borrador para cualquier corrección del borrador (NIF, dirección, nombre, importe, concepto, fecha, email, otro cliente). Un «sí, pero…» con cambios es un cambio, NO una confirmación.
- emitir solo si confirman el borrador sin cambios. Ante cualquier duda, pregunta con responder.
- cancelar si no lo quieren.
- consultar para cualquier pregunta sobre sus números (facturado, pendiente de cobro, gastos, IVA o IRPF del trimestre, tesorería…). Nunca contestes cifras de memoria: usa consultar.
- cambiar_gasto si hay un gasto de una foto pendiente y corrigen algo (importe, fecha, proveedor, concepto, IVA, si está pagado). Con un gasto pendiente, «sí» es emitir (apuntarlo) y «no» es cancelar.
- responder para todo lo demás. Si quieren apuntar un gasto, que te manden una foto del ticket o de la factura. Los datos de su propia empresa se cambian en Ajustes de Fisquo, no por aquí.
Por defecto el documento se manda al cliente por correo si hay email; si la persona prefiere enviarlo ella («pásamelo por aquí», «ya se lo mando yo»), se le da el PDF por WhatsApp (entrega).
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
  if (uso?.name === 'preparar_factura' && i.cliente && i.lineas?.length) return { accion: 'preparar', datos: { ...i, tipo: i.tipo === 'presupuesto' ? 'presupuesto' : 'factura' }, mensaje };
  if (uso?.name === 'cambiar_borrador') return { accion: 'cambiar', datos: i, mensaje };
  if (uso?.name === 'consultar' && String(i.pregunta || '').trim()) return { accion: 'consultar', datos: { pregunta: String(i.pregunta).trim().slice(0, 500) }, mensaje };
  if (uso?.name === 'cambiar_gasto') return { accion: 'cambiar_gasto', datos: i, mensaje };
  if (uso?.name === 'emitir') return { accion: 'emitir', mensaje };
  if (uso?.name === 'cancelar') return { accion: 'cancelar', mensaje };
  return { accion: 'responder', mensaje: String(i.texto || '').slice(0, 1000) || 'Perdona, no te he pillado 😅 ¿Me lo dices de otra forma? Por ejemplo: «hazle una factura a Bar Pepe de 300 € por la sesión del sábado».' };
}

// Fisquo por WhatsApp: la IA conversa e interpreta. Nunca emite por sí sola: elige una acción y el servidor la aplica
// (y solo se emite el borrador que la persona ya ha visto). Si solo hay que hablar, contesta con texto (tool_choice auto).
// Sonnet por defecto, para que converse con naturalidad (~1-2 céntimos por mensaje); ANTHROPIC_MODEL_WHATSAPP para cambiarlo.
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
];

function sistema(u, { hoy, clientes, borrador }) {
  const nombre = String(u.nombre || '').split(' ')[0];
  return `Eres Fisquo, el ayudante de ${u.empresaNombre || 'esta empresa'} por WhatsApp. Hablas con ${nombre || 'la persona que lleva las cuentas'}. Hoy es ${hoy}.
Qué sabes hacer: preparar facturas y presupuestos (y enviarlos), apuntar gastos de fotos de tickets, y responder preguntas sobre sus cuentas.

Cómo hablas:
- Como una persona de confianza que le lleva los papeles: cercano, natural, con sentido del humor si viene a cuento. Tutea. Adapta tu tono al suyo: si escribe escueto, sé escueto; si charla, charla un poco.
- Frases cortas, como en un chat. Nada de listas, encabezados ni frases de manual («Estoy aquí para ayudarte», «¿En qué más puedo ayudarte?»). Varía cómo dices las cosas: no repitas siempre la misma fórmula. Algún emoji suelto, sin pasarte.
- Si te saluda o te cuenta algo que no es de trabajo, contesta con naturalidad y, si encaja, lleva la conversación a lo que puedes hacer, sin forzarlo.
- Entiende lo coloquial, las faltas, los mensajes a medias y las notas de voz transcritas (puede haber palabras mal entendidas: interpreta con sentido común). Usa la conversación anterior: «a ese», «lo de antes», «el mismo de la otra vez».
- Si algo no está claro o falta un dato importante (para quién, cuánto, si el importe lleva IVA cuando no se sabe, qué periodo), PREGUNTA en una frase en vez de suponer. Si es un detalle menor y razonable, decide tú y dilo («te pongo "Servicios profesionales" como concepto, ¿vale?»).
- Si no puedes hacer algo, dilo claro y propón la alternativa (por ejemplo, hacerlo desde la app).
- Nunca te inventes cifras, NIF, direcciones ni emails. Las cifras de sus cuentas siempre con consultar.

Cuándo usar herramientas (si solo hay que hablar, contesta con texto, sin herramienta):
- preparar_factura: una factura o presupuesto nuevo con cliente e importe claros. Los importes son SIN IVA salvo que digan «con IVA», «total» o «en mano»: entonces calcula el precio sin IVA. Si no dicen concepto, uno razonable por el contexto.
- cambiar_borrador: cualquier corrección del borrador de factura o presupuesto. Un «sí, pero…» con cambios es un cambio, NO una confirmación.
- emitir: solo si confirman sin cambios el borrador pendiente (factura, presupuesto o gasto). Si dudas, pregunta.
- cancelar: si no lo quieren.
- consultar: cualquier pregunta sobre sus números (facturado, quién debe, gastos, IVA o IRPF del trimestre, tesorería…). Reescribe la pregunta completa con lo que haga falta de la conversación.
- cambiar_gasto: correcciones del gasto de una foto pendiente de confirmar.
En el campo «mensaje» de las herramientas pon, si aporta algo, una frase breve y natural que acompañe (no repitas el resumen, que ya lo añade Fisquo).
Para apuntar un gasto, que te manden la foto del ticket o el PDF. Los datos de su propia empresa se cambian en Ajustes de Fisquo, no por aquí. Por defecto el documento se manda al cliente por correo si tiene email; si prefiere enviarlo él («pásamelo», «ya se lo mando yo»), se le da el PDF por aquí (entrega).

Clientes guardados: ${clientes.slice(0, 200).join('; ') || 'ninguno'}.
${borrador ? `Pendiente de confirmar (ya se lo has enseñado):\n${JSON.stringify(borrador)}` : 'No hay nada pendiente de confirmar.'}`;
}

// historial: [{ role: 'user'|'assistant', content: string }] (últimos turnos). → { accion, datos, mensaje }
export async function conversar(u, texto, { historial = [], clientes = [], borrador = null, hoy }) {
  const { d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL_WHATSAPP || 'claude-sonnet-5-5',
      max_tokens: 900,
      system: sistema(u, { hoy, clientes, borrador }),
      tools: HERRAMIENTAS,
      // auto: si solo hay que hablar (saludar, preguntar una duda, explicar), contesta con texto.
      tool_choice: { type: 'auto' },
      messages: [...historial, { role: 'user', content: texto }],
    }),
  }, { idempotente: true, timeoutMs: 20000 });
  return accionDe(d.content);
}

// Respuesta de la IA → acción comprobada (lo que no encaja acaba en «responder»).
export function accionDe(content) {
  const uso = (content || []).find((c) => c.type === 'tool_use');
  const i = uso?.input || {};
  // Lo que escribe en texto: la respuesta cuando no usa herramienta, o la frase que acompaña a la acción.
  const texto = (content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const mensaje = (typeof i.mensaje === 'string' && i.mensaje.trim() ? i.mensaje : texto).slice(0, 500);
  if (uso?.name === 'preparar_factura' && i.cliente && i.lineas?.length) return { accion: 'preparar', datos: { ...i, tipo: i.tipo === 'presupuesto' ? 'presupuesto' : 'factura' }, mensaje };
  if (uso?.name === 'cambiar_borrador') return { accion: 'cambiar', datos: i, mensaje };
  if (uso?.name === 'consultar' && String(i.pregunta || '').trim()) return { accion: 'consultar', datos: { pregunta: String(i.pregunta).trim().slice(0, 500) }, mensaje };
  if (uso?.name === 'cambiar_gasto') return { accion: 'cambiar_gasto', datos: i, mensaje };
  if (uso?.name === 'emitir') return { accion: 'emitir', mensaje };
  if (uso?.name === 'cancelar') return { accion: 'cancelar', mensaje };
  return { accion: 'responder', mensaje: String(i.texto || texto || '').slice(0, 1500) || 'Perdona, no te he pillado 😅 ¿Me lo dices de otra forma?' };
}

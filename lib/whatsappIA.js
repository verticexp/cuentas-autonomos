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
      producto: { type: 'string', description: 'id del catálogo si la línea es uno de sus productos o servicios («3 sesiones de DJ», «4 metros de parquet»)' },
      concepto: { type: 'string', description: 'Con producto, puedes dejarlo vacío: se usa el nombre del catálogo' },
      cantidad: { type: 'number' },
      precio: { type: 'number', description: 'Precio unitario SIN IVA en euros. Con producto, solo si dice otro precio distinto del catálogo' },
      ivaPct: { type: 'number', description: 'Solo si la persona indica un tipo de IVA' },
    },
    required: ['cantidad'],
  },
};
const TIPO = { type: 'string', enum: ['factura', 'presupuesto'], description: 'presupuesto si piden presupuesto, oferta o «cuánto le cobraría»; si no, factura' };
const ENTREGA = { type: 'string', enum: ['correo', 'whatsapp', 'ambos'], description: 'Solo si lo dicen: whatsapp si quieren el PDF aquí para enviarlo ellos («pásamelo», «déjamelo aquí», «ya se lo mando yo»); ambos si quieren las dos cosas; correo si quieren que se lo mandes tú al cliente' };
const MENSAJE = { type: 'string', description: 'Frase corta y natural con la que empiezas, justo antes del resumen que añade Fisquo (p. ej. «Hecho, mira cómo queda:», «Cambiado, ahora sí:»). Sin repetir datos ni cifras.' };
const DIRECCION = { type: 'string', description: 'Solo calle, número, piso y puerta («C/ Major 12, 3º 2ª»). Sin código postal ni población' };
const CIUDAD = { type: 'string', description: 'Código postal y población, en ese orden («08301 Mataró»). El código postal (5 cifras) va aquí, nunca en la dirección' };
const PAIS = { type: 'string', description: 'Código de 2 letras si no es España' };
const CONTACTO = { type: 'string', description: 'Persona con la que trata en ese cliente («Pepe»), si la nombra' };
const NUEVO = { type: 'boolean', description: 'true solo si la persona ha dicho que es un cliente nuevo (o te ha dado sus datos fiscales para darlo de alta)' };
const ALIAS = { type: 'string', description: 'Si la persona llamaba a este cliente de otra forma (p. ej. «Pepe» para «Restaurant Can Joan SL») y te acaba de aclarar que es este, cómo lo llamaba: Fisquo lo recordará para la próxima' };
const DATOS_CLIENTE = {
  type: 'object',
  description: 'Solo los datos del cliente que cambian',
  properties: { nombre: { type: 'string' }, nif: { type: 'string' }, direccion: DIRECCION, ciudad: CIUDAD, pais: PAIS },
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
        datosCliente: {
          type: 'object',
          description: 'Datos del cliente que da la persona en la conversación (NIF, dirección…). Ponlos aquí directamente, sin esperar a corregir el borrador',
          properties: { nif: { type: 'string' }, direccion: DIRECCION, ciudad: CIUDAD, pais: PAIS, contacto: CONTACTO },
        },
        nuevo: NUEVO,
        alias: ALIAS,
        repetir: { type: 'boolean', description: 'true si quiere lo mismo que la última vez a ese cliente («lo de siempre», «como la del mes pasado», «la misma de siempre»): Fisquo copia los conceptos y precios de su última factura. Si además cambia algo (otro precio, otra cantidad), pon las líneas completas tú.' },
        lineas: LINEAS,
        fecha: { type: 'string', description: 'YYYY-MM-DD, solo si indica otra fecha distinta de hoy' },
        email: { type: 'string', description: 'Email al que enviarla, solo si lo escribe' },
        validez: { type: 'number', description: 'Presupuesto: días de validez, solo si los dicen' },
        entrega: ENTREGA,
        mensaje: MENSAJE,
      },
      required: ['tipo', 'cliente'],
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
        nuevo: NUEVO,
        alias: ALIAS,
        lineas: LINEAS,
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        email: { type: 'string', description: 'Nuevo email, o cadena vacía para no enviarla' },
        mensaje: MENSAJE,
      },
    },
  },
  {
    name: 'emitir',
    description: 'La persona da el visto bueno al borrador (sí, adelante, perfecto, mándala, hazlo…). También si a la vez solo dice cómo entregarlo («sí, y pásamela a mí también», «sí, pero no se la mandes, ya se la paso yo», «vale, mándala a otro@correo.es»): eso no cambia el documento, así que se emite ya, con esa entrega o ese email, sin volver a preguntar.',
    input_schema: {
      type: 'object',
      properties: {
        entrega: ENTREGA,
        email: { type: 'string', description: 'Solo si da otro email para enviarlo' },
        mensaje: { type: 'string', description: 'Opcional y muy corto («¡Allá va!»). No digas si se ha enviado ni hables del PDF: eso lo cuenta Fisquo debajo según lo que haya pasado.' },
      },
    },
  },
  {
    name: 'cancelar',
    description: 'La persona no quiere emitir el borrador.',
    input_schema: { type: 'object', properties: { mensaje: MENSAJE } },
  },
  {
    name: 'documento',
    description: 'Algo sobre una factura o presupuesto que YA existe (no el borrador): marcar una factura como cobrada, mandarle al cliente un recordatorio de pago, reenviársela por correo, pasarle el PDF a la persona por aquí, o hacer la factura de un presupuesto aceptado. Identifícalo por número o por cliente.',
    input_schema: {
      type: 'object',
      properties: {
        que: { type: 'string', enum: ['cobrada', 'recordar', 'reenviar', 'pdf', 'facturar_presupuesto'], description: 'cobrada: «ya me ha pagado» · recordar: «recuérdale que me debe» · reenviar: mandársela otra vez al cliente por correo · pdf: «pásame la factura de…» · facturar_presupuesto: «el presupuesto de Ana está aceptado, hazle la factura»' },
        doc: { type: 'string', enum: ['factura', 'presupuesto'], description: 'presupuesto si habla de un presupuesto (también en facturar_presupuesto); si no, factura' },
        numero: { type: 'string', description: 'El número tal como lo dice, si lo dice («F2026-012», «la 12»)' },
        cliente: { type: 'string', description: 'El cliente, si lo dice' },
        email: { type: 'string', description: 'Solo para reenviar o recordar a otro email distinto del del cliente' },
        mensaje: MENSAJE,
      },
      required: ['que'],
    },
  },
  {
    name: 'guardar_cliente',
    description: 'Guardar (o actualizar) un cliente en sus clientes, sin hacer factura: «guárdame este cliente», o datos de un cliente (por ejemplo de una foto de tarjeta o de otra factura) cuando no hay factura en marcha ni se pide una. Si hay un borrador para ese cliente, usa cambiar_borrador en su lugar.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' }, nif: { type: 'string' }, direccion: DIRECCION, ciudad: CIUDAD, pais: PAIS, contacto: CONTACTO, email: { type: 'string' }, telefono: { type: 'string' }, mensaje: MENSAJE },
      required: ['nombre'],
    },
  },
  {
    name: 'apuntar_gasto',
    description: 'La foto o PDF que acaba de mandar es un ticket o una factura de un proveedor (un gasto suyo): Fisquo la lee y le enseña el gasto para confirmarlo.',
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

// El idioma del perfil de la persona (lib/i18n.js IDIOMAS_APP): la IA contesta en él, como los textos fijos de Fisquo.
const LENGUAS = { es: 'castellano', ca: 'catalán', en: 'inglés (británico)' };

function sistema(u, { hoy, clientes, borrador, idioma, catalogo = [] }) {
  const lengua = LENGUAS[idioma] || LENGUAS.es;
  const nombre = String(u.nombre || '').split(' ')[0];
  return `Eres Fisquo, el ayudante de ${u.empresaNombre || 'esta empresa'} por WhatsApp. Hablas con ${nombre || 'la persona que lleva las cuentas'}. Hoy es ${hoy}.
Qué sabes hacer: preparar facturas y presupuestos (y enviarlos), apuntar gastos de fotos de tickets, y responder preguntas sobre sus cuentas.

Cómo hablas:
- Siempre en ${lengua}, también si te escriben en otro idioma o los nombres son de otra lengua: lo que añade Fisquo debajo (resúmenes, avisos) va en ${lengua} y el mensaje no puede mezclar idiomas. Entiendes cualquier idioma, pero contestas en ${lengua}. Los campos de las herramientas que no son «mensaje» (conceptos, nombres, preguntas para consultar) pueden ir en el idioma que use la persona.
- Como una persona de confianza que le lleva los papeles: cercano, natural, con sentido del humor si viene a cuento. Tutea. Adapta tu tono al suyo: si escribe escueto, sé escueto; si charla, charla un poco.
- Frases cortas, como en un chat. Nada de listas, encabezados ni frases de manual («Estoy aquí para ayudarte», «¿En qué más puedo ayudarte?»). Varía cómo dices las cosas: no repitas siempre la misma fórmula. Algún emoji suelto, sin pasarte.
- Si te saluda o te cuenta algo que no es de trabajo, contesta con naturalidad y, si encaja, lleva la conversación a lo que puedes hacer, sin forzarlo.
- Entiende lo coloquial, las faltas, los mensajes a medias y las notas de voz transcritas (puede haber palabras mal entendidas: interpreta con sentido común). Usa la conversación anterior: «a ese», «lo de antes», «el mismo de la otra vez».
- Si algo no está claro o falta un dato importante (para quién, cuánto, si el importe lleva IVA cuando no se sabe, qué periodo), PREGUNTA en una frase en vez de suponer. Si es un detalle menor y razonable, decide tú y dilo («te pongo "Servicios profesionales" como concepto, ¿vale?»).
- Los clientes son empresas o personas, pero a menudo te hablará de la persona con la que trata («factura a Pepe»). En la lista de clientes verás su persona de contacto y cómo los llama: usa eso para saber cuál es y pon en «cliente» el nombre del cliente, no el de la persona. Si no sabes a qué cliente se refiere, PREGUNTA («¿Pepe de qué empresa? ¿Es alguno de tus clientes o es nuevo?») en vez de darlo de alta. Cuando te aclare cuál es, pon en «alias» cómo lo llamaba, para no volver a preguntar; si dice que es nuevo, nuevo: true.
- Datos de un cliente pegados de golpe (nombre, NIF, dirección, a veces copiados de una firma o de otra factura): sepáralos tú. NIF/CIF/NIE es la letra y cifras que lo identifican. En la dirección, la calle con número, piso y puerta van en «direccion»; el código postal (5 cifras, p. ej. 08301) y la población van juntos en «ciudad» («08301 Mataró»), aunque te los escriban en otro orden o separados. La provincia entre paréntesis solo si la dicen.
- Si no puedes hacer algo, dilo claro y propón la alternativa (por ejemplo, hacerlo desde la app).
- Nunca te inventes cifras, NIF, direcciones ni emails. Las cifras de sus cuentas siempre con consultar.

Cuándo usar herramientas (si solo hay que hablar, contesta con texto, sin herramienta):
- preparar_factura: una factura o presupuesto nuevo con cliente e importe claros. Si en la conversación ya te han dado NIF o dirección del cliente, van en datosCliente en la misma llamada. Los importes son SIN IVA salvo que digan «con IVA», «total» o «en mano»: entonces calcula el precio sin IVA. Si no dicen concepto, uno razonable por el contexto.
- cambiar_borrador: cualquier corrección de lo que pone el documento (cliente, sus datos, conceptos, importes, fecha, factura↔presupuesto). Un «sí, pero cámbiale…» es un cambio y se vuelve a enseñar.
- emitir: cuando dan el visto bueno al borrador pendiente (factura, presupuesto o gasto), aunque a la vez digan cómo entregarlo (también por aquí, solo por aquí, a otro email): no lo vuelvas a enseñar ni a preguntar, emite con esa entrega. Si de verdad no queda claro que quieran emitir, pregunta.
- cancelar: si no lo quieren.
- consultar: cualquier pregunta sobre sus números (facturado, quién debe, gastos, IVA o IRPF del trimestre, tesorería…). Reescribe la pregunta completa con lo que haga falta de la conversación.
- cambiar_gasto: correcciones del gasto de una foto pendiente de confirmar.
- documento: lo que se hace con facturas o presupuestos ya hechos (cobrada, recordatorio, reenviar, pásame el PDF, facturar un presupuesto). Si no sabes cuál es, pregunta.
- guardar_cliente: guardar o actualizar los datos de un cliente sin hacer factura.
- Si te mandan una foto o un PDF, míralo: si es un ticket o factura de un proveedor, apuntar_gasto; si son los datos de un cliente (tarjeta, firma de un correo, una factura que le hicieron a él, un pedido), úsalos para la factura que se está haciendo (cambiar_borrador o preparar_factura con datosCliente) o guárdalo con guardar_cliente si no hay ninguna; si no está claro qué quiere hacer con ello, pregunta.
En el campo «mensaje» de las herramientas pon la frase con la que empiezas, corta y natural, como en un chat («Hecho, mira:», «Cambiado, ahora sí»); varía. No repitas datos: el resumen lo añade Fisquo debajo.
Para apuntar un gasto, que te manden la foto del ticket o el PDF. Si te escriben en varios mensajes seguidos, te llegan juntos en uno: tómalos como un solo mensaje. Los datos de su propia empresa se cambian en Ajustes de Fisquo, no por aquí. Por defecto el documento se manda al cliente por correo si tiene email; si prefiere enviarlo él («pásamelo», «ya se lo mando yo»), se le da el PDF por aquí (entrega).

Catálogo (id · nombre · precio sin IVA · IVA · si es servicio): ${catalogo.slice(0, 150).join('; ') || 'vacío'}.
- Si lo que factura está en el catálogo (aunque lo diga de otra forma: «sesiones de DJ» → «Sesión DJ»), pon su id en «producto» y la cantidad; el precio y el IVA los pone Fisquo, salvo que diga otro precio. Si no está, línea normal con el precio que diga; si no dice precio, pregúntalo, y dile que no está en su catálogo.
Clientes guardados (entre paréntesis, su persona de contacto y cómo los llama): ${clientes.slice(0, 200).join('; ') || 'ninguno'}.
${borrador ? `Pendiente de confirmar (ya se lo has enseñado):\n${JSON.stringify(borrador)}` : 'No hay nada pendiente de confirmar.'}`;
}

// historial: [{ role: 'user'|'assistant', content: string }] (últimos turnos). → { accion, datos, mensaje }
// adjunto: { datos: Buffer, tipo: 'image/jpeg' | 'application/pdf' … } (la foto o PDF que acaba de mandar).
// catalogo: líneas de texto «id · nombre · precio · IVA» de sus productos y servicios.
export async function conversar(u, texto, { historial = [], clientes = [], borrador = null, hoy, adjunto, idioma, catalogo }) {
  const { d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL_WHATSAPP || 'claude-sonnet-5-5',
      max_tokens: 900,
      system: sistema(u, { hoy, clientes, borrador, idioma, catalogo }),
      tools: HERRAMIENTAS,
      // auto: si solo hay que hablar (saludar, preguntar una duda, explicar), contesta con texto.
      tool_choice: { type: 'auto' },
      // Turnos vacíos guardados antes de corregirlo (la API los rechaza).
      messages: [...historial.map((t) => (t.content ? t : { ...t, content: '(…)' })), { role: 'user', content: adjunto ? [bloqueAdjunto(adjunto), { type: 'text', text: texto || '(Te mando esto.)' }] : texto }],
    }),
  }, { idempotente: true, timeoutMs: 20000 });
  return accionDe(d.content);
}

const bloqueAdjunto = ({ datos, tipo }) => {
  const source = { type: 'base64', media_type: tipo, data: Buffer.from(datos).toString('base64') };
  return tipo === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
};

const QUE = ['cobrada', 'recordar', 'reenviar', 'pdf', 'facturar_presupuesto'];

// Respuesta de la IA → acción comprobada (lo que no encaja acaba en «responder»).
export function accionDe(content) {
  const uso = (content || []).find((c) => c.type === 'tool_use');
  const i = uso?.input || {};
  // Lo que escribe en texto: la respuesta cuando no usa herramienta, o la frase que acompaña a la acción.
  const texto = (content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const mensaje = (typeof i.mensaje === 'string' && i.mensaje.trim() ? i.mensaje : texto).slice(0, 500);
  if (uso?.name === 'preparar_factura' && i.cliente && (i.lineas?.length || i.repetir)) return { accion: 'preparar', datos: { ...i, tipo: i.tipo === 'presupuesto' ? 'presupuesto' : 'factura' }, mensaje };
  if (uso?.name === 'cambiar_borrador') return { accion: 'cambiar', datos: i, mensaje };
  if (uso?.name === 'consultar' && String(i.pregunta || '').trim()) return { accion: 'consultar', datos: { pregunta: String(i.pregunta).trim().slice(0, 500) }, mensaje };
  if (uso?.name === 'documento' && QUE.includes(i.que)) return { accion: 'documento', datos: { que: i.que, doc: i.doc === 'presupuesto' || i.que === 'facturar_presupuesto' ? 'presupuesto' : 'factura', ...['numero', 'cliente', 'email'].reduce((o, k) => (typeof i[k] === 'string' && i[k].trim() ? { ...o, [k]: i[k].trim().slice(0, 200) } : o), {}) }, mensaje };
  if (uso?.name === 'guardar_cliente' && String(i.nombre || '').trim()) return { accion: 'guardar_cliente', datos: i, mensaje };
  if (uso?.name === 'apuntar_gasto') return { accion: 'apuntar_gasto', mensaje };
  if (uso?.name === 'cambiar_gasto') return { accion: 'cambiar_gasto', datos: i, mensaje };
  if (uso?.name === 'emitir') return { accion: 'emitir', datos: { ...(['correo', 'whatsapp', 'ambos'].includes(i.entrega) ? { entrega: i.entrega } : {}), ...(typeof i.email === 'string' && i.email.trim() ? { email: i.email.trim().toLowerCase() } : {}) }, mensaje };
  if (uso?.name === 'cancelar') return { accion: 'cancelar', mensaje };
  return { accion: 'responder', mensaje: String(i.texto || texto || '').slice(0, 1500) || 'Perdona, no te he pillado 😅 ¿Me lo dices de otra forma?' };
}

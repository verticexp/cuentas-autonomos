// Fisquo por WhatsApp: un mensaje → borrador de factura → «SÍ» → se emite (y se envía si hay email).
// El borrador vive 30 minutos en whatsapp:borrador:<teléfono>; sin confirmar no se emite nada.
import { redis, leer } from './redis.js';
import { conEmpresa } from './auth.js';
import { puede } from './permisos.js';
import { soloLectura } from './planes.js';
import { usarFuncion } from './usoPlan.js';
import { actividadesDe, fiscalDe, usa303 } from './empresa.js';
import { crearFactura, limpiar } from './facturas.js';
import { enviarFactura } from './envio.js';
import { emailValido } from './email.js';
import { numeroFactura } from './calculos.js';
import { contarVentana } from './limite.js';
import { hoy } from './formato.js';
import { buscarCliente, cuerpoFactura, resumenBorrador, siNo, telefonosAutorizados } from './whatsapp.js';
import { interpretar } from './whatsappIA.js';

const BORRADOR_S = 30 * 60;
const POR_DIA = 40; // tope de mensajes por teléfono y día: limita el gasto en IA

const origen = () => (process.env.APP_URL || 'https://www.fisquo.com').replace(/\/$/, '');

// Usuario de la app detrás de un teléfono autorizado, con su empresa; null si no puede facturar por aquí.
async function usuarioDe(tel) {
  const id = telefonosAutorizados().get(tel);
  const base = id && (await redis.hget('usuarios', id));
  if (!base) return { texto: null };
  const u = await conEmpresa(base);
  if (!puede(u, 'facturar')) return { texto: 'Tu usuario no tiene permiso para crear facturas.' };
  if (soloLectura(u.plan)) return { texto: 'Tu prueba ha terminado: elige un plan en Fisquo para seguir facturando.' };
  if (await usarFuncion(u, 'asistente')) return { texto: 'Fisquo por WhatsApp va con el plan que incluye el asistente.' };
  return { u };
}

// Devuelve el texto de respuesta (o null si no hay que contestar: teléfono desconocido o repetido).
export async function atenderMensaje({ id, de, texto }) {
  // Meta reintenta los avisos: cada mensaje se atiende una vez.
  if (!(await redis.set(`whatsapp:msg:${id}`, 1, { nx: true, ex: 86400 }))) return null;
  const { u, texto: aviso } = await usuarioDe(de);
  if (!u) return aviso;
  if ((await contarVentana(`whatsapp:dia:${de}:${hoy()}`, 2 * 86400)) > POR_DIA) return `Has llegado a los ${POR_DIA} mensajes de hoy. Mañana más.`;

  const kb = `whatsapp:borrador:${de}`;
  const borrador = await redis.get(kb);
  const r = borrador && siNo(texto);
  if (r === 'no') { await redis.del(kb); return 'Hecho, no la emito.'; }
  if (r === 'si') { await redis.del(kb); return emitir(u, borrador, id); }

  const clientes = (await leer(u, 'clientes')) || [];
  const ia = await interpretar(u, texto, clientes.map((c) => c.nombre).filter(Boolean), hoy());
  if (!ia.pedido) return ia.texto;
  const { cliente: ficha, varios } = buscarCliente(clientes, ia.pedido.cliente);
  if (varios) return `Tengo varios clientes parecidos: ${varios.join(', ')}. ¿A cuál? Escríbemelo con el nombre completo.`;
  const actividad = actividadesDe(u)[0];
  const datos = limpiar(cuerpoFactura(ia.pedido, { ficha, actividad, hoy: hoy() }), actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { conRecargo: usa303(fiscalDe(u)) });
  if (datos.error) return `No puedo preparar la factura: ${datos.error}.`;
  const email = emailValido(ia.pedido.email || '') ? ia.pedido.email.toLowerCase() : ficha?.email || '';
  await redis.set(kb, { datos, email, nueva: !ficha }, { ex: BORRADOR_S });
  return `${ficha ? '' : `«${datos.cliente.nombre}» no está entre tus clientes: lo daré de alta sin NIF.\n`}${resumenBorrador(datos, email, u.emisor)}`;
}

async function emitir(u, { datos, email }, idMensaje) {
  const { factura: f, error: e } = await crearFactura(u, datos, { idem: `whatsapp:${idMensaje}`, ordenFechas: true });
  if (e) return `No la he podido emitir: ${e}`;
  const num = numeroFactura(f);
  if (!email) return `✅ Emitida la factura ${num}. Puedes enviarla desde Fisquo.`;
  const env = await enviarFactura(u, f, { para: email, origen: origen(), responderA: u.email }).catch((x) => ({ error: x.message }));
  return env.error ? `✅ Emitida la factura ${num}, pero no se ha podido enviar: ${env.error}` : `✅ Emitida la factura ${num} y enviada a ${email}.`;
}

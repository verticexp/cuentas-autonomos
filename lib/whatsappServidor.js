// Fisquo por WhatsApp: un mensaje (texto o nota de voz) → borrador de factura o presupuesto → «SÍ» → se emite.
// La factura se envía por correo si hay email; del presupuesto se devuelve el enlace para reenviarlo.
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
import { aplicarCambios, buscarCliente, cuerpoFactura, descargarMedia, resumenBorrador, siNo, telefonosAutorizados } from './whatsapp.js';
import { conversar } from './whatsappIA.js';
import { transcribir, transcripcionLista } from './transcripcion.js';
import { crearPresupuesto, datosPresupuesto } from './presupuestosServidor.js';
import { numeroPresupuesto } from './presupuestos.js';

const BORRADOR_S = 30 * 60;
const CHAT_S = 60 * 60; // la conversación reciente (para entender «cámbiale el NIF») se olvida a la hora
const TURNOS = 10;
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
export async function atenderMensaje({ id, de, texto, audio, otro }) {
  // Meta reintenta los avisos: cada mensaje se atiende una vez.
  if (!(await redis.set(`whatsapp:msg:${id}`, 1, { nx: true, ex: 86400 }))) return null;
  const { u, texto: aviso } = await usuarioDe(de);
  if (!u) return aviso;
  if ((await contarVentana(`whatsapp:dia:${de}:${hoy()}`, 2 * 86400)) > POR_DIA) return `Has llegado a los ${POR_DIA} mensajes de hoy. Mañana más.`;
  if (otro) return 'De momento entiendo mensajes de texto y notas de voz 🙂';
  // Nota de voz: se transcribe (solo para teléfonos autorizados, ya comprobado) y sigue como si fuera texto.
  let oido = '';
  if (audio) {
    if (!transcripcionLista()) return 'Aún no puedo escuchar audios. ¿Me lo escribes?';
    const m = await descargarMedia(audio);
    if (m.error) return 'Ese audio es demasiado largo para mí. ¿Me mandas uno más corto o me lo escribes?';
    texto = await transcribir(m.datos, m.tipo);
    if (!texto) return 'No he conseguido entender el audio 😅 ¿Me lo repites o me lo escribes?';
    oido = `🎙️ «${texto}»\n\n`;
  }

  const kb = `whatsapp:borrador:${de}`;
  const kc = `whatsapp:chat:${de}`;
  const [borrador, historial] = await Promise.all([redis.get(kb), redis.get(kc)]);
  const respuesta = await responderA(u, texto, { borrador, historial: Array.isArray(historial) ? historial : [], kb, idMensaje: id });
  const turnos = [...(Array.isArray(historial) ? historial : []), { role: 'user', content: texto }, { role: 'assistant', content: respuesta }].slice(-TURNOS);
  await redis.set(kc, turnos, { ex: CHAT_S });
  return oido + respuesta;
}

const con = (mensaje, resto) => (mensaje ? `${mensaje}\n\n${resto}` : resto);

async function responderA(u, texto, { borrador, historial, kb, idMensaje }) {
  // «sí» o «no» a secas: sin IA.
  const r = borrador && siNo(texto);
  if (r === 'no') { await redis.del(kb); return 'Vale, lo dejo 👍'; }
  if (r === 'si') return emitir(u, borrador, idMensaje, kb);

  const clientes = (await leer(u, 'clientes')) || [];
  const ia = await conversar(u, texto, { historial, clientes: clientes.map((c) => c.nombre).filter(Boolean), borrador: borrador && { tipo: borrador.tipo || 'factura', ...borrador.datos, email: borrador.email }, hoy: hoy() });
  const actividad = actividadesDe(u)[0];

  if (ia.accion === 'responder') return ia.mensaje;
  if (!borrador && ['cambiar', 'emitir', 'cancelar'].includes(ia.accion)) return 'Ahora mismo no tengo nada a medias. ¿Qué te preparo: una factura o un presupuesto? ¿Para quién y de cuánto?';
  if (ia.accion === 'cancelar') { await redis.del(kb); return ia.mensaje || 'Vale, lo dejo 👍'; }
  if (ia.accion === 'emitir') return con(ia.mensaje, await emitir(u, borrador, idMensaje, kb));

  let nuevo;
  if (ia.accion === 'preparar') {
    const { cliente: ficha, varios } = buscarCliente(clientes, ia.datos.cliente);
    if (varios) return `Tengo varios clientes que se parecen: ${varios.join(', ')}. ¿Cuál de ellos?`;
    const email = emailValido(ia.datos.email || '') ? ia.datos.email.toLowerCase() : ficha?.email || '';
    nuevo = { tipo: ia.datos.tipo, cuerpo: cuerpoFactura(ia.datos, { ficha, actividad, hoy: hoy() }), email, nueva: !ficha };
  } else {
    let ficha;
    if (ia.datos.otroCliente) {
      const b = buscarCliente(clientes, ia.datos.otroCliente);
      if (b.varios) return `Tengo varios clientes que se parecen: ${b.varios.join(', ')}. ¿Cuál de ellos?`;
      ficha = b.cliente;
    }
    if (typeof ia.datos.email === 'string' && ia.datos.email && !emailValido(ia.datos.email)) return `«${ia.datos.email}» no parece un email válido. ¿Me lo repites?`;
    const tipo = ['factura', 'presupuesto'].includes(ia.datos.tipo) ? ia.datos.tipo : borrador.tipo || 'factura';
    nuevo = { ...aplicarCambios(borrador, ia.datos, { ficha, actividad }), tipo, nueva: ia.datos.otroCliente ? !ficha : borrador.nueva };
  }
  const datos = nuevo.tipo === 'presupuesto'
    ? datosPresupuesto(u, nuevo.cuerpo)
    : limpiar(nuevo.cuerpo, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { conRecargo: usa303(fiscalDe(u)) });
  if (datos.error) {
    // El borrador anterior sigue valiendo: solo se descarta el cambio que no cuadra.
    return `Uy, así no me deja: ${datos.error.charAt(0).toLowerCase()}${datos.error.slice(1)}. ¿Lo revisamos?`;
  }
  await redis.set(kb, { ...nuevo, datos }, { ex: BORRADOR_S });
  const aviso = nuevo.nueva ? `«${datos.cliente.nombre}» no está entre tus clientes; lo guardo cuando lo cree.` : '';
  return con([ia.mensaje, aviso].filter(Boolean).join('\n'), resumenBorrador(datos, nuevo.email, u.emisor, nuevo.tipo));
}

// Si no se puede emitir, el borrador se queda para corregirlo; emitido, se borra.
async function emitir(u, borrador, idMensaje, kb) {
  if (borrador.tipo === 'presupuesto') {
    const p = await crearPresupuesto(u, borrador.datos);
    await redis.del(kb);
    return `✅ Hecho: presupuesto ${numeroPresupuesto(p)} creado. Reenvíale este enlace a ${p.cliente.nombre} para que lo vea y lo acepte:\n${origen()}/p/${p.token}`;
  }
  const { datos, email } = borrador;
  const { factura: f, error: e } = await crearFactura(u, datos, { idem: `whatsapp:${idMensaje}`, ordenFechas: true });
  if (!e) await redis.del(kb);
  if (e) return `No la he podido emitir: ${e}. Corrígeme lo que haga falta y lo intento otra vez.`;
  const num = numeroFactura(f);
  if (!email) return `✅ Hecho: factura ${num} emitida. Puedes enviarla desde Fisquo cuando quieras.`;
  const env = await enviarFactura(u, f, { para: email, origen: origen(), responderA: u.email }).catch((x) => ({ error: x.message }));
  return env.error ? `✅ Emitida la factura ${num}, pero no se ha podido enviar: ${env.error}` : `✅ Hecho: factura ${num} emitida y enviada a ${email}.`;
}

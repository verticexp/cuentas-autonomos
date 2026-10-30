// Fisquo por WhatsApp: un mensaje (texto o nota de voz) → borrador de factura o presupuesto → «SÍ» → se emite.
// Se entrega por correo al cliente, con el PDF por WhatsApp a la persona (para que lo reenvíe ella) o de las dos formas.
// El borrador vive 30 minutos en whatsapp:borrador:<teléfono>; sin confirmar no se emite nada.
import { redis, leer, leerUno } from './redis.js';
import { conEmpresa } from './auth.js';
import { puede } from './permisos.js';
import { planConFuncion, soloLectura, topeWhatsapp } from './planes.js';
import { usarFuncion } from './usoPlan.js';
import { actividadesDe, fiscalDe, limiteSimplificada, usaIgic, usa303 } from './empresa.js';
import { crearFactura, limpiar } from './facturas.js';
import { enviarFactura, enviarPresupuesto, nombrePdf } from './envio.js';
import { facturaPdf } from './pdf.js';
import { identidadDoc } from './documento.js';
import { emailValido } from './email.js';
import { importes, numeroFactura } from './calculos.js';
import { contarVentana, limiteEnvios } from './limite.js';
import { eur, hoy } from './formato.js';
import { aplicarCambios, buscarCliente, cambiarGasto, cuerpoFactura, descargarMedia, resumenGasto, enviarDocumento, entregaDe, resumenBorrador, siNo, telefonosAutorizados } from './whatsapp.js';
import { conversar } from './whatsappIA.js';
import { codigoEn, vincular, vinculoDe } from './whatsappVinculo.js';
import { aprobar, datosDe, recibirArchivo } from './bandejaServidor.js';
import { sinFuncion } from './planes.js';
import { preguntar } from './asistenteIA.js';
import { MAX_BYTES_IA } from './cuotasIA.js';
import { TIPOS_IGIC } from './igic.js';
import { TIPOS_IVA } from './validacion.js';
import { transcribir, transcripcionLista } from './transcripcion.js';
import { crearPresupuesto, datosPresupuesto } from './presupuestosServidor.js';
import { numeroPresupuesto } from './presupuestos.js';

const BORRADOR_S = 30 * 60;
const CHAT_S = 3 * 60 * 60; // la conversación reciente (para entender «cámbiale el NIF», «y el mes pasado?») se olvida a las 3 h
const TURNOS = 16; // 8 intercambios
const INTENTOS_HORA = 10; // códigos de conexión por teléfono y hora
const POR_DIA = 60; // tope de mensajes por teléfono y día: limita el gasto en IA (~1-2 céntimos cada uno)

// Documentos hechos por WhatsApp este mes (tope por plan en lib/planes.js topeWhatsapp).
const kDocs = (u) => `whatsapp:docs:${u.empresa}:${hoy().slice(0, 7)}`;
const docsDelMes = async (u) => Number(await redis.get(kDocs(u))) || 0;
const sinCupo = (u, tope) => `Este mes ya has hecho ${tope} documentos por WhatsApp, el máximo de tu plan. Puedes seguir desde Fisquo${u.plan?.nombre === 'Plus' ? '' : ' o pasar a un plan superior en Ajustes › Tu plan'}.`;

const origen = () => (process.env.APP_URL || 'https://www.fisquo.com').replace(/\/$/, '');

// Usuario de la app detrás de un teléfono autorizado, con su empresa; null si no puede facturar por aquí.
async function usuarioDe(tel) {
  // Lo normal: el teléfono que la persona conectó en Ajustes › WhatsApp (lib/whatsappVinculo.js), con la empresa con la
  // que lo conectó. WHATSAPP_TELEFONOS («34600…=email o id») queda para pruebas del administrador.
  const vinculo = await vinculoDe(tel);
  const quien = vinculo?.usuario || telefonosAutorizados().get(tel);
  const id = quien?.includes('@') ? await redis.hget('emails', quien.trim().toLowerCase()) : quien;
  const base = id && (await redis.hget('usuarios', id));
  if (!base) {
    console.warn(`[whatsapp] teléfono …${tel.slice(-3)} sin usuario: ${quien ? 'el usuario vinculado ya no existe' : 'no está conectado'}`);
    return { texto: null };
  }
  const u = await conEmpresa(base, vinculo?.empresa);
  // Si ya no pertenece a esa empresa, conEmpresa le da otra: entonces no se usa.
  if (vinculo?.empresa && u.empresa !== vinculo.empresa) return { texto: 'Ya no tienes acceso a la empresa con la que conectaste este WhatsApp. Vuelve a conectarlo desde Ajustes › WhatsApp.' };
  if (!puede(u, 'facturar') && !puede(u, 'gastar')) return { texto: 'Tu usuario no tiene permiso para crear facturas ni gastos.' };
  if (soloLectura(u.plan)) return { texto: 'Tu prueba ha terminado: elige un plan en Fisquo para seguir facturando.' };
  if (await usarFuncion(u, 'whatsapp')) {
    const p = planConFuncion(u.plan, 'whatsapp');
    return { texto: `Facturar por WhatsApp va en el plan ${p ? `${p.n} (${p.p} €/mes)` : 'superior'}. Puedes cambiarlo en Fisquo, en Ajustes › Tu plan 🙂` };
  }
  return { u };
}

// Devuelve el texto de respuesta (o null si no hay que contestar: teléfono desconocido o repetido).
export async function atenderMensaje({ id, de, texto, audio, archivo, otro }) {
  // Meta reintenta los avisos: cada mensaje se atiende una vez.
  if (!(await redis.set(`whatsapp:msg:${id}`, 1, { nx: true, ex: 86400 }))) return null;
  // Conectar el teléfono: el código que Fisquo enseña en Ajustes › WhatsApp. Con tope de intentos, para que no se
  // puedan probar códigos a ciegas.
  const codigo = codigoEn(texto);
  if (codigo) {
    if ((await contarVentana(`whatsapp:intentos:${de}`, 3600)) > INTENTOS_HORA) return 'Demasiados intentos. Espera una hora y genera un código nuevo en Ajustes › WhatsApp.';
    const v = await vincular(codigo, de);
    if (!v) return 'Ese código no vale o ha caducado. Genera uno nuevo en Fisquo, en Ajustes › WhatsApp.';
    const nombre = String((await redis.hget('usuarios', v.usuario))?.nombre || '').split(' ')[0];
    return `✅ ¡Listo${nombre ? `, ${nombre}` : ''}! Ya tienes Fisquo en WhatsApp.\n\nHáblame como a una persona, también con notas de voz:\n• «Hazle una factura a Bar Pepe de 300 € por la sesión del sábado»\n• «¿Quién me debe dinero?» o «¿cuánto IVA pago este trimestre?»\n• Mándame la foto de un ticket y lo apunto como gasto.`;
  }
  const { u, texto: aviso } = await usuarioDe(de);
  if (!u) return aviso;
  if ((await contarVentana(`whatsapp:dia:${de}:${hoy()}`, 2 * 86400)) > POR_DIA) return `Has llegado a los ${POR_DIA} mensajes de hoy. Mañana más.`;
  if (otro) return 'De momento entiendo mensajes de texto, notas de voz y fotos o PDF de tickets 🙂';
  if (archivo) {
    const r = await gastoDeFoto(u, archivo, de);
    await recordarTurno(de, '(foto de un ticket o factura de gasto)', r);
    return r;
  }
  // Nota de voz: se transcribe (solo para teléfonos autorizados, ya comprobado) y sigue como si fuera texto.
  if (audio) {
    if (!transcripcionLista()) return 'Aún no puedo escuchar audios. ¿Me lo escribes?';
    const m = await descargarMedia(audio);
    if (m.error) return 'Ese audio es demasiado largo para mí. ¿Me mandas uno más corto o me lo escribes?';
    texto = await transcribir(m.datos, m.tipo);
    if (!texto) return 'No he conseguido entender el audio 😅 ¿Me lo repites o me lo escribes?';
  }

  const kb = `whatsapp:borrador:${de}`;
  const kc = `whatsapp:chat:${de}`;
  const [borrador, historial] = await Promise.all([redis.get(kb), redis.get(kc)]);
  const respuesta = await responderA(u, texto, { borrador, historial: Array.isArray(historial) ? historial : [], kb, idMensaje: id, de });
  await recordarTurno(de, texto, respuesta, historial);
  return respuesta;
}

async function recordarTurno(de, texto, respuesta, historial) {
  const kc = `whatsapp:chat:${de}`;
  const antes = historial ?? (await redis.get(kc));
  const turnos = [...(Array.isArray(antes) ? antes : []), { role: 'user', content: texto }, { role: 'assistant', content: respuesta }].slice(-TURNOS);
  await redis.set(kc, turnos, { ex: CHAT_S });
}

// --- Gastos por foto: el archivo entra en la bandeja de facturas, se lee al momento y se apunta con «sí» ---

const ERROR_LECTURA = 'No he podido leerlo. Te lo dejo en la Bandeja de facturas de Fisquo para que lo apuntes desde ahí.';

async function gastoDeFoto(u, archivo, de) {
  if (!puede(u, 'gastar')) return 'Tu usuario no tiene permiso para apuntar gastos.';
  const m = await descargarMedia(archivo.id, MAX_BYTES_IA);
  if (m.error) return 'Es demasiado grande para leerlo (máx. 3 MB). Prueba con una foto o súbelo desde la app.';
  const r = await recibirArchivo(u, m.datos, { nombre: archivo.nombre, origen: 'whatsapp', por: u.id, leerYa: true });
  if (r.error) return r.error;
  const doc = await leerUno(u, 'bandeja', r.doc.id);
  if (!doc || doc.estado === 'aprobado') return '✅ Apuntado. Es de un proveedor de confianza, así que lo he guardado directamente.';
  if (r.repetido && doc.estado !== 'revisar') return 'Ese archivo ya lo tengo en tu Bandeja de facturas.';
  if (doc.estado === 'error') return `${doc.error || ERROR_LECTURA}`;
  if (doc.estado !== 'revisar') return 'Lo estoy leyendo. En un rato lo tienes en la Bandeja de facturas de Fisquo para revisarlo.';
  const duplicados = doc.duplicados || [];
  await redis.set(`whatsapp:borrador:${de}`, { tipo: 'gasto', bandeja: doc.id, propuesta: doc.propuesta, duplicados: duplicados.length }, { ex: BORRADOR_S });
  return resumenGasto(doc.propuesta, { duplicados });
}

const eurDe = (g) => eur(importes(g).total);

async function apuntarGasto(u, borrador, kb) {
  // El permiso se comprueba al confirmar, no solo al preparar: quitarlo vale al momento, también para borradores pendientes.
  if (!puede(u, 'gastar')) { await redis.del(kb); return 'Tu usuario no tiene permiso para apuntar gastos.'; }
  const doc = await leerUno(u, 'bandeja', borrador.bandeja);
  if (!doc || doc.estado === 'aprobado') { await redis.del(kb); return 'Ese gasto ya está apuntado.'; }
  // Si había uno parecido, ya se avisó en el resumen: el «sí» lo confirma.
  const r = await aprobar(u, doc.id, datosDe({ ...doc, propuesta: borrador.propuesta }), { duplicadoConfirmado: borrador.duplicados > 0 });
  if (r.error) return `No lo he podido apuntar: ${r.error}. Corrígeme lo que haga falta o revísalo en la Bandeja de facturas.`;
  await redis.del(kb);
  return `✅ Apuntado: ${r.gasto.proveedor || r.gasto.concepto}, ${eurDe(r.gasto)}.${r.aviso ? `\n${r.aviso}` : ''}`;
}

// --- Preguntas sobre las cuentas: el asistente de la app (lib/asistenteIA.js), con sus permisos y sus cifras comprobadas ---

async function consultar(u, pregunta) {
  const no = sinFuncion(u.plan, 'asistente');
  if (no) return no;
  try {
    const r = await preguntar(u, pregunta, [], hoy(), { canal: 'whatsapp' });
    return r.respuesta || 'No he encontrado la respuesta. Prueba a preguntármelo de otra forma.';
  } catch { return 'Ahora mismo no puedo consultar tus cuentas. Prueba en unos minutos.'; }
}

const tiposDe = (u) => (usaIgic(fiscalDe(u)) ? TIPOS_IGIC : TIPOS_IVA);

// Las mismas comprobaciones que el formulario de facturas (app/api/facturas/route.js).
const opcionesFactura = (f) => ({ igic: usaIgic(f), conRecargo: usa303(f) && !usaIgic(f), reagp: f.iva === 'reagp', limiteSimplificada: limiteSimplificada(f) });

const con = (mensaje, resto) => (mensaje ? `${mensaje}\n\n${resto}` : resto);

async function responderA(u, texto, { borrador, historial, kb, idMensaje, de }) {
  // «sí» o «no» a secas: sin IA.
  const gasto = borrador?.tipo === 'gasto';
  const r = borrador && siNo(texto);
  if (r === 'no') { await redis.del(kb); return gasto ? 'Vale, no lo apunto. Lo tienes en la Bandeja de facturas por si acaso 👍' : 'Vale, lo dejo 👍'; }
  if (r === 'si') return gasto ? apuntarGasto(u, borrador, kb) : emitir(u, borrador, { idMensaje, kb, de });

  const clientes = (await leer(u, 'clientes')) || [];
  const ia = await conversar(u, texto, { historial, clientes: clientes.map((c) => c.nombre).filter(Boolean), borrador: borrador && (gasto ? { tipo: 'gasto', ...borrador.propuesta } : { tipo: borrador.tipo || 'factura', ...borrador.datos, email: borrador.email, entrega: entregaDe(borrador.entrega, borrador.email) }), hoy: hoy() });
  const actividad = actividadesDe(u)[0];

  if (ia.accion === 'responder') return ia.mensaje;
  if (ia.accion === 'consultar') return await consultar(u, ia.datos.pregunta);
  if (gasto && ia.accion === 'cancelar') { await redis.del(kb); return ia.mensaje || 'Vale, no lo apunto. Lo tienes en la Bandeja de facturas por si acaso 👍'; }
  if (gasto && ia.accion === 'emitir') return con(ia.mensaje, await apuntarGasto(u, borrador, kb));
  if (ia.accion === 'cambiar_gasto') {
    if (!gasto) return 'Ahora mismo no tengo ningún gasto a medias. Mándame la foto del ticket y lo apunto.';
    const propuesta = cambiarGasto(borrador.propuesta, ia.datos);
    await redis.set(kb, { ...borrador, propuesta }, { ex: BORRADOR_S });
    return resumenGasto(propuesta, { duplicados: Array(borrador.duplicados || 0).fill(0), intro: ia.mensaje });
  }
  if (gasto && ia.accion === 'cambiar') return 'Ahora tengo un gasto a medias: dime qué cambio de él, o «no» para dejarlo, y luego seguimos con la factura.';
  if (['preparar', 'emitir', 'cambiar'].includes(ia.accion) && !puede(u, 'facturar')) return 'Tu usuario no tiene permiso para crear facturas.';
  if (!borrador && ['cambiar', 'emitir', 'cancelar'].includes(ia.accion)) return 'Ahora mismo no tengo nada a medias. ¿Qué te preparo: una factura o un presupuesto? ¿Para quién y de cuánto?';
  if (ia.accion === 'cancelar') { await redis.del(kb); return ia.mensaje || 'Vale, lo dejo 👍'; }
  if (ia.accion === 'emitir') return con(ia.mensaje, await emitir(u, borrador, { idMensaje, kb, de }));

  let nuevo;
  if (ia.accion === 'preparar') {
    const tope = topeWhatsapp(u.plan);
    if ((await docsDelMes(u)) >= tope) return sinCupo(u, tope);
    const { cliente: ficha, varios } = buscarCliente(clientes, ia.datos.cliente);
    if (varios) return `Tengo varios clientes que se parecen: ${varios.join(', ')}. ¿Cuál de ellos?`;
    const email = emailValido(ia.datos.email || '') ? ia.datos.email.toLowerCase() : ficha?.email || '';
    nuevo = { tipo: ia.datos.tipo, entrega: ia.datos.entrega, cuerpo: cuerpoFactura(ia.datos, { ficha, actividad, hoy: hoy(), tipos: tiposDe(u) }), email, nueva: !ficha };
  } else {
    let ficha;
    if (ia.datos.otroCliente) {
      const b = buscarCliente(clientes, ia.datos.otroCliente);
      if (b.varios) return `Tengo varios clientes que se parecen: ${b.varios.join(', ')}. ¿Cuál de ellos?`;
      ficha = b.cliente;
    }
    if (typeof ia.datos.email === 'string' && ia.datos.email && !emailValido(ia.datos.email)) return `«${ia.datos.email}» no parece un email válido. ¿Me lo repites?`;
    const tipo = ['factura', 'presupuesto'].includes(ia.datos.tipo) ? ia.datos.tipo : borrador.tipo || 'factura';
    nuevo = { ...aplicarCambios(borrador, ia.datos, { ficha, actividad, tipos: tiposDe(u) }), tipo, entrega: ia.datos.entrega || borrador.entrega, nueva: ia.datos.otroCliente ? !ficha : borrador.nueva };
  }
  const datos = nuevo.tipo === 'presupuesto'
    ? datosPresupuesto(u, nuevo.cuerpo)
    : limpiar(nuevo.cuerpo, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', opcionesFactura(fiscalDe(u)));
  if (datos.error) {
    // El borrador anterior sigue valiendo: solo se descarta el cambio que no cuadra.
    return `Uy, así no me deja: ${datos.error.charAt(0).toLowerCase()}${datos.error.slice(1)}. ¿Lo revisamos?`;
  }
  await redis.set(kb, { ...nuevo, datos }, { ex: BORRADOR_S });
  const aviso = nuevo.nueva ? `(${datos.cliente.nombre} es nuevo, lo guardo en tus clientes.)` : '';
  const resumen = resumenBorrador(datos, nuevo.email, u.emisor, nuevo.tipo, entregaDe(nuevo.entrega, nuevo.email), { intro: ia.mensaje || undefined });
  return aviso ? `${resumen}\n${aviso}` : resumen;
}

// Si no se puede emitir, el borrador se queda para corregirlo; emitido, se borra y se entrega como se haya pedido.
async function emitir(u, borrador, { idMensaje, kb, de }) {
  // El permiso se comprueba al confirmar, no solo al preparar: quitarlo vale al momento, también para borradores pendientes.
  if (!puede(u, 'facturar')) { await redis.del(kb); return 'Tu usuario no tiene permiso para crear facturas.'; }
  const { datos, email } = borrador;
  const tope = topeWhatsapp(u.plan);
  if ((await docsDelMes(u)) >= tope) return sinCupo(u, tope);
  const entrega = entregaDe(borrador.entrega, email);
  const pres = borrador.tipo === 'presupuesto';
  let doc;
  if (pres) doc = await crearPresupuesto(u, datos);
  else {
    const { factura: f, error: e } = await crearFactura(u, datos, { idem: `whatsapp:${idMensaje}`, ordenFechas: true });
    if (e) return `No la he podido emitir: ${e}. Corrígeme lo que haga falta y lo intento otra vez.`;
    doc = f;
  }
  await redis.del(kb);
  const k = kDocs(u);
  if ((await redis.incr(k)) === 1) await redis.expire(k, 40 * 86400);
  const num = pres ? numeroPresupuesto(doc) : numeroFactura(doc);
  const hecho = pres ? `✅ Hecho: presupuesto ${num} creado` : `✅ Hecho: factura ${num} emitida`;
  const partes = [];
  if (entrega !== 'whatsapp') {
    // Mismo tope diario de envíos que desde la app.
    const tope = await limiteEnvios(u);
    const env = tope ? { error: tope.error } : await (pres ? enviarPresupuesto : enviarFactura)(u, doc, { para: email, origen: origen(), responderA: u.email }).catch((x) => ({ error: x.message }));
    partes.push(env.error ? `pero no se ha podido enviar a ${email}: ${env.error}` : `y enviad${pres ? 'o' : 'a'} a ${email}`);
  }
  if (entrega !== 'correo') {
    const { emisor: e, marca } = pres ? { emisor: u.emisor || {}, marca: u.marca } : await identidadDoc(u, doc);
    const pdf = await facturaPdf(doc, e, marca, { presupuesto: pres });
    const enlace = pres ? `\nSi se lo reenvías, también puede verlo y aceptarlo aquí: ${origen()}/p/${doc.token}` : '';
    const ok = await enviarDocumento(de, pdf, nombrePdf(doc, pres), `${pres ? 'Presupuesto' : 'Factura'} ${num} para ${doc.cliente.nombre}`).catch(() => false);
    partes.push(ok ? `Te paso el PDF para que se ${pres ? 'lo' : 'la'} reenvíes 👇${enlace}` : 'No he podido mandarte el PDF por aquí; lo tienes en Fisquo.');
  }
  return [`${hecho}${partes[0] && entrega !== 'whatsapp' ? ` ${partes.shift()}` : ''}.`, ...partes].join('\n');
}

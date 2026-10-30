// Fisquo por WhatsApp: un mensaje (texto o nota de voz) → borrador de factura o presupuesto → «SÍ» → se emite.
// Se entrega por correo al cliente, con el PDF por WhatsApp a la persona (para que lo reenvíe ella) o de las dos formas.
// El borrador vive 30 minutos en whatsapp:borrador:<teléfono>; sin confirmar no se emite nada.
import { redis, leer, leerUno, guardar } from './redis.js';
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
import { eur, fechaCorta, hoy } from './formato.js';
import { aplicarCambios, avisarEscribiendo, buscarCliente, cambiarGasto, claveCliente, cuerpoFactura, descargarMedia, lineasDeUltima, resumenGasto, enviarDocumento, enviarTexto, entregaDe, separarDireccion, textoEmitido, resumenBorrador, siNo, telefonosAutorizados } from './whatsapp.js';
import { documento } from './whatsappDocs.js';
import { guardarCliente } from './tercerosServidor.js';
import { idCliente } from './terceros.js';
import { conversar } from './whatsappIA.js';
import { codigoEn, vincular, vinculoDe } from './whatsappVinculo.js';
import { aprobar, datosDe, recibirArchivo } from './bandejaServidor.js';
import { sinFuncion } from './planes.js';
import { preguntar } from './asistenteIA.js';
import { MAX_BYTES_IA } from './cuotasIA.js';
import { TIPOS_IGIC } from './igic.js';
import { TIPOS_IVA } from './validacion.js';
import { transcribir, transcripcionLista } from './transcripcion.js';
import { crearPresupuesto, datosPresupuesto, facturarPresupuesto, Ocupado } from './presupuestosServidor.js';
import { numeroPresupuesto } from './presupuestos.js';
import { traductorDe } from './textos/index.js';

const BORRADOR_S = 30 * 60;
const CHAT_S = 3 * 60 * 60; // la conversación reciente (para entender «cámbiale el NIF», «y el mes pasado?») se olvida a las 3 h
const TURNOS = 16; // 8 intercambios
const INTENTOS_HORA = 10; // códigos de conexión por teléfono y hora
const POR_DIA = 60; // tope de mensajes por teléfono y día: limita el gasto en IA (~1-2 céntimos cada uno)
// Mensajes seguidos («Factura a Pepe» · «C/ Major 12, Mataró» · «300 €»): se espera un poco por si llegan más y se
// contestan juntos, como haría una persona. Cada aviso de Meta espera; solo el último atiende la tanda.
const ESPERA_MS = Number(process.env.WHATSAPP_ESPERA_MS ?? 4000);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Cómo prefiere entregar los documentos de cada cliente (correo, por aquí o ambos), por empresa: se aprende al emitir.
const kEntrega = (u) => `whatsapp:entrega:${u.empresa || u.id}`;
// Cómo llama la persona a cada cliente («Pepe» → Restaurant Can Joan SL), por empresa: se aprende cuando lo aclara.
const kAlias = (u) => `whatsapp:alias:${u.empresa || u.id}`;
const NO_LO_CONOZCO = (u, nombre) => u.tr('No tengo a «{nombre}» entre tus clientes 🤔 ¿Es de alguna empresa que ya tengas (dime cuál) o es un cliente nuevo?', { nombre });

// Recuerda el otro nombre con el que la persona se refiere a un cliente (si no es el suyo).
async function aprender(u, alias, ficha) {
  const k = claveCliente(alias || '');
  if (k && ficha?.nombre && k !== claveCliente(ficha.nombre)) await redis.hset(kAlias(u), { [k]: ficha.nombre });
}

// Documentos hechos por WhatsApp este mes (tope por plan en lib/planes.js topeWhatsapp).
const kDocs = (u) => `whatsapp:docs:${u.empresa}:${hoy().slice(0, 7)}`;
const docsDelMes = async (u) => Number(await redis.get(kDocs(u))) || 0;
const sinCupo = (u, tope) => u.tr(u.plan?.nombre === 'Plus' ? 'Este mes ya has hecho {tope} documentos por WhatsApp, el máximo de tu plan. Puedes seguir desde Fisquo.' : 'Este mes ya has hecho {tope} documentos por WhatsApp, el máximo de tu plan. Puedes seguir desde Fisquo o pasar a un plan superior en Ajustes › Tu plan.', { tope });

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
  // Todo lo que dice Fisquo por aquí, en el idioma de su perfil (castellano, catalán o inglés).
  u.tr = traductorDe(base.idioma);
  // Si ya no pertenece a esa empresa, conEmpresa le da otra: entonces no se usa.
  if (vinculo?.empresa && u.empresa !== vinculo.empresa) return { texto: u.tr('Ya no tienes acceso a la empresa con la que conectaste este WhatsApp. Vuelve a conectarlo desde Ajustes › WhatsApp.') };
  if (!puede(u, 'facturar') && !puede(u, 'gastar')) return { texto: u.tr('Tu usuario no tiene permiso para crear facturas ni gastos.') };
  if (soloLectura(u.plan)) return { texto: u.tr('Tu prueba ha terminado: elige un plan en Fisquo para seguir facturando.') };
  if (await usarFuncion(u, 'whatsapp')) {
    const p = planConFuncion(u.plan, 'whatsapp');
    return { texto: p ? u.tr('Facturar por WhatsApp va en el plan {plan} ({precio} €/mes). Puedes cambiarlo en Fisquo, en Ajustes › Tu plan 🙂', { plan: p.n, precio: p.p }) : u.tr('Facturar por WhatsApp va en un plan superior. Puedes cambiarlo en Fisquo, en Ajustes › Tu plan 🙂') };
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
    // Aún no se sabe quién es: el idioma del usuario de este teléfono, si ya estaba conectado.
    const antes = await vinculoDe(de);
    const tr0 = traductorDe(antes?.usuario && (await redis.hget('usuarios', antes.usuario))?.idioma);
    if ((await contarVentana(`whatsapp:intentos:${de}`, 3600)) > INTENTOS_HORA) return tr0('Demasiados intentos. Espera una hora y genera un código nuevo en Ajustes › WhatsApp.');
    const v = await vincular(codigo, de);
    if (!v) return tr0('Ese código no vale o ha caducado. Genera uno nuevo en Fisquo, en Ajustes › WhatsApp.');
    const usuario = await redis.hget('usuarios', v.usuario);
    const tr = traductorDe(usuario?.idioma);
    const nombre = String(usuario?.nombre || '').split(' ')[0];
    return `${nombre ? tr('✅ ¡Listo, {nombre}! Ya tienes Fisquo en WhatsApp.', { nombre }) : tr('✅ ¡Listo! Ya tienes Fisquo en WhatsApp.')}\n\n${tr('Háblame como a una persona, también con notas de voz:')}\n• ${tr('«Hazle una factura a Bar Pepe de 300 € por la sesión del sábado»')}\n• ${tr('«¿Quién me debe dinero?» o «¿cuánto IVA pago este trimestre?»')}\n• ${tr('Mándame la foto de un ticket y lo apunto como gasto.')}`;
  }
  const { u, texto: aviso } = await usuarioDe(de);
  if (!u) return aviso;
  if ((await contarVentana(`whatsapp:dia:${de}:${hoy()}`, 2 * 86400)) > POR_DIA) return u.tr('Has llegado a los {n} mensajes de hoy. Mañana más.', { n: POR_DIA });
  if (otro) return u.tr('De momento entiendo mensajes de texto, notas de voz, fotos y PDF 🙂');
  avisarEscribiendo(id).catch(() => {});
  // Nota de voz: se transcribe (solo para teléfonos autorizados, ya comprobado) y sigue como si fuera texto.
  if (audio) {
    if (!transcripcionLista()) return u.tr('Aún no puedo escuchar audios. ¿Me lo escribes?');
    const m = await descargarMedia(audio);
    if (m.error) return u.tr('Ese audio es demasiado largo para mí. ¿Me mandas uno más corto o me lo escribes?');
    texto = await transcribir(m.datos, m.tipo);
    if (!texto) return u.tr('No he conseguido entender el audio 😅 ¿Me lo repites o me lo escribes?');
  }

  // A la cola y a esperar: si llega otro mensaje en este rato, lo atiende ese aviso (con todos juntos).
  const kq = `whatsapp:cola:${de}`;
  await redis.rpush(kq, { id, texto: texto || '', ...(archivo ? { archivo } : {}) });
  await redis.expire(kq, 300);
  await redis.set(`whatsapp:ultimo:${de}`, id, { ex: 300 });
  if (ESPERA_MS > 0) await esperar(ESPERA_MS);
  if ((await redis.get(`whatsapp:ultimo:${de}`)) !== id) return null;
  const tanda = (await redis.lpop(kq, 30)) || [];
  if (!tanda.length) return null;
  return atenderTanda(u, de, Array.isArray(tanda) ? tanda : [tanda]);
}

// Los mensajes seguidos de una persona, juntos: un solo texto y, como mucho, una foto o PDF que ve la IA. Varias fotos de
// golpe son tickets: van a la Bandeja de facturas.
async function atenderTanda(u, de, tanda) {
  const id = tanda.at(-1).id;
  const texto = tanda.map((m) => m.texto).filter(Boolean).join('\n');
  const archivos = tanda.map((m) => m.archivo).filter(Boolean);
  if (archivos.length > 1) {
    const r = await variosGastos(u, archivos);
    await recordarTurno(de, `(${archivos.length} fotos o PDF de tickets)${texto ? ` ${texto}` : ''}`, r);
    return r;
  }
  const archivo = archivos[0];
  let adjunto;
  if (archivo) {
    // Una factura electrónica (XML) solo puede ser un gasto; lo demás lo mira la IA (ticket, datos de un cliente…).
    if (/\.xml$/i.test(archivo.nombre)) return gastoDeFoto(u, archivo, de, {});
    const m = await descargarMedia(archivo.id, MAX_BYTES_IA);
    if (m.error) return u.tr('Es demasiado grande para leerlo (máx. 3 MB). Prueba con una foto o súbelo desde la app.');
    adjunto = { datos: m.datos, tipo: /^image\/(jpeg|png|gif|webp)$/.test(m.tipo) || m.tipo === 'application/pdf' ? m.tipo : 'image/jpeg' };
  }
  const kb = `whatsapp:borrador:${de}`;
  const kc = `whatsapp:chat:${de}`;
  const [borrador, historial] = await Promise.all([redis.get(kb), redis.get(kc)]);
  const respuesta = await responderA(u, texto, { borrador, historial: Array.isArray(historial) ? historial : [], kb, idMensaje: id, de, archivo, adjunto });
  await recordarTurno(de, archivo ? `(foto o PDF)${texto ? ` ${texto}` : ''}` : texto, respuesta, historial);
  return respuesta;
}

async function recordarTurno(de, texto, respuesta, historial) {
  const kc = `whatsapp:chat:${de}`;
  const antes = historial ?? (await redis.get(kc));
  // La API de la IA no admite turnos vacíos: cuando la respuesta ya salió por separado (texto y PDF), se apunta así.
  const turnos = [...(Array.isArray(antes) ? antes : []), { role: 'user', content: texto || '(…)' }, { role: 'assistant', content: respuesta || '(Te he mandado el mensaje y el PDF.)' }].slice(-TURNOS);
  await redis.set(kc, turnos, { ex: CHAT_S });
}

// --- Gastos por foto: el archivo entra en la bandeja de facturas, se lee al momento y se apunta con «sí» ---

const ERROR_LECTURA = 'No he podido leerlo. Te lo dejo en la Bandeja de facturas de Fisquo para que lo apuntes desde ahí.'; // se traduce al usarlo

// adjunto: el archivo ya descargado (si la IA ya lo ha mirado); intro: la frase de la IA antes del resumen.
async function gastoDeFoto(u, archivo, de, { adjunto, intro } = {}) {
  if (!puede(u, 'gastar')) return u.tr('Tu usuario no tiene permiso para apuntar gastos.');
  const m = adjunto || (await descargarMedia(archivo.id, MAX_BYTES_IA));
  if (m.error) return u.tr('Es demasiado grande para leerlo (máx. 3 MB). Prueba con una foto o súbelo desde la app.');
  const r = await recibirArchivo(u, m.datos, { nombre: archivo.nombre, origen: 'whatsapp', por: u.id, leerYa: true });
  if (r.error) return u.tr(r.error);
  const doc = await leerUno(u, 'bandeja', r.doc.id);
  if (!doc || doc.estado === 'aprobado') return u.tr('✅ Apuntado. Es de un proveedor de confianza, así que lo he guardado directamente.');
  if (r.repetido && doc.estado !== 'revisar') return u.tr('Ese archivo ya lo tengo en tu Bandeja de facturas.');
  if (doc.estado === 'error') return u.tr(doc.error || ERROR_LECTURA);
  if (doc.estado !== 'revisar') return u.tr('Lo estoy leyendo. En un rato lo tienes en la Bandeja de facturas de Fisquo para revisarlo.');
  const duplicados = doc.duplicados || [];
  await redis.set(`whatsapp:borrador:${de}`, { tipo: 'gasto', bandeja: doc.id, propuesta: doc.propuesta, duplicados: duplicados.length }, { ex: BORRADOR_S });
  return resumenGasto(doc.propuesta, { duplicados, intro, tr: u.tr });
}

// Varias fotos o PDF de golpe: se leen y se dejan en la Bandeja de facturas (los de proveedores de confianza se apuntan solos).
async function variosGastos(u, archivos) {
  if (!puede(u, 'gastar')) return u.tr('Tu usuario no tiene permiso para apuntar gastos.');
  const lineas = [];
  for (const a of archivos.slice(0, 10)) {
    const m = await descargarMedia(a.id, MAX_BYTES_IA);
    if (m.error) { lineas.push(`• ${a.nombre}: ${u.tr('demasiado grande para leerlo')}`); continue; }
    const r = await recibirArchivo(u, m.datos, { nombre: a.nombre, origen: 'whatsapp', por: u.id, leerYa: true });
    if (r.error) { lineas.push(`• ${u.tr(r.error)}`); continue; }
    const doc = await leerUno(u, 'bandeja', r.doc.id);
    const p = doc?.propuesta || {};
    const que = p.proveedor ? `${p.proveedor}${Number(p.base) ? `, ${eur(importes({ base: p.base, ivaPct: p.ivaPct }).total)}` : ''}` : a.nombre;
    lineas.push(`• ${que}${!doc || doc.estado === 'aprobado' ? ` ✅ ${u.tr('apuntado (proveedor de confianza)')}` : doc.estado === 'error' ? `: ${u.tr('no lo he podido leer')}` : ''}`);
  }
  return `${u.tr('Me han llegado {n}. Te los he dejado en la Bandeja de facturas:', { n: archivos.length })}\n${lineas.join('\n')}\n\n${u.tr('Revísalos desde ahí, o mándamelos de uno en uno y te los apunto por aquí.')}`;
}

const eurDe = (g) => eur(importes(g).total);

async function apuntarGasto(u, borrador, kb) {
  // El permiso se comprueba al confirmar, no solo al preparar: quitarlo vale al momento, también para borradores pendientes.
  if (!puede(u, 'gastar')) { await redis.del(kb); return u.tr('Tu usuario no tiene permiso para apuntar gastos.'); }
  const doc = await leerUno(u, 'bandeja', borrador.bandeja);
  if (!doc || doc.estado === 'aprobado') { await redis.del(kb); return u.tr('Ese gasto ya está apuntado.'); }
  // Si había uno parecido, ya se avisó en el resumen: el «sí» lo confirma.
  const r = await aprobar(u, doc.id, datosDe({ ...doc, propuesta: borrador.propuesta }), { duplicadoConfirmado: borrador.duplicados > 0 });
  if (r.error) return u.tr('No lo he podido apuntar: {error}. Corrígeme lo que haga falta o revísalo en la Bandeja de facturas.', { error: u.tr(r.error) });
  await redis.del(kb);
  return `${u.tr('✅ Apuntado: {que}, {total}.', { que: r.gasto.proveedor || r.gasto.concepto, total: eurDe(r.gasto) })}${r.aviso ? `\n${u.tr(r.aviso)}` : ''}`;
}

// --- Preguntas sobre las cuentas: el asistente de la app (lib/asistenteIA.js), con sus permisos y sus cifras comprobadas ---

async function consultar(u, pregunta) {
  const no = sinFuncion(u.plan, 'asistente');
  if (no) return u.tr(no);
  try {
    const r = await preguntar(u, pregunta, [], hoy(), { canal: 'whatsapp', idioma: u.idioma });
    return r.respuesta || u.tr('No he encontrado la respuesta. Prueba a preguntármelo de otra forma.');
  } catch { return u.tr('Ahora mismo no puedo consultar tus cuentas. Prueba en unos minutos.'); }
}

const tiposDe = (u) => (usaIgic(fiscalDe(u)) ? TIPOS_IGIC : TIPOS_IVA);

// Las mismas comprobaciones que el formulario de facturas (app/api/facturas/route.js).
const opcionesFactura = (f) => ({ igic: usaIgic(f), conRecargo: usa303(f) && !usaIgic(f), reagp: f.iva === 'reagp', limiteSimplificada: limiteSimplificada(f) });

const con = (mensaje, resto) => (mensaje ? `${mensaje}\n\n${resto}` : resto);

async function responderA(u, texto, { borrador, historial, kb, idMensaje, de, archivo, adjunto }) {
  // «sí» o «no» a secas: sin IA.
  const gasto = borrador?.tipo === 'gasto';
  const r = borrador && !adjunto && siNo(texto);
  if (r === 'no') { await redis.del(kb); return gasto ? u.tr('Vale, no lo apunto. Lo tienes en la Bandeja de facturas por si acaso 👍') : u.tr('Vale, lo dejo 👍'); }
  if (r === 'si') return gasto ? apuntarGasto(u, borrador, kb) : emitir(u, borrador, { idMensaje, kb, de });

  const [clientes, alias] = await Promise.all([leer(u, 'clientes').then((c) => c || []), redis.hgetall(kAlias(u)).then((a) => a || {})]);
  // Para la IA: «Restaurant Can Joan SL (Pepe; le llamas: el de Mataró)».
  const llamas = (nombre) => Object.entries(alias).filter(([, n]) => n === nombre).map(([k]) => k);
  const lista = clientes.filter((c) => c.nombre).map((c) => { const x = [c.contacto, ...llamas(c.nombre).map((k) => `le llamas: ${k}`)].filter(Boolean); return x.length ? `${c.nombre} (${x.join('; ')})` : c.nombre; });
  const ia = await conversar(u, texto, { historial, clientes: lista, idioma: u.idioma, borrador: borrador && (gasto ? { tipo: 'gasto', ...borrador.propuesta } : { tipo: borrador.tipo || 'factura', ...borrador.datos, email: borrador.email, entrega: entregaDe(borrador.entrega, borrador.email) }), hoy: hoy(), adjunto });
  const actividad = actividadesDe(u)[0];

  if (ia.accion === 'responder') return ia.mensaje;
  if (ia.accion === 'consultar') return await consultar(u, ia.datos.pregunta);
  if (ia.accion === 'apuntar_gasto') return archivo ? gastoDeFoto(u, archivo, de, { adjunto, intro: ia.mensaje || undefined }) : u.tr('Mándame la foto del ticket o el PDF y te lo apunto.');
  if (ia.accion === 'guardar_cliente') return guardarClienteChat(u, ia.datos, ia.mensaje);
  if (ia.accion === 'documento') {
    const r = await documento(u, ia.datos, { de, origen: origen(), intro: ia.mensaje });
    if (typeof r === 'string') return r;
    // La factura de un presupuesto: se enseña y se confirma como cualquier otra.
    return ensenar(u, r.borrador, { kb, intro: ia.mensaje || u.tr('Esta sería la factura del presupuesto {numero}:', { numero: r.numero }) });
  }
  if (gasto && ia.accion === 'cancelar') { await redis.del(kb); return ia.mensaje || u.tr('Vale, no lo apunto. Lo tienes en la Bandeja de facturas por si acaso 👍'); }
  if (gasto && ia.accion === 'emitir') return con(ia.mensaje, await apuntarGasto(u, borrador, kb));
  if (ia.accion === 'cambiar_gasto') {
    if (!gasto) return u.tr('Ahora mismo no tengo ningún gasto a medias. Mándame la foto del ticket y lo apunto.');
    const propuesta = cambiarGasto(borrador.propuesta, ia.datos);
    await redis.set(kb, { ...borrador, propuesta }, { ex: BORRADOR_S });
    return resumenGasto(propuesta, { duplicados: Array(borrador.duplicados || 0).fill(0), intro: ia.mensaje, tr: u.tr });
  }
  if (gasto && ia.accion === 'cambiar') return u.tr('Ahora tengo un gasto a medias: dime qué cambio de él, o «no» para dejarlo, y luego seguimos con la factura.');
  if (['preparar', 'emitir', 'cambiar'].includes(ia.accion) && !puede(u, 'facturar')) return u.tr('Tu usuario no tiene permiso para crear facturas.');
  if (!borrador && ['cambiar', 'emitir', 'cancelar'].includes(ia.accion)) return u.tr('Ahora mismo no tengo nada a medias. ¿Qué te preparo: una factura o un presupuesto? ¿Para quién y de cuánto?');
  if (ia.accion === 'cancelar') { await redis.del(kb); return ia.mensaje || u.tr('Vale, lo dejo 👍'); }
  if (borrador?.presupuesto && ia.accion === 'cambiar') {
    const solo = Object.keys(ia.datos).filter((k) => !['entrega', 'email', 'mensaje'].includes(k));
    if (solo.length) return u.tr('Esta factura sale tal cual del presupuesto. Si hay que cambiar algo, cambia antes el presupuesto en Fisquo, o dime «no» y te hago una factura aparte.');
  }
  if (ia.accion === 'emitir') {
    // «Sí, y pásamela a mí también»: el visto bueno con otra entrega u otro email, sin volver a enseñarla.
    const email = emailValido(ia.datos.email || '') ? ia.datos.email : borrador.email;
    return emitir(u, { ...borrador, email, entrega: ia.datos.entrega || borrador.entrega }, { idMensaje, kb, de, intro: ia.mensaje });
  }

  let nuevo;
  if (ia.accion === 'preparar') {
    const tope = topeWhatsapp(u.plan);
    if ((await docsDelMes(u)) >= tope) return sinCupo(u, tope);
    const { cliente: ficha, varios } = buscarCliente(clientes, ia.datos.cliente, alias);
    if (varios) return u.tr('Tengo varios clientes que se parecen: {lista}. ¿Cuál de ellos?', { lista: varios.join(', ') });
    // Un nombre que no es ningún cliente y sin datos fiscales: suele ser la persona de contacto de uno. Se pregunta en vez
    // de dar de alta a «Pepe».
    if (!ficha && !ia.datos.nuevo && !ia.datos.datosCliente?.nif) return NO_LO_CONOZCO(u, ia.datos.cliente);
    await aprender(u, ia.datos.alias, ficha);
    const email = emailValido(ia.datos.email || '') ? ia.datos.email.toLowerCase() : ficha?.email || '';
    let pedido = ia.datos;
    // «Lo de siempre»: los conceptos y precios de su última factura (si la IA no ha puesto ya las líneas cambiadas).
    if (pedido.repetir && !pedido.lineas?.length) {
      const nombre = ficha?.nombre || pedido.cliente;
      const ultima = lineasDeUltima(await leer(u, 'facturas'), nombre);
      if (!ultima) return u.tr('No tengo ninguna factura anterior a {nombre}. ¿Qué le pongo y de cuánto?', { nombre });
      pedido = { ...pedido, lineas: ultima.lineas };
      if (!ia.mensaje) ia.mensaje = u.tr('Igual que la {numero} del {fecha}:', { numero: ultima.numero, fecha: fechaCorta(ultima.fecha) });
    }
    // Si no dice cómo entregarla, como la última vez a ese cliente.
    const entrega = pedido.entrega || (ficha && (await redis.hget(kEntrega(u), claveCliente(ficha.nombre)))) || undefined;
    const contacto = String(pedido.datosCliente?.contacto || '').trim().slice(0, 80);
    nuevo = { tipo: pedido.tipo, entrega, cuerpo: cuerpoFactura(pedido, { ficha, actividad, hoy: hoy(), tipos: tiposDe(u) }), email, nueva: !ficha, ...(contacto && !ficha?.contacto ? { contacto } : {}) };
  } else {
    let ficha;
    if (ia.datos.otroCliente) {
      const b = buscarCliente(clientes, ia.datos.otroCliente, alias);
      if (b.varios) return u.tr('Tengo varios clientes que se parecen: {lista}. ¿Cuál de ellos?', { lista: b.varios.join(', ') });
      ficha = b.cliente;
      if (!ficha && !ia.datos.nuevo && !ia.datos.cliente?.nif) return NO_LO_CONOZCO(u, ia.datos.otroCliente);
      await aprender(u, ia.datos.alias, ficha);
    }
    if (typeof ia.datos.email === 'string' && ia.datos.email && !emailValido(ia.datos.email)) return u.tr('«{email}» no parece un email válido. ¿Me lo repites?', { email: ia.datos.email });
    const tipo = ['factura', 'presupuesto'].includes(ia.datos.tipo) ? ia.datos.tipo : borrador.tipo || 'factura';
    nuevo = { ...borrador, ...aplicarCambios(borrador, ia.datos, { ficha, actividad, tipos: tiposDe(u) }), tipo, entrega: ia.datos.entrega || borrador.entrega, nueva: ia.datos.otroCliente ? !ficha : borrador.nueva };
    delete nuevo.datos;
  }
  return ensenar(u, nuevo, { kb, intro: ia.mensaje });
}

// Comprueba el borrador como el formulario, lo guarda 30 minutos y lo enseña para confirmarlo.
async function ensenar(u, nuevo, { kb, intro }) {
  const datos = nuevo.tipo === 'presupuesto'
    ? datosPresupuesto(u, nuevo.cuerpo)
    : limpiar(nuevo.cuerpo, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', opcionesFactura(fiscalDe(u)));
  if (datos.error) {
    // El borrador anterior sigue valiendo: solo se descarta el cambio que no cuadra.
    const e = u.tr(datos.error);
    return u.tr('Uy, así no me deja: {error}. ¿Lo revisamos?', { error: `${e.charAt(0).toLowerCase()}${e.slice(1)}` });
  }
  await redis.set(kb, { ...nuevo, datos }, { ex: BORRADOR_S });
  const aviso = nuevo.nueva ? u.tr('({nombre} es nuevo, lo guardo en tus clientes.)', { nombre: datos.cliente.nombre }) : '';
  const resumen = resumenBorrador(datos, nuevo.email, u.emisor, nuevo.tipo, entregaDe(nuevo.entrega, nuevo.email), { intro: intro || undefined, tr: u.tr });
  return aviso ? `${resumen}\n${aviso}` : resumen;
}

// «Guárdame este cliente» (o sus datos de una foto, sin factura en marcha). Se guarda y se dice cómo ha quedado.
async function guardarClienteChat(u, d, intro) {
  if (!puede(u, 'facturar')) return u.tr('Tu usuario no tiene permiso para guardar clientes.');
  const texto = (k) => (typeof d[k] === 'string' ? d[k].trim().slice(0, 200) : '');
  const nombre = texto('nombre');
  const antes = buscarCliente((await leer(u, 'clientes')) || [], nombre).cliente;
  const c = separarDireccion({ ...(antes || {}), nombre: antes?.nombre || nombre, ...Object.fromEntries(['nif', 'direccion', 'ciudad', 'pais', 'telefono', 'contacto'].filter((k) => texto(k)).map((k) => [k, texto(k)])) });
  if (emailValido(texto('email'))) c.email = texto('email').toLowerCase();
  // Directo a la ficha: lo que dice ahora (también un contacto nuevo) manda sobre lo que tenía.
  await guardar(u, 'clientes', { ...c, id: idCliente(c.nombre) });
  const lineas = [`*${c.nombre}*${c.nif ? ` · ${c.nif}` : ''}`, [c.direccion, c.ciudad].filter(Boolean).join(', '), c.contacto && u.tr('Contacto: {nombre}', { nombre: c.contacto }), c.email].filter(Boolean);
  return `${intro || u.tr(antes ? 'Actualizado 👍' : 'Guardado en tus clientes 👍')}\n\n${lineas.join('\n')}\n\n${u.tr('Si algo no está bien, dímelo y lo cambio.')}`;
}

// Si no se puede emitir, el borrador se queda para corregirlo; emitido, se borra y se entrega como se haya pedido.
async function emitir(u, borrador, { idMensaje, kb, de, intro }) {
  // El permiso se comprueba al confirmar, no solo al preparar: quitarlo vale al momento, también para borradores pendientes.
  if (!puede(u, 'facturar')) { await redis.del(kb); return u.tr('Tu usuario no tiene permiso para crear facturas.'); }
  const { datos, email } = borrador;
  const tope = topeWhatsapp(u.plan);
  if ((await docsDelMes(u)) >= tope) return sinCupo(u, tope);
  const entrega = entregaDe(borrador.entrega, email);
  const pres = borrador.tipo === 'presupuesto';
  let doc;
  if (pres) doc = await crearPresupuesto(u, datos);
  else if (borrador.presupuesto) {
    // La factura de un presupuesto: la misma de la pantalla de presupuestos, que lo deja enlazado.
    const r = await facturarPresupuesto(u, borrador.presupuesto, 'resto', { ordenFechas: true }).catch((x) => (x instanceof Ocupado ? { error: x.message } : Promise.reject(x)));
    if (r.error) return u.tr('No la he podido emitir: {error}.', { error: u.tr(r.error) });
    doc = r.factura;
  } else {
    const { factura: f, error: e } = await crearFactura(u, datos, { idem: `whatsapp:${idMensaje}`, ordenFechas: true });
    if (e) return u.tr('No la he podido emitir: {error}. Corrígeme lo que haga falta y lo intento otra vez.', { error: u.tr(e) });
    doc = f;
  }
  await redis.del(kb);
  const k = kDocs(u);
  if ((await redis.incr(k)) === 1) await redis.expire(k, 40 * 86400);
  const num = pres ? numeroPresupuesto(doc) : numeroFactura(doc);
  // La persona de contacto que dijo al hacerla, a la ficha (si aún no tenía).
  if (borrador.contacto) {
    const ficha = await leerUno(u, 'clientes', idCliente(doc.cliente.nombre));
    if (ficha && !ficha.contacto) await guardarCliente(u, { ...ficha, contacto: borrador.contacto });
  }
  // Para la próxima vez a este cliente: cómo lo ha querido.
  if (borrador.entrega) await redis.hset(kEntrega(u), { [claveCliente(doc.cliente.nombre)]: borrador.entrega });
  let envio = null;
  if (entrega !== 'whatsapp') {
    // Mismo tope diario de envíos que desde la app.
    const tope = await limiteEnvios(u);
    const env = tope ? { error: tope.error } : await (pres ? enviarPresupuesto : enviarFactura)(u, doc, { para: email, origen: origen(), responderA: u.email }).catch((x) => ({ error: x.message }));
    envio = env.error ? { error: u.tr(env.error) } : { ok: true };
  }
  const texto = con(intro, textoEmitido({ pres, num, email, entrega, envio, enlace: pres ? `${origen()}/p/${doc.token}` : '', tr: u.tr }));
  if (entrega === 'correo') return texto;
  // Primero el texto y después el PDF, para que en el chat se lea en orden.
  await enviarTexto(de, texto);
  const { emisor: e, marca } = pres ? { emisor: u.emisor || {}, marca: u.marca } : await identidadDoc(u, doc);
  const pdf = await facturaPdf(doc, e, marca, { presupuesto: pres });
  const ok = await enviarDocumento(de, pdf, nombrePdf(doc, pres), `${u.tr(pres ? 'Presupuesto' : 'Factura')} ${num} · ${doc.cliente.nombre}`).catch(() => false);
  return ok ? '' : u.tr('No he podido mandarte el PDF por aquí; lo tienes en Fisquo.');
}

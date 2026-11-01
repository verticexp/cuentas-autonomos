// Fisquo por WhatsApp (prueba técnica): lo que no depende de la base de datos ni de la IA.
// Variables en Vercel: WHATSAPP_TOKEN y WHATSAPP_PHONE_ID (Cloud API de Meta), WHATSAPP_APP_SECRET (firma de los avisos),
// WHATSAPP_VERIFY_TOKEN (alta del webhook) y WHATSAPP_TELEFONOS («34600111222=email@de.acceso,…» o con el id del usuario: quién puede usarlo).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { importes, numeroFactura, pendienteDe } from './calculos.js';
import { eur, fechaCorta } from './formato.js';
import { traductor } from './i18n.js';

// Sin traductor: castellano (lib/i18n.js; el del perfil de la persona con traductorDe).
const CASTELLANO = traductor(null);

export const whatsappListo = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_APP_SECRET);

// Meta firma el cuerpo tal cual llega: «X-Hub-Signature-256: sha256=<hex>» con el secreto de la app.
export function firmaValida(cuerpo, cabecera, secreto) {
  if (!secreto || !/^sha256=[a-f0-9]{64}$/.test(cabecera || '')) return false;
  const esperada = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('hex'));
  return timingSafeEqual(esperada, Buffer.from(cabecera.slice(7)));
}

export const normalizarTelefono = (t) => String(t || '').replace(/\D/g, '').replace(/^00/, '');

// «34600111222=u1,34611222333=ana@x.es» → Map(teléfono → id o email del usuario).
export function telefonosAutorizados(texto = process.env.WHATSAPP_TELEFONOS) {
  const m = new Map();
  for (const par of String(texto || '').split(',')) {
    const [t, id] = par.split('=').map((x) => x.trim());
    if (normalizarTelefono(t) && id) m.set(normalizarTelefono(t), id);
  }
  return m;
}

// Mensajes de un aviso de Meta: [{ id, de, texto }], [{ id, de, audio }] (notas de voz) o [{ id, de, archivo }] (foto o
// PDF de un gasto). Los estados (entregado, leído) se ignoran; lo demás llega como { otro: true }.
export function mensajesDe(aviso) {
  const out = [];
  for (const e of aviso?.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) {
    if (!m.id) continue;
    const base = { id: m.id, de: normalizarTelefono(m.from) };
    if (m.type === 'text' && m.text?.body) out.push({ ...base, texto: String(m.text.body).slice(0, 1000) });
    else if (m.type === 'audio' && m.audio?.id) out.push({ ...base, audio: String(m.audio.id) });
    // Foto o PDF de un ticket o factura de gasto: va a la bandeja de facturas (lib/bandejaServidor.js).
    else if (m.type === 'image' && m.image?.id) out.push({ ...base, archivo: { id: String(m.image.id), nombre: 'ticket-whatsapp.jpg' }, ...(m.image.caption ? { texto: String(m.image.caption).slice(0, 1000) } : {}) });
    else if (m.type === 'document' && m.document?.id && /pdf|xml|image\//i.test(m.document.mime_type || '')) out.push({ ...base, archivo: { id: String(m.document.id), nombre: String(m.document.filename || 'factura.pdf').slice(0, 120) }, ...(m.document.caption ? { texto: String(m.document.caption).slice(0, 1000) } : {}) });
    else out.push({ ...base, otro: true });
  }
  return out;
}

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`;
export const AUDIO_MAX = 8 * 1024 * 1024; // ~8 MB: varios minutos de nota de voz

// Descarga un archivo de WhatsApp: primero su dirección temporal y luego el contenido (ambas con el token).
export async function descargarMedia(id, max = AUDIO_MAX) {
  const auth = { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const r = await fetch(`${GRAPH()}/${encodeURIComponent(id)}`, { headers: auth, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`WhatsApp media ${r.status}`);
  const m = await r.json();
  if (Number(m.file_size) > max) return { error: 'grande' };
  const f = await fetch(m.url, { headers: auth, signal: AbortSignal.timeout(20000) });
  if (!f.ok) throw new Error(`WhatsApp descarga ${f.status}`);
  const datos = Buffer.from(await f.arrayBuffer());
  if (datos.length > max) return { error: 'grande' };
  return { datos, tipo: String(m.mime_type || 'audio/ogg').split(';')[0] };
}

const plano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Atajo sin IA para un «sí» o «no» a secas: 'si', 'no' o null. Con cualquier otra cosa («sí, pero cambia el NIF») decide
// la IA: así una confirmación con cambios no emite la factura sin ellos.
export function siNo(texto) {
  const t = plano(texto).replace(/[¡!¿?.,👍🙌✅\s]+/gu, ' ').trim();
  // También en catalán e inglés (d'acord, endavant, yes…).
  if (/^(si|sii+|s|vale|ok|okay|dale|adelante|perfecto|correcto|emitela|si emitela|si porfa|si por favor|d'acord|dacord|endavant|perfecte|si si us plau|yes|yep|yeah|sure|go ahead)$/.test(t)) return 'si';
  if (/^(no|n|cancela|cancelala|dejalo|nada|cancel·la|deixa-ho|deixa ho|res|nope|cancel)$/.test(t)) return 'no';
  return null;
}

// Ficha del cliente por el nombre que escribe la persona. { cliente } si hay una sola, { varios } si hay dudas, {} si ninguna.
const sinForma = (s) => plano(s).replace(/\b(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?|s\.?\s?c\.?|c\.?\s?b\.?)$/i, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
// También por la persona de contacto de la ficha («Pepe» → Can Joan SL) y por los nombres que la persona ya le ha
// enseñado a Fisquo por WhatsApp (alias: { clave del nombre → nombre del cliente }).
export function buscarCliente(clientes, nombre, alias = {}) {
  const q = sinForma(nombre);
  if (!q) return {};
  const lista = (clientes || []).filter((c) => c?.nombre);
  const exactos = lista.filter((c) => sinForma(c.nombre) === q);
  if (exactos.length === 1) return { cliente: exactos[0] };
  const aprendido = alias?.[q] && lista.find((c) => c.nombre === alias[q]);
  if (aprendido) return { cliente: aprendido };
  // «pepe» vale para el contacto «Pepe García»; el nombre del cliente, también a medias («apolo» → Sala Apolo).
  const porContacto = lista.filter((c) => { const k = sinForma(c.contacto); return k && (k === q || k.split(' ').includes(q)); });
  const porNombre = exactos.length ? exactos : lista.filter((c) => sinForma(c.nombre).includes(q) || q.includes(sinForma(c.nombre)));
  const parecidos = [...new Set([...porContacto, ...porNombre])];
  if (parecidos.length === 1) return { cliente: parecidos[0] };
  if (parecidos.length > 1) return { varios: parecidos.slice(0, 5).map((c) => (c.contacto && porContacto.includes(c) ? `${c.nombre} (${c.contacto})` : c.nombre)) };
  return {};
}

// Avisos de stock de un borrador: lo que pide cada producto con stock frente a lo que queda (inventario: { id → stock }).
// Solo avisa; la factura se puede emitir igual (el stock de la app puede no estar al día).
export function avisosStock(lineas = [], productos = [], stock = {}, tr = CASTELLANO) {
  const pide = {};
  for (const l of lineas) if (l.producto && Number(l.cantidad) > 0) pide[l.producto] = (pide[l.producto] || 0) + Number(l.cantidad);
  return Object.entries(pide).flatMap(([id, n]) => {
    const p = productos.find((x) => x.id === id);
    if (!p || p.servicio || !(id in stock)) return [];
    const queda = Math.round(Number(stock[id]) * 1000) / 1000;
    if (queda <= 0) return [tr('Ojo: {producto} está agotado según tu inventario.', { producto: p.nombre })];
    if (queda < n) return [tr('Ojo: de {producto} solo te quedan {n} según tu inventario.', { producto: p.nombre, n: String(queda).replace('.', ',') })];
    return [];
  });
}

// --- Documentos ya hechos: «la F-12», «la de Pepe», «la última de Ana» ---

// Clave para comparar nombres de cliente (sin acentos ni forma jurídica).
export const claveCliente = (nombre) => sinForma(nombre);
const reciente = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (Number(b.numero) || 0) - (Number(a.numero) || 0);
const cifras = (t) => String(t || '').replace(/\D+/g, '').replace(/^0+/, '');

// Busca una factura o presupuesto por número o por cliente. numero: como lo dice la persona («F-2026-012», «la 12»).
// pendientes: solo las que quedan por cobrar. → { doc } si está claro, { varios: [números] } si hay dudas, {} si ninguno.
// Por cliente sin número: si hay varias, la más reciente, salvo que se pidan pendientes (cobrar una que no era es peor).
export function elegirDocumento(docs, { numero, cliente } = {}, { pendientes = false, presupuesto = false } = {}) {
  const num = (d) => (presupuesto ? numeroFactura({ ...d, serie: 'P' }) : numeroFactura(d));
  let lista = (docs || []).filter(Boolean);
  if (pendientes) lista = lista.filter((d) => !d.cobrada && pendienteDe(d) > 0);
  if (cliente) {
    const q = sinForma(cliente);
    lista = lista.filter((d) => { const n = sinForma(d.cliente?.nombre); return n && (n === q || n.includes(q) || q.includes(n)); });
  }
  if (numero) {
    const q = plano(numero).replace(/\s+/g, '');
    const exacto = lista.filter((d) => plano(num(d)).replace(/\s+/g, '') === q);
    // «la 12»: el número sin serie ni año, si solo hay una que acabe así.
    const corto = exacto.length ? exacto : lista.filter((d) => cifras(d.numero) === cifras(numero) || cifras(num(d)).endsWith(cifras(numero).padStart(3, '0')));
    lista = corto;
  }
  lista = [...lista].sort(reciente);
  if (!lista.length) return {};
  if (lista.length === 1 || (!numero && !pendientes)) return { doc: lista[0] };
  return { varios: lista.slice(0, 5).map(num) };
}

// Líneas de la última factura a un cliente, para «lo de siempre» o «como la del mes pasado». null si no hay ninguna.
export function lineasDeUltima(facturas, cliente) {
  const q = sinForma(cliente);
  const f = (facturas || []).filter((x) => !x.rectifica && sinForma(x.cliente?.nombre) === q).sort(reciente)[0];
  if (!f) return null;
  const lineas = f.lineas?.length
    ? f.lineas.map((l) => ({ concepto: l.concepto, cantidad: Number(l.cantidad) || 1, precio: Number(l.precio) || 0, ivaPct: Number(l.ivaPct ?? f.ivaPct) }))
    : [{ concepto: f.concepto, cantidad: 1, precio: Number(f.base) || 0, ivaPct: Number(f.ivaPct) }];
  return { lineas, numero: numeroFactura(f), fecha: f.fecha };
}

// Código postal español (01000-52999) dentro de la dirección.
const CP = '(?:0[1-9]|[1-4]\\d|5[0-2])\\d{3}';
const CP_EN_DIRECCION = new RegExp(`^(.*?)[,\\s]+(${CP})(?:[,\\s]+(.*))?$`);
const CP_DETRAS = new RegExp(`^(.*?)[,\\s]+(${CP})$`);
const limpio = (t) => String(t || '').replace(/^[\s,.-]+|[\s,.-]+$/g, '').replace(/\s+/g, ' ');

// Deja la calle, número y piso en «direccion» y el código postal con la población en «ciudad» («08301 Mataró»), como el
// formulario de factura. Arregla «C/ Major 12, 3º 2ª, 08301 Mataró», «C/ Major 12, Mataró 08301» o «Mataró 08301».
export function separarDireccion(c) {
  if (c.pais && c.pais !== 'ES') return c;
  let direccion = limpio(c.direccion);
  let ciudad = limpio(c.ciudad);
  const m = direccion.match(CP_EN_DIRECCION);
  if (m) {
    let [, calle, cp, pueblo = ''] = m;
    // «…, Mataró 08301»: la población va antes del código postal (si no se sabe ya y el trozo no es el piso).
    const ultimo = calle.split(',').pop();
    if (!limpio(pueblo) && calle.includes(',') && !/\p{L}/u.test(ciudad.replace(new RegExp(CP), '')) && !/[\dºª]/.test(ultimo)) {
      pueblo = ultimo;
      calle = calle.slice(0, calle.lastIndexOf(','));
    }
    direccion = limpio(calle);
    pueblo = limpio(pueblo);
    if (pueblo) ciudad = `${cp} ${pueblo}`;
    else if (!ciudad.includes(cp)) ciudad = new RegExp(CP).test(ciudad) ? ciudad.replace(new RegExp(CP), cp) : limpio(`${cp} ${ciudad}`);
  }
  const d = ciudad.match(CP_DETRAS);
  if (d && !new RegExp(CP).test(d[1])) ciudad = `${d[2]} ${limpio(d[1])}`;
  return { ...c, direccion, ciudad };
}

// Lo que pide la IA (herramienta preparar_factura) → cuerpo para lib/facturas.js limpiar(), con los tipos de la actividad.
// Una línea de la IA → línea de factura. Con `producto` del catálogo: su nombre, su precio y su IVA si la persona no dice
// otros, y la línea queda enlazada (así el inventario la descuenta al emitir, como desde la app).
function lineaDe(l, { actividad, tipos, catalogo }) {
  const p = l.producto ? catalogo.find((x) => x.id === l.producto) : null;
  const iva = [l.ivaPct, p?.ivaPct].map(Number).find((x) => tipos.includes(x));
  return {
    concepto: String(l.concepto || p?.nombre || '').slice(0, 200),
    cantidad: Number(l.cantidad) > 0 ? Number(l.cantidad) : 1,
    precio: Number(l.precio) || Number(p?.precio) || 0,
    ivaPct: iva ?? (actividad?.ivaPct ?? 21),
    ...(p ? { producto: p.id } : {}),
  };
}

// catalogo: los productos y servicios de la empresa (para las líneas que la IA enlaza con uno).
export function cuerpoFactura(pedido, { ficha, actividad, hoy, tipos = [0, 4, 5, 10, 21], catalogo = [] }) {
  const c = ficha || { nombre: String(pedido.cliente || '').trim() };
  // Datos del cliente que da la persona en el mismo mensaje: mandan sobre los guardados.
  const dato = (k) => (typeof pedido.datosCliente?.[k] === 'string' && pedido.datosCliente[k].trim()) || '';
  const sitio = dato('direccion') ? { direccion: dato('direccion'), ciudad: dato('ciudad') } : { direccion: c.direccion || '', ciudad: dato('ciudad') || c.ciudad || '' };
  const pais = dato('pais') || c.pais;
  return {
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha || '') ? pedido.fecha : hoy,
    actividad: actividad?.id,
    cliente: separarDireccion({ nombre: c.nombre, nif: dato('nif') || c.nif || '', ...sitio, ...(pais ? { pais } : {}), ...(c.email ? { email: c.email } : {}) }),
    lineas: (pedido.lineas || []).slice(0, 20).map((l) => lineaDe(l, { actividad, tipos, catalogo })),
    irpfPct: actividad?.irpfPct ?? 0,
    ...(Number(pedido.validez) > 0 ? { validez: Number(pedido.validez) } : {}),
  };
}

// Corrección del borrador: cambios de la IA (cambiar_borrador) sobre el cuerpo guardado. ficha: la del otro cliente, si lo
// cambia a uno guardado. Devuelve { cuerpo, email }.
export function aplicarCambios({ cuerpo, email }, cambios, { ficha, actividad, tipos, catalogo } = {}) {
  const c = { ...cuerpo, cliente: { ...cuerpo.cliente } };
  let correo = email;
  if (cambios.otroCliente) {
    c.cliente = ficha ? cuerpoFactura({ lineas: [] }, { ficha, actividad, hoy: c.fecha }).cliente : { nombre: String(cambios.otroCliente).trim(), nif: '', direccion: '', ciudad: '' };
    correo = ficha?.email || '';
  }
  for (const k of ['nombre', 'nif', 'direccion', 'ciudad', 'pais']) {
    if (typeof cambios.cliente?.[k] === 'string') c.cliente[k] = cambios.cliente[k].trim();
  }
  c.cliente = separarDireccion(c.cliente);
  if (Array.isArray(cambios.lineas) && cambios.lineas.length) c.lineas = cuerpoFactura({ lineas: cambios.lineas }, { actividad, hoy: c.fecha, tipos, catalogo }).lineas;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha || '')) c.fecha = cambios.fecha;
  if (typeof cambios.email === 'string') correo = cambios.email.trim().toLowerCase();
  if (Number(cambios.validez) > 0) c.validez = Number(cambios.validez);
  return { cuerpo: c, email: correo };
}

// Lo que falta de una parte (cliente o emisor), dicho como lo diría una persona; '' si no falta nada.
function falta(x = {}, tr, de) {
  const nif = !x.nif, dir = !(x.direccion || x.ciudad);
  if (!nif && !dir) return '';
  const que = nif && dir ? 'su NIF y su dirección' : nif ? 'su NIF' : 'su dirección';
  return de === 'cliente'
    ? tr({ 'su NIF y su dirección': 'Me falta su NIF y su dirección.', 'su NIF': 'Me falta su NIF.', 'su dirección': 'Me falta su dirección.' }[que])
    : tr({ 'su NIF y su dirección': 'En Ajustes te falta tu NIF y tu dirección.', 'su NIF': 'En Ajustes te falta tu NIF.', 'su dirección': 'En Ajustes te falta tu dirección.' }[que]);
}
const unaDe = (lista, semilla) => lista[Math.abs([...String(semilla)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % lista.length];

// Texto de confirmación del borrador (datos ya validados), en tono de chat. emisor: los datos de facturación de la empresa.
// tipo: 'factura' o 'presupuesto'. entrega: ver entregaDe(). intro: la frase con la que empieza (la de la IA, si la hay).
// tr: el traductor del idioma de la persona (castellano si no se pasa).
// avisos: otras frases que añadir antes de la pregunta (p. ej. el stock que queda).
export function resumenBorrador(datos, email, emisor = {}, tipo = 'factura', entrega = entregaDe('', email), { intro, tr = CASTELLANO, avisos = [] } = {}) {
  const pres = tipo === 'presupuesto';
  const t = importes(datos);
  const c = datos.cliente || {};
  const dir = [c.direccion, c.ciudad].filter(Boolean).join(', ');
  const lineas = (datos.lineas || []).map((l) => `${l.cantidad !== 1 ? `${l.cantidad} × ` : ''}${l.concepto} · ${eur(l.precio)}`);
  const desglose = t.irpf ? tr('{base} + IVA {iva} − IRPF {irpf}', { base: eur(t.base), iva: eur(t.iva), irpf: eur(t.irpf) }) : tr('{base} + IVA {iva}', { base: eur(t.base), iva: eur(t.iva) });
  const faltas = [falta(c, tr, 'cliente'), falta(emisor, tr, 'emisor'), ...avisos].filter(Boolean);
  const sinEmail = email ? '' : ` ${tr('(no tengo su email)')}`;
  const pregunta = pres
    ? { correo: tr('Se lo mando a {email} para que lo acepte. ¿Está bien así?', { email }), whatsapp: `${tr('Te paso el PDF por aquí para que se lo reenvíes.')}${sinEmail} ${tr('¿Lo hago así?')}`, ambos: tr('Se lo mando a {email} y a ti te paso el PDF. ¿Está bien así?', { email }) }[entrega]
    : { correo: tr('Se la mando a {email}. ¿Está bien? ¿La emito y se la envío?', { email }), whatsapp: `${tr('Te paso el PDF por aquí para que se la mandes tú.')}${sinEmail} ${tr('¿Está bien? ¿La emito?')}`, ambos: tr('Se la mando a {email} y a ti te paso el PDF. ¿Está bien? ¿La emito?', { email }) }[entrega];
  const aNombre = tr('a nombre de {nombre}', { nombre: emisor.nombre || tr('tu empresa') });
  return [
    intro || tr(unaDe(pres ? ['Vale, este sería el presupuesto:', 'Te lo dejo así:', 'Mira, así quedaría:'] : ['Vale, esta sería la factura:', 'Te la dejo así:', 'Mira, así quedaría:'], c.nombre + t.total)),
    '',
    `*${c.nombre}*${c.nif ? ` · ${c.nif}` : ''}${dir ? `\n${dir}` : ''}`,
    ...lineas,
    `Total *${eur(t.total)}* (${desglose})`,
    `${fechaCorta(datos.fecha)}${pres ? ` · ${tr('válido {n} días', { n: datos.validez || 15 })}` : ''} · ${aNombre}${emisor.nif ? ` (${emisor.nif})` : ''}`,
    ...(faltas.length ? ['', ...faltas] : []),
    '',
    pregunta,
  ].join('\n');
}

// Envía un texto por la Cloud API de Meta (dentro de las 24 h desde su último mensaje no hace falta plantilla).
export async function enviarTexto(para, texto) {
  const r = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: String(texto).slice(0, 4000) } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error('[whatsapp] envío', r.status, (await r.text().catch(() => '')).slice(0, 300));
  return r.ok;
}

// Marca el mensaje como leído (los dos ticks azules) y enseña «escribiendo…» mientras Fisquo prepara la respuesta (Meta lo
// quita al contestar o a los 25 s).
export async function avisarEscribiendo(idMensaje) {
  const r = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: idMensaje, typing_indicator: { type: 'text' } }),
    signal: AbortSignal.timeout(5000),
  });
  return r.ok;
}

// Envía un PDF como documento: se sube a WhatsApp (devuelve su id) y se manda con su nombre y un texto opcional.
export async function enviarDocumento(para, datos, nombre, texto = '') {
  const auth = { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([datos], { type: 'application/pdf' }), nombre);
  const s = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_ID}/media`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(20000) });
  const { id } = s.ok ? await s.json() : {};
  if (!id) { console.error('[whatsapp] subida', s.status); return false; }
  const r = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'document', document: { id, filename: nombre, ...(texto ? { caption: String(texto).slice(0, 1000) } : {}) } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error('[whatsapp] documento', r.status, (await r.text().catch(() => '')).slice(0, 300));
  return r.ok;
}

// Cómo se entrega el documento: 'correo', 'whatsapp' (el PDF aquí, para reenviarlo la persona) o 'ambos'.
// Sin elegir: por correo si hay email; si no, por WhatsApp. Por correo sin email no se puede: pasa a WhatsApp.
export function entregaDe(pedida, email) {
  const e = ['correo', 'whatsapp', 'ambos'].includes(pedida) ? pedida : email ? 'correo' : 'whatsapp';
  return email ? e : 'whatsapp';
}

// Aviso de documento emitido. envio: { ok } o { error } del correo (null si no se mandaba por correo). Si también va el PDF
// por aquí, se dice para qué: para reenviarlo o, si ya se ha enviado por correo, por si lo quiere.
export function textoEmitido({ pres, num, email, entrega, envio, enlace = '', tr = CASTELLANO }) {
  const v = { num, email, error: envio?.error };
  let t;
  if (envio?.ok) t = tr(pres ? '✅ Presupuesto {num} creado y enviado a {email}.' : '✅ Factura {num} emitida y enviada a {email}.', v);
  else if (envio?.error) t = tr(pres ? '✅ Presupuesto {num} creado, pero no se ha podido enviar a {email}: {error}.' : '✅ Factura {num} emitida, pero no se ha podido enviar a {email}: {error}.', v);
  else t = tr(pres ? '✅ Presupuesto {num} creado.' : '✅ Factura {num} emitida.', v);
  if (entrega === 'correo') return t;
  if (envio?.ok) return `${t} ${tr(pres ? 'Aquí tienes también el PDF, por si lo quieres 👇' : 'Aquí tienes también el PDF, por si la quieres 👇')}`;
  return `${t} ${tr(pres ? 'Aquí tienes el PDF para que se lo mandes tú 👇' : 'Aquí tienes el PDF para que se la mandes tú 👇')}${enlace ? `\n${tr('Si se lo reenvías, también puede verlo y aceptarlo aquí: {enlace}', { enlace })}` : ''}`;
}

// --- Gastos por foto (la propuesta es la de la bandeja de facturas: lib/bandeja.js propuestaDeTicket) ---

// Texto de confirmación de un gasto leído. duplicados: los que ya parecen apuntados.
export function resumenGasto(p, { duplicados = [], intro, tr = CASTELLANO } = {}) {
  const base = Number(p.base) || 0;
  const tipos = p.desglose?.length > 1 ? p.desglose : [{ ivaPct: Number(p.ivaPct) || 0, base }];
  const iva = tipos.reduce((t, d) => t + (Number(d.base) || 0) * (Number(d.ivaPct) || 0) / 100, 0);
  const irpf = base * (Number(p.irpfPct) || 0) / 100;
  const total = Math.round((base + iva - irpf) * 100) / 100;
  const avisos = p.avisos || [];
  const proveedor = p.proveedor || tr('Proveedor sin leer');
  const fecha = p.fecha ? fechaCorta(p.fecha) : tr('sin fecha');
  if (!base) return `${intro || tr('He leído el ticket, pero no consigo ver el importe.')}\n\n*${proveedor}* · ${fecha}\n\n${tr('¿Cuánto es, sin IVA? Dímelo y lo apunto.')}`;
  const ivaTxt = tipos.length > 1 ? tr('IVA {importe}', { importe: eur(Math.round(iva * 100) / 100) }) : tr('IVA {pct} % {importe}', { pct: tipos[0].ivaPct, importe: eur(Math.round(iva * 100) / 100) });
  return [
    intro || tr(unaDe(['Vale, este es el gasto:', 'Leído. Te lo apunto así:', 'Mira, así lo tengo:'], (p.proveedor || '') + total)),
    '',
    `*${proveedor}*${p.proveedorNif ? ` · ${p.proveedorNif}` : ''}`,
    `${p.concepto || tr('Sin concepto')} · ${fecha}${p.numero ? ` · ${tr('factura {numero}', { numero: p.numero })}` : ''}`,
    `Total *${eur(total)}* (${eur(base)} + ${ivaTxt}${irpf ? ` − IRPF ${eur(Math.round(irpf * 100) / 100)}` : ''})`,
    ...avisos.map((a) => tr('Ojo: {aviso}.', { aviso: tr(`${a.charAt(0).toLowerCase()}${a.slice(1)}`) })),
    ...(duplicados.length ? [duplicados.length === 1 ? tr('Ojo: creo que ya lo tienes apuntado (hay uno muy parecido).') : tr('Ojo: creo que ya lo tienes apuntado (hay {n} parecidos).', { n: duplicados.length })] : []),
    '',
    p.pendiente ? tr('¿Lo apunto como pendiente de pagar?') : tr('¿Lo apunto como pagado?'),
  ].join('\n');
}

// Corrección de un gasto pendiente (herramienta cambiar_gasto) sobre su propuesta. Solo cambia lo que viene bien.
export function cambiarGasto(p, c) {
  const n = { ...p };
  for (const k of ['proveedor', 'concepto']) if (typeof c[k] === 'string' && c[k].trim()) n[k] = c[k].trim().slice(0, k === 'proveedor' ? 80 : 140);
  if (/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '')) { n.fecha = c.fecha; delete n.fechaDudosa; }
  if (Number(c.base) > 0) { n.base = Math.round(Number(c.base) * 100) / 100; delete n.desglose; }
  if ([0, 2, 4, 5, 10, 21].includes(Number(c.ivaPct)) && c.ivaPct !== undefined && c.ivaPct !== null) { n.ivaPct = Number(c.ivaPct); delete n.desglose; }
  if (typeof c.pendiente === 'boolean') n.pendiente = c.pendiente;
  // Lo que se corrige a mano ya no es un aviso de la lectura.
  if (Object.keys(c).some((k) => ['base', 'ivaPct', 'fecha'].includes(k))) n.avisos = [];
  return n;
}

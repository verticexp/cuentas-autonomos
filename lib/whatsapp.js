// Fisquo por WhatsApp (prueba técnica): lo que no depende de la base de datos ni de la IA.
// Variables en Vercel: WHATSAPP_TOKEN y WHATSAPP_PHONE_ID (Cloud API de Meta), WHATSAPP_APP_SECRET (firma de los avisos),
// WHATSAPP_VERIFY_TOKEN (alta del webhook) y WHATSAPP_TELEFONOS («34600111222=email@de.acceso,…» o con el id del usuario: quién puede usarlo).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { importes } from './calculos.js';
import { eur, fechaCorta } from './formato.js';

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
  if (/^(si|sii+|s|vale|ok|okay|dale|adelante|perfecto|correcto|emitela|si emitela|si porfa|si por favor)$/.test(t)) return 'si';
  if (/^(no|n|cancela|cancelala|dejalo|nada)$/.test(t)) return 'no';
  return null;
}

// Ficha del cliente por el nombre que escribe la persona. { cliente } si hay una sola, { varios } si hay dudas, {} si ninguna.
const sinForma = (s) => plano(s).replace(/\b(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?|s\.?\s?c\.?|c\.?\s?b\.?)$/i, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function buscarCliente(clientes, nombre) {
  const q = sinForma(nombre);
  if (!q) return {};
  const lista = (clientes || []).filter((c) => c?.nombre);
  const exactos = lista.filter((c) => sinForma(c.nombre) === q);
  if (exactos.length === 1) return { cliente: exactos[0] };
  const parecidos = exactos.length ? exactos : lista.filter((c) => sinForma(c.nombre).includes(q) || q.includes(sinForma(c.nombre)));
  if (parecidos.length === 1) return { cliente: parecidos[0] };
  if (parecidos.length > 1) return { varios: parecidos.slice(0, 5).map((c) => c.nombre) };
  return {};
}

// Lo que pide la IA (herramienta preparar_factura) → cuerpo para lib/facturas.js limpiar(), con los tipos de la actividad.
export function cuerpoFactura(pedido, { ficha, actividad, hoy, tipos = [0, 4, 5, 10, 21] }) {
  const c = ficha || { nombre: String(pedido.cliente || '').trim() };
  return {
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha || '') ? pedido.fecha : hoy,
    actividad: actividad?.id,
    cliente: { nombre: c.nombre, nif: c.nif || '', direccion: c.direccion || '', ciudad: c.ciudad || '', ...(c.pais ? { pais: c.pais } : {}), ...(c.email ? { email: c.email } : {}) },
    lineas: (pedido.lineas || []).slice(0, 20).map((l) => ({
      concepto: String(l.concepto || '').slice(0, 200),
      cantidad: Number(l.cantidad) > 0 ? Number(l.cantidad) : 1,
      precio: Number(l.precio) || 0,
      ivaPct: tipos.includes(Number(l.ivaPct)) ? Number(l.ivaPct) : (actividad?.ivaPct ?? 21),
    })),
    irpfPct: actividad?.irpfPct ?? 0,
    ...(Number(pedido.validez) > 0 ? { validez: Number(pedido.validez) } : {}),
  };
}

// Corrección del borrador: cambios de la IA (cambiar_borrador) sobre el cuerpo guardado. ficha: la del otro cliente, si lo
// cambia a uno guardado. Devuelve { cuerpo, email }.
export function aplicarCambios({ cuerpo, email }, cambios, { ficha, actividad, tipos } = {}) {
  const c = { ...cuerpo, cliente: { ...cuerpo.cliente } };
  let correo = email;
  if (cambios.otroCliente) {
    c.cliente = ficha ? cuerpoFactura({ lineas: [] }, { ficha, actividad, hoy: c.fecha }).cliente : { nombre: String(cambios.otroCliente).trim(), nif: '', direccion: '', ciudad: '' };
    correo = ficha?.email || '';
  }
  for (const k of ['nombre', 'nif', 'direccion', 'ciudad', 'pais']) {
    if (typeof cambios.cliente?.[k] === 'string') c.cliente[k] = cambios.cliente[k].trim();
  }
  if (Array.isArray(cambios.lineas) && cambios.lineas.length) c.lineas = cuerpoFactura({ lineas: cambios.lineas }, { actividad, hoy: c.fecha, tipos }).lineas;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha || '')) c.fecha = cambios.fecha;
  if (typeof cambios.email === 'string') correo = cambios.email.trim().toLowerCase();
  if (Number(cambios.validez) > 0) c.validez = Number(cambios.validez);
  return { cuerpo: c, email: correo };
}

// Lo que falta de una parte (cliente o emisor), dicho como lo diría una persona; '' si no falta nada.
function falta(x = {}, quien, su) {
  const no = [!x.nif && `${su} NIF`, !(x.direccion || x.ciudad) && `${su} dirección`].filter(Boolean);
  return no.length ? `${quien} ${no.join(' y ')}` : '';
}
const unaDe = (lista, semilla) => lista[Math.abs([...String(semilla)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % lista.length];

// Texto de confirmación del borrador (datos ya validados), en tono de chat. emisor: los datos de facturación de la empresa.
// tipo: 'factura' o 'presupuesto'. entrega: ver entregaDe(). intro: la frase con la que empieza (la de la IA, si la hay).
export function resumenBorrador(datos, email, emisor = {}, tipo = 'factura', entrega = entregaDe('', email), { intro } = {}) {
  const pres = tipo === 'presupuesto';
  const t = importes(datos);
  const c = datos.cliente || {};
  const dir = [c.direccion, c.ciudad].filter(Boolean).join(', ');
  const lineas = (datos.lineas || []).map((l) => `${l.cantidad !== 1 ? `${l.cantidad} × ` : ''}${l.concepto} · ${eur(l.precio)}`);
  const desglose = `${eur(t.base)} + IVA ${eur(t.iva)}${t.irpf ? ` − IRPF ${eur(t.irpf)}` : ''}`;
  const faltas = [falta(c, 'Me falta', 'su'), falta(emisor, 'En Ajustes te falta', 'tu')].filter(Boolean).map((f) => `${f}.`);
  const pregunta = pres
    ? { correo: `Se lo mando a ${email} para que lo acepte. ¿Está bien así?`, whatsapp: `Te paso el PDF por aquí para que se lo reenvíes${email ? '' : ' (no tengo su email)'}. ¿Lo hago así?`, ambos: `Se lo mando a ${email} y a ti te paso el PDF. ¿Está bien así?` }[entrega]
    : { correo: `Se la mando a ${email}. ¿Está bien? ¿La emito y se la envío?`, whatsapp: `Te paso el PDF por aquí para que se la mandes tú${email ? '' : ' (no tengo su email)'}. ¿Está bien? ¿La emito?`, ambos: `Se la mando a ${email} y a ti te paso el PDF. ¿Está bien? ¿La emito?` }[entrega];
  return [
    intro || unaDe(pres ? ['Vale, este sería el presupuesto:', 'Te lo dejo así:', 'Mira, así quedaría:'] : ['Vale, esta sería la factura:', 'Te la dejo así:', 'Mira, así quedaría:'], c.nombre + t.total),
    '',
    `*${c.nombre}*${c.nif ? ` · ${c.nif}` : ''}${dir ? `\n${dir}` : ''}`,
    ...lineas,
    `Total *${eur(t.total)}* (${desglose})`,
    `${fechaCorta(datos.fecha)}${pres ? ` · válido ${datos.validez || 15} días` : ''} · a nombre de ${emisor.nombre || 'tu empresa'}${emisor.nif ? ` (${emisor.nif})` : ''}`,
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

// --- Gastos por foto (la propuesta es la de la bandeja de facturas: lib/bandeja.js propuestaDeTicket) ---

// Texto de confirmación de un gasto leído. duplicados: los que ya parecen apuntados.
export function resumenGasto(p, { duplicados = [], intro } = {}) {
  const base = Number(p.base) || 0;
  const tipos = p.desglose?.length > 1 ? p.desglose : [{ ivaPct: Number(p.ivaPct) || 0, base }];
  const iva = tipos.reduce((t, d) => t + (Number(d.base) || 0) * (Number(d.ivaPct) || 0) / 100, 0);
  const irpf = base * (Number(p.irpfPct) || 0) / 100;
  const total = Math.round((base + iva - irpf) * 100) / 100;
  const avisos = p.avisos || [];
  if (!base) return `${intro || 'He leído el ticket, pero no consigo ver el importe.'}\n\n*${p.proveedor || 'Proveedor sin leer'}* · ${p.fecha ? fechaCorta(p.fecha) : 'sin fecha'}\n\n¿Cuánto es, sin IVA? Dímelo y lo apunto.`;
  return [
    intro || unaDe(['Vale, este es el gasto:', 'Leído. Te lo apunto así:', 'Mira, así lo tengo:'], (p.proveedor || '') + total),
    '',
    `*${p.proveedor || 'Proveedor sin leer'}*${p.proveedorNif ? ` · ${p.proveedorNif}` : ''}`,
    `${p.concepto || 'Sin concepto'} · ${p.fecha ? fechaCorta(p.fecha) : 'sin fecha'}${p.numero ? ` · factura ${p.numero}` : ''}`,
    `Total *${eur(total)}* (${eur(base)} + ${tipos.length > 1 ? 'IVA' : `IVA ${tipos[0].ivaPct} %`} ${eur(Math.round(iva * 100) / 100)}${irpf ? ` − IRPF ${eur(Math.round(irpf * 100) / 100)}` : ''})`,
    ...avisos.map((a) => `Ojo: ${a.charAt(0).toLowerCase()}${a.slice(1)}.`),
    ...(duplicados.length ? [`Ojo: creo que ya lo tienes apuntado (${duplicados.length === 1 ? 'hay uno muy parecido' : `hay ${duplicados.length} parecidos`}).`] : []),
    '',
    p.pendiente ? '¿Lo apunto como pendiente de pagar?' : '¿Lo apunto como pagado?',
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

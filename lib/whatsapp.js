// Fisquo por WhatsApp (prueba técnica): lo que no depende de la base de datos ni de la IA.
// Variables en Vercel: WHATSAPP_TOKEN y WHATSAPP_PHONE_ID (Cloud API de Meta), WHATSAPP_APP_SECRET (firma de los avisos),
// WHATSAPP_VERIFY_TOKEN (alta del webhook) y WHATSAPP_TELEFONOS («34600111222=idUsuario,…»: quién puede usarlo).
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

// «34600111222=u1,34611222333=u2» → Map(teléfono → id de usuario).
export function telefonosAutorizados(texto = process.env.WHATSAPP_TELEFONOS) {
  const m = new Map();
  for (const par of String(texto || '').split(',')) {
    const [t, id] = par.split('=').map((x) => x.trim());
    if (normalizarTelefono(t) && id) m.set(normalizarTelefono(t), id);
  }
  return m;
}

// Mensajes de texto de un aviso de Meta: [{ id, de, texto }]. Los estados (entregado, leído) y lo que no es texto se ignoran.
export function mensajesDe(aviso) {
  const out = [];
  for (const e of aviso?.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) {
    if (m.type === 'text' && m.text?.body && m.id) out.push({ id: m.id, de: normalizarTelefono(m.from), texto: String(m.text.body).slice(0, 1000) });
  }
  return out;
}

const plano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Respuesta a «¿La emito?»: 'si', 'no' o null (otra cosa: se trata como petición nueva).
export function siNo(texto) {
  const t = plano(texto).replace(/[¡!¿?.,\s]+/g, ' ').trim();
  if (/^(si|s|vale|ok|okay|dale|adelante|emitela|emitir|confirmo|correcto)( .*)?$/.test(t)) return 'si';
  if (/^(no|n|cancela|cancelar|anula|anular|nada)( .*)?$/.test(t)) return 'no';
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
export function cuerpoFactura(pedido, { ficha, actividad, hoy }) {
  const c = ficha || { nombre: String(pedido.cliente || '').trim() };
  return {
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha || '') ? pedido.fecha : hoy,
    actividad: actividad?.id,
    cliente: { nombre: c.nombre, nif: c.nif || '', direccion: c.direccion || '', ciudad: c.ciudad || '', ...(c.pais ? { pais: c.pais } : {}), ...(c.email ? { email: c.email } : {}) },
    lineas: (pedido.lineas || []).slice(0, 20).map((l) => ({
      concepto: String(l.concepto || '').slice(0, 200),
      cantidad: Number(l.cantidad) > 0 ? Number(l.cantidad) : 1,
      precio: Number(l.precio) || 0,
      ivaPct: [0, 4, 5, 10, 21].includes(Number(l.ivaPct)) ? Number(l.ivaPct) : (actividad?.ivaPct ?? 21),
    })),
    irpfPct: actividad?.irpfPct ?? 0,
  };
}

// Datos fiscales de una parte (emisor o cliente) para revisarlos antes de emitir; lo que falta se dice.
function ficha(titulo, x = {}) {
  const dir = [x.direccion, x.ciudad, x.pais && x.pais !== 'ES' ? x.pais : ''].filter(Boolean).join(', ');
  return [`*${titulo}:* ${x.nombre || '⚠️ sin nombre'}`, `NIF: ${x.nif || '⚠️ sin NIF'}`, `Dirección: ${dir || '⚠️ sin dirección'}`].join('\n');
}

// Texto de confirmación del borrador (datos ya pasados por limpiar()). emisor: los datos de facturación de la empresa.
export function resumenBorrador(datos, email, emisor) {
  const t = importes(datos);
  const lineas = (datos.lineas || []).map((l) => `• ${l.cantidad !== 1 ? `${l.cantidad} × ` : ''}${l.concepto}: ${eur(l.precio)}`);
  return [
    `Factura con fecha ${fechaCorta(datos.fecha)}`,
    '',
    ficha('De', emisor),
    '',
    ficha('Para', datos.cliente),
    `Email: ${email || '—'}`,
    '',
    ...lineas,
    `Base ${eur(t.base)} + IVA ${eur(t.iva)}${t.irpf ? ` − IRPF ${eur(t.irpf)}` : ''} = *${eur(t.total)}*`,
    email ? `Después se la envío a ${email}.` : 'No tengo su email: la dejo emitida en Fisquo sin enviarla.',
    '',
    '¿La emito? Responde *SÍ* o *NO*.',
  ].join('\n');
}

// Envía un texto por la Cloud API de Meta (dentro de las 24 h desde su último mensaje no hace falta plantilla).
export async function enviarTexto(para, texto) {
  const v = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const r = await fetch(`https://graph.facebook.com/${v}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: String(texto).slice(0, 4000) } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error('[whatsapp] envío', r.status, (await r.text().catch(() => '')).slice(0, 300));
  return r.ok;
}

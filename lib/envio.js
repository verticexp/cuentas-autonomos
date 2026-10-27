// Envía una factura en PDF por email (con enlace de pago si la empresa cobra con tarjeta) y apunta el envío en la factura.
import { randomBytes } from 'node:crypto';
import { guardar, leerUno, redis } from './redis.js';
import { guardarCliente } from './tercerosServidor.js';
import { importes, numeroFactura } from './calculos.js';
import { eur, fechaTexto, nombreArchivoDoc } from './formato.js';
import { asuntoFactura } from './plantillaEnvio.js';
export { asuntoFactura, mensajeFactura } from './plantillaEnvio.js';
import { facturaPdf } from './pdf.js';
import { identidadDoc } from './documento.js';
import { enviarCorreo } from './correos.js';
import { enlacePortal } from './portal.js';
import { actualizarFactura } from './actualizarFactura.js';
import { enlacePago } from './cobros.js';
import { AVISO_DATOS_FACTURA, faltanDatosFactura } from './empresa.js';
import { cobroFacturasListo } from './stripe.js';
import { caduca, numeroPresupuesto } from './presupuestos.js';

// u: usuario o empresa (con emisor, marca y empresa/id). origen: https://… de la app, para los enlaces.
export async function enviarFactura(u, f, { para, asunto, mensaje, origen, responderA }) {
  const { emisor: e, marca } = await identidadDoc(u, f);
  if (faltanDatosFactura(e).length) return { error: AVISO_DATOS_FACTURA };
  const num = numeroFactura(f);
  const token = randomBytes(16).toString('hex');
  const nombre = `${nombreArchivoDoc(num, f.cliente.nombre)}.pdf`;
  const texto = String(mensaje || '').slice(0, 5000);
  // Botón al portal del cliente (todas sus facturas y presupuestos). El portal necesita la ficha del cliente: si aún no
  // la tiene (primera factura), se guarda antes. Sin portal el correo sale igual.
  const portalCliente = () => enlacePortal(u, f.cliente.nombre, f.cliente.nif || '');
  const portal = await portalCliente().catch(() => null)
    || await guardarCliente(u, f.cliente).then(portalCliente).catch(() => null);
  // Si la empresa cobra con tarjeta en su cuenta de Stripe (lib/stripeConnect.js), también el botón para pagarla.
  let urlPago;
  if (cobroFacturasListo(u) && !f.cobrada && importes(f).total > 0) {
    const p = await enlacePago(u, f).catch(() => null);
    if (p) { f = p.f; urlPago = `${origen}${p.ruta}`; }
  }
  const r = await enviarCorreo('factura', {
    para,
    asunto: String(asunto || '').trim().slice(0, 200) || asuntoFactura(f, e),
    datos: { empresa: e.nombre || marca?.nombre, mensaje: texto, urlPortal: portal && `${origen}${portal}`, urlPago, idioma: f.idioma },
    pixel: `${origen}/api/abierta/${token}`,
    responderA,
    adjuntos: [{ nombre, datos: await facturaPdf(f, e, marca) }],
  });
  if (r.error) return r;
  const envio = { fecha: new Date().toISOString(), para, token };
  await redis.hset('factura-envios', { [token]: { empresa: u.empresa || u.id, id: f.id } });
  // El email queda guardado en el cliente para la próxima vez.
  // Sobre la factura de ahora, no la leída antes del correo: en el entretiempo pudo cobrarse o cambiar.
  const act = await actualizarFactura(u, f.id, (actual) => ({ nueva: { ...actual, cliente: { ...actual.cliente, email: para }, envios: [...(actual.envios || []), envio] } }));
  const nueva = act.factura || { ...f, cliente: { ...f.cliente, email: para }, envios: [...(f.envios || []), envio] };
  await guardarCliente(u, nueva.cliente);
  return { envio, factura: nueva };
}

// Nombre del PDF de una factura o un presupuesto (como en el portal del cliente).
export const nombrePdf = (doc, presupuesto = false) => `${presupuesto ? 'Presupuesto ' : ''}${numeroFactura(doc)} ${doc.cliente.nombre.toUpperCase().replace(/[^A-Z0-9 ]+/g, '')}.pdf`.trim();

// En el mes de prueba, un mensaje más corto (informe de seguridad m1); el tope de envíos está en lib/limite.js limiteEnvios.
export const MENSAJE_PRUEBA = 1500;

const empresaDe = (u) => u.emisor?.nombre || u.marca?.nombre || u.empresaNombre;
export const asuntoPresupuesto = (p, u) => `Presupuesto ${numeroPresupuesto(p)} de ${empresaDe(u)}`;
export const mensajePresupuesto = (p, u) => `Hola,\n\nTe envío el presupuesto ${numeroPresupuesto(p)} por ${eur(importes(p).total)}, válido hasta el ${fechaTexto(caduca(p))}. Lo tienes adjunto en PDF y puedes aceptarlo desde el botón de abajo.\n\nGracias,\n${empresaDe(u)}`;

// Envía un presupuesto en PDF por email con el botón para aceptarlo (/p/<token>) y apunta el envío en el presupuesto.
// El presupuesto se imprime con el emisor y la marca de hoy, como en el portal. Sin asunto ni mensaje, los de la plantilla.
export async function enviarPresupuesto(u, p, { para, origen, responderA, asunto, mensaje }) {
  const e = u.emisor || {};
  if (!e.nif) return { error: 'Rellena tus datos de facturación en Ajustes' };
  const r = await enviarCorreo('presupuesto', {
    para,
    asunto: String(asunto || '').trim().slice(0, 200) || undefined,
    datos: { empresa: empresaDe(u), numero: numeroPresupuesto(p), total: eur(importes(p).total), validoHasta: fechaTexto(caduca(p)), urlPresupuesto: `${origen}/p/${p.token}`, mensaje: String(mensaje || '').slice(0, 5000) },
    responderA,
    adjuntos: [{ nombre: nombrePdf(p, true), datos: await facturaPdf(p, e, u.marca, { presupuesto: true }) }],
  });
  if (r.error) return r;
  const envio = { fecha: new Date().toISOString(), para, token: randomBytes(8).toString('hex') };
  const actual = (await leerUno(u, 'presupuestos', p.id)) || p;
  await guardar(u, 'presupuestos', { ...actual, cliente: { ...actual.cliente, email: para }, envios: [...(actual.envios || []), envio] });
  await guardarCliente(u, { ...actual.cliente, email: para });
  return { envio };
}

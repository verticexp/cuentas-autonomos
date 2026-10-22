// Un correo que llega a la dirección de una empresa (lib/buzon.js) → a su bandeja de facturas. Lo llama el webhook de
// Resend (app/api/buzon) con el aviso ya verificado. Los adjuntos útiles (PDF, fotos, facturas electrónicas) entran uno a
// uno; si no trae ninguno pero sí texto (la factura en el cuerpo: Uber, Cabify…), entra el texto como PDF.
import { redis } from './redis.js';
import { contarVentana } from './limite.js';
import { hoy } from './formato.js';
import { adjuntosUtiles, aliasDe, confirmacionGmail, descargarAdjunto, leerCorreo, listarAdjuntos, textoPlano } from './correoEntrante.js';
import { empresaDeAlias, guardarConfirmacion, remitenteConocido } from './buzon.js';
import { recibirArchivo } from './bandejaServidor.js';
import { correoPdf } from './correoPdf.js';

// Correos al día por empresa: lo normal son unos pocos; más es un bucle de reenvío o alguien que conoce la dirección.
export const MAX_CORREOS_DIA = 150;
// Un cuerpo más corto que esto no es una factura (un «te reenvío esto» sin adjunto).
const TEXTO_MINIMO = 120;

const fechaTexto = (d = new Date()) => d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// aviso: lib/correoEntrante.js leerAviso. → { ignorado: motivo } o { entrados, cuarentena, fallidos }.
export async function recibirCorreo(aviso) {
  const e = await empresaDeAlias(aliasDe(aviso.para));
  if (!e) return { ignorado: 'sin empresa' };
  if ((await contarVentana(`buzon:${e.empresa}:${hoy()}`, 2 * 86400)) > MAX_CORREOS_DIA) return { ignorado: 'demasiados' };
  const correo = await leerCorreo(aviso.emailId);
  const de = correo.de || aviso.de;
  // Gmail, al configurar el reenvío automático, manda un código para confirmarlo: se enseña en la bandeja.
  const gmail = confirmacionGmail({ de, asunto: correo.asunto, texto: correo.texto, html: correo.html });
  if (gmail) { await guardarConfirmacion(e.empresa, gmail); return { confirmacion: true }; }
  // Remitente desconocido o que falsea su dominio (DMARC suspenso): se guarda en cuarentena, sin leer.
  const cuarentena = correo.autenticacion?.dmarc === 'fail' || !(await remitenteConocido(e, de));
  const meta = { origen: 'correo', correo: { de, deNombre: correo.deNombre || '', asunto: String(correo.asunto || aviso.asunto || '').slice(0, 200), emailId: aviso.emailId }, cuarentena };
  const u = e;
  const resultado = { entrados: 0, cuarentena, fallidos: [] };
  const utiles = adjuntosUtiles(await listarAdjuntos(aviso.emailId));
  for (const a of utiles) {
    const bytes = await descargarAdjunto(a);
    if (bytes.error) { resultado.fallidos.push(`${a.nombre}: ${bytes.error}`); continue; }
    const r = await recibirArchivo(u, bytes, { ...meta, nombre: a.nombre || `adjunto.${a.clase === 'xml' ? 'xml' : a.clase === 'pdf' ? 'pdf' : 'jpg'}` });
    if (r.error) resultado.fallidos.push(`${a.nombre}: ${r.error}`); else resultado.entrados += 1;
  }
  if (!utiles.length) {
    const texto = (correo.texto || textoPlano(correo.html)).trim();
    if (texto.length >= TEXTO_MINIMO) {
      const pdf = await correoPdf({ de, deNombre: correo.deNombre, asunto: correo.asunto, fecha: fechaTexto(), texto });
      const r = await recibirArchivo(u, pdf, { ...meta, nombre: `correo-${String(correo.asunto || 'factura').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}.pdf` });
      if (r.error) resultado.fallidos.push(`cuerpo del correo: ${r.error}`); else resultado.entrados += 1;
    }
  }
  return resultado;
}

// Para el webhook: el mismo correo (Resend reintenta si no respondemos a tiempo) solo se procesa una vez.
export async function primeraVez(emailId) {
  return Boolean(await redis.set(`buzon-correo:${emailId}`, '1', { nx: true, ex: 7 * 86400 }));
}
export const olvidarCorreo = (emailId) => redis.del(`buzon-correo:${emailId}`);

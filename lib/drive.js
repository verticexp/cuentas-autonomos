import { ACTIVIDADES, importes, numeroFactura, trimestre } from './calculos.js';
import { fechaCorta } from './formato.js';
import { facturaHtml } from './facturaHtml.js';
import { actualizarUsuario } from './auth.js';

// Qué ha pasado, en cristiano, a partir de la respuesta del Apps Script.
function diagnostico(status, texto) {
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  if (json?.ok) return null;
  if (json?.error === 'Clave incorrecta') return 'La clave de Ajustes no coincide con la CLAVE del script.';
  if (json?.error) return `El script ha fallado: ${json.error}`;
  // Solo el texto visible de la página que devuelve Google (sin su JavaScript ni estilos).
  const visible = texto.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (/ServiceLogin|accounts\.google\.com\/(v3\/)?signin/i.test(texto)) return 'Google pide iniciar sesión: en la implementación, «Quién tiene acceso» debe ser «Cualquier usuario».';
  if (/doPost/.test(visible)) return 'Google no encuentra la función doPost: guarda el script (icono del disquete), y luego Implementar → Gestionar implementaciones → editar → Versión nueva.';
  return `Google ha respondido (${status}): «${visible.slice(0, 220) || 'página vacía'}»`;
}

// Envía al Apps Script del usuario (Ajustes → Google Drive). Nunca bloquea: la app ya lo ha guardado.
export async function enviar(u, datos) {
  if (!u.drive?.url) return { ok: false, error: 'No hay URL guardada en Ajustes → Google Drive.' };
  let error;
  try {
    const r = await fetch(u.drive.url, { method: 'POST', body: JSON.stringify({ token: u.drive.token, ...datos }), redirect: 'follow', signal: AbortSignal.timeout(25000) });
    error = diagnostico(r.status, await r.text());
  } catch (e) {
    error = e.name === 'TimeoutError' ? 'Google ha tardado demasiado en responder.' : `No se pudo conectar con Google (${e.message}).`;
  }
  if (error) console.error('Drive:', error);
  if ((error || null) !== (u.driveError || null)) await actualizarUsuario(u, { driveError: error || null }).catch(() => {});
  return { ok: !error, error };
}

const nombreCliente = (n) => n.toUpperCase().replace(/[\\/:*?"<>|]/g, '').trim();

export function subirFactura(u, f) {
  const i = importes(f);
  const num = numeroFactura(f);
  return enviar(u, {
    tipo: 'factura',
    actividad: f.actividad,
    nombre: `${num} ${nombreCliente(f.cliente.nombre)}`,
    html: facturaHtml(f, u.emisor || {}, u.marca),
    fila: [num, fechaCorta(f.fecha).replace(/-/g, '/'), `${trimestre(f.fecha)}T`, ACTIVIDADES[f.actividad], f.cliente.nombre, f.cliente.nif, i.base, f.ivaPct, i.iva, f.irpfPct, i.irpf, i.total, f.cobrada ? 'Sí' : 'No', `Facturas emitidas ${f.anio}/${ACTIVIDADES[f.actividad]}`],
  });
}

export function subirGasto(u, g) {
  const i = importes(g);
  return enviar(u, {
    tipo: 'gasto',
    fila: [fechaCorta(g.fecha).replace(/-/g, '/'), `${trimestre(g.fecha)}T`, ACTIVIDADES[g.actividad], g.concepto, i.base, g.ivaPct, i.iva, i.base + i.iva, ''],
  });
}

import { importes, numeroFactura, tipoIvaTexto, trimestre } from './calculos.js';
import { actividadesDe, nombresActividad } from './empresa.js';
import { fechaCorta } from './formato.js';
import { facturaHtml } from './facturaHtml.js';
import { identidadDoc } from './documento.js';
import { actualizarUsuario } from './auth.js';

// La respuesta es del Apps Script del usuario: no se confía en su tamaño ni en su forma. Se lee como mucho este tope.
const MAX_RESPUESTA = 64 * 1024;
async function leerRespuesta(r) {
  if (!r.body?.getReader) return (await r.text()).slice(0, MAX_RESPUESTA);
  const lector = r.body.getReader();
  const decodificador = new TextDecoder();
  let texto = '', n = 0;
  try {
    for (let c = await lector.read(); !c.done && n < MAX_RESPUESTA; c = await lector.read()) {
      n += c.value.length;
      texto += decodificador.decode(c.value, { stream: true });
    }
  } finally { lector.cancel().catch(() => {}); }
  return texto.slice(0, MAX_RESPUESTA);
}

// Quita <script>…</script>, <style>…</style> y las etiquetas de una sola pasada: las expresiones perezosas sin cierre
// vuelven a recorrer el texto desde cada apertura (coste casi cuadrático) y esto corre en el mismo proceso que la cola.
export function textoVisible(html) {
  let fuera = '', i = 0;
  const sinCierre = { script: false, style: false };
  while (i < html.length) {
    const a = html.indexOf('<', i);
    if (a < 0) { fuera += html.slice(i); break; }
    fuera += html.slice(i, a);
    const nombre = ['script', 'style'].find((n) => html.slice(a + 1, a + 1 + n.length).toLowerCase() === n);
    if (nombre && !sinCierre[nombre]) {
      let k = a;
      while ((k = html.indexOf('</', k + 2)) >= 0 && !(html.slice(k + 2, k + 2 + nombre.length).toLowerCase() === nombre && html[k + 2 + nombre.length] === '>'));
      if (k >= 0) { fuera += ' '; i = k + nombre.length + 3; continue; }
      sinCierre[nombre] = true;
    }
    const b = html.indexOf('>', a + 1);
    if (b < 0) { fuera += html.slice(a); break; }
    if (b === a + 1) { fuera += '<>'; i = b + 1; continue; }
    fuera += ' ';
    i = b + 1;
  }
  return fuera.replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Qué ha pasado, en cristiano, a partir de la respuesta del Apps Script.
function diagnostico(status, texto) {
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  if (json?.ok) return null;
  if (json?.error === 'Clave incorrecta') return 'La clave de Ajustes no coincide con la CLAVE del script.';
  if (json?.error) return `El script ha fallado: ${json.error}`;
  // Solo el texto visible de la página que devuelve Google (sin su JavaScript ni estilos).
  const visible = textoVisible(texto);
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
    error = diagnostico(r.status, await leerRespuesta(r));
  } catch (e) {
    error = e.name === 'TimeoutError' ? 'Google ha tardado demasiado en responder.' : `No se ha podido conectar con Google (${e.message}).`;
  }
  if (error) console.error('Drive:', error);
  if ((error || null) !== (u.driveError || null)) await actualizarUsuario(u, { driveError: error || null }).catch(() => {});
  return { ok: !error, error };
}

const nombreCliente = (n) => n.toUpperCase().replace(/[\\/:*?"<>|]/g, '').trim();

export async function subirFactura(u, f) {
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const i = importes(f);
  const num = numeroFactura(f);
  return enviar(u, {
    tipo: 'factura',
    actividad: f.actividad,
    nombre: `${num} ${nombreCliente(f.cliente.nombre)}`,
    html: facturaHtml(f, ...Object.values(await identidadDoc(u, f))),
    fila: [num, fechaCorta(f.fecha), `${trimestre(f.fecha)}T`, ACTIVIDADES[f.actividad], f.cliente.nombre, f.cliente.nif, i.base, f.ivaPct, i.iva, f.irpfPct, i.irpf, i.total, f.cobrada ? 'Sí' : 'No', `Facturas emitidas ${f.anio}/${ACTIVIDADES[f.actividad]}`],
  });
}

export function subirGasto(u, g) {
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const i = importes(g);
  return enviar(u, {
    tipo: 'gasto',
    fila: [fechaCorta(g.fecha), `${trimestre(g.fecha)}T`, ACTIVIDADES[g.actividad], g.concepto, i.base, tipoIvaTexto(g), i.iva, i.base + i.iva, ''],
  });
}

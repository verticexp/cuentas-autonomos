import { contarVentana, rafaga, respuesta429 } from '@/lib/limite';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { iaLista } from '@/lib/ticket';
import { MAX_BYTES_IA, respuestaCupo } from '@/lib/cuotasIA';
import { leerConCupo } from '@/lib/lecturaIA';
import { fiscalDe, usaIgic } from '@/lib/empresa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const POR_DIA = 100; // El mismo tope diario que los tickets de gasto (comparten contador).

// Foto del informe Z del TPV o de la caja registradora: la IA lee lo vendido por tipo de IVA, el cobro y los tiques, y
// rellena el cierre del día (components/FormCierre.js). No guarda nada: el cierre se revisa y se apunta aparte.
// Gasta una página de la cuota de lectura IA de la empresa, como un ticket.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  if (!iaLista()) return error('La lectura con IA aún no está configurada.', 503);
  const { imagen } = await cuerpo(req);
  const m = /^data:(image\/(jpeg|png|webp)|application\/(pdf));base64,([A-Za-z0-9+/=]+)$/.exec(String(imagen || ''));
  if (!m) return error('Sube una foto (JPG, PNG o WebP) o un PDF del informe Z');
  if (m[4].length > Math.ceil(MAX_BYTES_IA / 3) * 4) return error('El archivo es demasiado grande (máx. 3 MB)');
  if (await rafaga('ticket', u.id, 10, 60)) return respuesta429(60, 'Has enviado demasiadas fotos seguidas. Espera un minuto y prueba de nuevo.');
  const n = await contarVentana(`tickets:${u.id}:${hoy()}`, 2 * 86400);
  if (n > POR_DIA) return respuesta429(86400, 'Has llegado al límite de lecturas de hoy. Mañana puedes continuar.');
  try {
    const r = await leerConCupo(u, m[4], m[1], { z: true, igic: usaIgic(fiscalDe(u)) });
    if (r.ocupado) return respuesta429(5, r.error);
    if (r.sinCupo) return respuestaCupo(r);
    if (r.error) return Response.json({ error: r.error, ...(r.cupo ? { cupo: r.cupo } : {}) }, { status: r.status });
    return Response.json({ ok: true, z: r.z, cupo: r.cupo });
  } catch { return error('No se ha podido completar la lectura. Puedes apuntar el cierre a mano.', 503); }
}

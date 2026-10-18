import { contarVentana, rafaga, concurrencia, respuesta429 } from '@/lib/limite';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { iaLista, leerTicket, limpiarTicket, validarEntradaIA } from '@/lib/ticket';
import { consumirEscaneos, cupoEscaneos, MAX_BYTES_IA, paginasIA, registrarConsumoIA, respuestaCupo } from '@/lib/cuotasIA';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const POR_DIA = 100; // Protección adicional contra abuso, independiente de la cuota mensual compartida.

export async function GET() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  try { return Response.json({ ok: true, cupo: await cupoEscaneos(u) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return error('No se ha podido consultar el consumo de escaneos. Inténtalo de nuevo.', 503); }
}

// Una imagen = una página. Cada página de un PDF consume una lectura; no se cobra dinero al superar la cuota.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  if (!iaLista()) return error('La lectura de tickets aún no está configurada.', 503);
  const { imagen } = await cuerpo(req);
  const m = /^data:(image\/(jpeg|png|webp)|application\/(pdf));base64,([A-Za-z0-9+/=]+)$/.exec(String(imagen || ''));
  if (!m) return error('Sube una foto (JPG, PNG o WebP) o un PDF');
  if (m[4].length > Math.ceil(MAX_BYTES_IA / 3) * 4) return error('El archivo es demasiado grande (máx. 3 MB)');
  if (await rafaga('ticket', u.id, 10, 60)) return respuesta429(60, 'Has enviado demasiadas fotos seguidas. Espera un minuto y prueba de nuevo.');
  const archivo = await paginasIA(Buffer.from(m[4], 'base64'), m[1]);
  if (archivo.error) return error(archivo.error);
  const n = await contarVentana(`tickets:${u.id}:${hoy()}`, 2 * 86400);
  if (n > POR_DIA) return respuesta429(86400, 'Has llegado al límite de lecturas de hoy. Mañana puedes continuar.');
  let reserva;
  try {
    const r = await concurrencia('ticket', u.empresa, 3, 30000, () =>
      concurrencia('ia', 'global', 20, 60000, async () => {
        const cupo = await cupoEscaneos(u);
        if (archivo.paginas > cupo.restantes) { reserva = { error: 'No quedan suficientes páginas de lectura IA. Puedes registrar el gasto a mano o solicitar una ampliación.', cupo }; return { sinCupo: true }; }
        const preparacion = await validarEntradaIA(m[4], m[1], archivo.paginas);
        if (preparacion.error) return { ...preparacion, sinEnvio: true, cupo };
        reserva = await consumirEscaneos(u, archivo.paginas);
        if (reserva.error) return { sinCupo: true };
        // No se reintenta automáticamente: una conexión interrumpida puede haber generado un cargo.
        const lectura = await leerTicket(m[4], m[1]);
        await registrarConsumoIA(reserva, lectura.consumo);
        return lectura;
      }));
    if (r?.ocupado) return respuesta429(5, 'La lectura de tickets está ocupada. Espera unos segundos y prueba de nuevo.');
    if (r.sinCupo) return respuestaCupo(reserva);
    if (r.sinEnvio) return Response.json({ error: r.error, cupo: r.cupo }, { status: r.status });
    if (r.error) return Response.json({ error: r.error, cupo: reserva.cupo }, { status: 502 });
    return Response.json({ ok: true, gasto: limpiarTicket(r.datos, hoy()), cupo: reserva.cupo });
  } catch { return error('No se ha podido completar la lectura. Puedes registrar el gasto a mano y consultar tu consumo antes de reintentar.', 503); }
}

import { leer } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerHoja } from '@/lib/hoja';
import { limpiarDia, ventasDesdeFilas } from '@/lib/importarVentas';
import { limpiarCierre } from '@/lib/caja';
import { guardarCierre } from '@/lib/facturas';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { auditar } from '@/lib/auditoria';
import { leerRango } from '@/lib/indices';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_MB = 5, MAX_DIAS = 400;
const FORMATOS = ['shopify', 'woocommerce', 'sumup', 'square', 'generico'];

// Ventas de un TPV o una tienda online (Shopify, WooCommerce, SumUp, Square o un Excel propio) → un cierre de caja por día.
// Con un archivo (multipart): vista previa (los días que ya se importaron de ese mismo origen salen marcados).
// Con JSON { dias, formato, actividad }: guarda los días elegidos.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  // Informe de capacidad E01: solo las facturas de las fechas que llegan (no el histórico).
  let facturas = [];
  const cargar = async (fechas) => { const fs = fechas.sort(); facturas = fs.length ? await leerRango(u, 'facturas', fs[0], fs.at(-1)) : []; };
  const yaImportado = (formato, fecha) => facturas.some((f) => f.caja && f.importado === formato && f.fecha === fecha);

  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const archivo = form?.get('archivo');
    if (!archivo || typeof archivo === 'string' || !archivo.size) return error('Elige un archivo .csv o .xlsx');
    if (archivo.size > MAX_MB * 1024 * 1024) return error(`El archivo pasa de ${MAX_MB} MB`);
    let filas;
    try { filas = leerHoja(Buffer.from(await archivo.arrayBuffer())); } catch { return error('No se puede leer el archivo: guárdalo como .csv o .xlsx'); }
    const ivaPct = actividadesDe(u)[0].ivaPct ?? 21;
    const p = ventasDesdeFilas(filas, (await leer(u, 'productos')) || [], { ivaPct });
    if (p.error) return error(p.error);
    if (p.dias.length > MAX_DIAS) return error(`Demasiados días: como mucho ${MAX_DIAS} por archivo`);
    await cargar(p.dias.map((d) => d.fecha));
    return Response.json({ ...p, dias: p.dias.map((d) => ({ ...d, repetido: yaImportado(p.formato, d.fecha) })) });
  }

  const b = await cuerpo(req);
  const formato = FORMATOS.includes(b.formato) ? b.formato : 'generico';
  const dias = (Array.isArray(b.dias) ? b.dias.slice(0, MAX_DIAS) : []).map(limpiarDia).filter(Boolean);
  if (!dias.length) return error('No hay días que importar');
  await cargar(dias.map((d) => d.fecha));
  const productos = (await leer(u, 'productos')) || [];
  const actividad = actividadValida(actividadesDe(u), b.actividad);
  let guardados = 0, saltados = 0;
  const errores = [];
  for (const d of dias.sort((a, c) => a.fecha.localeCompare(c.fecha))) {
    if (yaImportado(formato, d.fecha)) { saltados++; continue; }
    const datos = limpiarCierre({ ...d, actividad, importado: formato, nota: d.pedidos ? `${d.pedidos} ${d.pedidos === 1 ? 'venta' : 'ventas'} importadas de ${formato}` : '' }, productos);
    if (datos.error) { errores.push(`${d.fecha}: ${datos.error}`); continue; }
    const r = await guardarCierre(u, { ...datos, actividad }, null, { idem: `imp:${formato}:${d.fecha}` });
    if (r.error) { errores.push(`${d.fecha}: ${r.error}`); continue; }
    facturas.push(r.factura);
    guardados++;
  }
  if (guardados) await auditar(u, 'Importación de ventas', `${formato}: ${guardados} ${guardados === 1 ? 'día' : 'días'}`);
  return Response.json({ ok: true, guardados, saltados, errores });
}

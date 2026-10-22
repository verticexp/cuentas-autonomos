import { cuerpo, error, usuarioApi } from '@/lib/api';
import { rafaga, respuesta429 } from '@/lib/limite';
import { MAX_BYTES } from '@/lib/justificantes';
import { ordenar, paraPantalla, resumen } from '@/lib/bandeja';
import { adelantarLecturas, aprobar, aprobarVarias, descartar, deshacer, documentosBandeja, permitir, ponerConfianza, recibirArchivo, releer } from '@/lib/bandejaServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Bandeja de facturas recibidas (lib/bandeja.js). Verla pide permiso de ver gastos; añadir, aprobar o descartar, el de
// apuntarlos. GET: la lista (la pantalla la pide mientras se leen); si queda algo en la cola, la visita lo adelanta.
export async function GET() {
  const { u, res } = await usuarioApi({ permiso: 'gastos' });
  if (res) return res;
  const docs = await documentosBandeja(u);
  await adelantarLecturas(u, docs);
  return Response.json({ ok: true, documentos: ordenar(docs).map(paraPantalla), resumen: resumen(docs) }, { headers: { 'Cache-Control': 'no-store' } });
}

// PUT ?nombre=… con el archivo tal cual en el cuerpo (foto, PDF o factura electrónica): entra en la bandeja y se lee en
// segundo plano. ?origen=compartido: llegó por «Compartir» del móvil.
export async function PUT(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  if (Number(req.headers.get('content-length')) > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)', 413);
  if (await rafaga('bandeja', u.id, 60, 60)) return respuesta429(60, 'Has subido demasiados archivos seguidos. Espera un minuto y sigue.');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)', 413);
  const q = req.nextUrl.searchParams;
  const r = await recibirArchivo(u, bytes, { nombre: q.get('nombre'), origen: q.get('origen') === 'compartido' ? 'compartido' : 'subida', por: u.id });
  if (r.error) return error(r.error, r.status || 400);
  return Response.json({ ok: true, documento: paraPantalla(r.doc), ...(r.repetido ? { repetido: true } : {}) });
}

// POST { accion: 'aprobar', id, datos, duplicadoConfirmado? } · { accion: 'aprobarVarias', ids } ·
// { accion: 'descartar' | 'releer' | 'permitir' (su remitente, para siempre) | 'deshacer' (una aprobada sola), id } ·
// { accion: 'confianza', clave, proveedor, proveedorNif, activo } (proveedor cuyas facturas que cuadran se aprueban solas)
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.id || '');
  if (b.accion === 'aprobar') {
    const r = await aprobar(u, id, b.datos && typeof b.datos === 'object' ? b.datos : {}, { duplicadoConfirmado: b.duplicadoConfirmado === true });
    if (r.errores) return Response.json({ error: r.error, errores: r.errores }, { status: 400 });
    if (r.duplicados?.length) return Response.json({ error: r.error, duplicados: r.duplicados }, { status: 409 });
    if (r.error) return error(r.error, r.status || 400);
    return Response.json({ ok: true, gasto: { id: r.gasto.id }, ...(r.aviso ? { aviso: r.aviso } : {}) });
  }
  if (b.accion === 'aprobarVarias') {
    if (!Array.isArray(b.ids) || !b.ids.length) return error('No hay facturas que aprobar');
    return Response.json({ ok: true, ...(await aprobarVarias(u, b.ids.map(String))) });
  }
  if (b.accion === 'confianza') {
    const r = await ponerConfianza(u, { clave: b.clave, proveedor: b.proveedor, proveedorNif: b.proveedorNif }, b.activo === true);
    return r.error ? error(r.error) : Response.json({ ok: true });
  }
  if (['descartar', 'releer', 'permitir', 'deshacer'].includes(b.accion)) {
    const r = await { descartar, releer, permitir, deshacer }[b.accion](u, id);
    if (r.error) return error(r.error, r.status || 400);
    return Response.json({ ok: true });
  }
  return error('Acción no válida');
}

import { error, usuarioApi } from '@/lib/api';
import { leerUno } from '@/lib/redis';
import { rafaga, respuesta429 } from '@/lib/limite';
import { editarGasto } from '@/lib/gastosServidor';
import { borrarJustificantes, leerJustificante, MAX_BYTES, nombreJustificante, subirJustificante } from '@/lib/justificantes';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Justificante del gasto (foto del ticket o PDF de la factura, lib/justificantes.js). Nunca hay URL pública: se lee
// siempre por aquí, con sesión y permiso de ver gastos; adjuntarlo o sustituirlo pide permiso de apuntarlos.
// GET ?id=… → el archivo (?descargar=1, como descarga).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastos' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const g = await leerUno(u, 'gastos', String(q.get('id') || ''));
  if (!g?.archivo?.clave) return error('Este gasto no tiene justificante', 404);
  const datos = await leerJustificante(u, g.archivo);
  if (!datos) return error('No se encuentra el justificante', 404);
  const nombre = nombreJustificante(g);
  return new Response(datos, {
    headers: {
      'Content-Type': g.archivo.tipo,
      'Content-Length': String(datos.length),
      'Content-Disposition': `${q.get('descargar') ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Cache-Control': 'private, no-store',
      // Solo se sirven JPG, PNG, WebP o PDF comprobados por sus primeros bytes (lib/justificantes.js tipoReal).
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// PUT ?id=… con el archivo tal cual en el cuerpo (no en base64): adjunta o sustituye el justificante.
export async function PUT(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('id') || '');
  if (!id) return error('Ese gasto ya no existe', 404);
  if (Number(req.headers.get('content-length')) > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)');
  if (await rafaga('justificante', u.id, 30, 60)) return respuesta429(60, 'Has subido demasiados archivos seguidos. Espera un minuto y prueba de nuevo.');
  if (!(await leerUno(u, 'gastos', id))) return error('Ese gasto ya no existe', 404);
  const bytes = new Uint8Array(await req.arrayBuffer());
  const s = await subirJustificante(u, id, bytes);
  if (s.error) return error(s.error, s.status);
  const r = await editarGasto(u, id, (antes) => ({ gasto: { ...antes, archivo: s.archivo } }));
  if (r.error) {
    await borrarJustificantes(u, [s.archivo]);
    return error(r.error, r.status || 400);
  }
  const anterior = r.antes.archivo;
  if (anterior?.clave && anterior.clave !== s.archivo.clave) await borrarJustificantes(u, [anterior]);
  if (anterior?.clave) await auditar(u, 'Justificante sustituido', `${r.antes.concepto} · ${r.antes.fecha}`);
  return Response.json({ ok: true, archivo: { tipo: s.archivo.tipo, tamano: s.archivo.tamano } });
}

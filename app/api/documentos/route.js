import { cuerpo, error, usuarioApi } from '@/lib/api';
import { redis } from '@/lib/redis';
import { rafaga, respuesta429 } from '@/lib/limite';
import { MAX_BYTES } from '@/lib/justificantes';
import { despachoDe } from '@/lib/despachos';
import { buzonDe, direccionDe } from '@/lib/buzon';
import { entregar, peticionDe, peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import { escribir, marcarLeido } from '@/lib/comentariosDespacho';
import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { avisarDespacho } from '@/lib/avisosDespacho';
import { cupoEscaneos } from '@/lib/cuotasIA';
import { ordenar, paraCliente, soloDocumentos } from '@/lib/documentos';
import { abiertoPara, adelantarLecturas, descartar, documentosDe, LECTURA, recibirDocumento } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo del cliente «solo documentos» (lib/documentos.js), y lo que ya subió quien pasó después a Fisquo completo (solo verlo).
async function cliente() {
  const r = await usuarioApi();
  if (r.res) return r;
  if (r.u.viaDespacho) return { res: error('Esto es para el cliente, no para su gestoría', 403) };
  return r;
}

// GET: lo que ha subido, lo que le pide su gestoría, su dirección para reenviar facturas y si puede subir.
export async function GET() {
  const { u, res } = await cliente();
  if (res) return res;
  const e = await redis.hget('empresas', u.empresa);
  const docs = await documentosDe(u);
  await adelantarLecturas(u, docs);
  const despacho = soloDocumentos(u) ? u.documentos.despacho : u.despachoCliente?.id;
  const [d, peticiones, abierto, cupo] = await Promise.all([
    despacho ? despachoDe(despacho) : null,
    despacho ? peticionesDe(u.empresa, { despacho }) : [],
    soloDocumentos(u) ? abiertoPara(e) : false,
    soloDocumentos(u) ? cupoEscaneos(u).catch(() => null) : null,
  ]);
  return Response.json({
    documentos: ordenar(docs).map(paraCliente), abierto, ...(abierto ? {} : { aviso: soloDocumentos(u) ? LECTURA : 'Ya llevas tus cuentas en Fisquo: aquí solo se ven los documentos que enviaste antes.' }),
    gestoria: d ? d.nombre : '', correo: abierto ? direccionDe(buzonDe(e)) : '',
    peticiones: pendientes(peticiones).filter((p) => p.tipo === 'documento').map((p) => ({ id: p.id, texto: p.texto, creada: p.creada, por: p.por?.nombre || '' })),
    ...(cupo ? { cupo: { restantes: cupo.restantes, limite: cupo.limite } } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// PUT ?nombre=… con el archivo tal cual (foto o PDF): entra en su lista y se lee en segundo plano. ?peticion=: además
// entrega lo que le pidió su gestoría.
export async function PUT(req) {
  const { u, res } = await cliente();
  if (res) return res;
  if (!soloDocumentos(u)) return error('Sube tus facturas desde Gastos', 403);
  const e = await redis.hget('empresas', u.empresa);
  if (!(await abiertoPara(e))) return Response.json({ error: LECTURA, soloLectura: true }, { status: 402 });
  if (Number(req.headers.get('content-length')) > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)', 413);
  if (await rafaga('documentos', u.id, 60, 60)) return respuesta429(60, 'Has subido muchos archivos seguidos. Espera un minuto y sigue.');
  const q = req.nextUrl.searchParams;
  const p = q.get('peticion') ? await peticionDe(u.empresa, q.get('peticion')) : null;
  if (q.get('peticion') && (!p || p.despacho !== u.documentos.despacho || p.estado !== 'pendiente')) return error('Esa petición ya no está pendiente', 409);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)', 413);
  const r = await recibirDocumento(u, bytes, { nombre: q.get('nombre'), por: u.id });
  if (r.error) return error(r.error, r.status || 400);
  if (p) {
    const ent = await entregar(u.empresa, p.id, u, { archivo: r.doc.archivo });
    if (!ent.error) {
      const d = await despachoDe(p.despacho);
      await escribir(u.empresa, u, 'cliente', { texto: `📎 Te he subido: ${p.texto}.`, ...(p.hilo ? { hilo: p.hilo } : {}), despacho: p.despacho }).catch(() => null);
      await marcarLeido(u.empresa, 'cliente').catch(() => null);
      await invalidarNoLeidos(p.despacho).catch(() => null);
      if (d && e) avisarDespacho(d, e, { titulo: `${u.empresaNombre || 'Tu cliente'} ha subido un documento`, cuerpo: p.texto, chat: true });
    }
  }
  return Response.json({ ok: true, documento: paraCliente(r.doc), ...(r.repetido ? { repetido: true } : {}) });
}

// POST { accion: 'descartar', id }: quitar algo que subió por error, mientras su gestoría no lo haya revisado.
export async function POST(req) {
  const { u, res } = await cliente();
  if (res) return res;
  if (!soloDocumentos(u)) return error('Aquí ya no se pueden cambiar documentos', 403);
  const e = await redis.hget('empresas', u.empresa);
  if (!(await abiertoPara(e))) return Response.json({ error: LECTURA, soloLectura: true }, { status: 402 });
  const b = await cuerpo(req);
  if (b.accion !== 'descartar') return error('Acción no válida');
  const r = await descartar(u, String(b.id || ''), { soloSiSinRevisar: true });
  return r.error ? error(r.error, r.status || 400) : Response.json({ ok: true });
}

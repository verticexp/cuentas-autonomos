import { error, cuerpo, usuarioApi } from '@/lib/api';
import { leerUno, redis } from '@/lib/redis';
import { rafaga, respuesta429 } from '@/lib/limite';
import { despachoDe } from '@/lib/despachos';
import { escribir, marcarLeido } from '@/lib/comentariosDespacho';
import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { entregar, peticionDe, peticionesDe } from '@/lib/peticionesDespacho';
import { borrarJustificantes, MAX_BYTES, subirJustificante } from '@/lib/justificantes';
import { avisarDespacho } from '@/lib/avisosDespacho';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lo que la gestoría le pide al cliente (lib/peticionesDespacho.js), del lado del cliente.
async function cliente(opciones) {
  const r = await usuarioApi(opciones);
  if (r.res) return r;
  if (r.u.viaDespacho) return { res: error('Esto es para el cliente, no para su gestoría', 403) };
  if (!r.u.despachoCliente || r.u.despachoCliente.pendiente) return { res: error('No tienes ninguna gestoría con acceso', 404) };
  return r;
}

// Avisa en el chat (en el hilo de la petición, si lo tiene) y al despacho.
async function contar(u, p, texto) {
  const [d, e] = await Promise.all([despachoDe(p.despacho), redis.hget('empresas', u.empresa)]);
  await escribir(u.empresa, u, 'cliente', { texto, ...(p.hilo ? { hilo: p.hilo } : {}), despacho: p.despacho }).catch(() => null);
  await marcarLeido(u.empresa, 'cliente');
  await invalidarNoLeidos(p.despacho);
  if (d && e) avisarDespacho(d, e, { titulo: `${u.empresaNombre || 'Tu cliente'} ha subido un documento`, cuerpo: p.tipo === 'ticket' ? `El ticket de ${p.gasto?.texto || 'un gasto'}` : p.texto });
}

export async function GET() {
  const { u, res } = await cliente();
  if (res) return res;
  return Response.json({ peticiones: await peticionesDe(u.empresa, { despacho: u.despachoCliente.id, ctx: u }) });
}

// Ticket: el cliente ya lo ha subido al gasto (api/gastos/justificante) → { gasto }: se dan por entregadas sus peticiones.
export async function PATCH(req) {
  const { u, res } = await cliente();
  if (res) return res;
  const b = await cuerpo(req);
  const g = await leerUno(u, 'gastos', String(b.gasto || ''));
  if (!g?.archivo?.clave) return error('Ese gasto aún no tiene justificante', 409);
  const lista = (await peticionesDe(u.empresa, { despacho: u.despachoCliente.id })).filter((p) => p.estado === 'pendiente' && p.tipo === 'ticket' && p.gasto?.id === g.id);
  for (const p of lista) {
    const r = await entregar(u.empresa, p.id, u);
    if (r.peticion) await contar(u, r.peticion, '📎 Ya te he subido el ticket.');
  }
  return Response.json({ ok: true, entregadas: lista.length });
}

// Otro documento: PUT ?id= con el archivo tal cual en el cuerpo (foto o PDF, como los justificantes).
export async function PUT(req) {
  const { u, res } = await cliente();
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('id') || '');
  const p = await peticionDe(u.empresa, id);
  if (!p || p.despacho !== u.despachoCliente.id || p.tipo !== 'documento') return error('Esa petición ya no existe', 404);
  if (p.estado !== 'pendiente') return error('Ya la has entregado', 409);
  if (Number(req.headers.get('content-length')) > MAX_BYTES) return error('El archivo es demasiado grande (máx. 5 MB)');
  if (await rafaga('justificante', u.id, 30, 60)) return respuesta429(60, 'Has subido demasiados archivos seguidos. Espera un minuto y prueba de nuevo.');
  const s = await subirJustificante(u, `peticion-${p.id}`, new Uint8Array(await req.arrayBuffer()));
  if (s.error) return error(s.error, s.status);
  const r = await entregar(u.empresa, p.id, u, { archivo: s.archivo });
  if (r.error) { await borrarJustificantes(u, [s.archivo]); return error(r.error, r.status || 400); }
  await contar(u, r.peticion, `📎 Te he subido: ${p.texto}.`);
  return Response.json({ ok: true });
}

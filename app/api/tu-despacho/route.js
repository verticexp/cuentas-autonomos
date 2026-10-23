import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { despachoPorCodigo, leerAccesos, separarCliente, unirCliente } from '@/lib/despachos';
import { comentariosDe, escribir, marcarLeido, responder } from '@/lib/comentariosDespacho';
import { planSinLicencia, sincronizarLicencias } from '@/lib/licencias';
import { pasado, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';

// Ajustes › Tu gestoría, del lado del cliente: qué despacho lleva sus cuentas, qué ha hecho en ellas y sus preguntas.
// Quien entra desde un despacho no usa esto (lo suyo está en api/despacho).
async function cliente(opciones) {
  const r = await usuarioApi(opciones);
  if (r.res) return r;
  if (r.u.viaDespacho) return { res: error('Esto es para el cliente, no para su gestoría', 403) };
  return r;
}

// ?codigo=XXXX: el nombre del despacho de ese código, para confirmarlo antes de darle acceso.
export async function GET(req) {
  const { u, res } = await cliente({ permiso: 'resumen' });
  if (res) return res;
  const codigo = req.nextUrl.searchParams.get('codigo');
  if (codigo) {
    if (await pasado('tu-despacho-codigo', u.empresa, 20, 3600)) return respuesta429(3600, 'Demasiados intentos. Espera una hora.');
    const d = await despachoPorCodigo(codigo);
    return d ? Response.json({ nombre: d.nombre }) : error('No hay ningún despacho con ese código', 404);
  }
  const [accesos, comentarios] = await Promise.all([leerAccesos(u.empresa), comentariosDe(u.empresa)]);
  return Response.json({ despacho: u.despachoCliente || null, accesos, comentarios });
}

// Dar acceso a un despacho con su código (administrador o «Datos de la empresa»). { codigo }
export async function POST(req) {
  const { u, res } = await cliente({ permiso: 'empresa' });
  if (res) return res;
  if (await pasado('tu-despacho-codigo', u.empresa, 20, 3600)) return respuesta429(3600, 'Demasiados intentos. Espera una hora.');
  const d = await despachoPorCodigo((await cuerpo(req)).codigo);
  if (!d) return error('No hay ningún despacho con ese código', 404);
  const r = await unirCliente(u.empresa, d, 'cliente');
  if (r.error) return error(r.error, r.status || 400);
  await auditar(u, 'Acceso dado a la gestoría', d.nombre);
  return Response.json({ ok: true, despacho: { id: d.id, nombre: d.nombre } });
}

// Quitarle el acceso al despacho. Si pagaba tu plan, tienes un mes para elegir el tuyo.
export async function DELETE() {
  const { u, res } = await cliente({ permiso: 'empresa' });
  if (res) return res;
  const dia = hoy();
  const r = await separarCliente(u.empresa, null, { ajustar: (sin, antes) => (antes.despachoCliente?.licencia ? { ...sin, plan: planSinLicencia(sin.plan, dia) } : sin) });
  if (r.error) return error(r.error, r.status || 400);
  await auditar(u, 'Acceso quitado a la gestoría', r.antes.despachoCliente.nombre);
  if (r.antes.despachoCliente.licencia) await sincronizarLicencias(r.antes.despachoCliente.id, dia).catch(() => null);
  return Response.json({ ok: true });
}

// Responder a una pregunta de la gestoría o marcarla como resuelta ({ id, texto?, resuelto? }), o marcar leído ({ leer: true }).
export async function PATCH(req) {
  const { u, res } = await cliente({ permiso: 'resumen' });
  if (res) return res;
  if (!u.despachoCliente) return error('No tienes ninguna gestoría con acceso', 404);
  const b = await cuerpo(req);
  // { leer: true }: el cliente ha abierto la conversación.
  if (b.leer === true) { await marcarLeido(u.empresa, 'cliente'); return Response.json({ ok: true }); }
  const r = await responder(u.empresa, String(b.id || ''), u, 'cliente', { texto: b.texto, resuelto: b.resuelto });
  return r.error ? error(r.error, r.status || 400) : Response.json(r);
}

// Escribir a la gestoría: { texto, hilo? } (sin hilo, en la conversación general).
export async function PUT(req) {
  const { u, res } = await cliente({ permiso: 'resumen' });
  if (res) return res;
  if (!u.despachoCliente) return error('No tienes ninguna gestoría con acceso', 404);
  const b = await cuerpo(req);
  const r = await escribir(u.empresa, u, 'cliente', { texto: b.texto, hilo: b.hilo ? String(b.hilo) : undefined });
  if (r.error) return error(r.error, r.status || 400);
  await marcarLeido(u.empresa, 'cliente');
  return Response.json(r);
}

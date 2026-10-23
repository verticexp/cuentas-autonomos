import { cuerpo, error, usuarioApi } from '@/lib/api';
import { redis } from '@/lib/redis';
import { cambiarUsuario, crearUsuario, INVITACION_DIAS, limpiarEmail, nuevaEmpresa, tokenEmail } from '@/lib/auth';
import { enviarInvitacion } from '@/lib/invitacion';
import { crearGestoria, normalizarCodigo } from '@/lib/gestorias';
import { clientesDe, crearDespacho, listarDespachos } from '@/lib/despachos';
import { licenciasDe } from '@/lib/licencias';
import { disolverDespacho } from '@/lib/bajaDespacho';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// La empresa propia del despacho en Fisquo: gratis mientras sea despacho asociado (como el plan Fundador).
const planDespacho = () => ({ fundador: true, despacho: true, tipo: 'pym', nombre: 'Pro', desde: hoy() });

// Despachos con sus clientes y licencias (administrador de Fisquo).
export async function GET() {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const dia = hoy();
  const lista = await listarDespachos();
  return Response.json(await Promise.all(lista.map(async (d) => ({
    id: d.id, nombre: d.nombre, codigo: d.codigo, email: d.email, creado: d.creado, personas: Object.keys(d.miembros || {}).length,
    clientes: (await clientesDe(d.id)).length, licencias: await licenciasDe(d, dia), cobro: d.cobro || null,
  }))));
}

// Alta de un despacho: { nombre, nif, email, titular, codigo }. El titular recibe la invitación (o, si ya tenía cuenta, se le
// añade el despacho y su empresa). El código sirve también como código de gestoría en el registro (90 días de prueba).
export async function POST(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  const b = await cuerpo(req);
  const nombre = String(b.nombre || '').trim();
  const email = limpiarEmail(b.email);
  const codigo = normalizarCodigo(b.codigo);
  if (!nombre || !email || !String(b.titular || '').trim()) return error('Faltan el nombre del despacho, el del titular o el email');
  if (!codigo) return error('El código debe tener entre 4 y 20 caracteres: letras A-Z, números o guion.');
  if (await redis.hget('despacho-codigos', codigo)) return error('Ese código ya es de otro despacho.');
  const yaId = await redis.hget('emails', email);
  const ya = yaId && (await redis.hget('usuarios', yaId));
  if (ya?.despacho) return error('Esa persona ya es de otro despacho');
  let titular, empresa, invitacion = null;
  if (ya) {
    const r = await nuevaEmpresa(ya.id, nombre, { plan: planDespacho(), emisor: { nombre, nif: String(b.nif || '').trim().toUpperCase() } });
    if (r.error) return error(r.error);
    titular = ya.id; empresa = r.id;
  } else {
    const r = await crearUsuario({ nombre: b.titular, email, empresaNombre: nombre, empresaDatos: { plan: planDespacho(), emisor: { nombre, nif: String(b.nif || '').trim().toUpperCase() } } });
    if (r.error) return error(r.error);
    titular = r.usuario.id; empresa = r.usuario.empresa;
    invitacion = { usuario: r.usuario, codigo: r.codigo };
  }
  const d = await crearDespacho({ nombre, nif: b.nif, email, codigo, titular, empresa });
  if (d.error) return error(d.error);
  await cambiarUsuario(titular, (x) => ({ ...x, despacho: d.despacho.id }));
  // El mismo código en las gestorías del registro (lib/gestorias.js): 90 días de prueba a sus clientes.
  if (!(await redis.hget('gestorias', codigo))) await crearGestoria({ nombre, email, codigo });
  let envio = {};
  if (invitacion) {
    const url = new URL(`/invitacion/${invitacion.codigo}`, req.url).toString();
    envio = { enlace: url, ...(await enviarInvitacion({ para: email, nombre: invitacion.usuario.nombre, quien: u.nombre, empresa: nombre, url: `${url}?v=${await tokenEmail(titular)}`, responderA: u.email, dias: INVITACION_DIAS })) };
  }
  return Response.json({ ok: true, despacho: d.despacho, ...envio });
}

// Dar de baja un despacho (?id=): sus clientes quedan sin despacho (con margen para elegir su plan si se lo pagaba) y su
// gente, sin acceso al panel. Las cuentas y la empresa propia del despacho siguen.
export async function DELETE(req) {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const r = await disolverDespacho(String(req.nextUrl.searchParams.get('id') || ''));
  return r.error ? error(r.error, r.status || 400) : Response.json({ ok: true });
}

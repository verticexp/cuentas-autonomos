import { cuerpo, error } from '@/lib/api';
import { redis } from '@/lib/redis';
import { cambiarUsuario, crearUsuario, INVITACION_DIAS, limpiarEmail, quitarDeEmpresa, tokenEmail } from '@/lib/auth';
import { enviarInvitacion } from '@/lib/invitacion';
import { miDespacho } from '@/lib/despachoApi';
import { anularInvitacionDespacho, cambiarDespacho, cambiarVinculo, clientesDe, crearInvitacionDespacho, ROLES_DESPACHO } from '@/lib/despachos';
import { enEmpresa } from '@/lib/membresias';
import { pasado, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';

// Dentro del cerrojo del despacho se mira otra vez que quien lo pide sigue siendo titular (pudieron quitarle mientras).
const sigueTitular = (y, uid) => y.miembros?.[uid]?.rol === 'titular';

// Invitar a un gestor del despacho (titular). { nombre, email, rol? }
// Sin cuenta: se crea (dentro de la empresa del despacho, sin permisos en ella) y recibe la invitación de siempre.
// Con cuenta: recibe un enlace que solo acepta esa persona con su sesión (api/invitacion/despacho).
export async function POST(req) {
  const { u, d, res } = await miDespacho({ titular: true });
  if (res) return res;
  if (d.demo) return error('Es un despacho de demostración: no se invita a nadie.', 403);
  const b = await cuerpo(req);
  const rol = b.rol === 'titular' ? 'titular' : 'gestor';
  const email = limpiarEmail(b.email);
  if (!email || !String(b.nombre || '').trim()) return error('Faltan el nombre o el email');
  if (await pasado('despacho-invitar', d.id, 30, 3600)) return respuesta429(3600, 'Has enviado demasiadas invitaciones. Espera una hora.');
  const yaId = await redis.hget('emails', email);
  const ya = yaId && (await redis.hget('usuarios', yaId));
  if (ya) {
    if (ya.despacho === d.id) return error('Esa persona ya está en tu despacho');
    if (ya.despacho) return error('Esa persona ya es de otro despacho');
    const codigo = await crearInvitacionDespacho(d.id, ya.id, rol, INVITACION_DIAS * 86400);
    const url = new URL(`/invitacion/despacho?c=${codigo}`, req.url).toString();
    const e = await enviarInvitacion({ para: ya.email, nombre: ya.nombre, quien: u.nombre, empresa: d.nombre, url, responderA: u.email, dias: INVITACION_DIAS });
    return Response.json({ ok: true, pendiente: true, enlace: url, ...e });
  }
  const r = await crearUsuario({ nombre: b.nombre, email, empresa: d.empresa, rol: 'miembro', permisos: [] });
  if (r.error) return error(r.error);
  await cambiarUsuario(r.usuario.id, (x) => ({ ...x, despacho: d.id }));
  const x = await cambiarDespacho(d.id, (y) => (sigueTitular(y, u.id) ? { despacho: { ...y, miembros: { ...y.miembros, [r.usuario.id]: { rol, desde: new Date().toISOString() } } } } : { error: 'Ya no eres titular del despacho', status: 403 }));
  if (x.error) return error(x.error, x.status || 400);
  const url = new URL(`/invitacion/${r.codigo}`, req.url).toString();
  const e = await enviarInvitacion({ para: email, nombre: r.usuario.nombre, quien: u.nombre, empresa: d.nombre, url: `${url}?v=${await tokenEmail(r.usuario.id)}`, responderA: u.email, dias: INVITACION_DIAS });
  return Response.json({ ok: true, enlace: url, ...e });
}

// Cambiar el rol de alguien (titular). { id, rol }. Siempre queda al menos un titular.
export async function PATCH(req) {
  const { u, d, res } = await miDespacho({ titular: true });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.id || '');
  if (!ROLES_DESPACHO[b.rol]) return error('Rol no válido');
  const r = await cambiarDespacho(d.id, (y) => {
    if (!sigueTitular(y, u.id)) return { error: 'Ya no eres titular del despacho', status: 403 };
    if (!y.miembros?.[id]) return { error: 'Esa persona no está en tu despacho', status: 404 };
    const miembros = { ...y.miembros, [id]: { ...y.miembros[id], rol: b.rol } };
    if (!Object.values(miembros).some((m) => m.rol === 'titular')) return { error: 'El despacho necesita al menos un titular' };
    return { despacho: { ...y, miembros } };
  });
  return r.error ? error(r.error, r.status || 400) : Response.json({ ok: true });
}

// Quitar a alguien del despacho (titular). ?id=. Si solo estaba en la empresa del despacho, su cuenta se borra, como al
// quitar a alguien de una empresa.
export async function DELETE(req) {
  const { u, d, res } = await miDespacho({ titular: true });
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('id') || '');
  if (id === u.id) return error('No puedes quitarte a ti: pídeselo a otro titular');
  const r = await cambiarDespacho(d.id, (y) => {
    if (!sigueTitular(y, u.id)) return { error: 'Ya no eres titular del despacho', status: 403 };
    if (!y.miembros?.[id]) return { error: 'Esa persona no está en tu despacho', status: 404 };
    const { [id]: _, ...miembros } = y.miembros;
    if (!Object.values(miembros).some((m) => m.rol === 'titular')) return { error: 'El despacho necesita al menos un titular' };
    return { despacho: { ...y, miembros } };
  });
  if (r.error) return error(r.error, r.status || 400);
  // Ni su invitación pendiente ni su cartera siguen: los clientes que llevaba quedan sin asignar.
  await anularInvitacionDespacho(d.id, id);
  for (const c of await clientesDe(d.id)) {
    await cambiarVinculo(c, d.id, (v) => (v.gestor === id ? { vinculo: { ...v, gestor: undefined } } : null)).catch(() => null);
  }
  const o = await cambiarUsuario(id, (x) => (x.despacho === d.id ? { ...x, despacho: undefined } : null));
  if (o && enEmpresa(o, d.empresa)) await quitarDeEmpresa(id, d.empresa);
  return Response.json({ ok: true });
}

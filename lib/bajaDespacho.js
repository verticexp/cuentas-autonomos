// Bajas que tocan a un despacho (lib/despachos.js):
// - un cliente se da de baja: deja de estar en su despacho (y el despacho deja de pagar su licencia);
// - alguien del despacho elimina su cuenta: sale del equipo (el último titular no puede si quedan gestores);
// - el despacho desaparece (lo da de baja el administrador de Fisquo o su última persona elimina la cuenta): cada cliente
//   queda sin despacho y, si el despacho pagaba su plan, con su margen para elegir el suyo (lib/licencias.js).
import { redis } from './redis.js';
import { cambiarDespacho, clientesDe, despachoDe, pendientesDe, separarCliente } from './despachos.js';
import { planSinLicencia } from './licencias.js';

const hoy = () => new Date().toISOString().slice(0, 10);
const sinLicencia = (dia) => (sin, antes) => (antes.despachoCliente?.licencia ? { ...sin, plan: planSinLicencia(sin.plan, dia) } : sin);

export async function clienteDeBaja(empresaId) {
  const e = await redis.hget('empresas', String(empresaId));
  if (!e?.despachoCliente) return null;
  return separarCliente(empresaId, e.despachoCliente.id, { ajustar: sinLicencia(hoy()) });
}

export async function disolverDespacho(id) {
  const d = await despachoDe(id);
  if (!d) return { error: 'Ese despacho ya no existe', status: 404 };
  const dia = hoy();
  for (const empresa of [...(await clientesDe(id)), ...(await pendientesDe(id))]) await separarCliente(empresa, id, { ajustar: sinLicencia(dia) }).catch(() => null);
  for (const uid of Object.keys(d.miembros || {})) {
    const u = await redis.hget('usuarios', uid);
    if (u?.despacho === id) await redis.hset('usuarios', { [uid]: { ...u, despacho: undefined } });
  }
  await redis.del(`despacho-clientes:${id}`, `despacho-pendientes:${id}`);
  if ((await redis.hget('despacho-codigos', d.codigo)) === id) await redis.hdel('despacho-codigos', d.codigo);
  await redis.hdel('despachos', id);
  return { ok: true, clientes: true };
}

// Antes de eliminar la cuenta de alguien del despacho. → { error } si es el último titular y quedan gestores;
// si es la última persona, el despacho se disuelve.
export async function salirDelDespacho(u) {
  if (!u?.despacho) return null;
  const d = await despachoDe(u.despacho);
  if (!d?.miembros?.[u.id]) return null;
  const otros = Object.entries(d.miembros).filter(([id]) => id !== u.id);
  if (!otros.length) return disolverDespacho(d.id);
  if (d.miembros[u.id].rol === 'titular' && !otros.some(([, m]) => m.rol === 'titular')) {
    return { error: `Eres el único titular de «${d.nombre}»: nombra a otra persona titular en Mi despacho › Equipo antes de eliminar tu cuenta.` };
  }
  return cambiarDespacho(d.id, (x) => { const { [u.id]: _, ...miembros } = x.miembros; return { despacho: { ...x, miembros } }; });
}

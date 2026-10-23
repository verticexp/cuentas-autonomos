import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { miDespacho, periodoDe } from '@/lib/despachoApi';
import { cambiarDespacho, clientesVisibles, equipoDe, limpiarDatosDespacho } from '@/lib/despachos';
import { filasClientes } from '@/lib/panelDespacho';
import { licenciasDe } from '@/lib/licencias';

export const dynamic = 'force-dynamic';

// Panel: el despacho, su equipo, la fila de cada cliente del trimestre (?anio=&t=) y las licencias.
export async function GET(req) {
  const { u, d, rol, res } = await miDespacho();
  if (res) return res;
  const dia = hoy();
  const q = req.nextUrl.searchParams;
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), dia);
  const clientes = await clientesVisibles(d, u.id);
  const [filas, equipo, licencias] = await Promise.all([filasClientes(clientes, anio, t, dia), equipoDe(d), rol === 'titular' ? licenciasDe(d, dia) : null]);
  // Lo del cobro (Stripe) solo lo ve el titular.
  const { miembros: _, cobro, ...resto } = d;
  const ficha = rol === 'titular' ? { ...resto, cobro } : resto;
  return Response.json({ despacho: ficha, rol, equipo, anio, t, filas, licencias });
}

// Datos del despacho (titular): { nombre, nif, email, soloAsignados }.
export async function PATCH(req) {
  const { d, res } = await miDespacho({ titular: true });
  if (res) return res;
  const { datos, error: e } = limpiarDatosDespacho(await cuerpo(req));
  if (e) return error(e);
  const r = await cambiarDespacho(d.id, (x) => ({ despacho: { ...x, ...datos } }));
  if (r.error) return error(r.error, r.status || 400);
  return Response.json({ ok: true });
}

import { leer, leerUno } from '@/lib/redis';
import { guardarCierre } from '@/lib/facturas';
import { limpiarCierre } from '@/lib/caja';
import { numeroFactura } from '@/lib/calculos';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { actividadesDe, actividadValida, fiscalDe, usaIgic } from '@/lib/empresa';
import { auditar } from '@/lib/auditoria';
import { eur } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Cierre de caja: lo vendido en el día con su IVA, el cobro (efectivo, tarjeta, otros) y, si se quiere, las unidades.
// Con id, corrige un cierre que ya existe (se borra como cualquier factura, desde su ficha).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const igic = usaIgic(fiscalDe(u));
  const b = await cuerpo(req);
  const antes = b.id ? await leerUno(u, 'facturas', String(b.id)) : null;
  if (b.id && !antes?.caja) return error('Ese cierre ya no existe', 404);
  const datos = limpiarCierre(b, (await leer(u, 'productos')) || [], { igic });
  if (datos.error) return error(datos.error);
  datos.actividad = actividadValida(actividadesDe(u), b.actividad || antes?.actividad);
  const { factura: f, error: e } = await guardarCierre(u, datos, antes, { idem: typeof b.idem === 'string' ? `caja:${b.idem}` : undefined });
  if (e) return error(e);
  await auditar(u, antes ? 'Cierre de caja corregido' : 'Cierre de caja', `${numeroFactura(f)} · ${f.fecha} · ${eur(f.caja.efectivo + f.caja.tarjeta + f.caja.otros)}`);
  return Response.json({ ok: true, factura: f });
}

import { randomUUID } from 'node:crypto';
import { borrar, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiarPago } from '@/lib/capitalMobiliario';
import { auditar } from '@/lib/auditoria';
import { eur } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Dividendos e intereses pagados (lib/capitalMobiliario.js: modelos 123 y 193). Se apuntan y se borran desde Impuestos,
// con el permiso de contabilidad (también cuentan en los asientos).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'contabilidad' });
  if (res) return res;
  const p = limpiarPago(await cuerpo(req));
  if (p.error) return error(p.error);
  const pago = { id: randomUUID(), ...p, creado: new Date().toISOString() };
  await guardar(u, 'capital', pago);
  await auditar(u, 'Pago de dividendos o intereses apuntado', `${pago.fecha} · ${pago.perceptor.nombre} · ${eur(pago.bruto)} (retención ${eur(pago.retencion)})`);
  return Response.json({ ok: true, pago });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'contabilidad' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  const antes = id && (await leerUno(u, 'capital', id));
  if (!antes) return error('Ese pago ya no existe', 404);
  await borrar(u, 'capital', id);
  await auditar(u, 'Pago de dividendos o intereses borrado', `${antes.fecha} · ${antes.perceptor?.nombre || ''} · ${eur(antes.bruto)}`);
  return Response.json({ ok: true });
}

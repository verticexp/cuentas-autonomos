import { leerUno } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';
import { cambiarEfecto } from '@/lib/cartera';
import { idCliente, nombreForma } from '@/lib/terceros';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { numeroFactura } from '@/lib/calculos';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Forma de cobro de un efecto y si ya se ha recibido (cheque, confirming, pagaré). Body: { id, forma?, recibido? }.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar', funcion: 'cartera' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = typeof b.id === 'string' && (await leerUno(u, 'facturas', b.id));
  if (!antes) return error('Esa factura ya no existe', 404);
  if (b.forma !== undefined && typeof b.forma !== 'string') return error('La forma de cobro no es válida');
  if (b.recibido !== undefined && typeof b.recibido !== 'boolean') return error('Indica si el efecto está recibido o no');
  if (b.forma === undefined && b.recibido === undefined) return error('No hay nada que cambiar');
  const ficha = await leerUno(u, 'clientes', idCliente(antes.cliente?.nombre));
  const r = await actualizarFactura(u, antes.id, (actual) => cambiarEfecto(actual, { forma: b.forma, recibido: b.recibido }, { hoy: hoy(), formaFicha: ficha?.formaCobro || '' }));
  if (r.error) return error(r.error, r.status || 400);
  const detalle = [b.forma !== undefined && `forma de cobro: ${nombreForma(b.forma) || 'sin indicar'}`, b.recibido !== undefined && (b.recibido ? 'efecto recibido' : 'efecto pendiente de recibir')].filter(Boolean).join(' · ');
  await auditar(u, 'Efecto a cobrar', `${numeroFactura(r.factura)} · ${detalle}`);
  return Response.json({ ok: true });
}

import { cuerpo, error, usuarioApi } from '@/lib/api';
import { deshacer, liquidarTarjeta } from '@/lib/bancoServidor';
import { leerUno } from '@/lib/redis';
import { auditar } from '@/lib/auditoria';
import { eur } from '@/lib/formato';
import { DETALLE, puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

// Cuadra la tarjeta de unos cierres de caja con el ingreso del banco que la liquida ({ mov, cierres }), o lo deshace
// ({ mov, deshacer: true }). La comisión del TPV queda como gasto (lib/bancoServidor.js liquidarTarjeta).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  if (!puede(u, DETALLE)) return error('Pide al administrador el permiso de ver facturas y gastos', 403);
  const b = await cuerpo(req);
  const mov = String(b.mov || '').slice(0, 120);
  if (!mov) return error('Falta el movimiento del banco');
  if (b.deshacer) {
    const m = await leerUno(u, 'banco', mov);
    if (m?.enlace?.tipo !== 'tpv') return error('Ese ingreso no está cuadrado con la tarjeta');
    const r = await deshacer(u, mov);
    if (r.error) return error(r.error, r.status || 400);
    await auditar(u, 'Cuadre de tarjeta deshecho', `${m.fecha} · ${eur(m.importe)}`);
    return Response.json({ ok: true });
  }
  const cierres = Array.isArray(b.cierres) ? b.cierres.filter((x) => typeof x === 'string').slice(0, 31) : [];
  if (!cierres.length) return error('Elige los cierres que liquida ese ingreso');
  const r = await liquidarTarjeta(u, mov, cierres);
  if (r.error) return error(r.error, r.status || 400);
  await auditar(u, 'Tarjeta cuadrada con el banco', `${cierres.length} ${cierres.length === 1 ? 'cierre' : 'cierres'} · comisión ${eur(r.comision)}`);
  return Response.json({ ok: true, comision: r.comision });
}

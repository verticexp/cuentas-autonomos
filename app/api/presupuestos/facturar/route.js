import { cuerpo, error, usuarioApi } from '@/lib/api';
import { facturarPresupuesto, Ocupado } from '@/lib/presupuestosServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // el envío a Verifactu puede esperar al control de flujo de la AEAT

// tipo «senal»: el % de señal · tipo «resto»: lo que falta (todo, si no hubo señal).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const { id, tipo } = await cuerpo(req);
  if (!id) return error('Ese presupuesto ya no existe', 404);
  try {
    const r = await facturarPresupuesto(u, id, tipo);
    if (r.error) return error(r.error, r.status);
    return Response.json({ ok: true, factura: r.factura });
  } catch (e) {
    if (e instanceof Ocupado) return error(e.message, 409);
    throw e;
  }
}

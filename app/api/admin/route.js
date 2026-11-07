import { cuerpo, error, usuarioApi } from '@/lib/api';
import { cambioDePlan, historialPagoTrasCambio } from '@/lib/admin';
import { iniciarBajasAdmin } from '@/lib/adminServidor';
import { conCerrojo } from '@/lib/cerrojo';
import { metrica } from '@/lib/metricas';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Panel /admin: el administrador de Fisquo regala el plan Fundador, lo quita o alarga una prueba.
// { empresa, accion: 'interna', interna: boolean } solo clasifica para las cifras.
// Las demás acciones cambian el plan: 'fundador' | 'quitar-fundador' | 'alargar' | 'plan'.
export async function POST(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.empresa || '');
  return conCerrojo(`empresa-plan:${id}`, async () => {
    const e = id && (await redis.hget('empresas', id));
    if (!e) return error('Esa empresa no existe', 404);
    if (b.accion === 'interna') {
      if (typeof b.interna !== 'boolean') return error('Indica si es una cuenta interna/demo.');
      if (e.demo === true && !b.interna) return error('Es una cuenta de demostración: siempre se excluye de las cifras.');
      // Usa el mismo cerrojo que los cobros. Solo se toca esta marca, incluso si ya está de baja;
      // clasificarla no genera una cancelación ni altera el plan o su historial.
      await redis.hset('empresas', { [id]: { ...e, interna: b.interna } });
      metrica('admin-interna', { empresa: id, interna: b.interna, por: u.id });
      return Response.json({ ok: true, interna: b.interna });
    }
    if (e.baja) return error('Esa empresa no existe', 404);
    const r = cambioDePlan(e, String(b.accion || ''), { dias: b.dias, tipo: String(b.tipo || ''), nombre: String(b.nombre || '') });
    if (r.error) return error(r.error);
    await iniciarBajasAdmin();
    const despues = { ...e, plan: r.plan };
    await redis.hset('empresas', { [id]: { ...despues, historialPagoAdmin: historialPagoTrasCambio(e, despues) } });
    metrica('admin-plan', { empresa: id, accion: b.accion, por: u.id });
    return Response.json({ ok: true, plan: r.plan });
  });
}

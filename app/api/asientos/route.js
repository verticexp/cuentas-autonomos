import { borrar, guardar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { asientoApertura, limpiarAsiento } from '@/lib/asientos';
import { fiscalDe } from '@/lib/empresa';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Asientos apuntados a mano (ajustes, regularizaciones de la gestoría…) y el de apertura (solo uno por empresa).
// { apertura: { fecha, banco, capital, largo, corto } } o { fecha, concepto, lineas: [{ cuenta, debe, haber }] }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await cuerpo(req);
  let a;
  if (b.apertura) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.apertura.fecha || '')) return error('Fecha no válida');
    const previa = (await leer(u, 'asientos')).find((x) => x.apertura);
    a = { id: previa?.id || crypto.randomUUID(), ...asientoApertura(b.apertura, fiscalDe(u).tipo === 'sociedad') };
    if (a.lineas.length < 2) return error('Pon al menos el saldo del banco o el capital');
  } else {
    const l = limpiarAsiento(b);
    if (l.error) return error(l.error);
    a = { id: crypto.randomUUID(), ...l };
  }
  await guardar(u, 'asientos', { ...a, por: u.id, creado: new Date().toISOString() });
  await auditar(u, a.apertura ? 'Asiento de apertura' : 'Asiento manual', `${a.fecha} · ${a.concepto}`);
  return Response.json({ ok: true, asiento: a });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'asientos', id);
  if (!antes) return error('Ese asiento ya no existe', 404);
  await borrar(u, 'asientos', id);
  await auditar(u, 'Asiento borrado', `${antes.fecha} · ${antes.concepto}`);
  return Response.json({ ok: true });
}

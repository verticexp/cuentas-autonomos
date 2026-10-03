import { randomBytes } from 'node:crypto';
import { leerUno, guardar, borrar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { diaValido, plantillaDe } from '@/lib/recurrentes';

export const dynamic = 'force-dynamic';

// Repetir una factura cada mes.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const f = b.factura && (await leerUno(u, 'facturas', b.factura));
  if (!f) return error('Esa factura ya no existe', 404);
  if (f.serie === 'R') return error('Una rectificativa no se puede repetir');
  const r = { id: randomBytes(6).toString('hex'), origen: f.id, plantilla: plantillaDe(f), dia: diaValido(b.dia), enviar: Boolean(b.enviar), activa: true, ultima: hoy().slice(0, 7), creada: new Date().toISOString() };
  await guardar(u, 'recurrentes', r);
  return Response.json({ ok: true, recurrente: r });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const r = b.id && (await leerUno(u, 'recurrentes', b.id));
  if (!r) return error('Ya no existe', 404);
  await guardar(u, 'recurrentes', { ...r, ...('activa' in b ? { activa: Boolean(b.activa) } : {}), ...('dia' in b ? { dia: diaValido(b.dia) } : {}), ...('enviar' in b ? { enviar: Boolean(b.enviar) } : {}) });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  await borrar(u, 'recurrentes', req.nextUrl.searchParams.get('id') || '');
  return Response.json({ ok: true });
}

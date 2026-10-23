import { NextResponse } from 'next/server';
import { cuerpo } from '@/lib/api';
import { opcionesCookie } from '@/lib/auth';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { registrarEntrada } from '@/lib/despachos';

export const dynamic = 'force-dynamic';

// Entrar en las cuentas de un cliente: la empresa elegida se recuerda en este dispositivo (cookie «e», como al cambiar de
// empresa) y lib/auth.js conEmpresa comprueba en cada petición que el despacho sigue teniendo acceso. { empresa, ir }
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  await registrarEntrada(e.id, quien);
  const ir = typeof b.ir === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(b.ir) ? b.ir : '/';
  const r = NextResponse.json({ ok: true, ir });
  r.cookies.set('e', e.id, opcionesCookie);
  return r;
}

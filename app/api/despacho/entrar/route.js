import { NextResponse } from 'next/server';
import { cuerpo } from '@/lib/api';
import { opcionesCookie } from '@/lib/auth';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { error } from '@/lib/api';
import { registrarEntrada } from '@/lib/despachos';
import { esSoloDocumentos } from '@/lib/perfilDocumentos';

export const dynamic = 'force-dynamic';

// Entrar en las cuentas de un cliente: la empresa elegida se recuerda en este dispositivo (cookie «e», como al cambiar de
// empresa) y lib/auth.js conEmpresa comprueba en cada petición que el despacho sigue teniendo acceso. { empresa, ir }
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  // Un cliente «solo documentos» no tiene cuentas en Fisquo: se trabaja desde su ficha (lib/auth.js conEmpresa tampoco deja).
  if (esSoloDocumentos(e)) return error('Este cliente solo envía documentos: revísalos desde su ficha.', 409);
  await registrarEntrada(e.id, quien);
  const ir = typeof b.ir === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(b.ir) ? b.ir : '/';
  const r = NextResponse.json({ ok: true, ir });
  r.cookies.set('e', e.id, opcionesCookie);
  return r;
}

import { after, NextResponse } from 'next/server';
import { solicitarRecuperacion, recuperarPassword } from '@/lib/recuperar';
import { ipDe } from '@/lib/limite';

export async function POST(req) {
  const datos = await req.json().catch(() => null);
  const ip = ipDe(req);
  if (datos && typeof datos === 'object' && ('token' in datos || 'password' in datos)) {
    try {
      const r = await recuperarPassword(datos.token, datos.password, ip);
      return NextResponse.json(r.error ? { error: r.error } : { ok: true }, { status: r.error ? (r.bloqueado ? 429 : 400) : 200 });
    } catch {
      return NextResponse.json({ error: 'No se ha podido cambiar la contraseña. Vuelve a intentarlo.' }, { status: 503 });
    }
  }
  const email = datos?.email;
  // El enlace del email va siempre a la app (APP_URL), no al Host de la petición: así nadie puede hacer que el
  // enlace de recuperación apunte a otro dominio cambiando esa cabecera.
  const origen = process.env.APP_URL || new URL(req.url).origin;
  // Siempre el mismo código, mensaje y trabajo antes de responder, exista o no la cuenta.
  after(() => solicitarRecuperacion({ email, ip, origen }));
  return NextResponse.json({ ok: true });
}

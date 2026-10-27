import { NextResponse } from 'next/server';
import { usuarioActual } from '@/lib/auth';
import { normalizarCodigo } from '@/lib/gestorias';

export const dynamic = 'force-dynamic';

// El enlace que un despacho pasa a sus clientes (Mi despacho › Ajustes): uno solo para todos. Quien ya usa Fisquo va a
// Ajustes › Tu gestoría con el código puesto (confirma él); quien no, al registro con el código (3 meses gratis).
// Va bajo api/invitacion (pública) para que funcione sin sesión.
export async function GET(req) {
  const codigo = normalizarCodigo(req.nextUrl.searchParams.get('c'));
  const u = await usuarioActual().catch(() => null);
  const destino = !codigo ? '/registro' : u ? `/ajustes/gestoria?codigo=${encodeURIComponent(codigo)}` : `/registro?codigo=${encodeURIComponent(codigo)}`;
  return NextResponse.redirect(new URL(destino, req.url), 303);
}

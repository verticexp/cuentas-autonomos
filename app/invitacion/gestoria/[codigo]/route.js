import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// El enlace que el despacho pasa a sus clientes (Mi despacho › Ajustes), más legible que el de la API: /invitacion/gestoria/<código>.
// Público como todo /invitacion (lib/rutasPublicas.js) y no es web pública, así que la app de iOS también lo abre.
export async function GET(req, { params }) {
  const { codigo } = await params;
  return NextResponse.redirect(new URL(`/api/invitacion/gestoria?c=${encodeURIComponent(codigo)}`, req.url), 307);
}

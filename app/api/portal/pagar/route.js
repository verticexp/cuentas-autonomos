import { NextResponse } from 'next/server';
import { importes } from '@/lib/calculos';
import { enlacePago } from '@/lib/cobros';
import { portalDe } from '@/lib/portal';

export const dynamic = 'force-dynamic';

// Público: desde el portal, lleva a la página de pago de la factura (/pagar/<token>), creándola si hace falta.
export async function POST(req) {
  const form = await req.formData();
  const t = String(form.get('t') || '');
  const d = await portalDe(t);
  const f = d?.facturas.find((x) => x.id === String(form.get('id') || ''));
  if (!f) return NextResponse.json({ error: 'Ese documento no existe' }, { status: 404 });
  if (f.cobrada || importes(f).total <= 0) return NextResponse.redirect(`${req.nextUrl.origin}/portal/${t}`, 303);
  const { ruta } = await enlacePago(d.e, f);
  return NextResponse.redirect(`${req.nextUrl.origin}${ruta}`, 303);
}

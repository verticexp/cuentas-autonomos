import { NextResponse } from 'next/server';
import { importes } from '@/lib/calculos';
import { enlacePago } from '@/lib/cobros';
import { portalDe } from '@/lib/portal';
import { cobroFacturasListo } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Público: desde el portal, lleva a la página de pago de la factura (/pagar/<token>), creándola si hace falta.
export async function POST(req) {
  let form;
  try { form = await req.formData(); }
  catch {
    const error = 'No se ha podido leer el formulario. Abre de nuevo el portal del cliente e inténtalo otra vez.';
    if (req.headers.get('accept')?.includes('application/json')) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.redirect(new URL(`/portal/?error=${encodeURIComponent(error)}`, req.url), 303);
  }
  const t = String(form.get('t') || '');
  const d = await portalDe(t, req);
  if (d instanceof Response) return d;
  const f = d?.facturas.find((x) => x.id === String(form.get('id') || ''));
  if (!f) return NextResponse.json({ error: 'Ese documento no existe' }, { status: 404 });
  if (!cobroFacturasListo() || f.cobrada || importes(f).total <= 0) return NextResponse.redirect(`${req.nextUrl.origin}/portal/${t}`, 303);
  const { ruta } = await enlacePago(d.e, f);
  return NextResponse.redirect(`${req.nextUrl.origin}${ruta}`, 303);
}

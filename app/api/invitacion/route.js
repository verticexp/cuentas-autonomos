import { NextResponse } from 'next/server';
import { aceptarInvitacion, opcionesCookie } from '@/lib/auth';

export async function POST(req) {
  const form = await req.formData();
  const codigo = String(form.get('codigo') || '');
  const r = await aceptarInvitacion(codigo, form.get('password'));
  if (r.error) return NextResponse.redirect(new URL(`/invitacion/${codigo}?error=${encodeURIComponent(r.error)}`, req.url), 303);
  const res = NextResponse.redirect(new URL('/ajustes', req.url), 303);
  res.cookies.set('t', r.token, opcionesCookie);
  return res;
}

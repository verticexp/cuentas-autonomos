import { NextResponse } from 'next/server';
import { entrar, opcionesCookie } from '@/lib/auth';

export async function POST(req) {
  const form = await req.formData();
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const r = await entrar(form.get('email'), form.get('password'), ip);
  if (!r?.token) return NextResponse.redirect(new URL(`/login?error=${r?.bloqueado ? 'bloqueado' : 1}`, req.url), 303);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set('t', r.token, opcionesCookie);
  return res;
}

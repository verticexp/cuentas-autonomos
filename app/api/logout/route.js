import { NextResponse } from 'next/server';
import { cerrarSesion } from '@/lib/auth';

export async function POST(req) {
  await cerrarSesion(req.cookies.get('t')?.value);
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.delete('t');
  return res;
}

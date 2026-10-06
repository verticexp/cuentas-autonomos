import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { confirmarEmail, tokenEmail, usuarioActual } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';

// Enlace del email de confirmación (vale aunque se abra en otro dispositivo sin sesión).
export async function GET(req) {
  const ok = redis && (await confirmarEmail(req.nextUrl.searchParams.get('t')));
  return NextResponse.redirect(new URL(ok ? '/' : '/confirmar-email?caducado=1', req.url), 303);
}

// «Reenviar el enlace» desde /confirmar-email: como mucho uno por minuto.
export async function POST(req) {
  const u = await usuarioActual();
  if (!u) return NextResponse.redirect(new URL('/login', req.url), 303);
  if (u.emailVerificado === false && (await redis.set(`confirmar-envio:${u.id}`, 1, { ex: 60, nx: true }))) {
    await enviarConfirmacion({ para: u.email, nombre: u.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(u.id)}`, req.url).toString() });
  }
  return NextResponse.redirect(new URL('/confirmar-email?enviado=1', req.url), 303);
}

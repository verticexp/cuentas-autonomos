import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { canjearCodigo, clienteDe, comprobarIdToken } from '@/lib/social';
import { abrirSesion, codigoCanje, cuentaDe, guardarAlta, opcionesAlta, responderWeb } from '@/lib/socialServidor';
import { redis } from '@/lib/redis';

// Vuelta de Google (GET) y de Apple (POST form_post) tras «Continuar con…» (app/api/login/social).
// Con cuenta: entra (o pide el código del segundo paso). Sin cuenta: en la web, al alta con la identidad guardada;
// en la app (que no tiene alta), vuelve con el aviso.
export const dynamic = 'force-dynamic';

const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function vuelta(req, datos) {
  let guardado = null;
  try { guardado = JSON.parse(req.cookies.get('social')?.value || 'null'); } catch { /* cookie rota */ }
  const app = Boolean(guardado?.app);
  const fallo = (codigo = 'social') => {
    const res = app ? NextResponse.redirect(`fisquo://acceso?error=${codigo}`, 303) : NextResponse.redirect(new URL(`/login?error=${codigo}`, req.url), 303);
    res.cookies.delete({ name: 'social', path: '/api/login/social' });
    return res;
  };
  if (!redis || !guardado || !igual(datos.state, guardado.state) || datos.error) return fallo(datos.error === 'access_denied' || datos.error === 'user_cancelled_authorize' ? 'cancelado' : 'social');
  const { proveedor, nonce } = guardado;
  let persona, tokens;
  try {
    tokens = await canjearCodigo(proveedor, datos.code, { vuelta: new URL('/api/login/social/vuelta', req.url).toString() });
    persona = await comprobarIdToken(proveedor, tokens.id_token, { audiencia: clienteDe(proveedor), nonce });
  } catch (e) { console.warn('[social] vuelta:', e.message); return fallo(); }
  // Apple manda el nombre solo la primera vez, fuera del token.
  if (!persona.nombre && datos.user) {
    try { const n = JSON.parse(datos.user).name || {}; persona.nombre = [n.firstName, n.lastName].filter(Boolean).join(' ').trim().slice(0, 60); } catch { /* sin nombre */ }
  }
  const extra = proveedor === 'apple' && tokens.refresh_token ? { refresh: tokens.refresh_token, nativo: false } : {};
  const u = await cuentaDe(proveedor, persona, extra);
  if (u?.sinConfirmar) return fallo('sin-confirmar');
  if (!u) {
    if (app) return fallo('sin-cuenta');
    const res = NextResponse.redirect(new URL('/registro?social=1', req.url), 303);
    res.cookies.set('alta-social', await guardarAlta(proveedor, persona, extra), opcionesAlta);
    res.cookies.delete({ name: 'social', path: '/api/login/social' });
    return res;
  }
  const abierta = await abrirSesion(u);
  if (app) {
    if (!abierta || !guardado.vinculo) return fallo();
    const res = NextResponse.redirect(`fisquo://acceso?c=${await codigoCanje(u, abierta, proveedor, guardado.vinculo)}`, 303);
    res.cookies.delete({ name: 'social', path: '/api/login/social' });
    return res;
  }
  const res = await responderWeb(req, proveedor, u, abierta);
  res.cookies.delete({ name: 'social', path: '/api/login/social' });
  return res;
}

export async function GET(req) {
  return vuelta(req, Object.fromEntries(req.nextUrl.searchParams));
}

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  return vuelta(req, form ? Object.fromEntries(form) : {});
}

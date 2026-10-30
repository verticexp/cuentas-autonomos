import { NextResponse } from 'next/server';
import { appleListo, BUNDLE_APP, canjearCodigo, comprobarIdToken, nuevoAzar, sha256Hex } from '@/lib/social';
import { abrirSesion, cuentaDe } from '@/lib/socialServidor';
import { opcionesCookie, RETO_DOS_PASOS } from '@/lib/auth';
import { apuntarAcceso } from '@/lib/accesos';
import { ponerEntrada } from '@/lib/entrada';
import { esApp } from '@/lib/app';
import { cuerpo, error } from '@/lib/api';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';
import { redis } from '@/lib/redis';

// «Continuar con Apple» con la hoja nativa de la app de iOS (lib/accesoNativo.js, AccesoPlugin.swift).
// 1) accion «nonce»: un nonce de un solo uso en la cookie «nonce-apple»; la app manda su SHA-256 a Apple.
// 2) entrar: el identityToken (audiencia: el bundle de la app) y el authorizationCode, para guardar el refresh_token
//    con el que se revoca al borrar la cuenta. Sin cuenta con ese email: { sinCuenta } (en la app no hay alta).
export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!redis) return error('Base de datos no conectada', 503);
  if (!appleListo() || !esApp(req.headers.get('user-agent'))) return error('No disponible', 404);
  if (await pasado('social', ipDe(req), 30, 900)) return error(MUCHOS, 429);
  const b = await cuerpo(req);
  if (b.accion === 'nonce') {
    const nonce = nuevoAzar();
    const res = NextResponse.json({ nonce });
    res.cookies.set('nonce-apple', nonce, { ...opcionesCookie, path: '/api/login/apple', maxAge: 300 });
    return res;
  }
  const nonce = req.cookies.get('nonce-apple')?.value;
  if (!nonce) return error('Ha tardado demasiado. Vuelve a intentarlo.');
  let persona;
  try { persona = await comprobarIdToken('apple', b.identityToken, { audiencia: BUNDLE_APP, nonce: sha256Hex(nonce) }); }
  catch (e) { console.warn('[social] apple nativo:', e.message); return error('No se ha podido comprobar tu cuenta de Apple. Vuelve a intentarlo.', 401); }
  if (!persona.nombre && typeof b.nombre === 'string') persona.nombre = b.nombre.trim().slice(0, 60);
  const tokens = typeof b.authorizationCode === 'string' && b.authorizationCode
    ? await canjearCodigo('apple', b.authorizationCode, { nativo: true }).catch((e) => { console.warn('[social] apple código:', e.message); return {}; })
    : {};
  const u = await cuentaDe('apple', persona, tokens.refresh_token ? { refresh: tokens.refresh_token, nativo: true } : {});
  const limpiar = (res) => { res.cookies.delete({ name: 'nonce-apple', path: '/api/login/apple' }); return res; };
  if (u?.sinConfirmar) return limpiar(error('Ese email tiene una cuenta de Fisquo sin confirmar. Entra con tu email y contraseña, o confírmalo desde el correo que te enviamos.', 401));
  if (!u) return limpiar(NextResponse.json({ sinCuenta: true }));
  const abierta = await abrirSesion(u);
  if (!abierta) return limpiar(error('No se ha podido entrar. Vuelve a intentarlo.', 401));
  if (abierta.reto) {
    const res = NextResponse.json({ segundoPaso: true });
    res.cookies.set('reto', abierta.reto, { ...opcionesCookie, maxAge: RETO_DOS_PASOS });
    return limpiar(res);
  }
  await apuntarAcceso(u.id, req, 'Apple');
  return limpiar(await ponerEntrada(NextResponse.json({ ok: true, destino: u.despacho ? '/despacho' : '/' }), abierta.token, u, { recien: true }));
}

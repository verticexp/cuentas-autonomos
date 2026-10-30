import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { opcionesCookie, RETO_DOS_PASOS } from '@/lib/auth';
import { apuntarAcceso } from '@/lib/accesos';
import { ponerEntrada } from '@/lib/entrada';
import { canjear, NOMBRE } from '@/lib/socialServidor';
import { nuevoAzar } from '@/lib/social';
import { cuerpo } from '@/lib/api';
import { redis } from '@/lib/redis';

// «Continuar con Google» en la app de iOS (lib/accesoNativo.js). Antes de abrir ASWebAuthenticationSession, la vista web
// de la app pide un secreto (preparar) que queda en su cookie «canje»; su huella viaja en la URL de inicio y se guarda
// con el código de un solo uso. Al volver, la misma vista web canjea aquí el código: así la sesión queda en las cookies
// de la app y un código abierto en otro navegador no sirve. Solo POST del mismo origen (proxy.js corta los de otro sitio).
export const dynamic = 'force-dynamic';

const COOKIE = { ...opcionesCookie, path: '/api/login/canjear', maxAge: 600 };
const huella = (s) => createHash('sha256').update(String(s)).digest('hex');
const sinCanje = (res) => { res.cookies.delete({ name: 'canje', path: '/api/login/canjear' }); return res; };

export async function POST(req) {
  const b = await cuerpo(req);
  if (b.accion === 'preparar') {
    const secreto = nuevoAzar();
    const res = NextResponse.json({ vinculo: huella(secreto) });
    res.cookies.set('canje', secreto, COOKIE);
    return res;
  }
  const secreto = req.cookies.get('canje')?.value;
  const v = redis && secreto ? await canjear(b.c, huella(secreto)) : null;
  if (!v) return sinCanje(NextResponse.json({ error: 'caducado' }, { status: 401 }));
  if (v.reto) {
    const res = NextResponse.json({ ir: '/login/dos-pasos' });
    res.cookies.set('reto', v.reto, { ...opcionesCookie, maxAge: RETO_DOS_PASOS });
    return sinCanje(res);
  }
  const u = await redis.hget('usuarios', String(v.id));
  if (!u) return sinCanje(NextResponse.json({ error: 'social' }, { status: 401 }));
  await apuntarAcceso(u.id, req, NOMBRE[v.proveedor] || 'Google');
  return sinCanje(await ponerEntrada(NextResponse.json({ ir: u.despacho ? '/despacho' : '/' }), v.token, u, { recien: true }));
}

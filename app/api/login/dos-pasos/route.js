import { NextResponse } from 'next/server';
import { apuntarAcceso } from '@/lib/accesos';
import { completarReto } from '@/lib/dosPasos';
import { ponerEntrada } from '@/lib/entrada';
import { redis } from '@/lib/redis';

// Segundo paso de la entrada con contraseña (lib/dosPasos.js): el código de la app o uno de recuperación, con el reto que
// /api/login dejó en la cookie «reto». Responde en JSON (components/FormCodigo.js) o, sin JavaScript, redirige.
export async function POST(req) {
  const json = req.headers.get('accept')?.includes('application/json');
  const form = await req.formData().catch(() => null);
  const inicio = form?.get('inicio') !== '0';
  const r = await completarReto(req.cookies.get('reto')?.value, form?.get('codigo'));
  if (!r.token) {
    const status = r.bloqueado ? 429 : r.caducado ? 410 : 401;
    const res = json ? NextResponse.json({ error: r.error, caducado: Boolean(r.caducado) }, { status })
      : NextResponse.redirect(new URL(r.caducado ? '/login?error=caducado' : `/login/dos-pasos?error=${r.bloqueado ? 'bloqueado' : 1}`, req.url), 303);
    if (r.caducado) res.cookies.delete('reto');
    return res;
  }
  await apuntarAcceso(r.id, req, r.metodo === 'recuperacion' ? 'Contraseña y código de recuperación' : 'Contraseña y código');
  const cuenta = inicio ? await redis.hget('usuarios', r.id) : null;
  // Quedan pocos códigos de recuperación: se avisa para que genere otros (Ajustes › Seguridad).
  const aviso = r.metodo === 'recuperacion' ? `Te quedan ${r.quedan} códigos de recuperación.${r.quedan <= 3 ? ' Genera otros en Ajustes › Seguridad.' : ''}` : '';
  const res = json ? NextResponse.json({ ok: true, aviso })
    : NextResponse.redirect(new URL(cuenta?.despacho ? '/despacho' : '/', req.url), 303);
  res.cookies.delete('reto');
  return ponerEntrada(res, r.token, cuenta, { inicio, recien: !json });
}

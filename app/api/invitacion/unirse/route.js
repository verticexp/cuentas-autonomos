import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cambiarUsuario, opcionesCookie, usuarioActual } from '@/lib/auth';
import { conMembresia, enEmpresa, membresias } from '@/lib/membresias';
import { sinPlaza } from '@/lib/planes';
import { conCerrojo } from '@/lib/cerrojo';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Enlace del email que recibe quien ya tenía cuenta al ser invitado a otra empresa (api/usuarios). Abrirlo no cambia
// nada: lleva a la página que la enseña (app/invitacion/unirse), y solo se acepta con su botón (POST, con la protección
// de origen de proxy.js), con la sesión de esa misma persona y una sola vez. Así nadie entra en una empresa ajena sin quererlo.
export async function GET(req) {
  const c = String(req.nextUrl.searchParams.get('c') || '');
  return NextResponse.redirect(new URL(`/invitacion/unirse?c=${encodeURIComponent(c)}`, req.url), 303);
}

export async function POST(req) {
  const ir = (q) => NextResponse.redirect(new URL(q, req.url), 303);
  const form = await req.formData().catch(() => null);
  const codigo = String(form?.get('c') || '');
  if (!redis || !codigo) return ir('/');
  const u = await usuarioActual();
  if (!u) return ir('/login?error=' + encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.'));
  const inv = await redis.get(`union:${codigo}`);
  if (!inv || inv.usuario !== u.id) return ir('/?invitacion=caducada');
  return conCerrojo(`usuarios:${inv.empresa}`, async () => {
    // Se borra al usarlo: el enlace vale una sola vez.
    if (!(await redis.del(`union:${codigo}`))) return ir('/?invitacion=caducada');
    const [o, emp] = await Promise.all([redis.hget('usuarios', u.id), redis.hget('empresas', inv.empresa)]);
    if (!o || !emp || emp.baja) return ir('/?invitacion=caducada');
    if (!enEmpresa(o, inv.empresa)) {
      const personas = Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => enEmpresa(x, inv.empresa)).map((x) => ({ id: x.id, ...membresias(x)[inv.empresa] }));
      const papel = { rol: inv.rol, permisos: inv.permisos };
      if (sinPlaza(emp.plan, personas, papel)) return ir('/?invitacion=sin-plaza');
      await cambiarUsuario(o.id, (x) => (enEmpresa(x, inv.empresa) ? null : conMembresia(x, inv.empresa, papel)));
      await auditar({ id: o.id, nombre: o.nombre, empresa: inv.empresa }, 'Invitación aceptada', o.email);
    }
    const r = ir('/');
    r.cookies.set('e', inv.empresa, opcionesCookie);
    return r;
  });
}

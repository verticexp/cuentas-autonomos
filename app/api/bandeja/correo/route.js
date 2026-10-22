import { cuerpo, error, usuarioApi } from '@/lib/api';
import { redis } from '@/lib/redis';
import { emailValido } from '@/lib/email';
import { correoEntranteListo } from '@/lib/correoEntrante';
import { buzonDe, confirmacionVigente, crearBuzon, direccionDe, olvidar, quitarConfirmacion, recordar } from '@/lib/buzon';

export const dynamic = 'force-dynamic';

// La dirección de correo de la bandeja de la empresa (lib/buzon.js), leída de nuevo (la sesión puede traerla vieja).
async function estado(u) {
  const b = buzonDe(await redis.hget('empresas', u.empresa || u.id));
  return { listo: correoEntranteListo(), direccion: direccionDe(b), remitentes: b?.remitentes || [], confirmacion: confirmacionVigente(b) };
}

export async function GET() {
  const { u, res } = await usuarioApi({ permiso: 'gastos' });
  if (res) return res;
  return Response.json({ ok: true, ...(await estado(u)) }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { accion: 'crear' | 'cambiar' | 'anadir' | 'quitar' | 'confirmada', email? }. Cambiar la dirección (la anterior
// deja de recibir y hay que tocar las reglas de reenvío de todos) solo lo hace quien administra la empresa.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  if (!correoEntranteListo()) return error('Recibir facturas por correo aún no está disponible', 503);
  const b = await cuerpo(req);
  if (b.accion === 'crear' || b.accion === 'cambiar') {
    if (b.accion === 'cambiar' && !u.admin) return error('Solo quien administra la empresa puede cambiar la dirección', 403);
    const r = await crearBuzon(u, { nueva: b.accion === 'cambiar' });
    if (r.error) return error(r.error, 500);
  } else if (b.accion === 'anadir' || b.accion === 'quitar') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!emailValido(email)) return error('Escribe un email válido');
    await (b.accion === 'anadir' ? recordar(u, email) : olvidar(u, email));
  } else if (b.accion === 'confirmada') {
    await quitarConfirmacion(u);
  } else return error('Acción no válida');
  return Response.json({ ok: true, ...(await estado(u)) });
}

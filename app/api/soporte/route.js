import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { enviarCorreo } from '@/lib/correos';
import { MUCHOS, pasado } from '@/lib/limite';
import { CONTACTO } from '@/components/web/datos';
import { esFundador } from '@/lib/prueba';
import { TEMAS_SOPORTE as TEMAS } from '@/lib/soporte';

export const dynamic = 'force-dynamic';

// Ajustes › Ayuda y contacto: el mensaje de una persona con sesión llega al equipo de Fisquo con su empresa y su email
// para responderle. CONTACTO_EMAIL cambia el destinatario (como en app/api/contacto).
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (await pasado('soporte', u.id, 5, 3600)) return error(MUCHOS, 429);
  const b = await cuerpo(req);
  const tema = TEMAS.includes(b?.tema) ? b.tema : TEMAS[0];
  const mensaje = String(b?.mensaje || '').trim().slice(0, 3000);
  if (mensaje.length < 5) return error('Cuéntanos un poco más');
  const pagina = String(b?.pagina || '').slice(0, 200);
  const datos = [['Persona', `${u.nombre} <${u.email}>`], ['Empresa', `${u.empresaNombre || ''} (${u.empresa})`], ['Plan', esFundador(u.plan) ? 'Fundador' : `${u.plan.tipo || ''} ${u.plan.nombre || ''}`.trim()], ['Tema', tema], ...(pagina ? [['Desde', pagina]] : [])];
  const r = await enviarCorreo('soporte', {
    para: process.env.CONTACTO_EMAIL || CONTACTO,
    datos: { tema, empresa: u.empresaNombre || u.nombre, datos, mensaje },
    ...(emailValido(u.email) ? { responderA: u.email } : {}),
  });
  if (r.error) return error(`No hemos podido enviarlo. Escríbenos a ${CONTACTO}.`, 502);
  return Response.json({ ok: true });
}

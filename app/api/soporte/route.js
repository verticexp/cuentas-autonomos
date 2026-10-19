import { cuerpo, error, usuarioApi } from '@/lib/api';
import { enviarEmail, emailValido } from '@/lib/email';
import { MUCHOS, pasado } from '@/lib/limite';
import { CONTACTO } from '@/components/web/datos';
import { TEMAS_SOPORTE as TEMAS } from '@/lib/soporte';

export const dynamic = 'force-dynamic';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ajustes › Ayuda y contacto: el mensaje de una persona con sesión llega al equipo de Netto con su empresa y su email
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
  const datos = [['Persona', `${u.nombre} <${u.email}>`], ['Empresa', `${u.empresaNombre || ''} (${u.empresa})`], ['Plan', u.plan ? `${u.plan.tipo || ''} ${u.plan.nombre || ''}`.trim() : '—'], ['Tema', tema], ...(pagina ? [['Desde', pagina]] : [])];
  const r = await enviarEmail({
    para: process.env.CONTACTO_EMAIL || CONTACTO,
    asunto: `[Ayuda] ${tema} · ${u.empresaNombre || u.nombre}`,
    html: `<div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;color:#0F1F1B"><table style="border-collapse:collapse">${datos.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#5B6360">${k}</td><td>${esc(v)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(mensaje)}</p></div>`,
    ...(emailValido(u.email) ? { responderA: u.email } : {}),
  });
  if (r.error) return error(`No hemos podido enviarlo. Escríbenos a ${CONTACTO}.`, 502);
  return Response.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { emailValido, enviarEmail } from '@/lib/email';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';
import { redis } from '@/lib/redis';

// Formulario «Pedir acceso» de la web pública (components/web/FormContacto.js): guarda la solicitud y avisa por email.
// CONTACTO_EMAIL cambia el destinatario (por defecto, el email de empresa).
const DESTINO = () => process.env.CONTACTO_EMAIL || 'corporate@nettohq.com';
const CAMPOS = { nombre: 80, email: 120, empresa: 120, tipo: 40, plan: 60, vengo: 60, mensaje: 1500 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ETIQUETAS = { nombre: 'Nombre', email: 'Email', empresa: 'Empresa', tipo: 'Tipo de negocio', plan: 'Plan', vengo: 'Usa ahora', mensaje: 'Mensaje' };

export async function POST(req) {
  const d = await req.json().catch(() => ({}));
  // Campo trampa: invisible para personas, los bots lo rellenan. Se responde «ok» sin hacer nada.
  if (d.web) return NextResponse.json({ ok: true });
  if (await pasado('contacto', ipDe(req), 5, 3600)) return NextResponse.json({ error: MUCHOS }, { status: 429 });

  const s = Object.fromEntries(Object.entries(CAMPOS).map(([k, max]) => [k, String(d[k] ?? '').trim().slice(0, max)]));
  if (!s.nombre) return NextResponse.json({ error: 'Escribe tu nombre.' }, { status: 400 });
  if (!emailValido(s.email)) return NextResponse.json({ error: 'Revisa tu email.' }, { status: 400 });

  const solicitud = { ...s, fecha: new Date().toISOString() };
  const guardada = redis ? await redis.lpush('solicitudes', JSON.stringify(solicitud)).then(() => true).catch(() => false) : false;
  if (guardada) await redis.ltrim('solicitudes', 0, 1999).catch(() => {});

  const filas = Object.entries(ETIQUETAS).filter(([k]) => s[k]).map(([k, t]) => `<tr><td style="padding:6px 14px 6px 0;color:#5B6360;vertical-align:top">${t}</td><td style="padding:6px 0">${esc(s[k]).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const r = await enviarEmail({
    para: DESTINO(),
    asunto: `Nueva solicitud de acceso: ${s.nombre}${s.empresa ? ` (${s.empresa})` : ''}`,
    html: `<div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;color:#0F1F1B"><p>Alguien ha pedido acceso a Netto desde la web.</p><table style="border-collapse:collapse">${filas}</table><p style="color:#5B6360">Responde a este email para escribirle directamente.</p></div>`,
    responderA: s.email,
  });

  // Basta con que quede en un sitio: guardada en la base de datos o enviada por email.
  if (r.error && !guardada) return NextResponse.json({ error: 'No hemos podido enviar tu solicitud. Escríbenos a corporate@nettohq.com.' }, { status: 502 });
  if (r.error) console.warn('[contacto] solicitud guardada, pero el email no salió:', r.error);
  return NextResponse.json({ ok: true });
}

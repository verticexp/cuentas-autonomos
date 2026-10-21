import { after } from 'next/server';
import { redis } from '@/lib/redis';
import { enviarTexto, firmaValida, mensajesDe, whatsappListo } from '@/lib/whatsapp';
import { atenderMensaje } from '@/lib/whatsappServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Alta del webhook en Meta: devuelve el reto si el token coincide.
export async function GET(req) {
  const p = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === token) return new Response(p.get('hub.challenge') || '');
  return new Response('No autorizado', { status: 403 });
}

// Mensajes entrantes. Se contesta 200 enseguida (si no, Meta reintenta) y se atienden después.
export async function POST(req) {
  if (!redis || !whatsappListo()) return new Response('No configurado', { status: 503 });
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) return new Response('Firma no válida', { status: 401 });
  let aviso;
  try { aviso = JSON.parse(cuerpo); } catch { return new Response('JSON no válido', { status: 400 }); }
  const mensajes = mensajesDe(aviso);
  after(async () => {
    for (const m of mensajes) {
      try {
        const r = await atenderMensaje(m);
        if (r) await enviarTexto(m.de, r);
      } catch (e) {
        console.error('[whatsapp]', e);
        await enviarTexto(m.de, 'Ha fallado algo al atender tu mensaje. Prueba de nuevo en unos minutos.').catch(() => {});
      }
    }
  });
  return new Response('ok');
}

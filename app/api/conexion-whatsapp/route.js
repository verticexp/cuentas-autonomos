import QRCode from 'qrcode';
import { error, usuarioApi } from '@/lib/api';
import { rafaga, respuesta429 } from '@/lib/limite';
import { mensajePlan } from '@/lib/app';
import { sinFuncion } from '@/lib/planes';
import { whatsappListo } from '@/lib/whatsapp';
import { crearCodigo, desvincular, enlaceWa, numeroFisquo, telefonoBonito, telefonoDe } from '@/lib/whatsappVinculo';

export const dynamic = 'force-dynamic';

// Estado de la conexión de esta persona (Ajustes › WhatsApp lo consulta mientras espera el código).
export async function GET() {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const tel = await telefonoDe(u.id);
  return Response.json({ conectado: Boolean(tel), telefono: tel ? telefonoBonito(tel) : null });
}

// Código nuevo para conectar el WhatsApp de esta persona (10 minutos, un solo uso).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  if (!whatsappListo()) return error('Fisquo por WhatsApp aún no está disponible', 503);
  const no = sinFuncion(u.plan, 'whatsapp');
  if (no) return error(mensajePlan(no, req.headers.get('user-agent')), 403);
  if (await rafaga('whatsapp-codigo', u.id, 5, 600)) return respuesta429(600, 'Has pedido demasiados códigos seguidos. Espera unos minutos.');
  const codigo = await crearCodigo(u);
  const numero = numeroFisquo();
  const enlace = enlaceWa(numero, codigo);
  // QR del mismo enlace, para conectarlo desde el ordenador con la cámara del móvil.
  const qr = enlace ? await QRCode.toDataURL(enlace, { margin: 1, width: 200 }) : null;
  return Response.json({ ok: true, codigo, enlace, qr, numero: numero ? telefonoBonito(numero) : null });
}

export async function DELETE() {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  await desvincular(u.id);
  return Response.json({ ok: true });
}

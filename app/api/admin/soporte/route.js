import { cuerpo, error, usuarioApi } from '@/lib/api';
import { guardarConversacion, leerConversacion, recientes, responderEquipo } from '@/lib/soporteServidor';

export const dynamic = 'force-dynamic';

// Panel /admin › Soporte: las conversaciones recientes (las pasadas al equipo primero).
export async function GET() {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const cs = await recientes();
  const orden = { persona: 0, ia: 1, cerrada: 2 };
  cs.sort((a, b) => orden[a.estado] - orden[b.estado] || Date.parse(b.actualizada) - Date.parse(a.actualizada));
  return Response.json({ conversaciones: cs }, { headers: { 'Cache-Control': 'no-store' } });
}

// { id, texto } responde (y avisa al cliente); { id, cerrar: true } la da por resuelta; { id, leida: true } la marca leída.
export async function POST(req) {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b?.id || '');
  const c = id && (await leerConversacion(id));
  if (!c) return error('Esa conversación ya no existe', 404);
  if (b.cerrar) return Response.json({ conversacion: await guardarConversacion({ ...c, estado: 'cerrada', leidaEquipo: true }) });
  if (b.leida) return Response.json({ conversacion: await guardarConversacion({ ...c, leidaEquipo: true }) });
  const texto = String(b.texto || '').trim();
  if (!texto) return error('Escribe la respuesta');
  return Response.json({ conversacion: await responderEquipo(id, texto) });
}

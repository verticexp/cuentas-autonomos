import { cuerpo, error, usuarioApi } from '@/lib/api';
import { MUCHOS, pasado } from '@/lib/limite';
import { metrica } from '@/lib/metricas';
import { MAX_MENSAJE, TEXTO_HORARIO, enHorario, proximaApertura, vistaCliente } from '@/lib/soporte';
import { anadir, avisarAlEquipo, guardarConversacion, leerConversacion, nuevaConversacion, pasarAPersona, responderIA, textoPasada } from '@/lib/soporteServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const horario = () => ({ enHorario: enHorario(), texto: TEXTO_HORARIO, vuelve: proximaApertura() });

// Ajustes › Ayuda: la conversación de soporte de esta persona (lib/soporteServidor.js).
export async function GET() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  let c = await leerConversacion(u.id);
  if (c && c.leidaCliente === false) c = await guardarConversacion({ ...c, leidaCliente: true });
  return Response.json({ conversacion: vistaCliente(c?.estado === 'cerrada' ? null : c), horario: horario() }, { headers: { 'Cache-Control': 'no-store' } });
}

// { texto } o { persona: true } (botón «Hablar con una persona»). Responde el asistente salvo que ya esté con el equipo.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (await pasado('soporte-chat', u.id, 60, 86400)) return error(MUCHOS, 429);
  const b = await cuerpo(req);
  const texto = String(b?.texto || '').trim().slice(0, MAX_MENSAJE);
  if (!texto && !b?.persona) return error('Escribe tu duda');
  const ahora = new Date();
  let c = await leerConversacion(u.id);
  if (!c || c.estado === 'cerrada') c = nuevaConversacion(u, ahora.toISOString());
  if (texto) c = anadir(c, 'cliente', texto, ahora.toISOString());
  if (b?.persona) {
    c = anadir(pasarAPersona(c, 'Lo pide el cliente', ahora.toISOString()), 'ia', textoPasada(ahora), ahora.toISOString());
  } else if (c.estado === 'ia') {
    try {
      const r = await responderIA(u, c, { pagina: String(b?.pagina || '').slice(0, 200), ahora });
      if (r.pasar) c = pasarAPersona(c, r.motivo, ahora.toISOString());
      c = anadir(c, 'ia', r.texto || (r.pasar ? textoPasada(ahora) : ''), ahora.toISOString());
      metrica('soporte-ia', { usuario: u.id, pasada: Boolean(r.pasar) });
    } catch (e) {
      console.warn('[soporte] IA', e.message);
      c = anadir(pasarAPersona(c, 'El asistente no ha podido responder', ahora.toISOString()), 'ia', textoPasada(ahora), ahora.toISOString());
    }
  }
  if (c.estado === 'persona') c = await avisarAlEquipo(c, ahora);
  c = await guardarConversacion({ ...c, leidaCliente: true });
  return Response.json({ conversacion: vistaCliente(c), horario: horario() });
}

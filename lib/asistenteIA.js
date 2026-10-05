// Asistente con IA (Claude): responde preguntas sobre las cuentas usando solo las herramientas de lib/asistente.js.
// Hace falta ANTHROPIC_API_KEY en Vercel; ANTHROPIC_MODEL_ASISTENTE para cambiar de modelo.
import { leer, clave, redis } from './redis.js';
import { DATOS_DE, HERRAMIENTAS, cifrasInventadas, definiciones, ejecutar } from './asistente.js';
import { fiscalDe, usa130, usa303 } from './empresa.js';

const MAX_VUELTAS = 6;

function sistema(u, hoy) {
  const f = fiscalDe(u);
  return `Eres el asistente de Netto, la app de facturas y cuentas de ${u.empresaNombre || 'esta empresa'} (${f.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}${usa303(f) ? ', presenta IVA (303)' : ', no presenta 303'}${usa130(f) ? ' y pago a cuenta del IRPF (130)' : ''}). Hoy es ${hoy}.
Reglas:
- Responde en español, en 1-4 frases, claro y sin tecnicismos.
- Cada cifra que des tiene que salir de una herramienta y copiarse tal cual (mismo formato). No sumes, restes ni estimes cifras tú: si hace falta otro total, vuelve a llamar a la herramienta con otros filtros.
- Si no hay herramienta para lo que te preguntan, o no tienes acceso, dilo: "Con tus permisos no puedo ver eso".
- Solo hablas de los datos de esta empresa. No des asesoramiento fiscal más allá de las cifras: para decisiones, que lo confirme su gestor.
- Si el trimestre está en curso, recuerda que la cifra cambiará con lo que falte por apuntar.`;
}

async function llamarIA(body) {
  const r = await fetch(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40000),
  }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (!r?.ok || !d) throw new Error('El asistente no responde ahora. Prueba en un rato.');
  return d;
}

// Pregunta → respuesta comprobada. historial: turnos anteriores (solo texto, ya limpios).
export async function preguntar(u, pregunta, historial, hoy) {
  const tools = definiciones(u);
  const messages = [...historial, { role: 'user', content: pregunta }];
  const datos = {};
  const resultados = [];
  const usadas = [];
  let reintento = false;
  const cargar = async (nombre) => {
    for (const k of DATOS_DE[nombre] || []) {
      if (k in datos) continue;
      datos[k] = k === 'saldo' ? await redis.get(clave(u, 'saldo')) : (await leer(u, k)) || [];
    }
  };
  for (let i = 0; i < MAX_VUELTAS; i++) {
    const d = await llamarIA({ model: process.env.ANTHROPIC_MODEL_ASISTENTE || 'claude-sonnet-5-5', max_tokens: 700, system: sistema(u, hoy), tools, messages });
    const usos = (d.content || []).filter((c) => c.type === 'tool_use');
    if (usos.length) {
      messages.push({ role: 'assistant', content: d.content });
      const out = [];
      for (const t of usos) {
        let r;
        if (!tools.some((x) => x.name === t.name)) r = { error: 'No tienes permiso para ver estos datos' };
        else { await cargar(t.name); r = ejecutar(u, t.name, t.input, datos, hoy); }
        resultados.push(r);
        const titulo = HERRAMIENTAS.find((x) => x.name === t.name)?.titulo;
        if (titulo && !r.error && !usadas.includes(titulo)) usadas.push(titulo);
        out.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(r) });
      }
      messages.push({ role: 'user', content: out });
      continue;
    }
    const texto = (d.content || []).map((c) => c.text || '').join('').trim();
    const malas = cifrasInventadas(texto, resultados);
    if (!malas.length) return { respuesta: texto || 'No tengo respuesta para eso.', fuentes: usadas };
    if (reintento) break;
    reintento = true;
    messages.push({ role: 'assistant', content: texto }, { role: 'user', content: `Estas cifras no salen de las herramientas: ${malas.join(', ')}. Vuelve a responder usando solo cifras que aparezcan en los resultados, copiadas tal cual (llama a otra herramienta si hace falta).` });
  }
  return { respuesta: 'No he podido comprobar esas cifras con tus datos, así que prefiero no dártelas. Prueba a preguntarlo de otra forma o mira la pantalla correspondiente.', fuentes: usadas, sinComprobar: true };
}

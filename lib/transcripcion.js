// Notas de voz → texto (Fisquo por WhatsApp). Claude no escucha audio: se usa un servicio de transcripción compatible con
// la API de OpenAI (OPENAI_API_KEY; TRANSCRIPCION_URL y TRANSCRIPCION_MODELO para cambiar de proveedor o modelo).
export const transcripcionLista = () => Boolean(process.env.OPENAI_API_KEY);

export async function transcribir(datos, tipo = 'audio/ogg') {
  const ext = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr' }[tipo] || 'ogg';
  const form = new FormData();
  form.append('file', new Blob([datos], { type: tipo }), `nota.${ext}`);
  form.append('model', process.env.TRANSCRIPCION_MODELO || 'gpt-4o-mini-transcribe');
  form.append('language', 'es');
  const r = await fetch(process.env.TRANSCRIPCION_URL || 'https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Transcripción ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return String((await r.json()).text || '').trim().slice(0, 1000);
}

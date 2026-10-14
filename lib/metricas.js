// Métricas y registros estructurados (informe de capacidad E11): una línea JSON por evento en los registros de Vercel,
// para filtrarlas, agregarlas o enviarlas a otro servicio (drain). Nunca datos fiscales, nombres, emails, importes ni
// secretos: solo qué ha pasado, cuánto ha tardado y la empresa por su id interno.
export function metrica(evento, datos = {}) {
  try { console.log(JSON.stringify({ metrica: evento, t: new Date().toISOString(), ...datos })); } catch {}
}

// Mide una operación: metrica(evento, { ms, ok, ...extra }). Devuelve lo que devuelva fn (y relanza su error).
export async function medir(evento, fn, extra = {}) {
  const inicio = Date.now();
  try {
    const r = await fn();
    metrica(evento, { ms: Date.now() - inicio, ok: true, ...extra });
    return r;
  } catch (e) {
    metrica(evento, { ms: Date.now() - inicio, ok: false, error: String(e?.name || 'Error'), ...extra });
    throw e;
  }
}

// Llamadas a proveedores externos (IA, Stripe, correo, banco) con plazos y fallos acotados (informe de capacidad E08):
// timeout por llamada, plazo total opcional, reintentos limitados con espera creciente (respetando Retry-After) solo en
// operaciones idempotentes, y un circuito por proveedor que tras 5 fallos seguidos falla rápido durante un minuto.
// Plazos exportados para simular el tiempo sin esperas de segundos en las pruebas.
export const PLAZOS_PROVEEDOR = { timeoutMs: 15000, reintentos: 2, esperaMs: 200, circuitoMs: 60000 };
const circuitos = new Map();

// La señal cubre fetch y la lectura del cuerpo, incluso con un fetch simulado que no atienda abort.
export async function conPlazo(fn, signal) {
  signal.throwIfAborted();
  let abortar;
  const corte = new Promise((_, reject) => {
    abortar = () => reject(signal.reason);
    signal.addEventListener('abort', abortar, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(fn), corte]); }
  finally { signal.removeEventListener('abort', abortar); }
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function esperaReintento(r, intento) {
  const cabecera = r?.headers?.get('retry-after');
  const proveedor = cabecera == null ? 0 : /^\d+(\.\d+)?$/.test(cabecera)
    ? Number(cabecera) * 1000 : Math.max(0, Date.parse(cabecera) - Date.now()) || 0;
  return Math.max(proveedor, PLAZOS_PROVEEDOR.esperaMs * 2 ** intento * (1 + Math.random()));
}

// Solo el llamador puede declarar una operación idempotente (GET de Stripe o inferencia de IA).
export async function proveedorJSON(proveedor, url, opciones, { idempotente = false, timeoutMs = PLAZOS_PROVEEDOR.timeoutMs, deadline = Infinity, reservaMs = 0 } = {}) {
  const circuito = circuitos.get(proveedor) || { fallos: 0, hasta: 0 };
  circuitos.set(proveedor, circuito);
  const disponible = () => {
    if (circuito.hasta > Date.now()) throw new Error(`${proveedor} no está disponible temporalmente. Prueba dentro de un minuto.`);
    if (circuito.hasta) { circuito.hasta = 0; circuito.fallos = 0; }
  };
  for (let intento = 0; ; intento++) {
    disponible();
    const restante = Math.min(timeoutMs, deadline - Date.now() - reservaMs);
    if (restante <= 0) throw new Error('Se ha agotado el tiempo de respuesta. Prueba de nuevo.');
    let r;
    try {
      const signal = AbortSignal.timeout(Math.max(1, Math.floor(restante)));
      const resultado = await conPlazo(async () => {
        r = await fetch(url, { ...opciones, signal });
        const d = r.status === 204 || r.status === 205 ? {} : await r.json();
        if (!r.ok) throw Object.assign(new Error(d?.error?.message || d?.message || (typeof d?.error === 'string' ? d.error : '') || `${proveedor} no responde (${r.status}).`), { status: r.status, datos: d });
        return { r, d };
      }, signal);
      circuito.fallos = 0;
      return resultado;
    } catch (e) {
      const transitorio = !e.status || e.status === 429 || e.status >= 500;
      if (!transitorio) { circuito.fallos = 0; throw e; }
      if (++circuito.fallos >= 5) circuito.hasta = Date.now() + PLAZOS_PROVEEDOR.circuitoMs;
      const error = e.name === 'TimeoutError' || e.name === 'AbortError'
        ? new Error(`${proveedor} ha superado el tiempo máximo de respuesta. Prueba en un rato.`) : e;
      if (!idempotente || intento >= PLAZOS_PROVEEDOR.reintentos || circuito.hasta) throw error;
      const espera = esperaReintento(r, intento);
      if (Date.now() + espera + reservaMs >= deadline) throw error;
      await pausa(espera);
    }
  }
}


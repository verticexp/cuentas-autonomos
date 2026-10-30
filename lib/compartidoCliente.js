// Lo compartido con Fisquo desde el móvil: el service worker (app/sw) lo deja en Cache Storage y la bandeja lo recoge
// aquí para subirlo con la sesión normal. Se consumen una sola vez para no repetir una subida al volver a la bandeja.
// En la app de iOS llegan por el plugin nativo (mobile/ios/App/App/CompartirPlugin.swift), en base64, y se quedan allí
// hasta confirmarCompartidos(): si al compartir la app estaba bloqueada, se suben después de desbloquear.
// Cualquier página puede mandar un POST a /compartir y dejar archivos en la caché (app/sw): por eso la bandeja enseña los
// nombres y no sube nada sin que la persona acepte. Para eso se leen con {conservar: true} (la caché sigue ahí) y, al
// aceptar o cancelar, se limpia con descartarCompartidos().
export async function leerCompartidos({ conservar = false } = {}) {
  const archivos = [];
  if (typeof window === 'undefined') return archivos;
  const nativo = window.Capacitor?.Plugins?.Compartir;
  if (nativo) {
    try {
      for (const a of (await nativo.pendientes()).archivos || []) {
        const bytes = Uint8Array.from(atob(a.datos), (c) => c.charCodeAt(0));
        archivos.push(new File([bytes], a.nombre || 'archivo', { type: a.tipo || 'application/octet-stream' }));
      }
    } catch {}
    return archivos;
  }
  if (!('caches' in window)) return archivos;
  try {
    const cache = await window.caches.open('fisquo-compartido');
    for (const clave of await cache.keys()) {
      try {
        const respuesta = await cache.match(clave);
        if (!respuesta) continue;
        const nombre = decodeURIComponent(respuesta.headers.get('X-Nombre') || 'archivo');
        archivos.push(new File([await respuesta.blob()], nombre, { type: respuesta.headers.get('Content-Type') || 'application/octet-stream' }));
      } catch {}
    }
  } catch {} finally {
    if (!conservar) try { await window.caches.delete('fisquo-compartido'); } catch {}
  }
  return archivos;
}

// Cancelar: la caché de lo compartido queda vacía (y, en la app de iOS, lo pendiente en el iPhone se da por visto).
export async function descartarCompartidos() {
  if (typeof window === 'undefined') return;
  try { await window.caches?.delete('fisquo-compartido'); } catch {}
  try { await window.Capacitor?.Plugins?.Compartir?.subidos(); } catch {}
}

const nativo = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Compartir || null);
export const hayCompartidosNativos = async () => Boolean(nativo() && (await nativo().pendientes().catch(() => ({}))).archivos?.length);
export const confirmarCompartidos = () => nativo()?.subidos().catch(() => {});

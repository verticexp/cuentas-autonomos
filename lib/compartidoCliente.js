// Lo compartido con Fisquo desde el móvil: el service worker (app/sw) lo deja en Cache Storage y la bandeja lo recoge
// aquí para subirlo con la sesión normal. Se consumen una sola vez para no repetir una subida al volver a la bandeja.
// En la app de iOS llegan por el plugin nativo (mobile/ios/App/App/CompartirPlugin.swift), en base64.
export async function leerCompartidos() {
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
    try { await window.caches.delete('fisquo-compartido'); } catch {}
  }
  return archivos;
}

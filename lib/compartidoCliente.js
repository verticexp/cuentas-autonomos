// Lo compartido con Fisquo desde el móvil: el service worker (app/sw) lo deja en Cache Storage y la bandeja lo recoge
// aquí para subirlo con la sesión normal. Se consumen una sola vez para no repetir una subida al volver a la bandeja.
export async function leerCompartidos() {
  const archivos = [];
  if (typeof window === 'undefined' || !('caches' in window)) return archivos;
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

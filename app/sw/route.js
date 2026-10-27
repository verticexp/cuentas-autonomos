// Service worker de la PWA: muestra avisos, guarda temporalmente los archivos compartidos y, sin conexión, enseña la página
// «Sin conexión» (app/sin-conexion) en lugar del error del navegador. Nunca guarda pantallas con datos.
const SW = `self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.titulo || 'Fisquo', { body: d.cuerpo || '', icon: '/apple-icon', badge: '/apple-icon', data: { url: d.url || '/' }, tag: d.tipo }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ls) => {
    const w = ls.find((c) => c.url.startsWith(self.location.origin));
    return w ? w.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});
const OFFLINE = 'fisquo-sin-conexion-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(OFFLINE).then((c) => c.add(new Request('/sin-conexion', { cache: 'reload' }))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fisquo-sin-conexion') && k !== OFFLINE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Navegar sin red: la página guardada «Sin conexión» (con botón para reintentar), no la del navegador.
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate' || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match('/sin-conexion', { cacheName: OFFLINE })) || Response.error()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/compartir') return;
  e.respondWith((async () => {
    let n = 0;
    try {
      await caches.delete('fisquo-compartido');
      const form = await e.request.formData();
      const cache = await caches.open('fisquo-compartido');
      const archivos = form.getAll('archivos').filter((f) => f instanceof File).slice(0, 10);
      const tipos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'];
      const ahora = Date.now();
      for (const file of archivos) {
        if (!file.size || file.size > 5 * 1024 * 1024) continue;
        if (!tipos.includes(file.type.toLowerCase()) && !/\\.(pdf|jpe?g|png|webp|xml)$/i.test(file.name)) continue;
        await cache.put('/compartido/' + ahora + '-' + n, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Nombre': encodeURIComponent(file.name) } }));
        n++;
      }
    } catch {}
    return Response.redirect(new URL('/gastos/bandeja?compartido=' + n, self.location.origin).href, 303);
  })());
});`;

export const dynamic = 'force-static';
export function GET() {
  return new Response(SW, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' } });
}

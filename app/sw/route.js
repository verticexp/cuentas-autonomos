// Service worker de la PWA: solo muestra los avisos y abre la app al tocarlos (no guarda nada en caché).
const SW = `self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.titulo || 'Netto', { body: d.cuerpo || '', icon: '/apple-icon', badge: '/apple-icon', data: { url: d.url || '/' }, tag: d.tipo }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ls) => {
    const w = ls.find((c) => c.url.startsWith(self.location.origin));
    return w ? w.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});`;

export const dynamic = 'force-static';
export function GET() {
  return new Response(SW, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' } });
}

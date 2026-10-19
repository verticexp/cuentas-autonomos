import { WEB } from '@/lib/web';

// Buscadores: solo la web pública. La app, la API y los enlaces privados (presupuestos, portal, pagos) no se indexan.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/p/', '/portal/', '/pagar/', '/invitacion', '/confirmar-email', '/bloqueo'] },
    sitemap: `${WEB}/sitemap.xml`,
  };
}

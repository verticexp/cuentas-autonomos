import { WEB } from '@/lib/web';
import { FUNCIONES } from '@/components/web/datos';

// Páginas públicas de app/(web) y legales. Al añadir una página pública, ponla aquí y en PUBLICO de proxy.js.
const PAGINAS = ['', '/funciones', '/precios', '/autonomos', '/pymes', '/business', '/grandes-empresas', '/seguridad', '/verificado', '/contacto', '/gestorias', '/privacidad', '/condiciones'];

export default function sitemap() {
  return [...PAGINAS, ...FUNCIONES.map((f) => `/funciones/${f.slug}`)].map((p) => ({ url: `${WEB}${p}` }));
}

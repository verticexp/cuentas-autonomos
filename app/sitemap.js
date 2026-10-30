import { WEB } from '@/lib/web';
import { FUNCIONES } from '@/components/web/datos';
import { GUIAS, REVISION_GUIAS } from '@/data/web-guias';
import { RIVALES } from '@/data/web-comparativas';
import { identidadLegal } from '@/lib/webLegal';

// Páginas públicas de app/(web) y legales. Al añadir una página pública, ponla aquí y en PUBLICO de lib/rutasPublicas.js.
// /aviso-legal solo existe si data/empresa-legal.js tiene datos (si no, da 404 y no debe estar en el mapa).
const PAGINAS = ['', '/funciones', '/precios', '/autonomos', '/pymes', '/business', '/seguridad', '/verificado', '/contacto', '/gestorias', '/demo', '/guias', '/comparativa', '/privacidad', '/condiciones'];

export default function sitemap() {
  return [
    ...PAGINAS,
    ...FUNCIONES.map((f) => `/funciones/${f.slug}`),
    ...GUIAS.map((g) => ({ ruta: `/guias/${g.slug}`, cambio: REVISION_GUIAS })),
    ...RIVALES.map((r) => `/comparativa/${r.slug}`),
    ...(identidadLegal() ? ['/aviso-legal'] : []),
  ].map((p) => (typeof p === 'string' ? { url: `${WEB}${p}` } : { url: `${WEB}${p.ruta}`, lastModified: p.cambio }));
}

import { WEB } from '@/lib/web';
import { FUNCIONES, PLANES } from '@/components/web/datos';
import { GUIAS } from '@/data/web-guias';
import { RIVALES } from '@/data/web-comparativas';

// llms.txt (llmstxt.org): resumen de la web pública para asistentes de IA (ChatGPT, Claude, Perplexity…), con enlaces a
// las páginas que conviene leer. Sale de los mismos datos que el sitemap, así no se queda desfasado.
export const dynamic = 'force-static';

const lista = (filas) => filas.map(([t, ruta, d]) => `- [${t}](${WEB}${ruta})${d ? `: ${d}` : ''}`).join('\n');

export function GET() {
  const texto = `# Fisquo

> Software de facturación, gastos, impuestos y contabilidad para autónomos y pymes de España. Facturas con Verifactu, lectura de tickets con IA, conciliación bancaria y cálculo de los modelos 303, 130, 111, 115, 390, 347 y del Impuesto sobre Sociedades. La gestoría entra gratis con su propio acceso.

Precios sin IVA, por empresa: autónomos desde ${PLANES.aut[0].p} € al mes y pymes desde ${PLANES.pym[0].p} € al mes. Prueba de 30 días sin tarjeta y sin permanencia. Funciona en la web y se instala como app en el móvil (la app de iPhone está en preparación), en castellano, catalán e inglés. Cubre territorio común, Canarias (IGIC), Navarra y País Vasco.

## Producto

${lista([['Funciones', '/funciones', 'todo lo que hace Fisquo'], ...FUNCIONES.map((f) => [f.nombre, `/funciones/${f.slug}`, f.corto])])}

## Precios y planes

${lista([['Precios', '/precios', 'planes Esencial, Pro y Plus para autónomos y pymes'], ['Autónomos', '/autonomos'], ['Pymes', '/pymes'], ['Business', '/business', 'varias sociedades o equipos grandes'], ['Gestorías', '/gestorias', 'programa para despachos']])}

## Guías fiscales

${lista(GUIAS.map((g) => [g.titulo, `/guias/${g.slug}`, g.descripcion]))}

## Comparativas

${lista(RIVALES.map((r) => [`Fisquo frente a ${r.nombre}`, `/comparativa/${r.slug}`]))}

## Confianza

${lista([['Seguridad', '/seguridad'], ['Verifactu', '/verificado'], ['Privacidad', '/privacidad'], ['Contacto', '/contacto']])}
`;
  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

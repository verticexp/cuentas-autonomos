import { WEB } from './web.js';

// Metadatos de las páginas nuevas de la web pública. El título es absoluto: app/layout.js solo quita el «· Fisquo»
// automático a las rutas de su lista, y estas no están en ella. No se define openGraph a propósito: al hacerlo se perdería
// la imagen de opengraph-image (la imagen y la tarjeta grande de X); title y description ya pasan solos a Open Graph.
export function metaPagina({ titulo, descripcion, ruta }) {
  return {
    title: { absolute: `${titulo} · Fisquo` },
    description: descripcion,
    alternates: { canonical: `${WEB}${ruta}` },
  };
}

// Datos estructurados en JSON-LD. Se escapa «<» para que un texto nunca pueda cerrar la etiqueta <script>.
export const jsonLd = (datos) => JSON.stringify(datos).replace(/</g, '\\u003c');

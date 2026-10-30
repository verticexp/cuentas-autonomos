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

// Perfiles oficiales de Fisquo fuera de su web: unen la marca en buscadores y asistentes de IA (y la distinguen de
// FisQO, una plataforma fiscal mexicana con nombre parecido). Añadir aquí LinkedIn, App Store… cuando existan.
export const PERFILES = ['https://www.g2.com/products/fisquo/reviews'];

// Portada: quién es Fisquo (Organization), el sitio (WebSite) y el producto con sus precios de entrada sin IVA
// (SoftwareApplication). Los precios salen de los planes Esencial de components/web/datos.js.
export function datosPortada({ web = WEB, autonomo = 9, pyme = 25 } = {}) {
  const org = {
    '@type': 'Organization', '@id': `${web}/#org`, name: 'Fisquo', legalName: 'Xiverno Tecnologías y Eventos, S.L.', url: web, logo: `${web}/icon1.svg`,
    description: 'Fisquo es un software español de facturación, gastos, impuestos y contabilidad para autónomos y pymes de España.',
    areaServed: { '@type': 'Country', name: 'España' }, sameAs: PERFILES,
  };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      { '@type': 'WebSite', '@id': `${web}/#web`, url: web, name: 'Fisquo', inLanguage: 'es-ES', publisher: { '@id': org['@id'] } },
      {
        '@type': 'SoftwareApplication', name: 'Fisquo', url: web, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
        description: 'Software español de facturación con Verifactu, gastos con IA, impuestos (303, 130, 111…) y contabilidad para autónomos y pymes de España.', inLanguage: 'es-ES',
        publisher: { '@id': org['@id'] },
        offers: [
          { '@type': 'Offer', name: 'Autónomos', price: autonomo, priceCurrency: 'EUR', url: `${web}/precios` },
          { '@type': 'Offer', name: 'Pymes', price: pyme, priceCurrency: 'EUR', url: `${web}/precios` },
        ],
      },
    ],
  };
}

// Preguntas frecuentes de una página (FAQPage). Una sola por página: cada página pública lleva como mucho un <Faq>.
export const datosFaq = (preguntas) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: preguntas.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

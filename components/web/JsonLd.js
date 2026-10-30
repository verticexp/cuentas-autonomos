import { headers } from 'next/headers';
import { jsonLd } from '@/lib/webMeta';

// Datos estructurados con el nonce de la CSP (proxy.js): todo <script> de la página lo lleva, aunque no se ejecute.
export default async function JsonLd({ datos }) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd(datos) }} />;
}

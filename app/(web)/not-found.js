import Link from 'next/link';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

export async function generateMetadata() { return { title: (await textos())('No existe · Fisquo') }; }

// Lo mismo que app/not-found.js, con la cabecera oscura de la web (la de la app no se vería sobre ella).
export default async function NoExisteWeb() {
  const tr = await textos();
  return (
    <section className="web-hero-pag centro">
      <h1 className="web-entra">{conHuecos(tr('Vaya, esto {resalte}'), { resalte: <em>{tr('no existe')}</em> })}</h1>
      <p className="web-sub web-entra" style={{ '--d': '60ms' }}>{tr('Puede que la página se haya movido o que la dirección no esté bien escrita.')}</p>
      <p className="web-entra" style={{ '--d': '120ms' }}><Link href="/" className="web-btn">{tr('Ir al inicio')}</Link></p>
    </section>
  );
}

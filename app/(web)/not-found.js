import Link from 'next/link';

export const metadata = { title: 'No existe · Netto' };

// Lo mismo que app/not-found.js, con la cabecera oscura de la web (la de la app no se vería sobre ella).
export default function NoExisteWeb() {
  return (
    <section className="web-hero-pag centro">
      <h1 className="web-entra">Vaya, esto <em>no existe</em></h1>
      <p className="web-sub web-entra" style={{ '--d': '60ms' }}>Puede que la página se haya movido o que la dirección no esté bien escrita.</p>
      <p className="web-entra" style={{ '--d': '120ms' }}><Link href="/" className="web-btn">Ir al inicio</Link></p>
    </section>
  );
}

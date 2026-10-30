import { RIVALES, euros } from '@/data/web-comparativas';
import { preciosFisquo } from '@/lib/webComparativa';

// Precios publicados, uno al lado de otro. Lo de Fisquo sale de la oferta pública (components/web/datos.js); lo de los
// demás, de data/web-comparativas.js, con la fecha en que se comprobó.
export default function TablaPreciosComparativa() {
  const p = preciosFisquo();
  const filas = [
    ['Fisquo · Autónomos', `${p.aut.join(' · ')} €/mes`, 'Tres planes cerrados, sin IVA, una empresa por suscripción'],
    ['Fisquo · Pymes', `${p.pym.join(' · ')} €/mes`, 'Tres planes cerrados, sin IVA, una empresa por suscripción'],
    ...RIVALES.map((r) => [r.nombre, `De ${euros(r.desde)} a ${euros(r.hasta)} €/mes`, r.publicado.slice(1).join(' ')]),
  ];
  return (
    <div className="web-art-tabla" role="region" aria-label="Precios publicados" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Programa</th><th scope="col">Precio publicado</th><th scope="col">Lo que dice su web</th></tr></thead>
        <tbody>{filas.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td><b>{b}</b></td><td>{c}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

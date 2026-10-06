import { baseLinea } from '@/lib/calculos';
import { eur, eurSin } from '@/lib/formato';
import '@/app/lineas.css';

// Conceptos de un presupuesto con varias líneas (sin IVA): ficha interna y página del cliente.
export default function Conceptos({ lineas }) {
  if (!(lineas?.length > 1)) return null;
  return (
    <ul className="conceptos" aria-label="Conceptos">
      {lineas.map((l, i) => (
        <li key={i}>
          <span>{l.concepto}{l.cantidad !== 1 && <small>{eurSin(l.cantidad).replace(/,00$/, '')} × {eur(l.precio)}</small>}</span>
          <strong>{eur(baseLinea(l))}</strong>
        </li>
      ))}
    </ul>
  );
}

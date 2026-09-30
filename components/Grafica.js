'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eur } from '@/lib/formato';

const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Evolución del año: toca un mes para ver sus cifras.
export default function Grafica({ meses, anio, actual }) {
  const [sel, setSel] = useState(actual ?? meses.reduce((b, x, i) => (x.ing > meses[b].ing ? i : b), 0));
  const tope = Math.max(1, ...meses.map((x) => Math.max(x.ing, x.gas)));
  const m = meses[sel];
  return (
    <div className="grafica-v2">
      <div className="grafica-sel" aria-live="polite">
        <div>
          <strong>{NOMBRES[sel]}</strong>
          <span><i className="dot in" />Facturado {eur(m.ing)}</span>
          <span><i className="dot out" />Gastos {eur(m.gas)}</span>
        </div>
        <Link href={`/mes/${anio}-${String(sel + 1).padStart(2, '0')}`} className="boton pequeno sec">Ver mes</Link>
      </div>
      <div className="grafica-barras" role="group" aria-label={`Facturado y gastos por mes de ${anio}`}>
        {meses.map((x, i) => (
          <button key={i} type="button" className={i === sel ? 'activo' : ''} onClick={() => setSel(i)} aria-label={`${NOMBRES[i]}: facturado ${eur(x.ing)}, gastos ${eur(x.gas)}`} aria-pressed={i === sel}>
            <span className="pila">
              <span className="b i" style={{ height: `${(Math.max(0, x.ing) / tope) * 100}%` }} />
              <span className="b g" style={{ height: `${(Math.max(0, x.gas) / tope) * 100}%` }} />
            </span>
            <small>{NOMBRES[i][0]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eur } from '@/lib/formato';
import { topeRedondo } from '@/lib/escala';

const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// Cifra corta para el eje: 1.200 → «1,2 k»
const corta = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k` : Math.round(n).toLocaleString('es-ES'));

// Evolución del año: barras de facturado y gastos por mes. Toca un mes para ver sus cifras y el beneficio acumulado hasta
// él. La curva del acumulado va en la tarjeta del beneficio (app/page.js): aquí, con otra escala que el eje de las barras,
// parecía que el eje la medía.
export default function Grafica({ meses, anio, actual }) {
  const [sel, setSel] = useState(actual ?? meses.reduce((b, x, i) => (x.ing > meses[b].ing ? i : b), 0));
  const maximo = Math.max(0, ...meses.map((x) => Math.max(x.ing, x.gas)));
  const tope = topeRedondo(maximo) || 1;
  const hasta = actual ?? 11;
  const acum = meses.slice(0, hasta + 1).reduce((a, x) => [...a, (a.at(-1) ?? 0) + x.ing - x.gas], []);
  const m = meses[sel];
  const beneficioMes = m.ing - m.gas;

  return (
    <div className="graf">
      <div className="graf-cab" aria-live="polite">
        <div className="graf-dato" key={sel}>
          <strong>{NOMBRES[sel]}</strong>
          <span><i className="graf-punto in" />Facturado <b>{eur(m.ing)}</b></span>
          <span><i className="graf-punto out" />Gastos <b>{eur(m.gas)}</b></span>
          <span className={beneficioMes < 0 ? 'rojo' : undefined}>Beneficio del mes <b>{eur(beneficioMes).replace(/^-/, '\u2212')}</b></span>
        </div>
        <Link href={`/mes/${anio}-${String(sel + 1).padStart(2, '0')}`} className="boton pequeno sec">Ver mes</Link>
      </div>
      <div className="graf-zona">
        <div className="graf-eje" aria-hidden>{maximo > 0 ? <><span>{corta(tope)}</span><span>{corta(tope / 2)}</span><span>0</span></> : null}</div>
        <div className="graf-barras" role="group" aria-label={`Facturado y gastos por mes de ${anio}`}>
          {meses.map((x, i) => (
            <button key={i} type="button" className={i === sel ? 'activo' : ''} style={{ '--i': i }} onClick={() => setSel(i)} aria-label={`${NOMBRES[i].slice(0, 3)}. ${NOMBRES[i]}: facturado ${eur(x.ing)}, gastos ${eur(x.gas)}`} aria-pressed={i === sel}>
              <span className="graf-pila">
                <span className="graf-b in" style={{ height: `${(Math.max(0, x.ing) / tope) * 100}%` }} />
                <span className="graf-b out" style={{ height: `${(Math.max(0, x.gas) / tope) * 100}%` }} />
              </span>
              <small><span className="corto">{NOMBRES[i][0]}</span><span className="largo">{NOMBRES[i].slice(0, 3)}</span></small>
            </button>
          ))}
        </div>
      </div>
      <p className="graf-leyenda"><span><i className="graf-punto in" />Facturado</span><span><i className="graf-punto out" />Gastos</span>{sel <= hasta && <span>Beneficio acumulado hasta {NOMBRES[sel].toLowerCase()}: {eur(acum[sel])}</span>}</p>
    </div>
  );
}

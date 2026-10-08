'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eur } from '@/lib/formato';

const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// Cifra corta para el eje: 1.200 → «1,2 k»
const corta = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k` : Math.round(n).toLocaleString('es-ES'));

// Evolución del año: barras de facturado y gastos por mes y la línea del beneficio acumulado. Toca un mes para ver sus cifras.
export default function Grafica({ meses, anio, actual }) {
  const [sel, setSel] = useState(actual ?? meses.reduce((b, x, i) => (x.ing > meses[b].ing ? i : b), 0));
  const tope = Math.max(1, ...meses.map((x) => Math.max(x.ing, x.gas)));
  const hasta = actual ?? 11;
  const acum = meses.slice(0, hasta + 1).reduce((a, x) => [...a, (a.at(-1) ?? 0) + x.ing - x.gas], []);
  const [bajo, alto] = [Math.min(0, ...acum), Math.max(1, ...acum)];
  // La línea va en su propia escala (0-100 de alto), encima de las barras.
  const punto = (v, i) => [((i + 0.5) / 12) * 100, 96 - ((v - bajo) / (alto - bajo)) * 88];
  const linea = acum.map((v, i) => punto(v, i)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
  const m = meses[sel];
  const beneficioMes = m.ing - m.gas;

  return (
    <div className="graf">
      <div className="graf-cab" aria-live="polite">
        <div className="graf-dato" key={sel}>
          <strong>{NOMBRES[sel]}</strong>
          <span><i className="graf-punto in" />Facturado <b>{eur(m.ing)}</b></span>
          <span><i className="graf-punto out" />Gastos <b>{eur(m.gas)}</b></span>
          <span className={beneficioMes < 0 ? 'rojo' : undefined}>Beneficio del mes <b>{eur(beneficioMes)}</b></span>
        </div>
        <Link href={`/mes/${anio}-${String(sel + 1).padStart(2, '0')}`} className="boton pequeno sec">Ver mes</Link>
      </div>
      <div className="graf-zona">
        <div className="graf-eje" aria-hidden><span>{corta(tope)}</span><span>{corta(tope / 2)}</span><span>0</span></div>
        <div className="graf-barras" role="group" aria-label={`Facturado y gastos por mes de ${anio}`}>
          {meses.map((x, i) => (
            <button key={i} type="button" className={i === sel ? 'activo' : ''} style={{ '--i': i }} onClick={() => setSel(i)} aria-label={`${NOMBRES[i]}: facturado ${eur(x.ing)}, gastos ${eur(x.gas)}`} aria-pressed={i === sel}>
              <span className="graf-pila">
                <span className="graf-b in" style={{ height: `${(Math.max(0, x.ing) / tope) * 100}%` }} />
                <span className="graf-b out" style={{ height: `${(Math.max(0, x.gas) / tope) * 100}%` }} />
              </span>
              <small><span className="corto">{NOMBRES[i][0]}</span><span className="largo">{NOMBRES[i].slice(0, 3)}</span></small>
            </button>
          ))}
          {acum.length > 1 && (
            <div className="graf-capa" aria-hidden>
              <svg className="graf-linea" viewBox="0 0 100 100" preserveAspectRatio="none"><path d={linea} vectorEffect="non-scaling-stroke" /></svg>
              {sel <= hasta && <i className="graf-marca" style={{ left: `${punto(acum[sel], sel)[0]}%`, top: `${punto(acum[sel], sel)[1]}%` }} />}
            </div>
          )}
        </div>
      </div>
      <p className="graf-leyenda"><span><i className="graf-punto in" />Facturado</span><span><i className="graf-punto out" />Gastos</span><span><i className="graf-raya" />Beneficio acumulado{sel <= hasta ? `: ${eur(acum[sel])}` : ''}</span></p>
    </div>
  );
}

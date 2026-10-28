'use client';

import { useT } from '@/components/Idioma';

import { useState } from 'react';
import { eur } from '@/lib/formato';

const mayus = (s) => s[0].toUpperCase() + s.slice(1);

// Previsión de caja: el saldo al final de cada mes. Toca un mes para ver qué entra, qué sale y qué va a Hacienda.
export default function GraficaCaja({ meses, conSaldo }) {
  const tr = useT();
  const [sel, setSel] = useState(meses.length - 1);
  const pos = Math.max(0, ...meses.map((m) => m.saldo));
  const neg = Math.max(0, ...meses.map((m) => -m.saldo));
  const total = Math.max(1, pos + neg);
  const cero = (pos / total) * 100; // dónde cae el 0, desde arriba
  const m = meses[sel];

  return (
    <div className="caja">
      <div className="caja-dato" aria-live="polite" key={sel}>
        <span>{(conSaldo ? tr('Saldo previsto a final de {mes}', { mes: tr(m.nombre) }) : tr('Diferencia prevista a final de {mes}', { mes: tr(m.nombre) }))}</span>
        <strong className={m.saldo < 0 ? 'rojo' : undefined}>{eur(m.saldo)}</strong>
        <p className="caja-desglose">
          <span className="in">{tr('+{importe} cobros', { importe: eur(Math.abs(m.entra)) })}</span>
          <span className="out">{tr('−{importe} pagos', { importe: eur(Math.abs(m.sale)) })}</span>
          {m.hacienda > 0 && <span className="hac">{tr('−{importe} Hacienda', { importe: eur(Math.abs(m.hacienda)) })}</span>}
        </p>
      </div>
      <div className="caja-graf" style={{ '--n': meses.length, '--cero': `${cero}%` }} role="group" aria-label={tr('Saldo previsto por mes')}>
        {meses.map((x, i) => {
          const alto = (Math.abs(x.saldo) / total) * 100;
          return (
            <button key={x.mes} type="button" className={`${i === sel ? 'activo' : ''}${x.saldo < 0 ? ' neg' : ''}${x.hacienda ? ' hac' : ''}`} style={{ '--i': i }} onClick={() => setSel(i)} aria-pressed={i === sel} aria-label={tr('{abreviatura}. {mes}: {saldo}', { abreviatura: tr(x.nombre).slice(0, 3), mes: mayus(tr(x.nombre)), saldo: eur(x.saldo) })}>
              <span className="caja-col"><i style={x.saldo < 0 ? { top: `${cero}%`, height: `${alto}%` } : { bottom: `${100 - cero}%`, height: `${alto}%` }} /></span>
              <small>{tr(x.nombre).slice(0, 3)}</small>
            </button>
          );
        })}
      </div>
      <p className="graf-leyenda"><span><i className="graf-punto in" />{tr('Saldo previsto')}</span>{neg > 0 && <span><i className="graf-punto neg" />{tr('En negativo')}</span>}{meses.some((x) => x.hacienda) && <span><i className="graf-punto hac" />{tr('Mes con pago a Hacienda')}</span>}</p>
    </div>
  );
}

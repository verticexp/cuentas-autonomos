'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import Icono from '@/components/web/Icono';
import { COMPARATIVA, DESCUENTO, PERSONALIZADO, PLANES, SEGMENTOS } from '@/components/web/datos';

const conDescuento = (p, meses = 1) => Math.round((p * meses * (100 - DESCUENTO)) / 100);

function Celda({ v }) {
  if (v === true) return <span className="web-tabla-si"><Icono n="tic" /><span className="oculto">Incluido</span></span>;
  if (v === false) return <span className="web-tabla-no" aria-label="No incluido">—</span>;
  return <span>{v}</span>;
}

export default function Precios({ inicial = 'aut', tabla = false, solo = false }) {
  const [seg, setSeg] = useState(inicial);
  const [anual, setAnual] = useState(false);
  const i = SEGMENTOS.findIndex((s) => s.id === seg);
  const nombreSeg = SEGMENTOS[i].n;
  const planes = PLANES[seg];

  return (
    <div className="web-precios">
      <div className="web-controles">
        {!solo && (
          <div className="web-seg" role="tablist" aria-label="Tipo de negocio" style={{ '--i': i }}>
            <span className="web-seg-ind" aria-hidden />
            {SEGMENTOS.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === seg} className={s.id === seg ? 'on' : undefined} onClick={() => setSeg(s.id)}>{s.n}</button>
            ))}
          </div>
        )}
        <div className="web-ciclo">
          <button className={!anual ? 'on' : undefined} onClick={() => setAnual(false)}>Mensual</button>
          <button role="switch" aria-checked={anual} aria-label="Pago anual" className={`web-switch${anual ? ' on' : ''}`} onClick={() => setAnual(!anual)}><span /></button>
          <button className={anual ? 'on' : undefined} onClick={() => setAnual(true)}>Anual <em>−{DESCUENTO} %</em></button>
        </div>
      </div>

      <div className="web-planes" key={seg}>
        {planes.map((p, k) => {
          const mes = anual ? conDescuento(p.p) : p.p;
          return (
            <article key={p.n} data-foco className={`web-plan${p.fuerte ? ' web-plan-fuerte' : ''}`} style={{ '--k': k }}>
              {p.fuerte && <span className="web-etiqueta">El más elegido</span>}
              <h3>{p.n}</h3>
              <p className="web-para">{p.para}</p>
              <p className="web-precio" key={`${anual}`}>
                {anual && <s>{p.p} €</s>}<strong>{mes} €</strong><span>/mes</span>
              </p>
              <p className="web-pie-precio">{anual ? `${conDescuento(p.p, 12)} € al año · sin IVA` : 'Sin IVA · sin permanencia'}</p>
              <Link className={`web-btn${p.fuerte ? '' : ' web-btn-oscuro'}`} href={`/contacto?plan=${encodeURIComponent(`${nombreSeg} ${p.n}`)}`}>Probar 14 días gratis<Icono n="flecha" className="ico web-flecha" /></Link>
              <ul>
                {p.herencia && <li className="web-herencia">Todo lo de {p.herencia}, y además:</li>}
                {p.l.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}
              </ul>
            </article>
          );
        })}
      </div>

      <article data-foco className="web-medida">
        <div>
          <span className="web-medida-ico"><Icono n="rayo" /></span>
          <h3>Personalización</h3>
          <p>¿Tu caso no encaja en un plan? Montamos uno a tu medida, con precio cerrado.</p>
        </div>
        <ul>{PERSONALIZADO.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}</ul>
        <Link className="web-btn web-btn-claro-oscuro" href="/contacto">Hablemos<Icono n="flecha" className="ico web-flecha" /></Link>
      </article>

      {tabla && (
        <div className="web-tabla-caja" key={`t${seg}`}>
          <h3 className="web-tabla-titulo">Compara los planes de {nombreSeg.toLowerCase()}</h3>
          <div className="web-tabla-scroll">
            <table className="web-tabla">
              <thead>
                <tr><th scope="col"><span className="oculto">Función</span></th>{planes.map((p) => <th key={p.n} scope="col" className={p.fuerte ? 'fuerte' : undefined}>{p.n}<small>{anual ? conDescuento(p.p) : p.p} €/mes</small></th>)}</tr>
              </thead>
              <tbody>
                {COMPARATIVA[seg].map(([grupo, filas]) => (
                  <Fragment key={grupo}>
                    <tr className="web-tabla-grupo"><th colSpan={4} scope="colgroup">{grupo}</th></tr>
                    {filas.map(([f, v]) => (
                      <tr key={f}><th scope="row">{f}</th>{v.map((x, k) => <td key={k} className={planes[k].fuerte ? 'fuerte' : undefined}><Celda v={x} /></td>)}</tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="web-nota">14 días de prueba sin tarjeta · Precio de fundador para los primeros usuarios · Pagando al año ahorras un {DESCUENTO} %</p>
    </div>
  );
}

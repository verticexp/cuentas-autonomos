'use client';

import Link from '@/components/web/EnlacePublico';
import { Fragment, useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';
import { COMPARATIVA, DESCUENTO, PERSONALIZADO, PLANES, SEGMENTOS } from '@/components/web/datos';

const importe = (p) => p.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });
const CONTRATABLES = SEGMENTOS.filter((s) => s.id === 'aut' || s.id === 'pym');
const conDescuento = (p, meses = 1) => importe((p * meses * (100 - DESCUENTO)) / 100);

function Celda({ v }) {
  if (v === true) return <span className="web-tabla-si"><Icono n="tic" /><span className="oculto">Incluido</span></span>;
  if (v === false) return <span className="web-tabla-no" aria-label="No incluido">—</span>;
  return <span>{v}</span>;
}

export default function Precios({ inicial = 'aut', tabla = false, solo = false }) {
  const [seg, setSeg] = useState(CONTRATABLES.some((s) => s.id === inicial) ? inicial : 'aut');
  const [anual, setAnual] = useState(true); // de entrada, el precio con pago anual
  const [nota, setNota] = useState(false);
  const i = CONTRATABLES.findIndex((s) => s.id === seg);
  const nombreSeg = CONTRATABLES[i].n;
  const planes = PLANES[seg];
  const carril = useRef(null);

  // En el móvil los planes se deslizan en horizontal: se empieza centrado en el recomendado.
  useEffect(() => {
    const c = carril.current, f = c?.querySelector('.web-plan-fuerte');
    if (c && f && c.scrollWidth > c.clientWidth) c.scrollLeft = f.offsetLeft - (c.clientWidth - f.offsetWidth) / 2;
  }, [seg]);
  // En el móvil la comparativa enseña un plan cada vez; se empieza por el recomendado.
  const fuerte = Math.max(0, planes.findIndex((p) => p.fuerte));
  const [ver, setVer] = useState({ seg, k: fuerte });
  const visto = ver.seg === seg ? ver.k : fuerte;
  const col = (k) => [planes[k].fuerte && 'fuerte', k !== visto && 'web-tabla-otra'].filter(Boolean).join(' ') || undefined;

  return (
    <div className="web-precios">
      <div className="web-controles">
        {!solo && (
          <div className="web-seg" role="tablist" aria-label="Tipo de negocio" style={{ '--i': i }}>
            <span className="web-seg-ind" aria-hidden />
            {CONTRATABLES.map((s) => (
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

      <div className="web-planes web-carrusel" key={seg} ref={carril}>
        {planes.map((p, k) => {
          const mes = anual ? conDescuento(p.p) : p.p;
          return (
            <article key={p.n} data-foco className={`web-plan${p.fuerte ? ' web-plan-fuerte' : ''}`} style={{ '--k': k }}>
              {p.fuerte && <span className="web-etiqueta">Recomendado</span>}
              <h3>{p.n}</h3>
              <p className="web-para">{p.fuerte ? `Más control por ${anual ? conDescuento(p.p - planes[0].p) : importe(p.p - planes[0].p)} € más al mes${anual ? ' con pago anual' : ''}` : p.para}</p>
              <p className="web-precio" key={`${anual}`}>
                {anual && <s>{p.p} €</s>}<strong>{mes} €</strong><span>/mes</span>
              </p>
              <p className="web-pie-precio">{anual ? `${conDescuento(p.p, 12)} € al año · sin IVA` : 'Sin IVA · sin permanencia'}</p>
              <Link className={`web-btn${p.fuerte ? '' : ' web-btn-oscuro'}`} href={`/registro?tipo=${seg}&plan=${encodeURIComponent(p.n)}${anual ? '&periodo=anio' : ''}`}>Probar 30 días gratis<Icono n="flecha" className="ico web-flecha" /></Link>
              <ul>
                {p.herencia && <li className="web-herencia">Todo lo de {p.herencia}, y además:</li>}
                {p.l.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="web-nota">
        Todos incluyen portal del cliente, avisos push, exportación, seguridad e importación desde otro programa.
        <span id="web-nota-ia" className={`web-nota-extra${nota ? ' abierta' : ''}`}> La lectura IA tiene una cuota mensual de páginas por empresa, compartida con la gestoría; se renueva cada mes natural también con pago anual y no se acumula. En la prueba hay 50 páginas en total. La cuota del plan empieza con el periodo de pago. Consulta la tabla para ver el límite de cada plan.</span>
        {!nota && <button className="web-nota-mas" aria-expanded={false} aria-controls="web-nota-ia" onClick={() => setNota(true)}>Más detalles</button>}
      </p>

      <article data-foco className="web-medida">
        <div>
          <span className="web-medida-ico"><Icono n="rayo" /></span>
          <h3>Business</h3>
          <p>¿Gestionas varias sociedades o necesitas otro equipo? Acordamos el alcance y un precio cerrado contigo.</p>
        </div>
        <ul>{PERSONALIZADO.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}</ul>
        <Link className="web-btn web-btn-claro-oscuro" href="/business">Conoce Business<Icono n="flecha" className="ico web-flecha" /></Link>
      </article>

      {tabla && (
        <div className="web-tabla-caja" key={`t${seg}`}>
          <h3 className="web-tabla-titulo">Compara los planes de {nombreSeg.toLowerCase()}</h3>
          <div className="web-tabla-elige" role="group" aria-label="Plan que ver">
            {planes.map((p, k) => (
              <button key={p.n} aria-pressed={k === visto} className={k === visto ? 'on' : undefined} onClick={() => setVer({ seg, k })}>
                {p.n}{p.fuerte && <small>Recomendado</small>}
              </button>
            ))}
          </div>
          <div className="web-tabla-scroll">
            <table className="web-tabla">
              <thead>
                <tr><th scope="col"><span className="oculto">Función</span></th>{planes.map((p, k) => <th key={p.n} scope="col" className={col(k)}>{p.n}<small>{anual ? conDescuento(p.p) : p.p} €/mes</small></th>)}</tr>
              </thead>
              <tbody>
                {COMPARATIVA[seg].map(([grupo, filas]) => (
                  <Fragment key={grupo}>
                    <tr className="web-tabla-grupo"><th colSpan={4} scope="colgroup">{grupo}</th></tr>
                    {filas.map(([f, v]) => (
                      <tr key={f}><th scope="row">{f}</th>{v.map((x, k) => <td key={k} className={col(k)}><Celda v={x} /></td>)}</tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="web-nota">30 días de prueba sin tarjeta · 1 empresa por suscripción · 1 acceso de gestoría aparte · Pagando al año ahorras un {DESCUENTO} %</p>
    </div>
  );
}

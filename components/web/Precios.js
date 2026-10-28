'use client';

import Link from '@/components/web/EnlacePublico';
import { Fragment, useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';
import { useT } from '@/components/Idioma';
import { COMPARATIVA, DESCUENTO, PERSONALIZADO, PLANES, SEGMENTOS } from '@/components/web/datos';

const importe = (p) => p.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });
const CONTRATABLES = SEGMENTOS.filter((s) => s.id === 'aut' || s.id === 'pym');
const conDescuento = (p, meses = 1) => importe((p * meses * (100 - DESCUENTO)) / 100);

function Celda({ v }) {
  const tr = useT();
  if (v === true) return <span className="web-tabla-si"><Icono n="tic" /><span className="oculto">{tr('Incluido')}</span></span>;
  if (v === false) return <span className="web-tabla-no" aria-label={tr('No incluido')}>—</span>;
  return <span>{tr(v)}</span>;
}

export default function Precios({ inicial = 'aut', tabla = false, solo = false }) {
  const tr = useT();
  const [seg, setSeg] = useState(CONTRATABLES.some((s) => s.id === inicial) ? inicial : 'aut');
  const [anual, setAnual] = useState(false); // de entrada, el precio mensual (el mismo «desde 9 €» del resto de la web)
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
          <div className="web-seg" role="tablist" aria-label={tr('Tipo de negocio')} style={{ '--i': i }}>
            <span className="web-seg-ind" aria-hidden />
            {CONTRATABLES.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === seg} className={s.id === seg ? 'on' : undefined} onClick={() => setSeg(s.id)}>{tr(s.n)}</button>
            ))}
          </div>
        )}
        <div className="web-ciclo">
          <button className={!anual ? 'on' : undefined} onClick={() => setAnual(false)}>{tr('Mensual')}</button>
          <button role="switch" aria-checked={anual} aria-label={tr('Pago anual')} className={`web-switch${anual ? ' on' : ''}`} onClick={() => setAnual(!anual)}><span /></button>
          <button className={anual ? 'on' : undefined} onClick={() => setAnual(true)}>{tr('Anual')} <em>−{DESCUENTO} %</em></button>
        </div>
      </div>

      <div className="web-planes web-carrusel" key={seg} ref={carril}>
        {planes.map((p, k) => {
          const mes = anual ? conDescuento(p.p) : p.p;
          return (
            <article key={p.n} data-foco className={`web-plan${p.fuerte ? ' web-plan-fuerte' : ''}`} style={{ '--k': k }}>
              {p.fuerte && <span className="web-etiqueta">{tr('Recomendado')}</span>}
              <h3>{p.n}</h3>
              <p className="web-para">{p.fuerte ? tr(anual ? 'Más control por {importe} € más al mes con pago anual' : 'Más control por {importe} € más al mes', { importe: anual ? conDescuento(p.p - planes[0].p) : importe(p.p - planes[0].p) }) : tr(p.para)}</p>
              <p className="web-precio" key={`${anual}`}>
                {anual && <s>{p.p} €</s>}<strong>{mes} €</strong><span>{tr('/mes')}</span>
              </p>
              <p className="web-pie-precio">{anual ? tr('{importe} € al año · sin IVA', { importe: conDescuento(p.p, 12) }) : tr('Sin IVA · sin permanencia')}</p>
              <Link className={`web-btn${p.fuerte ? '' : ' web-btn-oscuro'}`} href={`/registro?tipo=${seg}&plan=${encodeURIComponent(p.n)}${anual ? '&periodo=anio' : ''}`}>{tr('Probar 30 días gratis')}<Icono n="flecha" className="ico web-flecha" /></Link>
              <ul>
                {p.herencia && <li className="web-herencia">{tr('Todo lo de {plan}, y además:', { plan: p.herencia })}</li>}
                {p.l.map((x) => <li key={x}><Icono n="tic" />{tr(x)}</li>)}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="web-nota">
        {tr('Todos incluyen portal del cliente, avisos push, exportación, seguridad e importación desde otro programa.')}
        <span id="web-nota-ia" className={`web-nota-extra${nota ? ' abierta' : ''}`}> {tr('La lectura IA tiene una cuota mensual de páginas por empresa, compartida con la gestoría; se renueva cada mes natural también con pago anual y no se acumula. En la prueba hay 50 páginas en total. La cuota del plan empieza con el periodo de pago.')}{tabla ? ` ${tr('Consulta la tabla para ver el límite de cada plan.')}` : ''}</span>
        {!nota && <button className="web-nota-mas" aria-expanded={false} aria-controls="web-nota-ia" onClick={() => setNota(true)}>{tr('Más detalles')}</button>}
      </p>

      <article data-foco className="web-medida">
        <div>
          <h3>Business</h3>
          <p>{tr('¿Gestionas varias sociedades o necesitas otro equipo? Acordamos el alcance y un precio cerrado contigo.')}</p>
        </div>
        <ul>{PERSONALIZADO.map((x) => <li key={x}><Icono n="tic" />{tr(x)}</li>)}</ul>
        <Link className="web-btn web-btn-claro-oscuro" href="/business">{tr('Conoce Business')}<Icono n="flecha" className="ico web-flecha" /></Link>
      </article>

      {tabla && (
        <div className="web-tabla-caja" key={`t${seg}`}>
          <h3 className="web-tabla-titulo">{tr('Compara los planes de {tipo}', { tipo: tr(nombreSeg.toLowerCase()) })}</h3>
          <div className="web-tabla-elige" role="group" aria-label={tr('Plan que ver')}>
            {planes.map((p, k) => (
              <button key={p.n} aria-pressed={k === visto} className={k === visto ? 'on' : undefined} onClick={() => setVer({ seg, k })}>
                {p.n}{p.fuerte && <small>{tr('Recomendado')}</small>}
              </button>
            ))}
          </div>
          <div className="web-tabla-scroll">
            <table className="web-tabla">
              <thead>
                <tr><th scope="col"><span className="oculto">{tr('Función')}</span></th>{planes.map((p, k) => <th key={p.n} scope="col" className={col(k)}>{p.n}<small>{tr('{importe} €/mes', { importe: anual ? conDescuento(p.p) : p.p })}</small></th>)}</tr>
              </thead>
              <tbody>
                {COMPARATIVA[seg].map(([grupo, filas]) => (
                  <Fragment key={grupo}>
                    <tr className="web-tabla-grupo"><th colSpan={4} scope="colgroup">{tr(grupo)}</th></tr>
                    {filas.map(([f, v]) => (
                      <tr key={f}><th scope="row">{tr(f)}</th>{v.map((x, k) => <td key={k} className={col(k)}><Celda v={x} /></td>)}</tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="web-nota">{tr('30 días de prueba sin tarjeta · 1 empresa por suscripción · 1 acceso de gestoría aparte · Pagando al año ahorras un {descuento} %', { descuento: DESCUENTO })}</p>
    </div>
  );
}

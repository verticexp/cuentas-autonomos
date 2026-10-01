import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { ACTIVIDADES, casillas303, importes, r2 } from '@/lib/calculos';
import { panelResumen } from '@/lib/panel';
import { eur, eurSin, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';
import Grafica from '@/components/Grafica';
import Ico from '@/components/Ico';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

export default async function Resumen({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]);
  if (!facturas) return <SinBD />;
  const h = hoy();
  const P = panelResumen({ facturas, gastos, pagos130: u.pagos130, emisor: u.emisor, anio: Number((await searchParams).anio) || undefined, hoy: h });
  const { anio, anioActual, esteAnio, r, facturado, gastado, beneficio, plazo, debe, tHoy, qAhora, apartado, aPagar, mesPago,
    sinCobrar, porCobrar, vencidas, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite } = P;
  const pagos = (y) => u.pagos130?.[y] || {};
  const exportar = (tipo, t) => `/api/exportar?tipo=${tipo}&anio=${anio}${t ? `&t=${t}` : ''}`;

  return (
    <main className="pagina">
      <header className="cabecera">
        <h1 className="titulo">Resumen</h1>
        <nav className="anios">
          <Link href={`/?anio=${anio - 1}`} aria-label="Año anterior">‹</Link>
          <strong>{anio}</strong>
          {anio < anioActual ? <Link href={`/?anio=${anio + 1}`} aria-label="Año siguiente">›</Link> : <span className="off">›</span>}
        </nav>
      </header>

      {!facturas.length && (
        <div className="vacio">
          <p>Crea tu primera factura</p>
          <p>Aquí verás cuánto de lo que facturas es tuyo y cuánto tienes que apartar para Hacienda.</p>
          {puede(u, 'facturar') && <Link href="/facturas/nueva" className="boton">Nueva factura</Link>}
        </div>
      )}

      {facturado > 0 && (
        <div className="hcards">
          <section className="hcard" style={{ '--c': '#007AFF' }}>
            <h2 className="hcard-t"><Ico n="beneficio" solo />Beneficio<span>{esteAnio ? 'este año' : anio}</span></h2>
            <p className="hcard-v">{eurSin(beneficio)}<small>€</small></p>
            <p className="hcard-s">Facturado {eur(facturado)} · Gastos {eur(gastado)}</p>
            {cambio !== null && <p className={`hcard-cambio ${cambio >= 0 ? 'sube' : 'baja'}`}>{cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio).toFixed(0)} % respecto a {anio - 1}</p>}
            <div className="mini-barras" aria-hidden>{meses.map((m, i) => <span key={i} style={{ height: `${Math.max(4, (Math.max(0, m.ing - m.gas) / Math.max(1, ...meses.map((x) => x.ing - x.gas))) * 100)}%` }} />)}</div>
          </section>

          {esteAnio && (
            <section className="hcard" style={{ '--c': '#FF9500' }}>
              <h2 className="hcard-t"><Ico n="hacienda" solo />Hacienda<span>{debe ? `${plazo.t}T ${plazo.anio}` : `${tHoy}T ${anioActual}`}</span></h2>
              {debe ? (
                <>
                  <p className="hcard-v">{eurSin(aPagar)}<small>€ a pagar</small></p>
                  <p className="hcard-s">Hasta el {fechaTexto(plazo.fecha)}, {plazo.dias === 0 ? 'hoy es el último día' : plazo.dias === 1 ? 'queda 1 día' : `quedan ${plazo.dias} días`} · 303 {debe.m303 < 0 ? `${eur(-debe.m303)} a compensar` : eur(debe.m303)}, 130 {eur(debe.m130)}</p>
                  <p className="hcard-s">Del {tHoy}T llevas {eur(apartado)} para apartar.</p>
                </>
              ) : (
                <>
                  <p className="hcard-v">{eurSin(apartado)}<small>€ para apartar</small></p>
                  <p className="hcard-s">IVA {eur(Math.max(0, qAhora.m303))} + IRPF {eur(qAhora.m130)} · se paga del 1 al 20 de {mesPago}</p>
                </>
              )}
            </section>
          )}

          {porCobrar > 0 && (
            <Link href="/facturas?estado=pendientes" className="hcard ir" style={{ '--c': '#C69500' }}>
              <h2 className="hcard-t"><Ico n="cobrar" solo />Por cobrar<span>{sinCobrar.length === 1 ? '1 factura' : `${sinCobrar.length} facturas`}</span></h2>
              <p className="hcard-v">{eurSin(porCobrar)}<small>€</small></p>
              {vencidas.length > 0 && <p className="hcard-s rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}: {vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ')}</p>}
            </Link>
          )}
        </div>
      )}

      {limite > 0 && (
        <section className="grupo">
          <h2 className="grupo-t">Tarifa plana</h2>
          <div className="grupo-c">
            <div className="celda columna">
              <div className="linea"><span>Rendimiento neto {anio}</span><span className="v">{eur(beneficio)} <small>de {eur(limite)}</small></span></div>
              <div className="barra-limite"><span className={beneficio > limite ? 'pasado' : beneficio > limite * 0.8 ? 'cerca' : ''} style={{ width: `${Math.min(100, Math.max(0, (beneficio / limite) * 100))}%` }} /></div>
            </div>
          </div>
          <p className="grupo-pie">{beneficio > limite ? `Te pasas en ${eur(beneficio - limite)}.` : `Te quedan ${eur(limite - beneficio)} de margen.`} Solo cuenta facturas menos gastos de la app; resta tu cuota de autónomos y otros gastos que no tengas aquí.</p>
        </section>
      )}

      {esteAnio && facturas.length > 0 && (
        <section className="grupo">
          <h2 className="grupo-t">Si sigues a este ritmo</h2>
          <div className="grupo-c">
            <div className="celda"><Ico n="factura" /><span className="txt">Facturarás en {anio}</span><span className="v">{eur(prevFact)}</span></div>
            <div className="celda"><Ico n="beneficio" /><span className="txt">Ganarás tras gastos</span><span className="v">{eur(prevBeneficio)}</span></div>
          </div>
          <p className="grupo-pie">Lo facturado hasta hoy ({eur(facturado)}) llevado a 12 meses.{limite > 0 ? (prevBeneficio > limite ? ` Te pasarías del límite de la tarifa plana en ${eur(prevBeneficio - limite)}.` : ` Quedarías ${eur(limite - prevBeneficio)} por debajo del límite de la tarifa plana.`) : ''}</p>
        </section>
      )}

      <section className="grupo">
        <h2 className="grupo-t">Por actividad</h2>
        <div className="grupo-c">
          {r.porActividad.map((a) => (
            <div key={a.actividad} className="celda">
              <Ico n="actividad" />
              <span className="txt">{ACTIVIDADES[a.actividad]}<small>Facturado {eur(a.ingresos)}, gastos {eur(a.gastos)}</small></span>
              <span className="v">{eur(a.rendimiento)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grupo">
        <h2 className="grupo-t">Mes a mes</h2>
        <div className="grupo-c relleno">
          <Grafica meses={meses} anio={anio} actual={ultimoMes} />
        </div>
      </section>

      {top.length > 0 && (
        <section className="grupo">
          <h2 className="grupo-t">Mejores clientes</h2>
          <div className="grupo-c">
            {top.map(([n, v]) => (
              <div key={n} className="celda"><span className="txt">{n}</span><span className="v">{eur(v)}</span></div>
            ))}
          </div>
          {facturado > 0 && <p className="grupo-pie">El primero supone el {((top[0][1] / facturado) * 100).toFixed(0)} % de lo facturado en {anio}.</p>}
        </section>
      )}

      <section className="grupo">
        <h2 className="grupo-t">Descargas</h2>
        <div className="grupo-c">
          <a href={exportar('facturas')} className="celda ir"><Ico n="factura" /><span className="txt">Facturas de {anio} en Excel</span></a>
          <a href={exportar('gastos')} className="celda ir"><Ico n="gasto" /><span className="txt">Gastos de {anio} en Excel</span></a>
          <a href="/api/avisos" className="celda ir"><Ico n="plazo" /><span className="txt">Plazos de Hacienda en tu calendario<small>Aviso 7 días y 1 día antes</small></span></a>
        </div>
      </section>




      <section className="bloque">
        <h2 className="grupo-t">Hacienda por trimestre</h2>
        <p className="grupo-pie arriba">Orientativo; confírmalo con tu gestor. Marca en cada trimestre si pagaste el 130: lo que no pagaste se suma al siguiente.</p>
        <div className="tarjetas">
          {r.trimestres.map((q) => (
            <div key={q.t} className="tarjeta trimestre">
              <div className="cabecera"><h3>{q.t}T {anio}</h3><Presentado anio={anio} t={q.t} importe={q.m130} pagado={pagos(anio)[q.t]} /></div>
              <dl>
                <dt>Base facturada</dt><dd>{eur(q.ingresos)}</dd>
                <dt>IVA repercutido</dt><dd>{eur(q.ivaRep)}</dd>
                <dt>IVA deducible</dt><dd>−{eur(q.ivaDed)}</dd>
                <dt><strong>Modelo 303</strong></dt><dd><strong>{q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.m303)}</strong></dd>
                <dt>5 % gastos difícil justificación</dt><dd>−{eur(q.difJust)}</dd>
                <dt>20 % rendimiento acumulado</dt><dd>{eur(0.2 * q.rendAcum)}</dd>
                <dt>Retenciones acumuladas</dt><dd>−{eur(q.retAcum)}</dd>
                <dt>130 pagados antes</dt><dd>−{eur(q.pagosPrev)}</dd>
                {pagos(anio)[q.t] > 0 && <><dt>Pagado este trimestre</dt><dd>{eur(pagos(anio)[q.t])}</dd></>}
                <dt><strong>Modelo 130</strong></dt><dd><strong>{eur(q.m130)}</strong></dd>
              </dl>
              {(() => {
                const c = casillas303(facturas, gastos, anio, q.t);
                const fila = (n, t, v) => <><dt>{n} · {t}</dt><dd>{eur(v)}</dd></>;
                return (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9375rem' }}>Casillas para Hacienda</summary>
                    <p className="nota" style={{ margin: '10px 0 6px' }}><strong>Modelo 303</strong></p>
                    <dl>
                      {c['04'] > 0 && <>{fila('04', 'Base al 10 %', c['04'])}{fila('06', 'Cuota al 10 %', c['06'])}</>}
                      {fila('07', 'Base al 21 %', c['07'])}
                      {fila('09', 'Cuota al 21 %', c['09'])}
                      {fila('27', 'Total cuota devengada', c['27'])}
                      {fila('28', 'Base IVA soportado', c['28'])}
                      {fila('29', 'Cuota IVA soportado', c['29'])}
                      {fila('45', 'Total a deducir', c['45'])}
                      {fila('46', 'Resultado', c['46'])}
                    </dl>
                    {c.sinIva !== 0 && <p className="nota">Facturas sin IVA por {eur(c.sinIva)}: van en otra casilla según el tipo de operación (por ejemplo, servicios a empresas de la UE). Pregúntale a tu gestor cuál.</p>}
                    <p className="nota" style={{ margin: '12px 0 6px' }}><strong>Modelo 130</strong> (acumulado desde enero)</p>
                    <dl>
                      {fila('01', 'Ingresos', q.ingAcum)}
                      {fila('02', 'Gastos (incluye el 5 %)', q.gasAcum)}
                      {fila('03', 'Rendimiento neto', q.rendAcum)}
                      {fila('04', '20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum)))}
                      {fila('05', 'Pagos de trimestres anteriores', q.pagosPrev)}
                      {fila('06', 'Retenciones', q.retAcum)}
                      {fila('07', 'Resultado', q.m130)}
                    </dl>
                  </details>
                );
              })()}
              <p className="descargas">Excel: <a href={exportar('facturas', q.t)}>facturas</a> · <a href={exportar('gastos', q.t)}>gastos</a></p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

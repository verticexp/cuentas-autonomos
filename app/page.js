import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { ACTIVIDADES, casillas303, importes, proximoPlazo, r2, resumenAnual, trimestre, vencida } from '@/lib/calculos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';

export const dynamic = 'force-dynamic';

export default async function Resumen({ searchParams }) {
  const u = await requerir();
  const [facturas, gastos] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]);
  if (!facturas) return <SinBD />;
  const anioActual = new Date().getFullYear();
  const anio = Number((await searchParams).anio) || anioActual;
  const pagos = (y) => u.pagos130?.[y] || {};
  const r = resumenAnual(facturas, gastos, anio, pagos(anio));
  const h = hoy();
  const plazo = proximoPlazo(h);
  const qPlazo = plazo.dias <= 25 && resumenAnual(facturas, gastos, plazo.anio, pagos(plazo.anio)).trimestres[plazo.t - 1];
  const vencidas = facturas.filter((f) => vencida(f, u.emisor?.plazo, h));
  const limite = Number(u.emisor?.limite) || 0;
  const rendimiento = r.porActividad.reduce((s, a) => s + a.rendimiento, 0);
  // Evolución mensual: base facturada y gastos de cada mes del año.
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mm = `${anio}-${String(i + 1).padStart(2, '0')}`;
    const s = (l) => l.filter((x) => x.fecha.startsWith(mm)).reduce((a, x) => a + x.base, 0);
    return { m: 'EFMAMJJASOND'[i], ing: s(facturas), gas: s(gastos) };
  });
  const tope = Math.max(1, ...meses.map((x) => Math.max(x.ing, x.gas)));
  // Apartar: lo que hoy le debes a Hacienda del trimestre en curso (303 + 130), aunque aún no toque pagar.
  const esteAnio = anio === anioActual;
  const tHoy = trimestre(h);
  const qHoy = resumenAnual(facturas, gastos, anioActual, pagos(anioActual)).trimestres[tHoy - 1];
  const apartado = Math.max(0, qHoy.m303) + qHoy.m130;
  // Previsión: al ritmo actual, cómo cierras el año.
  const dia = (Date.parse(h) - Date.parse(`${anioActual}-01-01`)) / 864e5 + 1;
  const ritmo = 365 / Math.max(dia, 30);
  const facturado = r.porActividad.reduce((s, a) => s + a.ingresos, 0);
  const prevFact = facturado * ritmo;
  const prevRend = rendimiento * ritmo;
  // Comparación con el mismo periodo del año anterior y clientes que más facturan.
  const hasta = esteAnio ? h.slice(5) : '12-31';
  const periodo = (y) => facturas.filter((f) => f.fecha.startsWith(`${y}-`) && f.fecha.slice(5) <= hasta).reduce((s, f) => s + f.base, 0);
  const antes = periodo(anio - 1);
  const cambio = antes > 0 ? ((periodo(anio) - antes) / antes) * 100 : null;
  const porCliente = {};
  for (const f of facturas.filter((x) => x.fecha.startsWith(`${anio}-`))) porCliente[f.cliente.nombre] = (porCliente[f.cliente.nombre] || 0) + f.base;
  const top = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);
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

      {!facturas.length && <div className="vacio"><p>Aún no hay facturas</p><p>Empieza creando la primera en Facturas.</p></div>}

      {qPlazo && !qPlazo.presentado && (
        <div className="aviso-plazo">
          <strong>{plazo.dias === 0 ? 'Hoy' : `En ${plazo.dias} días`} ({fechaCorta(plazo.fecha)}) acaba el plazo del {plazo.t}T {plazo.anio}</strong>
          <span>303: {qPlazo.m303 < 0 ? `${eur(-qPlazo.m303)} a compensar` : eur(qPlazo.m303)} · 130: {eur(qPlazo.m130)}</span>
        </div>
      )}

      {vencidas.length > 0 && (
        <Link href="/facturas" className="aviso-plazo rojo">
          <strong>{vencidas.length === 1 ? '1 factura vencida sin cobrar' : `${vencidas.length} facturas vencidas sin cobrar`}</strong>
          <span>{eur(vencidas.reduce((s, f) => s + importes(f).total, 0))} · {vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ')}</span>
        </Link>
      )}

      {limite > 0 && (
        <div className="tarjeta bloque">
          <h3>Tarifa plana · rendimiento neto {anio}</h3>
          <p className="grande">{eur(rendimiento)} <small className="nota">de {eur(limite)}</small></p>
          <div className="barra-limite"><span className={rendimiento > limite ? 'pasado' : rendimiento > limite * 0.8 ? 'cerca' : ''} style={{ width: `${Math.min(100, Math.max(0, (rendimiento / limite) * 100))}%` }} /></div>
          <p className="nota">{rendimiento > limite ? `Te pasas en ${eur(rendimiento - limite)}.` : `Te quedan ${eur(limite - rendimiento)} de margen.`} Solo cuenta facturas menos gastos de la app; resta tu cuota de autónomos y otros gastos que no tengas aquí.</p>
        </div>
      )}

      {esteAnio && (
        <>
          <div className="tarjeta bloque">
            <h3>Aparta para Hacienda</h3>
            <p className="grande">{eur(apartado)}</p>
            <p className="nota">Lo que ya debes del {tHoy}T aunque aún no toque pagarlo: 303 {eur(Math.max(0, qHoy.m303))} + 130 {eur(qHoy.m130)}.</p>
          </div>
          <div className="tarjeta bloque">
            <h3>Si sigues a este ritmo, en {anio}…</h3>
            <div className="dos-valores">
              <div><small>Facturarás</small><p className="grande">{eur(prevFact)}</p></div>
              <div><small>Ganarás tras gastos</small><p className="grande">{eur(prevRend)}</p></div>
            </div>
            <p className="nota">Lo facturado hasta hoy ({eur(facturado)}) llevado a los 12 meses.{limite > 0 ? (prevRend > limite ? ` Te pasarías del límite de la tarifa plana en ${eur(prevRend - limite)}.` : ` Quedarías ${eur(limite - prevRend)} por debajo del límite de la tarifa plana.`) : ''}</p>
          </div>
        </>
      )}

      <section className="bloque tarjetas dos">
        {r.porActividad.map((a) => (
          <div key={a.actividad} className="tarjeta">
            <h3>{ACTIVIDADES[a.actividad]}</h3>
            <p className="grande">{eur(a.rendimiento)}</p>
            <p className="nota">Facturado {eur(a.ingresos)} · Gastos {eur(a.gastos)}</p>
          </div>
        ))}
      </section>

      <section className="tarjeta bloque">
        <h3>Evolución {anio}</h3>
        <div className="grafica">
          {meses.map((x, i) => (
            <Link key={i} href={`/mes/${anio}-${String(i + 1).padStart(2, '0')}`} className="mes" title={`Facturado ${eur(x.ing)} · Gastos ${eur(x.gas)}`} style={{ textDecoration: 'none', color: 'inherit', borderRadius: 8 }}>
              <div className="barras">
                <span className="b i" style={{ height: `${Math.max(0, x.ing) / tope * 100}%` }} />
                <span className="b g" style={{ height: `${Math.max(0, x.gas) / tope * 100}%` }} />
              </div>
              <small>{x.m}</small>
            </Link>
          ))}
        </div>
        <p className="nota">{cambio === null ? `Sin datos de ${anio - 1} para comparar.` : `${cambio >= 0 ? '▲' : '▼'} ${Math.abs(cambio).toFixed(0)} % facturado respecto al mismo periodo de ${anio - 1}.`}</p>
        <div className="leyenda"><span>Toca un mes para ver el detalle</span><span><i style={{ background: 'var(--in)' }} />Facturado</span><span><i style={{ background: 'var(--out)', opacity: 0.75 }} />Gastos</span><span>Mejor mes: {eur(Math.max(...meses.map((x) => x.ing)))}</span></div>
      </section>

      {top.length > 0 && (
        <section className="tarjeta bloque">
          <h3>Clientes que más facturan en {anio}</h3>
          {top.map(([n, v]) => (
            <div key={n} style={{ marginBottom: 10 }}>
              <div className="top-cliente"><span>{n}</span><strong>{eur(v)}</strong></div>
              <div className="barra-limite" style={{ marginTop: 4 }}><span style={{ width: `${(v / top[0][1]) * 100}%` }} /></div>
            </div>
          ))}
          <p className="nota">{facturado > 0 ? `El primero supone el ${((top[0][1] / facturado) * 100).toFixed(0)} % de lo facturado.` : ''}</p>
        </section>
      )}

      {r.pendiente > 0 && <p className="pendiente">Pendiente de cobro: <strong>{eur(r.pendiente)}</strong></p>}

      <p className="descargas">Avisos de los modelos: <a href="/api/avisos">añadir al calendario</a> (7 días y 1 día antes de cada plazo)</p>
      <p className="descargas">Todo {anio} en Excel: <a href={exportar('facturas')}>facturas</a> · <a href={exportar('gastos')}>gastos</a></p>

      <section className="bloque">
        <p className="rotulo">Hacienda por trimestre (orientativo, confírmalo con tu gestor). En cada trimestre elige si el 130 lo pagaste o no: lo que no pagaste se suma al siguiente.</p>
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

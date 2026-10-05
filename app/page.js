import Link from 'next/link';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { prevision } from '@/lib/tesoreria';
import '@/app/tesoreria.css';
import { casillas303, importes, r2 } from '@/lib/calculos';
import { actividadesDe, fiscalDe, modelosDe, nombresActividad } from '@/lib/empresa';
import { panelResumen } from '@/lib/panel';
import { eur, eurSin, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';
import Grafica from '@/components/Grafica';
import Ico from '@/components/Ico';
import Logo from '@/components/Logo';
import { puede } from '@/lib/permisos';
import '@/app/asistente.css';

export const dynamic = 'force-dynamic';

export default async function Resumen({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos, recurrentes, nominas, saldo] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'recurrentes'), leer(u, 'nominas'), redis?.get(clave(u, 'saldo'))]);
  if (!facturas) return <SinBD />;
  const h = hoy();
  const actividades = actividadesDe(u);
  const fiscal = fiscalDe(u);
  const ACTIVIDADES = nombresActividad(actividades);
  const P = panelResumen({ facturas, gastos, pagos130: u.pagos130, emisor: u.emisor, anio: Number((await searchParams).anio) || undefined, hoy: h, actividades, fiscal });
  const { anio, anioActual, esteAnio, r, c303, c130, facturado, gastado, beneficio, plazo, debe, tHoy, qAhora, apartado, aPagar, mesPago,
    sinCobrar, porCobrar, vencidas, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite } = P;
  const pagos = (y) => u.pagos130?.[y] || {};
  const teso = esteAnio && prevision({ facturas, gastos, recurrentes: recurrentes || [], nominas: nominas || [], fiscal, pagos130: u.pagos130 || {}, plazo: u.emisor?.plazo, saldo, actividades: actividades.map((a) => a.id), hoy: h, meses: 3 });
  const exportar = (tipo, t) => `/api/exportar?tipo=${tipo}&anio=${anio}${t ? `&t=${t}` : ''}`;
  // Curva del beneficio acumulado mes a mes, hasta el último mes con movimiento.
  const acum = meses.slice(0, (esteAnio ? ultimoMes : 11) + 1).reduce((a, m) => [...a, (a.at(-1) ?? 0) + m.ing - m.gas], []);
  const [bajo, alto] = [Math.min(0, ...acum), Math.max(1, ...acum)];
  const puntos = acum.map((v, i) => [acum.length > 1 ? (i / (acum.length - 1)) * 120 : 120, 40 - ((v - bajo) / (alto - bajo)) * 36]);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const accesos = [
    puede(u, 'facturas') && { href: '/facturas', n: 'factura', t: 'Facturas' },
    puede(u, 'gastos') && { href: '/gastos', n: 'gasto', t: 'Gastos' },
    puede(u, 'facturas') && { href: '/presupuestos', n: 'presupuesto', t: 'Presupuestos' },
    { href: '/ajustes', n: 'mas', t: 'Más' },
  ].filter(Boolean);

  return (
    <main className="pagina">
      <header className="inicio">
        <div className="inicio-barra">
          <Logo />
          <nav className="anios">
            <Ir href={`/?anio=${anio - 1}`} tipo="cifras" aria-label="Año anterior">‹</Ir>
            <strong>{anio}</strong>
            {anio < anioActual ? <Ir href={`/?anio=${anio + 1}`} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
          </nav>
        </div>
        <h1 className="inicio-hola">Hola, {String(u.nombre || '').split(' ')[0] || 'equipo'}</h1>
        <p className="inicio-sub">{esteAnio ? 'Así va tu año.' : `Así cerraste ${anio}.`}</p>
      </header>

      {facturado > 0 && (
        <section className="saldo">
          <h2 className="saldo-t">Beneficio {esteAnio ? 'este año' : `de ${anio}`}</h2>
          <div className="saldo-fila">
            <p className="saldo-v">{eurSin(beneficio)}<small> €</small></p>
            {acum.length > 1 && (
              <svg className="saldo-curva" viewBox="-2 0 124 44" preserveAspectRatio="none" aria-hidden>
                <path className="area" d={`${linea}L120 44L0 44Z`} />
                <path className="trazo" d={linea} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          {cambio !== null && <p className={`saldo-cambio ${cambio >= 0 ? 'sube' : 'baja'}`}>{cambio >= 0 ? '↑' : '↓'} {Math.abs(cambio).toFixed(0)} % frente a {anio - 1}</p>}
          <p className="saldo-s">Facturado {eur(facturado)} · Gastos {eur(gastado)}</p>
        </section>
      )}

      <Ir href="/asistente" className="asi-entrada"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg>Pregunta por tus cuentas</Ir>

      <nav className="accesos" aria-label="Accesos">
        {accesos.map((a) => (
          <Ir key={a.href} href={a.href} tipo={a.href === '/presupuestos' ? 'adelante' : 'tab-der'} className="acceso"><Ico n={a.n} /><span>{a.t}</span></Ir>
        ))}
      </nav>

      {!facturas.length && (
        <div className="vacio">
          <p>Crea tu primera factura</p>
          <p>Aquí verás cuánto de lo que facturas es tuyo y cuánto tienes que apartar para Hacienda.</p>
          {puede(u, 'facturar') && <Ir href="/facturas/nueva" tipo="subir" className="boton">Nueva factura</Ir>}
        </div>
      )}

      {facturado > 0 && (
        <div className="hcards">
          {esteAnio && (c303 || c130) && (
            <section className="hcard" style={{ '--c': '#FF9500' }}>
              <h2 className="hcard-t"><Ico n="hacienda" solo />Hacienda<span>{debe ? `${plazo.t}T ${plazo.anio}` : `${tHoy}T ${anioActual}`}</span></h2>
              {debe ? (
                <>
                  <p className="hcard-v">{eurSin(aPagar)}<small>€ a pagar</small></p>
                  <p className="hcard-s">Hasta el {fechaTexto(plazo.fecha)}, {plazo.dias === 0 ? 'hoy es el último día' : plazo.dias === 1 ? 'queda 1 día' : `quedan ${plazo.dias} días`}{c303 ? ` · 303 ${debe.m303 < 0 ? `${eur(-debe.m303)} a compensar` : eur(debe.m303)}` : ''}{c130 ? ` · 130 ${eur(debe.m130)}` : ''}</p>
                  <p className="hcard-s">Del {tHoy}T llevas {eur(apartado)} para apartar.</p>
                </>
              ) : (
                <>
                  <p className="hcard-v">{eurSin(apartado)}<small>€ para apartar</small></p>
                  <p className="hcard-s">{[c303 && `IVA ${eur(Math.max(0, qAhora.m303))}`, c130 && `IRPF ${eur(qAhora.m130)}`].filter(Boolean).join(' + ')} · se paga del 1 al {tHoy === 4 ? 30 : 20} de {mesPago}</p>
                </>
              )}
            </section>
          )}

          {porCobrar > 0 && (
            <Ir href="/facturas?estado=pendientes" className="hcard ir" style={{ '--c': '#C69500' }}>
              <h2 className="hcard-t"><Ico n="cobrar" solo />Por cobrar<span>{sinCobrar.length === 1 ? '1 factura' : `${sinCobrar.length} facturas`}</span></h2>
              <p className="hcard-v">{eurSin(porCobrar)}<small>€</small></p>
              {vencidas.length > 0 && <p className="hcard-s rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}: {vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ')}</p>}
            </Ir>
          )}

          {teso && (
            <Ir href="/tesoreria" className="hcard ir" style={{ '--c': '#007AFF' }}>
              <h2 className="hcard-t"><Ico n="beneficio" solo />Tesorería<span>3 meses</span></h2>
              <p className="hcard-v">{eurSin(teso.final)}<small>€</small></p>
              <p className={`hcard-s${teso.minimo.saldo < 0 ? ' rojo' : ''}`}>{teso.minimo.saldo < 0 ? `El ${fechaTexto(teso.minimo.fecha)} te quedarías en ${eur(teso.minimo.saldo)}` : `${teso.conSaldo ? 'Saldo previsto' : 'Sin saldo del banco'} · cobras ${eur(teso.entra)} y pagas ${eur(r2(teso.sale + teso.hacienda))}`}</p>
            </Ir>
          )}
        </div>
      )}

      {limite > 0 && fiscal.tipo === 'autonomo' && (
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
              <span className="txt">{ACTIVIDADES[a.actividad] || 'Otra actividad'}<small>Facturado {eur(a.ingresos)}, gastos {eur(a.gastos)}</small></span>
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
        <h2 className="grupo-t">Tus modelos</h2>
        <div className="grupo-c">
          {modelosDe(fiscal).map((m) => (
            m.calcula && !['303', '130'].includes(m.id)
              ? <Ir key={m.id} href={`/modelos?anio=${anio}#m${m.id}`} tipo="adelante" className="celda ir"><span className="modelo-num">{m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span><span className="v">{m.id === '100' ? 'Borrador' : 'Calculado'}</span></Ir>
              : <div key={m.id} className="celda"><span className="modelo-num">{m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span>{m.calcula && <span className="v">Calculado</span>}</div>
          ))}
        </div>
        <p className="grupo-pie">Según lo que respondiste al empezar ({fiscal.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}). La app calcula los que pone «Calculado» (toca los anuales para verlos); el resto, tu gestor. Puedes cambiarlo en Ajustes.</p>
      </section>

      <section className="grupo">
        <h2 className="grupo-t">Descargas</h2>
        <div className="grupo-c">
          <a href={exportar('facturas')} className="celda ir"><Ico n="factura" /><span className="txt">Facturas de {anio} en Excel</span></a>
          <a href={exportar('gastos')} className="celda ir"><Ico n="gasto" /><span className="txt">Gastos de {anio} en Excel</span></a>
          {esteAnio && (() => { const g = plazo.dias <= 25 ? plazo : { anio, t: tHoy }; return <a href={`/api/paquete?anio=${g.anio}&t=${g.t}`} className="celda ir"><Ico n="hacienda" /><span className="txt">Paquete del {g.t}T {g.anio} para la gestoría<small>Excel y PDF con facturas, gastos e impuestos</small></span></a>; })()}
          <a href="/api/avisos" className="celda ir"><Ico n="plazo" /><span className="txt">Plazos de Hacienda en tu calendario<small>Aviso 7 días y 1 día antes</small></span></a>
        </div>
      </section>




      <section className="bloque">
        <h2 className="grupo-t">Hacienda por trimestre</h2>
        <p className="grupo-pie arriba">Orientativo; confírmalo con tu gestor.{c130 ? ' Marca en cada trimestre si pagaste el 130: lo que no pagaste se suma al siguiente.' : ' Marca cada trimestre cuando lo presentes.'}</p>
        <div className="tarjetas">
          {r.trimestres.map((q) => (
            <div key={q.t} className="tarjeta trimestre">
              <div className="cabecera"><h3>{q.t}T {anio}</h3><Presentado anio={anio} t={q.t} importe={c130 ? q.m130 : 0} pagado={pagos(anio)[q.t]} con130={c130} /></div>
              <dl>
                <dt>Base facturada</dt><dd>{eur(q.ingresos)}</dd>
                <dt>Gastos</dt><dd>{eur(q.gastos)}</dd>
                {c303 && <>
                <dt>IVA repercutido</dt><dd>{eur(q.ivaRep)}</dd>
                <dt>IVA deducible</dt><dd>−{eur(q.ivaDed)}</dd>
                <dt><strong>Modelo 303</strong></dt><dd><strong>{q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.m303)}</strong></dd>
                </>}
                {c130 && <>
                <dt>5 % gastos difícil justificación</dt><dd>−{eur(q.difJust)}</dd>
                <dt>20 % rendimiento acumulado</dt><dd>{eur(r2(0.2 * Math.max(0, q.rendAcum)))}</dd>
                <dt>Retenciones acumuladas</dt><dd>−{eur(q.retAcum)}</dd>
                <dt>130 pagados antes</dt><dd>−{eur(q.pagosPrev)}</dd>
                {pagos(anio)[q.t] > 0 && <><dt>Pagado este trimestre</dt><dd>{eur(pagos(anio)[q.t])}</dd></>}
                <dt><strong>Modelo 130</strong></dt><dd><strong>{eur(q.m130)}</strong></dd>
                </>}
              </dl>
              {(c303 || c130) && (() => {
                const c = casillas303(facturas, gastos, anio, q.t);
                const fila = (n, t, v) => <><dt>{n} · {t}</dt><dd>{eur(v)}</dd></>;
                return (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9375rem' }}>Casillas para Hacienda</summary>
                    {c303 && <>
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
                    </>}
                    {c130 && <>
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
                    </>}
                  </details>
                );
              })()}
              <p className="descargas">Excel: <a href={exportar('facturas', q.t)}>facturas</a> · <a href={exportar('gastos', q.t)}>gastos</a> · <a href={`/api/paquete?anio=${anio}&t=${q.t}`}>paquete para la gestoría</a></p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

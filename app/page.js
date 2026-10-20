import { Fragment } from 'react';
import { headers } from 'next/headers';
import { esApp } from '@/lib/app';
import Link from 'next/link';
import { enviarLuego } from '@/lib/verifactuEnvio';
import Ir from '@/components/Ir';
import { requerir, usuarioActual } from '@/lib/auth';
import Landing from '@/components/Landing';
import { clave, leer, redis } from '@/lib/redis';
import { contar } from '@/lib/indices';
import { panelDe } from '@/lib/panelCache';
import '@/app/tesoreria.css';
import { importes, r2 } from '@/lib/calculos';
import { actividadesDe, fiscalDe, hecho303, modelosDe, nombresActividad } from '@/lib/empresa';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';
import Grafica from '@/components/Grafica';
import Cifra from '@/components/Cifra';
import Ico from '@/components/Ico';
import Logo from '@/components/Logo';
import AvisoPrueba from '@/components/AvisoPrueba';
import { DETALLE, puede } from '@/lib/permisos';
import '@/app/asistente.css';
import '@/app/empresas.css';
import '@/app/mk.css';
import '@/app/hoy.css';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import { accionesHoy } from '@/lib/hoy';
import { proximoPlazoDe } from '@/lib/avisos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fisquo · Facturas, gastos e impuestos en orden', description: 'Software de gestión financiera para autónomos, pymes y empresas: facturas, gastos con IA, conciliación bancaria, impuestos y nóminas.' };

export default async function Resumen({ searchParams }) {
  // Sin sesión: la web pública. Con sesión: el panel.
  if (!(await usuarioActual())) return <Landing />;
  const u = await requerir('resumen');
  enviarLuego(u); // Verifactu: si quedó algo por enviar (control de flujo de la AEAT), ahora
  if (!redis) return <SinBD />;
  const h = hoy();
  // Informe de capacidad E01/E06: el panel se calcula con los años que enseña y lo pendiente, y se guarda por versión de
  // los datos (lib/panelCache.js): mientras nada cambie, no se vuelven a leer los documentos.
  const anioPedido = Number((await searchParams).anio) || Number(h.slice(0, 4));
  const [nFacturas, nGastos, recurrentes, nominas, saldo] = await Promise.all([contar(u, 'facturas'), contar(u, 'gastos'), leer(u, 'recurrentes'), leer(u, 'nominas'), redis.get(clave(u, 'saldo'))]);
  const { P, teso, casillas } = await panelDe(u, { anio: anioPedido, hoy: h, recurrentes: recurrentes || [], nominas: nominas || [], saldo });
  const actividades = actividadesDe(u);
  const fiscal = fiscalDe(u);
  const ACTIVIDADES = nombresActividad(actividades);
  const { anio, anioActual, esteAnio, r, c303, c130, facturado, gastado, beneficio, plazo, debe, tHoy, qAhora, apartado, aPagar, mesPago,
    sinCobrar, porCobrar, vencidas, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite, cuotasSS, rendSS, prevRendSS } = P;
  const pagos = (y) => u.pagos130?.[y] || {};
  const exportar = (tipo, t) => `/api/exportar?tipo=${tipo}&anio=${anio}${t ? `&t=${t}` : ''}`;
  // Curva del beneficio acumulado mes a mes, hasta el último mes con movimiento.
  const acum = meses.slice(0, (esteAnio ? ultimoMes : 11) + 1).reduce((a, m) => [...a, (a.at(-1) ?? 0) + m.ing - m.gas], []);
  const [bajo, alto] = [Math.min(0, ...acum), Math.max(1, ...acum)];
  const puntos = acum.map((v, i) => [acum.length > 1 ? (i / (acum.length - 1)) * 120 : 120, 40 - ((v - bajo) / (alto - bajo)) * 36]);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  // Cuenta recién creada: ni facturas ni gastos. En vez de gráficas y trimestres a cero, los primeros pasos.
  const sinDatos = !nFacturas && !nGastos;
  const e = u.emisor || {};
  const pasos = [
    puede(u, 'empresa') && { id: 'datos', hecho: Boolean(e.nombre && e.nif && e.direccion), href: '/ajustes/facturacion', t: 'Completa los datos de tu empresa', d: 'Nombre, NIF y dirección: salen en cada factura', n: 'datos' },
    puede(u, 'empresa') && { id: 'logo', hecho: Boolean(u.marca?.logo), href: '/ajustes/marca', t: 'Pon tu logo y tu color', d: 'Tus facturas, con tu imagen', n: 'marca' },
    puede(u, 'facturar') && { id: 'factura', hecho: nFacturas > 0, href: '/facturas/nueva', t: 'Crea tu primera factura', d: 'En un minuto, con el IVA y el IRPF ya calculados', n: 'factura' },
    puede(u, 'gastar') && { id: 'gasto', hecho: nGastos > 0, href: '/gastos', t: 'Apunta tu primer gasto', d: 'Hazle una foto al ticket y Fisquo lo rellena', n: 'gasto' },
    puede(u, DETALLE) && { id: 'banco', hecho: saldo !== null && saldo !== undefined, href: '/banco', t: 'Sube el extracto del banco', d: 'Fisquo empareja cobros y pagos con tus facturas', n: 'beneficio' },
    u.rol === 'admin' && { id: 'gestoria', hecho: Boolean(u.gestoria?.email), href: '/ajustes/gestoria', t: 'Invita a tu gestoría', d: 'Le llega todo cada trimestre, sin pedírtelo', n: 'usuarios' },
  ].filter(Boolean);
  const hechos = pasos.filter((x) => x.hecho).length;
  const verPasos = pasos.length > 0 && hechos < pasos.length && nFacturas < 10;
  // Hacienda: el último tramo del plazo (3 días o menos) se avisa en rojo (lib/hoy.js).
  const avisoHacienda = esteAnio && debe ? accionesHoy({ hacienda: { dias: plazo.dias, importe: aPagar } })[0] : null;
  const urgente = avisoHacienda?.tono === 'rojo';
  const menos = (t) => t.replace(/^-/, '\u2212');
  const listaNombres = (v) => {
    const extra = Math.max(0, (v.clientes ?? v.nombres.length) - v.nombres.length);
    if (extra) return `${v.nombres.join(', ')} y ${extra === 1 ? '1 más' : `${extra} más`}`;
    return v.nombres.length > 1 ? `${v.nombres.slice(0, -1).join(', ')} y ${v.nombres.at(-1)}` : v.nombres[0] || '';
  };
  const accesos = [
    puede(u, 'facturas') && { href: '/facturas', n: 'factura', t: 'Facturas', enBarra: true },
    puede(u, 'gastos') && { href: '/gastos', n: 'gasto', t: 'Gastos', enBarra: true },
    puede(u, 'facturas') && { href: '/presupuestos', n: 'presupuesto', t: 'Presupuestos' },
    { href: '/modelos', n: 'hacienda', t: 'Impuestos' },
    puede(u, DETALLE) && { href: `/contabilidad?anio=${anio}`, n: 'contabilidad', t: 'Contabilidad' },
  ].filter(Boolean);

  return (
    <main className="pagina mk-look">
      <AvisoPrueba plan={u.plan} app={esApp((await headers()).get('user-agent'))} />
      <header className={`inicio${facturado > 0 ? '' : ' sin-saldo'}`}>
        <div className="inicio-barra">
          <Logo />
          {!sinDatos && <nav className="anios">
            <Ir href={`/?anio=${anio - 1}`} tipo="cifras" aria-label="Año anterior">‹</Ir>
            <strong>{anio}</strong>
            {anio < anioActual ? <Ir href={`/?anio=${anio + 1}`} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
          </nav>}
        </div>
        <h1 className="inicio-hola">Hola, {String(u.nombre || '').split(' ')[0] || 'equipo'}</h1>
        <p className="inicio-sub">{sinDatos ? 'Vamos a dejarlo todo listo.' : esteAnio ? 'Así va tu año.' : `Así cerraste ${anio}.`}</p>
        {u.misEmpresas?.length > 1 && <CambiarEmpresa empresas={u.misEmpresas} actual={u.empresa} variante="chip" />}
      </header>

      {facturado > 0 && (
        <section className="saldo">
          <h2 className="saldo-t">Beneficio {esteAnio ? 'este año' : `de ${anio}`}</h2>
          <div className="saldo-fila">
            <p className="saldo-v"><Cifra v={beneficio} /><small> €</small></p>
            {acum.length > 1 && (
              <svg className="saldo-curva" viewBox="-2 0 124 44" preserveAspectRatio="none" aria-hidden>
                <path className="area" d={`${linea}L120 44L0 44Z`} />
                <path className="trazo" d={linea} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          {/* El porcentaje es de lo facturado (sin IVA) en el mismo periodo: así lo dice, para no leerlo como beneficio. */}
          {cambio !== null && <p className={`saldo-cambio ${cambio >= 0 ? 'sube' : 'baja'}`}>{cambio >= 0 ? '↑' : '↓'} {Math.abs(cambio).toFixed(0)} % {cambio >= 0 ? 'más' : 'menos'} facturado que {esteAnio ? 'hace un año' : `en ${anio - 1}`}</p>}
          <p className="saldo-s">Facturado {eur(facturado)} · Gastos {eur(gastado)}</p>
        </section>
      )}

      <Ir href="/asistente" className="asi-entrada"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg>Pregunta por tus cuentas</Ir>

      <nav className="accesos" aria-label="Accesos">
        {accesos.map((a) => (
          <Ir key={a.href} href={a.href} tipo={['/presupuestos', '/modelos'].includes(a.href) || a.href.startsWith('/contabilidad') ? 'adelante' : 'tab-der'} className={`acceso${a.enBarra ? ' acceso-tab' : ''}`}><Ico n={a.n} /><span>{a.t}</span></Ir>
        ))}
      </nav>

      {verPasos && (
        <section className="grupo pasos" aria-labelledby="pasos-t">
          <div className="pasos-cab">
            <h2 className="grupo-t" id="pasos-t">Primeros pasos</h2>
            <span className="pasos-n">{hechos} de {pasos.length}</span>
          </div>
          <div className="pasos-barra" aria-hidden><span style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
          <div className="grupo-c">
            {pasos.map((x) => (
              x.hecho
                ? <div key={x.id} className="celda pp-paso hecho"><span className="pp-ok" aria-hidden>✓</span><span className="txt">{x.t}<small>Hecho</small></span></div>
                : <Ir key={x.id} href={x.href} tipo="adelante" className="celda ir pp-paso"><Ico n={x.n} /><span className="txt">{x.t}<small>{x.d}</small></span></Ir>
            ))}
          </div>
        </section>
      )}

      {facturado > 0 && (
        <div className="hcards">
          {esteAnio && (c303 || c130) && (
            <Ir href={`/modelos?anio=${debe ? plazo.anio : anioActual}`} className={`hcard ir${urgente ? ' urgente' : ''}`} style={{ '--c': urgente ? '#FF3B30' : '#FF9500' }}>
              <h2 className="hcard-t"><Ico n="hacienda" solo />Hacienda<span>{debe ? `${plazo.t}T ${plazo.anio}` : `${tHoy}T ${anioActual}`}</span></h2>
              {debe ? (
                <>
                  <p className="hcard-v"><Cifra v={aPagar} /><small>€ a pagar</small></p>
                  <p className={`hcard-s${urgente ? ' rojo' : ''}`}>{plazo.dias === 0 ? <strong>Hoy es el último día para presentarlo</strong> : plazo.dias === 1 ? <strong>Mañana acaba el plazo</strong> : `Hasta el ${fechaTexto(plazo.fecha)} · quedan ${plazo.dias} días`}</p>
                  <p className="hcard-s">{[debe.pend303 ? `Modelo 303: ${debe.m303 < 0 ? `${eur(-debe.m303)} a compensar` : eur(debe.ivaIngresar)}` : c303 && 'Modelo 303 presentado', debe.pend130 ? `Modelo 130: ${eur(debe.m130)}` : c130 && 'Modelo 130 presentado'].filter(Boolean).join(' · ')}</p>
                  <p className="hcard-s">Del {tHoy}T llevas {eur(apartado)} para apartar.</p>
                </>
              ) : (
                <>
                  <p className="hcard-v"><Cifra v={apartado} /><small>€ para apartar</small></p>
                  <p className="hcard-s">{[c303 && `IVA ${eur(qAhora.ivaIngresar)}`, c130 && `IRPF ${eur(qAhora.m130)}`].filter(Boolean).join(' + ')} · se paga del 1 al {tHoy === 4 ? 30 : 20} de {mesPago}</p>
                </>
              )}
            </Ir>
          )}

          {porCobrar > 0 && (
            <Ir href="/facturas?estado=pendientes" className="hcard ir" style={{ '--c': '#C69500' }}>
              <h2 className="hcard-t"><Ico n="cobrar" solo />Por cobrar<span>{sinCobrar.length === 1 ? '1 factura' : `${sinCobrar.length} facturas`}</span></h2>
              <p className="hcard-v"><Cifra v={porCobrar} /><small>€</small></p>
              {vencidas.length > 0 && <p className="hcard-s rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}: {listaNombres(vencidas)}</p>}
            </Ir>
          )}

          {teso && (
            <Ir href="/tesoreria" className="hcard ir" style={{ '--c': '#007AFF' }}>
              <h2 className="hcard-t"><Ico n="beneficio" solo />Tesorería<span>3 meses</span></h2>
              <p className="hcard-v"><Cifra v={teso.final} /><small>€</small></p>
              <p className={`hcard-s${teso.minimo.saldo < 0 ? ' rojo' : ''}`}>{teso.minimo.saldo < 0 ? `El ${fechaTexto(teso.minimo.fecha)} te quedarías en ${eur(teso.minimo.saldo)}` : `${teso.conSaldo ? 'Saldo previsto' : 'Sin saldo del banco'} · cobras ${eur(teso.entra)} y pagas ${eur(r2(teso.sale + teso.hacienda))}`}</p>
            </Ir>
          )}
        </div>
      )}

      {/* En el ordenador, dos columnas: la evolución a la izquierda y lo de consultar a la derecha. En el móvil, una. */}
      <div className={`res-rejilla${sinDatos ? ' sin-datos' : ''}`}>
        <div className="res-col">
          {!sinDatos && <>
          <section className="grupo">
            <h2 className="grupo-t">Mes a mes</h2>
            <div className="grupo-c relleno">
              <Grafica meses={meses} anio={anio} actual={ultimoMes} />
            </div>
          </section>

          <section className="grupo">
            <h2 className="grupo-t">Por actividad</h2>
            <div className="grupo-c">
              {r.porActividad.map((a) => (
                <div key={a.actividad} className="celda">
                  <Ico n="actividad" />
                  <span className="txt">{ACTIVIDADES[a.actividad] || 'Otra actividad'}<small>Facturado {eur(a.ingresos)}, gastos {eur(a.gastos)}</small></span>
                  <span className={`v${a.rendimiento < 0 ? ' rojo' : ''}`}>{menos(eur(a.rendimiento))}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grupo res-trim">
            <h2 className="grupo-t">Hacienda por trimestre</h2>
            <p className="grupo-pie arriba">Orientativo; confírmalo con tu gestor.{c130 ? ' Marca el 303 y el 130 de cada trimestre por separado. Si no pagaste el 130, se suma al siguiente.' : ' Marca cada trimestre cuando lo presentes.'}</p>
            <div className="trims">
              {r.trimestres.map((q) => {
                // El trimestre en curso (y los que faltan) aún no se pueden presentar: «En curso», sin selector.
                const abierto = anio === anioActual && q.t >= tHoy;
                return (
                <div key={q.t} className={`trim trimestre${anio === anioActual && q.t > tHoy ? ' futuro' : ''}`}>
                  <div className="trim-cab"><h3>{q.t}T {anio}</h3>{abierto && <span className="estado-txt e-curso">{q.t === tHoy ? 'En curso' : 'Aún no ha empezado'}</span>}</div>
                  <div className="trim-cifras">
                    {c303 && <p><span>Modelo 303</span><strong>{q.ivaDevolucion > 0 ? `${eur(q.ivaDevolucion)} a devolver` : q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.ivaIngresar)}</strong></p>}
                    {c303 && !abierto && <Presentado modelo="303" anio={anio} t={q.t} importe={0} pagado={q.t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : hecho303(u.pres303, u.pagos130, anio, q.t)} con130={false} />}
                    {c130 && <p><span>Modelo 130</span><strong>{eur(q.m130)}</strong></p>}
                    {c130 && !abierto && <Presentado anio={anio} t={q.t} importe={q.m130} pagado={pagos(anio)[q.t]} />}
                    {!c303 && !c130 && <p><span>Base facturada</span><strong>{eur(q.ingresos)}</strong></p>}
                  </div>
                  <details className="trim-mas">
                  <summary>Ver detalle</summary>
                  <dl>
                    <dt>Base facturada</dt><dd>{eur(q.ingresos)}</dd>
                    <dt>Gastos</dt><dd>{eur(q.gastos)}</dd>
                    {c303 && <>
                    <dt>IVA repercutido</dt><dd>{eur(q.ivaRep)}</dd>
                    <dt>IVA deducible</dt><dd>−{eur(q.ivaDed)}</dd>
                    {q.ivaCompensado > 0 && <><dt>Cuotas anteriores compensadas</dt><dd>−{eur(q.ivaCompensado)}</dd></>}
                    <dt><strong>Modelo 303</strong></dt><dd><strong>{q.ivaDevolucion > 0 ? `${eur(q.ivaDevolucion)} a devolver` : q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.ivaIngresar)}</strong></dd>
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
                    const c = casillas[q.t];
                    const fila = (n, t, v) => <Fragment key={`${n}${t}`}><dt>{n} · {t}</dt><dd>{eur(v)}</dd></Fragment>;
                    return (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9375rem' }}>Casillas para Hacienda</summary>
                        {c303 && <>
                        <p className="nota" style={{ margin: '10px 0 6px' }}><strong>Modelo 303</strong></p>
                        <dl>
                          {c['04'] > 0 && <>{fila('04', 'Base al 10 %', c['04'])}{fila('06', 'Cuota al 10 %', c['06'])}</>}
                          {fila('07', 'Base al 21 %', c['07'])}
                          {fila('09', 'Cuota al 21 %', c['09'])}
                          {c.otros.flatMap((o) => [fila('—', `Base al ${o.pct} % (revisar casilla)`, o.base), fila('—', `Cuota al ${o.pct} % (revisar casilla)`, o.iva)])}
                          {(c['14'] !== 0 || c['15'] !== 0) && <>{fila('14', 'Rectificativas: base', c['14'])}{fila('15', 'Rectificativas: cuota', c['15'])}</>}
                          {[['16', '18', '0,5'], ['19', '21', '1,4'], ['22', '24', '5,2']].filter(([b]) => c[b]).flatMap(([b, q, r]) => [fila(b, `Recargo ${r} %: base`, c[b]), fila(q, `Recargo ${r} %: cuota`, c[q])])}
                          {(c['25'] || c['26']) ? <>{fila('25', 'Recargo de rectificativas: base', c['25'])}{fila('26', 'Recargo de rectificativas: cuota', c['26'])}</> : null}
                          {c['10'] > 0 && <>{fila('10', 'Compras a la UE: base', c['10'])}{fila('11', 'Compras a la UE: cuota', c['11'])}</>}
                          {c['12'] > 0 && <>{fila('12', 'Compras de fuera de la UE: base', c['12'])}{fila('13', 'Compras de fuera de la UE: cuota', c['13'])}</>}
                          {fila('27', 'Total cuota devengada', c['27'])}
                          {fila('28', 'Base IVA soportado', c['28'])}
                          {fila('29', 'Cuota IVA soportado', c['29'])}
                          {c['30'] > 0 && <>{fila('30', 'Bienes de inversión: base', c['30'])}{fila('31', 'Bienes de inversión: cuota', c['31'])}</>}
                          {c['36'] > 0 && <>{fila('36', 'Compras a la UE: base deducible', c['36'])}{fila('37', 'Compras a la UE: cuota deducible', c['37'])}</>}
                          {fila('45', 'Total a deducir', c['45'])}
                          {fila('46', 'Resultado', c['46'])}
                        </dl>
                        {(c['59'] || c['60'] || c['120'] || c['122']) ? <dl>
                          {c['59'] !== 0 && fila('59', 'Empresas de otros países de la UE', c['59'])}
                          {c['60'] !== 0 && fila('60', 'Exportaciones', c['60'])}
                          {c['120'] !== 0 && fila('120', 'No sujetas por localización (clientes de fuera de la UE)', c['120'])}
                          {c['122'] !== 0 && fila('122', 'Inversión del sujeto pasivo', c['122'])}
                        </dl> : null}
                        {c['59'] !== 0 && <p className="nota">Con operaciones con empresas de la UE presentas también el 349 en el mismo plazo: lo tienes en <a href={`/modelos?anio=${anio}#m349`}>Impuestos</a>.</p>}
                        {r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122']) !== 0 && <p className="nota">Facturas sin IVA por {eur(r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122']))} sin motivo claro: si el cliente es de otro país de la UE, pon en su NIF el NIF-IVA con el prefijo del país (por ejemplo, DE…) o elige el tipo de operación en la factura. Si es una operación exenta, va en la casilla de exentas.</p>}
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
                          {fila('07', 'Resultado', q.c07)}
                          {q.minoracion > 0 && fila('13', 'Minoración por el rendimiento del año anterior', q.minoracion)}
                          {q.negPrev > 0 && fila('15', 'Negativos de trimestres anteriores', q.negPrev)}
                          {q.minoracion > 0 && fila('19', 'A ingresar', q.m130)}
                        </dl>
                        </>}
                      </details>
                    );
                  })()}
                  <p className="descargas">Excel: <a href={exportar('facturas', q.t)}>facturas</a> · <a href={exportar('gastos', q.t)}>gastos</a>{puede(u, DETALLE) && <> · <a href={`/api/paquete?anio=${anio}&t=${q.t}`}>paquete para la gestoría</a></>}</p>
                  </details>
                </div>
                );
              })}
            </div>
          </section>
          </>}
        </div>
        <div className="res-col">
          {limite > 0 && fiscal.tipo === 'autonomo' && (
            <section className="grupo">
              <h2 className="grupo-t">Tarifa plana</h2>
              <div className="grupo-c">
                <div className="celda columna">
                  <div className="linea"><span>Rendimiento para la Seguridad Social {anio}</span><span className="v">{eur(rendSS)} <small>de {eur(limite)}</small></span></div>
                  <div className="barra-limite"><span className={rendSS > limite ? 'pasado' : rendSS > limite * 0.8 ? 'cerca' : ''} style={{ width: `${Math.min(100, Math.max(0, (rendSS / limite) * 100))}%` }} /></div>
                </div>
              </div>
              <p className="grupo-pie">{rendSS > limite ? `Te pasas en ${eur(rendSS - limite)}.` : `Te quedan ${eur(limite - rendSS)} de margen.`}{esteAnio && prevRendSS > limite ? ` A este ritmo acabarías el año en ${eur(prevRendSS)}: ${eur(prevRendSS - limite)} por encima, y perderías la tarifa plana.` : ''} Es lo que mira la Seguridad Social: facturas menos gastos ({eur(beneficio)}), más tus cuotas de autónomos ({eur(cuotasSS)}), menos un 7 % de gastos genéricos. Si tienes gastos que no están en Fisquo, el número real será menor.</p>
            </section>
          )}

          {esteAnio && nFacturas > 0 && (
            <section className="grupo">
              <h2 className="grupo-t">Si sigues a este ritmo</h2>
              <div className="grupo-c">
                <div className="celda"><Ico n="factura" /><span className="txt">Facturarás en {anio}</span><span className="v">{eur(prevFact)}</span></div>
                <div className="celda"><Ico n="beneficio" /><span className="txt">Ganarás tras gastos</span><span className="v">{eur(prevBeneficio)}</span></div>
              </div>
              <p className="grupo-pie">Lo facturado hasta hoy ({eur(facturado)}) llevado a 12 meses.{limite > 0 ? (prevRendSS > limite ? ` Para la Seguridad Social te pasarías del límite de la tarifa plana en ${eur(prevRendSS - limite)}.` : ` Para la Seguridad Social quedarías ${eur(limite - prevRendSS)} por debajo del límite de la tarifa plana.`) : ''}</p>
            </section>
          )}

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
              {modelosDe(fiscal).map((m) => ({ ...m, prox: proximoPlazoDe(fiscal, m.id, h, { cuotaIS: u.cuotaIS }) })).map((m) => ({ ...m, cuando: m.prox ? `${m.prox === h ? 'Hoy es el último día' : `Próximo: ${fechaTexto(m.prox)}${m.prox.slice(0, 4) !== h.slice(0, 4) ? ` de ${m.prox.slice(0, 4)}` : ''}`}` : m.cuando })).map((m) => (
                m.calcula
                  ? <Ir key={m.id} href={`/modelos?anio=${anio}#m${m.id}`} tipo="adelante" className="celda ir"><span className="modelo-num">{m.num || m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span><span className="v">{m.id === '100' ? 'Borrador' : 'Calculado'}</span></Ir>
                  : <div key={m.id} className="celda"><span className="modelo-num">{m.num || m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span>{m.calcula && <span className="v">Calculado</span>}</div>
              ))}
            </div>
            <p className="grupo-pie">Según lo que respondiste al empezar ({fiscal.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}). La app calcula los que pone «Calculado» (tócalos para verlos); el resto, tu gestor. Puedes cambiarlo en Ajustes.</p>
          </section>

          <section className="grupo">
            <h2 className="grupo-t">Descargas</h2>
            <div className="grupo-c">
              {!sinDatos && <a href={exportar('facturas')} className="celda ir"><Ico n="factura" /><span className="txt">Facturas de {anio} en Excel</span></a>}
              {!sinDatos && <a href={exportar('gastos')} className="celda ir"><Ico n="gasto" /><span className="txt">Gastos de {anio} en Excel</span></a>}
              {!sinDatos && esteAnio && puede(u, DETALLE) && (() => { const g = plazo.dias <= 25 ? plazo : { anio, t: tHoy }; return <a href={`/api/paquete?anio=${g.anio}&t=${g.t}`} className="celda ir"><Ico n="hacienda" /><span className="txt">Paquete del {g.t}T {g.anio} para la gestoría<small>Excel y PDF con facturas, gastos e impuestos</small></span></a>; })()}
              <a href="/api/avisos" className="celda ir"><Ico n="plazo" /><span className="txt">Plazos de Hacienda en tu calendario<small>Aviso 7 días y 1 día antes</small></span></a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

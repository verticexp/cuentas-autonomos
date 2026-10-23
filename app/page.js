import Termino from '@/components/Termino';
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
import { importes, limiteTrimestre, r2 } from '@/lib/calculos';
import { plazo420 } from '@/lib/igic';
import { sinFuncion } from '@/lib/planes';
import { actividadesDe, fiscalDe, hecho303, modelosDe, nombresActividad } from '@/lib/empresa';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';
import Grafica from '@/components/Grafica';
import Cifra from '@/components/Cifra';
import Ico from '@/components/Ico';
import Logo from '@/components/Logo';
import AvisoPrueba from '@/components/AvisoPrueba';
import AvisoMensajes from '@/components/AvisoMensajes';
import AccesoDespacho from '@/components/AccesoDespacho';
import { DETALLE, puede } from '@/lib/permisos';
import '@/app/asistente.css';
import '@/app/empresas.css';
import '@/app/mk.css';
import '@/app/hoy.css';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import { accionesHoy } from '@/lib/hoy';
import { resumen as resumenBandeja } from '@/lib/bandeja';
import { proximoPlazoDe } from '@/lib/avisos';
import YaPresentado from '@/components/YaPresentado';

export const dynamic = 'force-dynamic';
// Solo los modelos definidos en el glosario reciben ayuda.
function NumeroModelo({ modelo }) {
  const texto = modelo.num || modelo.id;
  return ({
    303: <Termino id="m303">{texto}</Termino>,
    130: <Termino id="m130">{texto}</Termino>,
    111: <Termino id="m111">{texto}</Termino>,
    115: <Termino id="m115">{texto}</Termino>,
    349: <Termino id="m349">{texto}</Termino>,
    347: <Termino id="m347">{texto}</Termino>,
    390: <Termino id="m390">{texto}</Termino>,
    202: <Termino id="m202">{texto}</Termino>,
    200: <Termino id="m200">{texto}</Termino>,
  })[modelo.id] || texto;
}

export async function generateMetadata() {
  return {
    title: { absolute: (await usuarioActual()) ? 'Resumen · Fisquo' : 'Fisquo · Facturas, gastos e impuestos en orden' },
    description: 'Software de gestión financiera para autónomos, pymes y empresas: facturas, gastos con IA, conciliación bancaria, impuestos y nóminas.',
  };
}

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
  const [nFacturas, nGastos, recurrentes, nominas, saldo, bandeja] = await Promise.all([contar(u, 'facturas'), contar(u, 'gastos'), leer(u, 'recurrentes'), leer(u, 'nominas'), redis.get(clave(u, 'saldo')), puede(u, 'gastos') ? leer(u, 'bandeja') : []]);
  // Facturas subidas o reenviadas que esperan a que alguien las revise (lib/bandeja.js): cuántas y cuántas cuadran.
  const porRevisar = resumenBandeja(bandeja || []);
  const { P, teso, casillas } = await panelDe(u, { anio: anioPedido, hoy: h, recurrentes: recurrentes || [], nominas: nominas || [], saldo });
  const actividades = actividadesDe(u);
  const fiscal = fiscalDe(u);
  const ACTIVIDADES = nombresActividad(actividades);
  const { anio, anioActual, esteAnio, r, c303, c130, igic, foral, facturado, gastado, beneficio, plazo, debe, tHoy, qAhora, apartado, aPagar,
    sinCobrar, porCobrar, vencidas, sinPagar = { length: 0 }, porPagar = 0, pagosVencidos = { length: 0, nombres: [] }, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite, cuotasSS, rendSS, prevRendSS } = P;
  const impuesto = igic ? 'IGIC' : 'IVA';
  const modeloIndirecto = igic ? 'IGIC (420)' : 'Modelo 303';
  const nombreIndirecto = (q) => q.modeloIva || modeloIndirecto;
  const nombreIrpf = (q) => q.modeloIrpf || 'Modelo 130';
  const importeIrpf = (q) => q.m130 === null ? 'Sin datos' : eur(q.m130);
  const plazosPago = (q) => [c303 && `${nombreIndirecto(q)}: hasta el ${fechaTexto(q.plazoIva)}`, c130 && `${nombreIrpf(q)}: hasta el ${fechaTexto(q.plazoIrpf)}`].filter(Boolean).join('; ');
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
  // Por orden de valor (auditoría D8-16): lo que da de comer primero y el adorno al final. Los datos de la empresa ya se
  // piden al registrarse: solo salen si faltan (y entonces van primero, porque sin ellos la factura no vale).
  const pasos = [
    puede(u, 'empresa') && !(e.nombre && e.nif && e.direccion) && { id: 'datos', hecho: false, href: '/ajustes/facturacion', t: 'Completa los datos de tu empresa', d: 'Nombre, NIF y dirección: salen en cada factura', n: 'datos', boton: 'Completar' },
    puede(u, 'facturar') && { id: 'factura', hecho: nFacturas > 0, href: '/facturas/nueva', t: 'Crea tu primera factura', d: 'IVA e IRPF ya calculados', n: 'factura', boton: 'Crear factura' },
    puede(u, 'gastar') && { id: 'gasto', hecho: nGastos > 0, href: '/gastos', t: 'Apunta tu primer gasto', d: 'Hazle una foto al ticket', n: 'gasto', boton: 'Apuntar gasto' },
    puede(u, DETALLE) && { id: 'banco', hecho: saldo !== null && saldo !== undefined, href: '/banco', t: 'Sube el extracto del banco', d: 'Fisquo empareja cobros y pagos', n: 'beneficio', boton: 'Subir extracto' },
    puede(u, 'empresa') && { id: 'logo', hecho: Boolean(u.marca?.logo), href: '/ajustes/marca', t: 'Pon tu logo y tu color', d: 'Tus facturas, con tu imagen', n: 'marca', boton: 'Poner logo' },
    u.rol === 'admin' && { id: 'gestoria', hecho: Boolean(u.gestoria?.email), href: '/ajustes/gestoria', t: 'Invita a tu gestoría', d: 'Recibe todo cada trimestre', n: 'usuarios', boton: 'Invitar' },
  ].filter(Boolean);
  const siguientePaso = pasos.find((x) => !x.hecho);
  const hechos = pasos.filter((x) => x.hecho).length;
  const verPasos = pasos.length > 0 && hechos < pasos.length && nFacturas < 10;
  // Hacienda: el último tramo del plazo (3 días o menos) se avisa en rojo (lib/hoy.js).
  const avisoHacienda = esteAnio && debe ? accionesHoy({ hacienda: { dias: plazo.dias, importe: aPagar } })[0] : null;
  const urgente = avisoHacienda?.tono === 'rojo';
  // Las tarjetas no dependen de lo facturado en el año: en enero, antes de la primera factura, siguen el 4T por pagar,
  // lo que queda por cobrar de diciembre o los gastos por revisar.
  const verHacienda = esteAnio && (c303 || c130) && (facturado > 0 || Boolean(debe));
  const verPorPagar = porPagar > 0 && puede(u, 'gastos');
  // La previsión de caja es del plan Pro (planes v2 y v3): con uno que no la incluye no se enseña la tarjeta.
  const verTeso = Boolean(teso) && !(u.plan?.version >= 2 && sinFuncion(u.plan, 'tesoreria'));
  // Por qué baja la previsión (auditoría U-16): el pago más grande hasta el día en que el saldo toca fondo.
  const causaMinimo = teso?.minimo?.saldo < 0 ? (teso.movimientos || []).filter((m) => m.importe < 0 && m.fecha <= teso.minimo.fecha).sort((a, b) => a.importe - b.importe)[0] : null;
  const hayTarjetas = !sinDatos && (verHacienda || porCobrar > 0 || verPorPagar || porRevisar.pendientes > 0 || verTeso);
  // Lo demás que viene para Hacienda en los próximos meses (retenciones, Sociedades, dividendos…), de la previsión de
  // Tesorería: la tarjeta enseña el IVA y el IRPF y, sin esto, parecía que era todo lo que había que apartar.
  const otrosHacienda = (teso?.movimientos || []).filter((m) => m.tipo === 'hacienda' && !m.vencido && !/^(IVA|IGIC|IRPF)\b/.test(m.concepto));
  const lineaOtros = otrosHacienda.length > 0 && `Además: ${otrosHacienda.slice(0, 2).map((m) => `${m.concepto}, ${eur(-m.importe)} hasta el ${fechaTexto(m.fecha)}`).join(' · ')}${otrosHacienda.length > 2 ? ` y ${otrosHacienda.length - 2} más` : ''}`;
  // Último día para pagar un trimestre, ya pasado al día hábil (el 4T, con el año siguiente).
  const hastaT = (t, y) => `${fechaTexto(limiteTrimestre(t, y))}${t === 4 ? ` de ${y + 1}` : ''}`;
  // Plazos que pasaron sin marcar el modelo como presentado (lib/tesoreria.js VENCIDOS_DIAS).
  const preguntas = (teso?.movimientos || []).filter((m) => m.pregunta);
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
    // Para un autónomo, «Libros registro» (el nombre de la pantalla en el menú y el que usa su gestor, D8-20).
    puede(u, DETALLE) && { href: `/contabilidad?anio=${anio}`, n: 'contabilidad', t: fiscal.tipo === 'sociedad' ? 'Contabilidad' : 'Libros registro' },
  ].filter(Boolean);

  return (
    <main className="pagina mk-look">
      <AvisoPrueba plan={u.plan} app={esApp((await headers()).get('user-agent'))} />
      <AvisoMensajes u={u} />
      <AccesoDespacho u={u} />
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
        <p className="inicio-sub">{sinDatos ? (siguientePaso?.id === 'factura' ? 'Empieza por tu primera factura: tarda un minuto.' : 'Vamos a dejarlo todo listo.') : esteAnio ? 'Así va tu año.' : `Así cerraste ${anio}.`}</p>
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

      {preguntas.length > 0 && (
        <section className="grupo" aria-labelledby="presentado-t">
          <h2 className="grupo-t" id="presentado-t">¿Ya lo has presentado?</h2>
          <ul className="grupo-lista">
            {preguntas.map((m) => (
              <li key={`${m.pregunta.modelo}-${m.pregunta.anio}-${m.pregunta.t}`}>
                <div className="fila"><span className="txt"><strong>{m.concepto} {m.pregunta.anio}</strong><small>{m.detalle}</small></span><span className="imp">{eur(-m.importe)}</span></div>
                <YaPresentado pregunta={m.pregunta} importe={-m.importe} puede={puede(u, 'contabilidad')} />
              </li>
            ))}
          </ul>
          <p className="grupo-pie">Mientras no lo marques, Tesorería lo cuenta como un pago de hoy.</p>
        </section>
      )}

      <Ir href="/asistente" className="asi-entrada"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg>{sinDatos ? 'Pregúntame cómo hacer tu primera factura' : 'Pregunta por tus cuentas'}</Ir>

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
                : <Ir key={x.id} href={x.href} tipo="adelante" className={`celda ir pp-paso${x === siguientePaso ? ' pp-primero' : ''}`}><Ico n={x.n} /><span className="txt">{x.t}<small>{x.d}</small></span>{x === siguientePaso && <span className="pp-accion" aria-hidden>{x.boton}</span>}</Ir>
            ))}
          </div>
        </section>
      )}

      {hayTarjetas && (
        <div className="hcards">
          {verHacienda && (
            <Ir href={`/modelos?anio=${debe ? plazo.anio : anioActual}`} className={`hcard ir${urgente ? ' urgente' : ''}`} style={{ '--c': urgente ? 'var(--out)' : 'var(--hacienda)' }}>
              <h2 className="hcard-t"><Ico n="hacienda" solo />Hacienda<span>{debe ? `${plazo.t}T ${plazo.anio}` : `${tHoy}T ${anioActual}`}</span></h2>
              {debe ? (
                <>
                  <p className="hcard-v"><Cifra v={aPagar} /><small>€ a pagar</small></p>
                  <p className={`hcard-s${urgente ? ' rojo' : ''}`}>{plazo.dias === 0 ? <strong>{debe.irpfForal?.deOficio && !debe.pend303 ? 'Hoy es el día del pago de oficio' : 'Hoy es el último día para presentarlo'}</strong> : plazo.dias === 1 ? <strong>Mañana acaba el plazo</strong> : `Hasta el ${fechaTexto(plazo.fecha)} · quedan ${plazo.dias} días`}</p>
                  <p className="hcard-s">{[debe.pend303 ? `${nombreIndirecto(debe)}: ${debe.m303 < 0 ? `${eur(-debe.m303)} a compensar` : eur(debe.ivaIngresar)}` : !foral && c303 && `${modeloIndirecto} presentado`, debe.pend130 ? `${nombreIrpf(debe)}: ${importeIrpf(debe)}${igic && plazo.t === 4 ? ` · hasta el ${hastaT(4, plazo.anio)}` : ''}` : !foral && c130 && 'Modelo 130 presentado'].filter(Boolean).join(' · ')}</p>
                  {foral && <p className="hcard-s">{plazosPago(debe)}</p>}
                  <p className="hcard-s">Del {tHoy}T llevas {eur(apartado)} para apartar.</p>
                  {lineaOtros && <p className="hcard-s">{lineaOtros}</p>}
                </>
              ) : (
                <>
                  <p className="hcard-v"><Cifra v={apartado} /><small>€ para apartar</small></p>
                  <p className="hcard-s">{[c303 && `${impuesto}${igic ? ' (420)' : ''} ${eur(qAhora.ivaIngresar)}`, c130 && `IRPF ${importeIrpf(qAhora)}`].filter(Boolean).join(' + ')} · {foral ? plazosPago(qAhora) : igic && tHoy === 4 ? [c303 && `420: hasta el ${fechaTexto(plazo420(anioActual, 4))} de ${anioActual + 1}`, c130 && `130: hasta el ${hastaT(4, anioActual)}`].filter(Boolean).join('; ') : <>se paga hasta el {hastaT(tHoy, anioActual)}</>}</p>
                  {lineaOtros && <p className="hcard-s">{lineaOtros}</p>}
                </>
              )}
            </Ir>
          )}

          {porCobrar > 0 && (
            <Ir href="/facturas?estado=pendientes" className="hcard ir" style={{ '--c': 'var(--aviso)' }}>
              <h2 className="hcard-t"><Ico n="cobrar" solo />Por cobrar<span>{sinCobrar.length === 1 ? '1 factura' : `${sinCobrar.length} facturas`}</span></h2>
              <p className="hcard-v"><Cifra v={porCobrar} /><small>€</small></p>
              {vencidas.length > 0 && <p className="hcard-s rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}: {listaNombres(vencidas)}</p>}
            </Ir>
          )}

          {verPorPagar && (
            <Ir href={pagosVencidos.length ? '/gastos?estado=vencidos' : '/gastos?estado=sinpagar'} className="hcard ir" style={{ '--c': 'var(--out)' }}>
              <h2 className="hcard-t"><Ico n="gasto" solo />Por pagar<span>{sinPagar.length === 1 ? '1 factura' : `${sinPagar.length} facturas`}</span></h2>
              <p className="hcard-v"><Cifra v={porPagar} /><small>€</small></p>
              {pagosVencidos.length > 0 && <p className="hcard-s rojo">{pagosVencidos.length === 1 ? '1 vencida' : `${pagosVencidos.length} vencidas`}: {listaNombres({ nombres: pagosVencidos.nombres || [], clientes: pagosVencidos.proveedores })}</p>}
            </Ir>
          )}

          {porRevisar.pendientes > 0 && (
            <Ir href="/gastos?ver=revisar" className="hcard ir" style={{ '--c': 'var(--info)' }}>
              <h2 className="hcard-t"><Ico n="gasto" solo />Por revisar</h2>
              <p className="hcard-v">{porRevisar.pendientes}<small>{porRevisar.pendientes === 1 ? 'factura' : 'facturas'}</small></p>
              <p className="hcard-s">{[porRevisar.cuadran && (porRevisar.cuadran === 1 ? '1 cuadra: apruébala con un toque' : `${porRevisar.cuadran} cuadran: apruébalas de golpe`), porRevisar.leyendo && `${porRevisar.leyendo} leyéndose`, porRevisar.cuarentena && (porRevisar.cuarentena === 1 ? '1 de un remitente que no conoces' : `${porRevisar.cuarentena} de remitentes que no conoces`)].filter(Boolean).join(' · ') || 'Ábrelas para revisarlas y guardarlas como gasto'}</p>
            </Ir>
          )}

          {verTeso && (
            <Ir href="/tesoreria" className="hcard ir" style={{ '--c': 'var(--info)' }}>
              <h2 className="hcard-t"><Ico n="beneficio" solo />Tesorería<span>3 meses</span></h2>
              <p className="hcard-v"><Cifra v={teso.final} /><small>€</small></p>
              <p className={`hcard-s${teso.minimo.saldo < 0 ? ' rojo' : ''}`}>{teso.minimo.saldo < 0 ? `El ${fechaTexto(teso.minimo.fecha)} te quedarías en ${eur(teso.minimo.saldo)}${causaMinimo ? `: incluye ${causaMinimo.concepto}` : ''}` : `${teso.conSaldo ? 'Saldo previsto' : 'Sin saldo del banco'} · cobras ${eur(teso.entra)} y pagas ${eur(r2(teso.sale + teso.hacienda))}`}</p>
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
            <p className="grupo-pie arriba">Orientativo; confírmalo con tu gestor.{foral ? ' Marca cada modelo por separado. El pago fraccionado del IRPF sigue las reglas de tu Hacienda foral.' : c130 ? ` Marca el ${igic ? '420' : '303'} y el 130 de cada trimestre por separado. Un 130 presentado se descuenta en los siguientes aunque no lo hayas pagado (esa deuda va aparte).` : ' Marca cada trimestre cuando lo presentes.'}</p>
            <div className="trims">
              {r.trimestres.map((q) => {
                // El trimestre en curso (y los que faltan) aún no se pueden presentar: «En curso», sin selector.
                const abierto = anio === anioActual && q.t >= tHoy;
                return (
                <div key={q.t} className={`trim trimestre${anio === anioActual && q.t > tHoy ? ' futuro' : ''}`}>
                  <div className="trim-cab"><h3>{q.t}T {anio}</h3>{abierto && <span className="estado-txt e-curso">{q.t === tHoy ? 'En curso' : 'Aún no ha empezado'}</span>}</div>
                  <div className="trim-cifras">
                    {c303 && <p><span>{foral ? nombreIndirecto(q) : igic ? modeloIndirecto : q.t === r.trimestres[0]?.t ? <Termino id="m303">Modelo 303</Termino> : 'Modelo 303'}</span><strong>{q.ivaDevolucion > 0 ? `${eur(q.ivaDevolucion)} a devolver` : q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.ivaIngresar)}</strong></p>}
                    {c303 && !abierto && <Presentado soloLectura={!puede(u, 'contabilidad')} modelo={igic ? '420' : '303'} anio={anio} t={q.t} importe={0} pagado={q.t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : hecho303(u.pres303, u.pagos130, anio, q.t)} con130={false} />}
                    {c130 && <p><span>{foral ? nombreIrpf(q) : q.t === r.trimestres[0]?.t ? <Termino id="m130">Modelo 130</Termino> : 'Modelo 130'}</span><strong>{importeIrpf(q)}</strong></p>}
                    {c130 && q.m130 !== null && !abierto && <Presentado soloLectura={!puede(u, 'contabilidad')} anio={anio} t={q.t} importe={q.m130} pagado={pagos(anio)[q.t]} />}
                    {!c303 && !c130 && <p><span>Base facturada</span><strong>{eur(q.ingresos)}</strong></p>}
                  </div>
                  <details className="trim-mas">
                  <summary>Ver detalle</summary>
                  <dl>
                    <dt>Base facturada</dt><dd>{eur(q.ingresos)}</dd>
                    <dt>Gastos</dt><dd>{eur(q.gastos)}</dd>
                    {c303 && <>
                    <dt>{impuesto} repercutido</dt><dd>{eur(q.ivaRep)}</dd>
                    <dt>{impuesto} deducible</dt><dd>−{eur(q.ivaDed)}</dd>
                    {q.ivaCompensado > 0 && <><dt>Cuotas anteriores compensadas</dt><dd>−{eur(q.ivaCompensado)}</dd></>}
                    <dt><strong>{nombreIndirecto(q)}</strong></dt><dd><strong>{q.ivaDevolucion > 0 ? `${eur(q.ivaDevolucion)} a devolver` : q.m303 < 0 ? `${eur(-q.m303)} a compensar` : eur(q.ivaIngresar)}</strong></dd>
                    </>}
                    {c130 && foral && <>
                    <dt>{q.irpfForal.texto}</dt><dd>{importeIrpf(q)}</dd>
                    <dt>{nombreIrpf(q)}</dt><dd>Hasta el {fechaTexto(q.plazoIrpf)}</dd>
                    </>}
                    {c130 && !foral && <>
                    <dt>5 % gastos difícil justificación</dt><dd>−{eur(q.difJust)}</dd>
                    <dt>20 % rendimiento acumulado</dt><dd>{eur(r2(0.2 * Math.max(0, q.rendAcum)))}</dd>
                    <dt>Retenciones acumuladas</dt><dd>−{eur(q.retAcum)}</dd>
                    <dt>130 pagados antes</dt><dd>−{eur(q.pagosPrev)}</dd>
                    {pagos(anio)[q.t] > 0 && <><dt>Pagado este trimestre</dt><dd>{eur(pagos(anio)[q.t])}</dd></>}
                    <dt><strong>Modelo 130</strong></dt><dd><strong>{eur(q.m130)}</strong></dd>
                    </>}
                  </dl>
                  {!foral && (c303 || c130) && (() => {
                    const c = casillas[q.t];
                    const fila = (n, t, v) => <Fragment key={`${n}${t}`}><dt>{n} · {t}</dt><dd>{eur(v)}</dd></Fragment>;
                    return (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9375rem' }}>Casillas para Hacienda</summary>
                        {c303 && igic && <>
                          <p className="nota"><strong>IGIC (420)</strong></p>
                          <dl>{Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')).filter((k) => c[k] !== 0).map((k) => fila(k, 'IGIC', c[k]))}</dl>
                        </>}
                        {c303 && !igic && <>
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
                          {c['12'] > 0 && <>{fila('12', 'Inversión del sujeto pasivo: base', c['12'])}{fila('13', 'Inversión del sujeto pasivo: cuota', c['13'])}</>}
                          {fila('27', 'Total cuota devengada', c['27'])}
                          {fila('28', 'Base IVA soportado', c['28'])}
                          {fila('29', 'Cuota IVA soportado', c['29'])}
                          {c['30'] > 0 && <>{fila('30', 'Bienes de inversión: base', c['30'])}{fila('31', 'Bienes de inversión: cuota', c['31'])}</>}
                          {c['36'] > 0 && <>{fila('36', 'Compras a la UE: base deducible', c['36'])}{fila('37', 'Compras a la UE: cuota deducible', c['37'])}</>}
                          {fila('45', 'Total a deducir', c['45'])}
                          {fila('46', 'Resultado', c['46'])}
                        </dl>
                        {(c['59'] || c['60'] || c['120'] || c['122']) ? <dl>
                          {c['59'] !== 0 && fila('59', 'Ventas y servicios a empresas de la UE (intracomunitarias)', c['59'])}
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
                          {fila('05', 'Casillas 07 de los 130 anteriores', q.pagosPrev)}
                          {fila('06', 'Retenciones', q.retAcum)}
                          {fila('07', 'Resultado', q.c07)}
                          {q.minoracion > 0 && fila('13', 'Minoración por el rendimiento del año anterior', q.minoracion)}
                          {q.negPrev > 0 && fila('15', 'Negativos de trimestres anteriores', q.negPrev)}
                          {(q.minoracion > 0 || q.negPrev > 0) && fila('19', q.c19 < 0 && q.t < 4 ? 'Resultado (a deducir en los siguientes)' : 'Resultado', q.c19)}
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
            <h2 className="grupo-t">{sinDatos ? 'Tus próximos plazos' : 'Tus modelos'}</h2>
            <div className="grupo-c">
              {/* Sin datos, solo los trimestrales de cada día (D8-19): el 347, el 390 o la renta son ruido el primer día. */}
              {modelosDe(fiscal).filter((m) => !sinDatos || ['303', '420', '130', '131'].includes(m.id)).map((m) => ({ ...m, prox: proximoPlazoDe(fiscal, m.id, h, { cuotaIS: u.cuotaIS }) })).map((m) => ({ ...m, cuando: m.prox ? `${m.prox === h ? 'Hoy es el último día' : `Próximo: ${fechaTexto(m.prox)}${m.prox.slice(0, 4) !== h.slice(0, 4) ? ` de ${m.prox.slice(0, 4)}` : ''}`}` : m.cuando })).map((m) => (
                m.calcula
                  ? <div key={m.id} className="celda ir"><span className="modelo-num"><NumeroModelo modelo={m} /></span><Ir href={`/modelos?anio=${anio}#m${m.id}`} tipo="adelante" className="txt enlace-modelo" aria-label={`Modelo ${m.id}: ${m.nombre}`}>{m.nombre}<small>{m.cuando}</small></Ir><span className="v">{m.id === '100' ? 'Borrador' : 'Lo calcula Fisquo'}</span></div>
                  : <div key={m.id} className="celda"><span className="modelo-num"><NumeroModelo modelo={m} /></span><span className="txt">{m.nombre}<small>{m.cuando}</small></span>{m.calcula && <span className="v">Lo calcula Fisquo</span>}</div>
              ))}
            </div>
            {sinDatos && <Ir href="/modelos" tipo="adelante" className="celda ir ver-todos">Ver todos los modelos</Ir>}
            <p className="grupo-pie">Según lo que contestaste al empezar ({fiscal.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}). Fisquo calcula los que lo dicen; el resto, tu gestor. Puedes cambiarlo en Ajustes.</p>
          </section>

          <section className="grupo">
            <h2 className="grupo-t">{sinDatos ? 'Recordatorios' : 'Descargas y recordatorios'}</h2>
            <div className="grupo-c">
              {!sinDatos && <a href={exportar('facturas')} className="celda ir"><Ico n="factura" /><span className="txt">Facturas de {anio} (CSV, se abre con Excel)</span></a>}
              {!sinDatos && <a href={exportar('gastos')} className="celda ir"><Ico n="gasto" /><span className="txt">Gastos de {anio} (CSV, se abre con Excel)</span></a>}
              {!sinDatos && esteAnio && puede(u, DETALLE) && (() => { const g = plazo.dias <= 25 ? plazo : { anio, t: tHoy }; return <a href={`/api/paquete?anio=${g.anio}&t=${g.t}`} className="celda ir"><Ico n="hacienda" /><span className="txt">Paquete del {g.t}T {g.anio} para la gestoría<small>Excel y PDF con facturas, gastos e impuestos</small></span></a>; })()}
              <a href="/api/avisos" className="celda ir"><Ico n="plazo" /><span className="txt">Añadir los plazos de Hacienda a tu calendario<small>Aviso 7 días y 1 día antes</small></span></a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

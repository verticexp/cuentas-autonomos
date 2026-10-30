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
import { eur, fechaCorta, fechaTexto, hoy, pctCorto } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { Presentado } from '@/components/Acciones';
import Grafica from '@/components/Grafica';
import Cifra from '@/components/Cifra';
import Ico from '@/components/Ico';
import Logo from '@/components/Logo';
import AvisoPrueba from '@/components/AvisoPrueba';
import AvisoMensajes from '@/components/AvisoMensajes';
import { despachoDe, rolEn, usaEmpresaPropia } from '@/lib/despachos';
import { redirect } from 'next/navigation';
import { DETALLE, puede } from '@/lib/permisos';
import '@/app/asistente.css';
import '@/app/empresas.css';
import '@/app/mk.css';
import '@/app/hoy.css';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import { accionesHoy } from '@/lib/hoy';
import { diasSinCerrar } from '@/lib/caja';
import { festivoNacional } from '@/lib/festivos';
import { resumen as resumenBandeja } from '@/lib/bandeja';
import { proximoPlazoDe } from '@/lib/avisos';
import YaPresentado from '@/components/YaPresentado';
import VienesDeOtroPrograma from '@/components/VienesDeOtroPrograma';
import { textos } from '@/lib/idiomaServidor';

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
  const tr = await textos();
  return {
    title: { absolute: (await usuarioActual()) ? tr('Resumen · Fisquo') : tr('Fisquo · Facturas, gastos e impuestos en orden') },
    description: tr('Fisquo, software español de facturación para autónomos y pymes: facturas con Verifactu, gastos con IA, conciliación bancaria, impuestos y nóminas.'),
  };
}

export default async function Resumen({ searchParams }) {
  const tr = await textos();
  // «4T» en castellano y catalán; «Q4» en inglés.
  const tt = (n) => tr('{t}T', { t: n });
  // Sin sesión: la web pública. Con sesión: el panel.
  const sesion = await usuarioActual();
  // En la app de iOS nunca la portada con precios (lib/app.js): con una cookie de sesión que ya no vale (contraseña cambiada
  // en otro dispositivo, sesiones cerradas), proxy.js deja pasar «/» y aquí no hay usuario.
  if (!sesion && esApp((await headers()).get('user-agent'))) redirect('/login');
  if (!sesion) return <Landing />;
  // Un despacho que no lleva sus propias cuentas en Fisquo (lib/despachos.js usaEmpresaPropia) no tiene empresa que ver:
  // su inicio es Mi despacho.
  if (sesion.despacho && !sesion.viaDespacho) {
    const d = await despachoDe(sesion.despacho).catch(() => null);
    // Solo si está en la empresa del despacho: si el titular tiene además su propio negocio en Fisquo, ese se ve.
    if (rolEn(d, sesion.id) && !usaEmpresaPropia(d) && String(sesion.empresa) === String(d.empresa)) redirect('/despacho');
  }
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
  const { P, teso, casillas, cierres = [] } = await panelDe(u, { anio: anioPedido, hoy: h, recurrentes: recurrentes || [], nominas: nominas || [], saldo });
  const actividades = actividadesDe(u);
  const fiscal = fiscalDe(u);
  const ACTIVIDADES = nombresActividad(actividades);
  const { anio, anioActual, esteAnio, r, c303, c130, igic, foral, facturado, gastado, beneficio, plazo, debe, tHoy, qAhora, apartado, aPagar,
    sinCobrar, porCobrar, vencidas, sinPagar = { length: 0 }, porPagar = 0, pagosVencidos = { length: 0, nombres: [] }, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite, cuotasSS, rendSS, prevRendSS } = P;
  const impuesto = igic ? 'IGIC' : 'IVA';
  const modeloIndirecto = igic ? 'IGIC (420)' : 'Modelo 303';
  const nombreIndirecto = (q) => q.modeloIva || modeloIndirecto;
  const nombreIrpf = (q) => q.modeloIrpf || 'Modelo 130';
  const importeIrpf = (q) => q.m130 === null ? tr('Sin datos') : eur(q.m130);
  const plazosPago = (q) => [c303 && tr('{modelo}: hasta el {fecha}', { modelo: tr(nombreIndirecto(q)), fecha: tr(fechaTexto(q.plazoIva)) }), c130 && tr('{modelo}: hasta el {fecha}', { modelo: tr(nombreIrpf(q)), fecha: tr(fechaTexto(q.plazoIrpf)) })].filter(Boolean).join('; ');
  const pagos = (y) => u.pagos130?.[y] || {};
  const exportar = (tipo, t) => `/api/exportar?tipo=${tipo}&anio=${anio}${t ? `&t=${t}` : ''}`;
  // Curva del beneficio acumulado mes a mes, hasta el último mes con movimiento.
  const acum = meses.slice(0, (esteAnio ? ultimoMes : 11) + 1).reduce((a, m) => [...a, (a.at(-1) ?? 0) + m.ing - m.gas], []);
  const [bajo, alto] = [Math.min(0, ...acum), Math.max(1, ...acum)];
  const puntos = acum.map((v, i) => [acum.length > 1 ? (i / (acum.length - 1)) * 120 : 120, 40 - ((v - bajo) / (alto - bajo)) * 36]);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  // Cuenta recién creada: ni facturas ni gastos. En vez de gráficas y trimestres a cero, los primeros pasos.
  const sinDatos = !nFacturas && !nGastos;
  // «Tus modelos»: los seis con el plazo más cercano; el resto, en Impuestos (con los 14 de una sociedad la columna medía 1.700 px).
  const nModelos = modelosDe(fiscal).length;
  const MODELOS_RESUMEN = 6;
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
  // Caja (lib/caja.js): los días en que se suele abrir y no tienen cierre. Los «no abrí» solo se leen si hay cierres.
  const sinCerrar = cierres.length && puede(u, 'facturar') && esteAnio ? diasSinCerrar(cierres, h, { cerrados: Object.keys((await redis.hgetall(clave(u, 'cajaCerrados'))) || {}), festivo: festivoNacional }) : [];
  const hayTarjetas = !sinDatos && (sinCerrar.length > 0 || verHacienda || porCobrar > 0 || verPorPagar || porRevisar.pendientes > 0 || verTeso);
  // Lo demás que viene para Hacienda en los próximos meses (retenciones, Sociedades, dividendos…), de la previsión de
  // Tesorería: la tarjeta enseña el IVA y el IRPF y, sin esto, parecía que era todo lo que había que apartar.
  const otrosHacienda = (teso?.movimientos || []).filter((m) => m.tipo === 'hacienda' && !m.vencido && !/^(IVA|IGIC|IRPF)\b/.test(m.concepto));
  const lineaOtros = otrosHacienda.length > 0 && `${tr('Además')}: ${otrosHacienda.slice(0, 2).map((m) => tr('{concepto}, {importe} hasta el {fecha}', { concepto: tr(m.concepto), importe: eur(-m.importe), fecha: tr(fechaTexto(m.fecha)) })).join(' · ')}${otrosHacienda.length > 2 ? ` ${tr('y {n} más', { n: otrosHacienda.length - 2 })}` : ''}`;
  // Último día para pagar un trimestre, ya pasado al día hábil (el 4T, con el año siguiente).
  const hastaT = (t, y) => `${fechaTexto(limiteTrimestre(t, y))}${t === 4 ? ` de ${y + 1}` : ''}`;
  // Plazos que pasaron sin marcar el modelo como presentado (lib/tesoreria.js VENCIDOS_DIAS).
  const preguntas = (teso?.movimientos || []).filter((m) => m.pregunta);
  const menos = (t) => t.replace(/^-/, '\u2212');
  const listaNombres = (v) => {
    const extra = Math.max(0, (v.clientes ?? v.nombres.length) - v.nombres.length);
    if (extra) return extra === 1 ? tr('{lista} y 1 más', { lista: v.nombres.join(', ') }) : tr('{lista} y {n} más', { lista: v.nombres.join(', '), n: extra });
    return v.nombres.length > 1 ? tr('{lista} y {ultimo}', { lista: v.nombres.slice(0, -1).join(', '), ultimo: v.nombres.at(-1) }) : v.nombres[0] || '';
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
      <header className={`inicio${facturado > 0 ? '' : ' sin-saldo'}`}>
        <div className="inicio-barra">
          <Logo />
          <div className="inicio-derecha">
            {!sinDatos && <nav className="anios" aria-label={tr('Año')}>
              <Ir href={`/?anio=${anio - 1}`} tipo="cifras" aria-label={tr('Año anterior')}>‹</Ir>
              <strong>{anio}</strong>
              {anio < anioActual ? <Ir href={`/?anio=${anio + 1}`} tipo="cifras" aria-label={tr('Año siguiente')}>›</Ir> : <span className="off">›</span>}
            </nav>}
            <AvisoMensajes u={u} />
          </div>
        </div>
        {/* La gestoría dentro de las cuentas de un cliente: no se saluda a sí misma ni le habla de «tu año» (son las del cliente) */}
        {u.viaDespacho
          ? <><h1 className="inicio-hola">{u.empresaNombre}</h1><p className="inicio-sub">{sinDatos ? tr('Todavía no ha apuntado nada.') : esteAnio ? tr('Así va su año.') : tr('Así cerró {anio}.', { anio })}</p></>
          : <><h1 className="inicio-hola">{tr('Hola, {nombre}', { nombre: String(u.nombre || '').split(' ')[0] || tr('equipo') })}</h1>
            <p className="inicio-sub">{sinDatos ? (siguientePaso?.id === 'factura' ? tr('Empieza por tu primera factura: tarda un minuto.') : tr('Vamos a dejarlo todo listo.')) : esteAnio ? tr('Así va tu año.') : tr('Así cerraste {anio}.', { anio })}</p></>}
        {!u.despacho && u.misEmpresas?.length > 1 && <CambiarEmpresa empresas={u.misEmpresas} actual={u.empresa} variante="chip" />}
      </header>

      {facturado > 0 && (
        <section className="saldo">
          <h2 className="saldo-t">{esteAnio ? tr('Beneficio este año') : tr('Beneficio de {anio}', { anio })}</h2>
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
          {cambio !== null && <p className={`saldo-cambio ${cambio >= 0 ? 'sube' : 'baja'}`}>{cambio >= 0 ? '↑' : '↓'} {tr(cambio >= 0 ? (esteAnio ? '{n} % más facturado que hace un año' : '{n} % más facturado que en {anio}') : (esteAnio ? '{n} % menos facturado que hace un año' : '{n} % menos facturado que en {anio}'), { n: Math.abs(cambio).toFixed(0), anio: anio - 1 })}</p>}
          <p className="saldo-s">{tr('Facturado {facturado} · Gastos {gastos}', { facturado: eur(facturado), gastos: eur(gastado) })}</p>
        </section>
      )}

      {preguntas.length > 0 && (
        <section className="grupo" aria-labelledby="presentado-t">
          <h2 className="grupo-t" id="presentado-t">{tr('¿Ya lo has presentado?')}</h2>
          <ul className="grupo-lista">
            {preguntas.map((m) => (
              <li key={`${m.pregunta.modelo}-${m.pregunta.anio}-${m.pregunta.t}`}>
                <div className="fila"><span className="txt"><strong>{tr(m.concepto)} {m.pregunta.anio}</strong><small>{tr(m.detalle)}</small></span><span className="imp">{eur(-m.importe)}</span></div>
                <YaPresentado pregunta={m.pregunta} importe={-m.importe} puede={puede(u, 'contabilidad')} />
              </li>
            ))}
          </ul>
          <p className="grupo-pie">{tr('Mientras no lo marques, Tesorería lo cuenta como un pago de hoy.')}</p>
        </section>
      )}

      <Ir href="/asistente" className="asi-entrada"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /></svg>{u.viaDespacho ? tr('Pregunta por sus cuentas') : sinDatos ? tr('Pregúntame cómo hacer tu primera factura') : tr('Pregunta por tus cuentas')}</Ir>

      <nav className="accesos" aria-label={tr('Accesos')}>
        {accesos.map((a) => (
          <Ir key={a.href} href={a.href} tipo={['/presupuestos', '/modelos'].includes(a.href) || a.href.startsWith('/contabilidad') ? 'adelante' : 'tab-der'} className={`acceso${a.enBarra ? ' acceso-tab' : ''}`}><Ico n={a.n} /><span>{tr(a.t)}</span></Ir>
        ))}
      </nav>

      {verPasos && (
        <section className="grupo pasos" aria-labelledby="pasos-t">
          <div className="pasos-cab">
            <h2 className="grupo-t" id="pasos-t">{tr('Primeros pasos')}</h2>
            <span className="pasos-n">{tr('{hechos} de {total}', { hechos, total: pasos.length })}</span>
          </div>
          <div className="pasos-barra" aria-hidden><span style={{ width: `${(hechos / pasos.length) * 100}%` }} /></div>
          <div className="grupo-c">
            {pasos.map((x) => (
              x.hecho
                ? <div key={x.id} className="celda pp-paso hecho"><span className="pp-ok" aria-hidden>✓</span><span className="txt">{tr(x.t)}<small>{tr('Hecho')}</small></span></div>
                : <Ir key={x.id} href={x.href} tipo="adelante" className={`celda ir pp-paso${x === siguientePaso ? ' pp-primero' : ''}`}><Ico n={x.n} /><span className="txt">{tr(x.t)}<small>{tr(x.d)}</small></span>{x === siguientePaso && <span className="pp-accion" aria-hidden>{tr(x.boton)}</span>}</Ir>
            ))}
          </div>
        </section>
      )}

      {/* Cuenta nueva: quien viene de otro programa puede traer sus clientes, facturas y gastos desde aquí. */}
      {sinDatos && puede(u, 'empresa') && <VienesDeOtroPrograma />}

      {hayTarjetas && (
        <div className="hcards">
          {verHacienda && (
            <Ir href={`/modelos?anio=${debe ? plazo.anio : anioActual}`} className={`hcard ir${urgente ? ' urgente' : ''}`} style={{ '--c': urgente ? 'var(--out)' : 'var(--hacienda)' }}>
              <h2 className="hcard-t"><Ico n="hacienda" solo />{tr('Impuestos')}<span>{debe ? `${tt(plazo.t)} ${plazo.anio}` : `${tt(tHoy)} ${anioActual}`}</span></h2>
              {debe ? (
                <>
                  <p className="hcard-v"><Cifra v={aPagar} /><small>{tr('€ a pagar')}</small></p>
                  <p className={`hcard-s${urgente ? ' rojo' : ''}`}>{plazo.dias === 0 ? <strong>{debe.irpfForal?.deOficio && !debe.pend303 ? tr('Hoy es el día del pago de oficio') : tr('Hoy es el último día para presentarlo')}</strong> : plazo.dias === 1 ? <strong>{tr('Mañana acaba el plazo')}</strong> : tr('Hasta el {fecha} · quedan {n} días', { fecha: tr(fechaTexto(plazo.fecha)), n: plazo.dias })}</p>
                  <p className="hcard-s">{[debe.pend303 ? `${tr(nombreIndirecto(debe))}: ${debe.m303 < 0 ? tr('{importe} a compensar', { importe: eur(-debe.m303) }) : eur(debe.ivaIngresar)}` : !foral && c303 && tr('{modelo} presentado', { modelo: tr(modeloIndirecto) }), debe.pend130 ? `${tr(nombreIrpf(debe))}: ${importeIrpf(debe)}${igic && plazo.t === 4 ? ` · ${tr('hasta el {fecha}', { fecha: tr(hastaT(4, plazo.anio)) })}` : ''}` : !foral && c130 && tr('{modelo} presentado', { modelo: tr('Modelo 130') })].filter(Boolean).join(' · ')}</p>
                  {foral && <p className="hcard-s">{plazosPago(debe)}</p>}
                  <p className="hcard-s">{tr('Del {t}T llevas {importe} para apartar, con lo apuntado hasta hoy.', { t: tHoy, importe: eur(apartado) })}</p>
                  {lineaOtros && <p className="hcard-s">{lineaOtros}</p>}
                </>
              ) : (
                <>
                  <p className="hcard-v"><Cifra v={apartado} /><small>{tr('€ para apartar')}</small></p>
                  <p className="hcard-s">{tr('Apuntado hasta hoy')}: {[c303 && `${tr(impuesto)}${igic ? ' (420)' : ''} ${eur(qAhora.ivaIngresar)}`, c130 && `IRPF ${importeIrpf(qAhora)}`].filter(Boolean).join(' + ')} · {foral ? plazosPago(qAhora) : igic && tHoy === 4 ? [c303 && tr('420: hasta el {fecha}', { fecha: tr(`${fechaTexto(plazo420(anioActual, 4))} de ${anioActual + 1}`) }), c130 && tr('130: hasta el {fecha}', { fecha: tr(hastaT(4, anioActual)) })].filter(Boolean).join('; ') : <>{tr('se paga hasta el {fecha}', { fecha: tr(hastaT(tHoy, anioActual)) })}</>}</p>
                  {lineaOtros && <p className="hcard-s">{lineaOtros}</p>}
                </>
              )}
            </Ir>
          )}

          {sinCerrar.length > 0 && (
            <Ir href={sinCerrar.length === 1 ? `/facturas/caja?fecha=${sinCerrar[0]}#nuevo-cierre` : '/facturas/caja#sin-cerrar'} className="hcard ir" style={{ '--c': 'var(--aviso)' }}>
              <h2 className="hcard-t"><Ico n="factura" solo />{tr('Caja')}<span>{sinCerrar.length === 1 ? tr('1 día') : tr('{n} días', { n: sinCerrar.length })}</span></h2>
              <p className="hcard-v">{sinCerrar.length}<small>{sinCerrar.length === 1 ? tr('día sin cierre') : tr('días sin cierre')}</small></p>
              <p className="hcard-s">{sinCerrar.length === 1 ? tr('El {fecha}: apunta su cierre o márcalo como cerrado', { fecha: tr(fechaTexto(sinCerrar[0])) }) : tr('Desde el {fecha}: apunta los cierres o marca los días que no abriste', { fecha: tr(fechaTexto(sinCerrar[0])) })}</p>
            </Ir>
          )}

          {porCobrar > 0 && (
            <Ir href="/facturas?estado=pendientes" className="hcard ir" style={{ '--c': 'var(--aviso)' }}>
              <h2 className="hcard-t"><Ico n="cobrar" solo />{tr('Por cobrar')}<span>{sinCobrar.length === 1 ? tr('1 factura') : tr('{n} facturas', { n: sinCobrar.length })}</span></h2>
              <p className="hcard-v"><Cifra v={porCobrar} /><small>€</small></p>
              {vencidas.length > 0 && <p className="hcard-s rojo">{vencidas.length === 1 ? tr('1 vencida') : tr('{n} vencidas', { n: vencidas.length })}: {listaNombres(vencidas)}</p>}
            </Ir>
          )}

          {verPorPagar && (
            <Ir href={pagosVencidos.length ? '/gastos?estado=vencidos' : '/gastos?estado=sinpagar'} className="hcard ir" style={{ '--c': 'var(--out)' }}>
              <h2 className="hcard-t"><Ico n="gasto" solo />{tr('Por pagar')}<span>{sinPagar.length === 1 ? tr('1 factura') : tr('{n} facturas', { n: sinPagar.length })}</span></h2>
              <p className="hcard-v"><Cifra v={porPagar} /><small>€</small></p>
              {pagosVencidos.length > 0 && <p className="hcard-s rojo">{pagosVencidos.length === 1 ? tr('1 vencida') : tr('{n} vencidas', { n: pagosVencidos.length })}: {listaNombres({ nombres: pagosVencidos.nombres || [], clientes: pagosVencidos.proveedores })}</p>}
            </Ir>
          )}

          {porRevisar.pendientes > 0 && (
            <Ir href="/gastos?ver=revisar" className="hcard ir" style={{ '--c': 'var(--info)' }}>
              <h2 className="hcard-t"><Ico n="gasto" solo />{tr('Por revisar')}</h2>
              <p className="hcard-v">{porRevisar.pendientes}<small>{porRevisar.pendientes === 1 ? tr('factura') : tr('facturas')}</small></p>
              <p className="hcard-s">{[porRevisar.cuadran && (porRevisar.cuadran === 1 ? tr('1 cuadra: apruébala con un toque') : tr('{n} cuadran: apruébalas de golpe', { n: porRevisar.cuadran })), porRevisar.leyendo && tr('{n} leyéndose', { n: porRevisar.leyendo }), porRevisar.cuarentena && (porRevisar.cuarentena === 1 ? tr('1 de un remitente que no conoces') : tr('{n} de remitentes que no conoces', { n: porRevisar.cuarentena }))].filter(Boolean).join(' · ') || tr('Ábrelas para revisarlas y guardarlas como gasto')}</p>
            </Ir>
          )}

          {verTeso && (
            <Ir href="/tesoreria" className="hcard ir" style={{ '--c': 'var(--info)' }}>
              <h2 className="hcard-t"><Ico n="beneficio" solo />{tr('Tesorería')}<span>{tr('3 meses')}</span></h2>
              <p className="hcard-v"><Cifra v={teso.final} /><small>€</small></p>
              <p className={`hcard-s${teso.minimo.saldo < 0 ? ' rojo' : ''}`}>{teso.minimo.saldo < 0 ? `${tr('El {fecha} te quedarías en {importe}', { fecha: tr(fechaTexto(teso.minimo.fecha)), importe: eur(teso.minimo.saldo) })}${causaMinimo ? `: ${tr('incluye {concepto}', { concepto: tr(causaMinimo.concepto) })}` : ''}` : `${teso.conSaldo ? tr('Saldo previsto') : tr('Sin saldo del banco')} · ${tr('cobras {entra} y pagas {sale}', { entra: eur(teso.entra), sale: eur(r2(teso.sale + teso.hacienda)) })}`}</p>
            </Ir>
          )}
        </div>
      )}

      {/* En el ordenador, dos columnas: la evolución a la izquierda y lo de consultar a la derecha. En el móvil, una. */}
      <div className={`res-rejilla${sinDatos ? ' sin-datos' : ''}`}>
        <div className="res-col">
          {!sinDatos && <>
          <section className="grupo">
            <h2 className="grupo-t">{tr('Mes a mes')}</h2>
            <div className="grupo-c relleno">
              <Grafica meses={meses} anio={anio} actual={ultimoMes} />
            </div>
          </section>

          <section className="grupo">
            <h2 className="grupo-t">{tr('Por actividad')}</h2>
            <div className="grupo-c envolver">
              {r.porActividad.map((a) => (
                <div key={a.actividad} className="celda">
                  <Ico n="actividad" />
                  <span className="txt">{ACTIVIDADES[a.actividad] || tr('Otra actividad')}<small>{tr('Facturado {ing}, gastos {gas}', { ing: eur(a.ingresos), gas: eur(a.gastos) })}</small></span>
                  <span className={`v${a.rendimiento < 0 ? ' rojo' : ''}`}>{menos(eur(a.rendimiento))}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grupo res-trim">
            <h2 className="grupo-t">{tr('Impuestos por trimestre')}</h2>
            <p className="grupo-pie arriba">{tr('Orientativo; confírmalo con tu gestor.')}{foral ? ` ${tr('Marca cada modelo por separado. El pago fraccionado del IRPF sigue las reglas de tu Hacienda foral.')}` : c130 ? ` ${tr('Marca el {modelo} y el 130 de cada trimestre por separado. Un 130 presentado se descuenta en los siguientes aunque no lo hayas pagado (esa deuda va aparte).', { modelo: igic ? '420' : '303' })}` : ` ${tr('Marca cada trimestre cuando lo presentes.')}`}</p>
            <div className="trims">
              {r.trimestres.map((q) => {
                // El trimestre en curso (y los que faltan) aún no se pueden presentar: «En curso», sin selector.
                const abierto = anio === anioActual && q.t >= tHoy;
                return (
                // El trimestre en curso ya sale arriba en la tarjeta de Impuestos: en el móvil no se repite aquí (app/movil.css).
                <div key={q.t} className={`trim trimestre${anio === anioActual && q.t > tHoy ? ' futuro' : ''}${verHacienda && anio === anioActual && q.t === tHoy ? ' en-tarjeta' : ''}`}>
                  <div className="trim-cab"><h3>{tt(q.t)} {anio}</h3>{abierto && <span className="estado-txt e-curso">{q.t === tHoy ? tr('En curso · apuntado hasta hoy') : tr('Aún no ha empezado')}</span>}</div>
                  <div className="trim-cifras">
                    {c303 && <p><span>{foral ? tr(nombreIndirecto(q)) : igic ? tr(modeloIndirecto) : q.t === r.trimestres[0]?.t ? <Termino id="m303">{tr('Modelo 303')}</Termino> : tr('Modelo 303')}</span><strong>{q.ivaDevolucion > 0 ? tr('{importe} a devolver', { importe: eur(q.ivaDevolucion) }) : q.m303 < 0 ? tr('{importe} a compensar', { importe: eur(-q.m303) }) : eur(q.ivaIngresar)}</strong></p>}
                    {c303 && !abierto && <Presentado soloLectura={!puede(u, 'contabilidad')} modelo={igic ? '420' : '303'} anio={anio} t={q.t} importe={0} pagado={q.t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : hecho303(u.pres303, u.pagos130, anio, q.t)} con130={false} />}
                    {c130 && <p><span>{foral ? tr(nombreIrpf(q)) : q.t === r.trimestres[0]?.t ? <Termino id="m130">{tr('Modelo 130')}</Termino> : tr('Modelo 130')}</span><strong>{importeIrpf(q)}</strong></p>}
                    {c130 && q.m130 !== null && !abierto && <Presentado soloLectura={!puede(u, 'contabilidad')} anio={anio} t={q.t} importe={q.m130} pagado={pagos(anio)[q.t]} />}
                    {!c303 && !c130 && <p><span>{tr('Base facturada')}</span><strong>{eur(q.ingresos)}</strong></p>}
                  </div>
                  <details className="trim-mas">
                  <summary>{tr('Ver detalle')}</summary>
                  <dl>
                    <dt>{tr('Base facturada')}</dt><dd>{eur(q.ingresos)}</dd>
                    <dt>{tr('Gastos')}</dt><dd>{eur(q.gastos)}</dd>
                    {c303 && <>
                    <dt>{tr('{impuesto} repercutido', { impuesto: tr(impuesto) })}</dt><dd>{eur(q.ivaRep)}</dd>
                    <dt>{tr('{impuesto} deducible', { impuesto: tr(impuesto) })}</dt><dd>−{eur(q.ivaDed)}</dd>
                    {q.ivaCompensado > 0 && <><dt>{tr('Cuotas anteriores compensadas')}</dt><dd>−{eur(q.ivaCompensado)}</dd></>}
                    <dt><strong>{tr(nombreIndirecto(q))}</strong></dt><dd><strong>{q.ivaDevolucion > 0 ? tr('{importe} a devolver', { importe: eur(q.ivaDevolucion) }) : q.m303 < 0 ? tr('{importe} a compensar', { importe: eur(-q.m303) }) : eur(q.ivaIngresar)}</strong></dd>
                    </>}
                    {c130 && foral && <>
                    <dt>{tr(q.irpfForal.texto)}</dt><dd>{importeIrpf(q)}</dd>
                    <dt>{tr(nombreIrpf(q))}</dt><dd>{tr('Hasta el {fecha}', { fecha: tr(fechaTexto(q.plazoIrpf)) })}</dd>
                    </>}
                    {c130 && !foral && <>
                    <dt>{tr('5 % gastos difícil justificación')}</dt><dd>−{eur(q.difJust)}</dd>
                    <dt>{tr('20 % rendimiento acumulado')}</dt><dd>{eur(r2(0.2 * Math.max(0, q.rendAcum)))}</dd>
                    <dt>{tr('Retenciones acumuladas')}</dt><dd>−{eur(q.retAcum)}</dd>
                    <dt>{tr('130 pagados antes')}</dt><dd>−{eur(q.pagosPrev)}</dd>
                    {pagos(anio)[q.t] > 0 && <><dt>{tr('Pagado este trimestre')}</dt><dd>{eur(pagos(anio)[q.t])}</dd></>}
                    <dt><strong>{tr('Modelo 130')}</strong></dt><dd><strong>{eur(q.m130)}</strong></dd>
                    </>}
                  </dl>
                  {!foral && (c303 || c130) && (() => {
                    const c = casillas[q.t];
                    const fila = (n, t, v) => <Fragment key={`${n}${t}`}><dt>{n} · {tr(t)}</dt><dd>{eur(v)}</dd></Fragment>;
                    return (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9375rem' }}>{tr('Casillas para Hacienda')}</summary>
                        {c303 && igic && <>
                          <p className="nota"><strong>IGIC (420)</strong></p>
                          <dl>{Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')).filter((k) => c[k] !== 0).map((k) => fila(k, 'IGIC', c[k]))}</dl>
                        </>}
                        {c303 && !igic && <>
                        <p className="nota" style={{ margin: '10px 0 6px' }}><strong>{tr('Modelo 303')}</strong></p>
                        <dl>
                          {c['04'] > 0 && <>{fila('04', 'Base al 10 %', c['04'])}{fila('06', 'Cuota al 10 %', c['06'])}</>}
                          {fila('07', 'Base al 21 %', c['07'])}
                          {fila('09', 'Cuota al 21 %', c['09'])}
                          {c.otros.flatMap((o) => [fila('—', `Base al ${pctCorto(o.pct)} (revisar casilla)`, o.base), fila('—', `Cuota al ${pctCorto(o.pct)} (revisar casilla)`, o.iva)])}
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
                        {c['59'] !== 0 && <p className="nota">{tr('Con operaciones con empresas de la UE presentas también el 349 en el mismo plazo: lo tienes en')} <a href={`/modelos?anio=${anio}#m349`}>{tr('Impuestos')}</a>.</p>}
                        {r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122']) !== 0 && <p className="nota">{tr('Facturas sin IVA por {importe} sin motivo claro: si el cliente es de otro país de la UE, pon en su NIF el NIF-IVA con el prefijo del país (por ejemplo, DE…) o elige el tipo de operación en la factura. Si es una operación exenta, va en la casilla de exentas.', { importe: eur(r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122'])) })}</p>}
                        </>}
                        {c130 && <>
                        <p className="nota" style={{ margin: '12px 0 6px' }}><strong>{tr('Modelo 130')}</strong> {tr('(acumulado desde enero)')}</p>
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
                  <p className="descargas">Excel: <a href={exportar('facturas', q.t)}>{tr('facturas')}</a> · <a href={exportar('gastos', q.t)}>{tr('gastos')}</a>{puede(u, DETALLE) && <> · <a href={`/api/paquete?anio=${anio}&t=${q.t}`}>{tr('paquete para la gestoría')}</a></>}</p>
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
              <h2 className="grupo-t">{tr('Tarifa plana')}</h2>
              <div className="grupo-c">
                <div className="celda columna">
                  <div className="linea"><span>{tr('Rendimiento para la Seguridad Social {anio}', { anio })}</span><span className="v">{eur(rendSS)} <small>{tr('de {importe}', { importe: eur(limite) })}</small></span></div>
                  <div className="barra-limite"><span className={rendSS > limite ? 'pasado' : rendSS > limite * 0.8 ? 'cerca' : ''} style={{ width: `${Math.min(100, Math.max(0, (rendSS / limite) * 100))}%` }} /></div>
                </div>
              </div>
              <p className="grupo-pie">{rendSS > limite ? tr('Te pasas en {importe}.', { importe: eur(rendSS - limite) }) : tr('Te quedan {importe} de margen.', { importe: eur(limite - rendSS) })}{esteAnio && prevRendSS > limite ? ` ${tr('A este ritmo acabarías el año en {a}: {b} por encima, y perderías la tarifa plana.', { a: eur(prevRendSS), b: eur(prevRendSS - limite) })}` : ''} {tr('Es lo que mira la Seguridad Social: facturas menos gastos ({beneficio}), más tus cuotas de autónomos ({cuotas}), menos un 7 % de gastos genéricos. Si tienes gastos que no están en Fisquo, el número real será menor.', { beneficio: eur(beneficio), cuotas: eur(cuotasSS) })}</p>
            </section>
          )}

          {esteAnio && nFacturas > 0 && (
            <section className="grupo">
              <h2 className="grupo-t">{tr('Si sigues a este ritmo')}</h2>
              <div className="grupo-c">
                <div className="celda"><Ico n="factura" /><span className="txt">{tr('Facturarás en {anio}', { anio })}</span><span className="v">{eur(prevFact)}</span></div>
                <div className="celda"><Ico n="beneficio" /><span className="txt">{tr('Ganarás tras gastos')}</span><span className="v">{eur(prevBeneficio)}</span></div>
              </div>
              <p className="grupo-pie">{tr('Lo facturado hasta hoy ({importe}) llevado a 12 meses.', { importe: eur(facturado) })}{limite > 0 ? (prevRendSS > limite ? ` ${tr('Para la Seguridad Social te pasarías del límite de la tarifa plana en {importe}.', { importe: eur(prevRendSS - limite) })}` : ` ${tr('Para la Seguridad Social quedarías {importe} por debajo del límite de la tarifa plana.', { importe: eur(limite - prevRendSS) })}`) : ''}</p>
            </section>
          )}

          {top.length > 0 && (
            <section className="grupo">
              <h2 className="grupo-t">{tr('Mejores clientes')}</h2>
              <div className="grupo-c">
                {top.map(([n, v]) => (
                  <div key={n} className="celda"><span className="txt">{n}</span><span className="v">{eur(v)}</span></div>
                ))}
              </div>
              {facturado > 0 && <p className="grupo-pie">{tr('El primero supone el {pct} % de lo facturado en {anio}.', { pct: ((top[0][1] / facturado) * 100).toFixed(0), anio })}</p>}
            </section>
          )}

          <section className="grupo">
            <h2 className="grupo-t">{sinDatos ? tr('Tus próximos plazos') : tr('Tus modelos')}</h2>
            <div className="grupo-c envolver">
              {/* Sin datos, solo los trimestrales de cada día (D8-19): el 347, el 390 o la renta son ruido el primer día. */}
              {modelosDe(fiscal).filter((m) => !sinDatos || ['303', '420', '130', '131'].includes(m.id)).map((m) => ({ ...m, prox: proximoPlazoDe(fiscal, m.id, h, { cuotaIS: u.cuotaIS }) })).sort((a, b) => (sinDatos ? 0 : (a.prox || '9').localeCompare(b.prox || '9'))).slice(0, sinDatos ? undefined : MODELOS_RESUMEN).map((m) => ({ ...m, cuando: m.prox ? `${m.prox === h ? tr('Hoy es el último día') : tr('Próximo: {fecha}', { fecha: tr(`${fechaTexto(m.prox)}${m.prox.slice(0, 4) !== h.slice(0, 4) ? ` de ${m.prox.slice(0, 4)}` : ''}`) })}` : tr(m.cuando) })).map((m) => (
                m.calcula
                  ? <div key={m.id} className="celda ir"><span className="modelo-num"><NumeroModelo modelo={m} /></span><Ir href={`/modelos?anio=${anio}#m${m.id}`} tipo="adelante" className="txt enlace-modelo" aria-label={`${tr('Modelo {id}', { id: m.id })}: ${tr(m.nombre)}${m.cuando ? `. ${m.cuando}` : ''}`}>{tr(m.nombre)} <small>{m.cuando}</small></Ir><span className="v">{m.id === '100' ? tr('Borrador') : tr('Lo calcula Fisquo')}</span></div>
                  : <div key={m.id} className="celda"><span className="modelo-num"><NumeroModelo modelo={m} /></span><span className="txt">{tr(m.nombre)}<small>{m.cuando}</small></span>{m.calcula && <span className="v">{tr('Lo calcula Fisquo')}</span>}</div>
              ))}
            </div>
            {(sinDatos || nModelos > MODELOS_RESUMEN) && <Ir href={sinDatos ? '/modelos' : `/modelos?anio=${anio}`} tipo="adelante" className="celda ir ver-todos">{sinDatos ? tr('Ver todos los modelos') : tr('Ver los {n} modelos', { n: nModelos })}</Ir>}
            <p className="grupo-pie">{tr('Según lo que contestaste al empezar ({tipo}). Fisquo calcula los que lo dicen; el resto, tu gestor. Puedes cambiarlo en Ajustes.', { tipo: tr(fiscal.tipo === 'sociedad' ? 'sociedad' : 'autónomo') })}</p>
          </section>

          <section className="grupo">
            <h2 className="grupo-t">{sinDatos ? tr('Recordatorios') : tr('Descargas y recordatorios')}</h2>
            <div className="grupo-c">
              {!sinDatos && <a href={exportar('facturas')} className="celda ir"><Ico n="factura" /><span className="txt">{tr('Facturas de {anio} (CSV, se abre con Excel)', { anio })}</span></a>}
              {!sinDatos && <a href={exportar('gastos')} className="celda ir"><Ico n="gasto" /><span className="txt">{tr('Gastos de {anio} (CSV, se abre con Excel)', { anio })}</span></a>}
              {!sinDatos && esteAnio && puede(u, DETALLE) && (() => { const g = plazo.dias <= 25 ? plazo : { anio, t: tHoy }; return <a href={`/api/paquete?anio=${g.anio}&t=${g.t}`} className="celda ir"><Ico n="hacienda" /><span className="txt">{tr('Paquete del {t}T {anio} para la gestoría', { t: g.t, anio: g.anio })}<small>{tr('Excel y PDF con facturas, gastos e impuestos')}</small></span></a>; })()}
              <a href="/api/avisos" className="celda ir"><Ico n="plazo" /><span className="txt">{tr('Añadir los plazos de Hacienda a tu calendario')}<small>{tr('Aviso 7 días y 1 día antes')}</small></span></a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

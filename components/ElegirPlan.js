'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { diasPrueba, esFundador, TIPOS, VERSION_PLAN } from '@/lib/prueba';
import CupoEscaneo from '@/components/CupoEscaneo';
import { eurPrecio } from '@/lib/formato';
import { useT } from '@/components/Idioma';
import styles from './ElegirPlan.module.css';

// Lo que se perdería, ya compuesto en lib/planes.js («El asistente IA (12 preguntas)»): se traduce por partes al pintar.
const VECES = [['{n} movimiento conciliado', '{n} movimientos conciliados'], ['{n} movimiento de stock', '{n} movimientos de stock'], ['{n} cambio en la previsión', '{n} cambios en la previsión'], ['{n} pregunta', '{n} preguntas'], ['{n} mensaje', '{n} mensajes'], ['{n} nómina', '{n} nóminas'], ['{n} usos']];
function perdida(tr, t) {
  const m = /^(.+?) \((.+)\)$/.exec(t);
  if (!m) return tr(t);
  for (const clave of VECES.flat()) {
    const c = new RegExp(`^${clave.replace('{n}', '(\\d+)')}$`).exec(m[2]);
    if (c) return `${tr(m[1])} (${tr(clave, { n: c[1] })})`;
  }
  return `${tr(m[1])} (${tr(m[2])})`;
}


// Ajustes › Tu plan: contratar con Stripe Checkout, cambiar de plan y gestionar el pago en el portal de Stripe
// (app/api/suscripcion). En la app de iOS no se enseña la compra (lib/app.js); solo el administrador puede cambiarlo.
// El tipo de negocio sale de los datos fiscales de la empresa: una sociedad ve solo Pymes; un autónomo ve los suyos y puede
// mirar los de Pymes (antes de pasar a sociedad tiene que tener uno, lib/formaJuridica.js).
export default function ElegirPlan({ plan, tipoEmpresa, uso, admin, app }) {
  const tr = useT();
  const sociedad = tipoEmpresa === 'pym';
  const [tipo, setTipo] = useState(sociedad || plan?.tipo === 'pym' ? 'pym' : 'aut');
  const [periodo, setPeriodo] = useState(plan?.periodo || 'mes');
  const [estado, setEstado] = useState('');
  const [actual, setActual] = useState(plan);
  const router = useRouter();
  const paga = Boolean(actual?.pagado && actual?.suscripcion);
  // Fundador (lib/prueba.js): gratis de por vida; ve los mismos planes que los clientes, sin poder contratarlos.
  const fundador = esFundador(actual);
  // Lo paga su gestoría (lib/licencias.js): no contrata nada mientras dure.
  const despacho = actual?.porDespacho || null;

  async function llamar(datos) {
    setEstado('enviando');
    const r = await fetch('/api/suscripcion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) { setEstado(d?.error || 'No se ha podido conectar. Inténtalo otra vez.'); return null; }
    if (d.url) { window.location.href = d.url; return null; }
    setEstado('');
    return d;
  }

  // Vuelta del Checkout: ?sesion=… activa el plan sin esperar al aviso de Stripe.
  useEffect(() => {
    if (app) return;
    const sesion = new URLSearchParams(window.location.search).get('sesion');
    if (!sesion) return;
    window.history.replaceState(null, '', window.location.pathname);
    llamar({ sesion }).then((d) => { if (d?.plan) { setActual(d.plan); setEstado(`Hecho: ya tienes el plan ${d.plan.nombre}.`); router.refresh(); } });
  }, [app]);

  async function elegir(nombre) {
    if (paga && !(await confirmarAccion({ titulo: tr('Confirmar acción'), texto: tr('¿Pasar al plan {tipo} {nombre} ({periodo})? Stripe ajusta la diferencia en tu próxima factura.', { tipo: tr(TIPOS[tipo]), nombre, periodo: periodo === 'anio' ? tr('anual') : tr('mensual') }), aceptar: tr('Continuar') }))) return;
    const d = await llamar({ tipo, nombre, periodo });
    if (d?.plan) { setActual(d.plan); setEstado(`Hecho: ahora tienes el plan ${d.plan.nombre}.`); router.refresh(); }
  }

  const dias = diasPrueba(actual);
  const ocupado = estado === 'enviando';
  const esActual = (n) => actual?.tipo === tipo && actual?.nombre === n && (actual.periodo || 'mes') === periodo;
  const estadoPlan = tr(fundador ? 'Gratis de por vida' : despacho ? 'Incluido por tu gestoría' : paga ? actual.estado === 'past_due' ? 'Revisar pago' : actual.estado === 'trialing' ? 'Prueba con tarjeta' : 'Activo'
    : dias === 0 ? 'Prueba finalizada' : dias > 0 ? `Prueba · ${dias} días` : actual?.nombre ? 'Pendiente de activación' : 'Condiciones anteriores');

  // En la app de iOS, solo el plan y su estado: sin precios, botones de pago ni enlaces para contratar (norma 3.1.1).
  if (app) return <div className={styles.contenido}>
    <div className={styles.resumen}>
      <section className={styles.actual} aria-labelledby="plan-actual">
        <div className={styles.cabeceraActual}><h2 id="plan-actual">{tr('Tu suscripción')}</h2><span className={styles.estado}>{estadoPlan}</span></div>
        <p className={styles.nombreActual}>{fundador ? tr('Plan Fundador') : actual?.nombre ? `${tr(TIPOS[actual.tipo])} ${actual.nombre}` : tr('Periodo de prueba')}</p>
        <p className={styles.detalleActual}>{fundador ? tr('Todas las funciones, sin límites de usuarios ni cuotas.') : despacho ? tr('Incluido por {nombre}.', { nombre: despacho.nombre }) : paga ? tr('Facturación {periodo} · una empresa por suscripción', { periodo: actual.periodo === 'anio' ? tr('anual') : tr('mensual') })
          : dias === 0 ? tr('Tu periodo de prueba ha terminado. Puedes consultar y exportar todos tus datos.')
          : dias > 0 ? (dias === 1 ? tr('Te queda 1 día de prueba con todas las funciones.') : tr('Te quedan {n} días de prueba con todas las funciones.', { n: dias })) : ''}</p>
        {paga && actual.estado === 'past_due' && <p className={styles.alerta}>{tr('El último cobro ha fallado.')}</p>}
      </section>
      <section className={styles.consumo} aria-labelledby="plan-consumo">
        <h2 id="plan-consumo">{tr('Lectura de facturas y tickets')}</h2>
        <CupoEscaneo />
      </section>
    </div>
  </div>;

  const planRecomendado = tr('El plan {plan} cubre este uso.', { plan: '\u0001' }).split('\u0001');
  return <div className={styles.contenido} aria-busy={ocupado}>
    <p className={styles.intro}>{tr('Gestiona tu suscripción y elige el alcance que necesita tu empresa.')}</p>
    <div className={styles.resumen}>
      <section className={styles.actual} aria-labelledby="plan-actual">
        <div className={styles.cabeceraActual}><h2 id="plan-actual">{tr('Tu suscripción')}</h2><span className={styles.estado}>{estadoPlan}</span></div>
        <p className={styles.nombreActual}>{fundador ? tr('Plan Fundador') : `${tr(TIPOS[actual.tipo])} ${actual.nombre}`}</p>
        <p className={styles.detalleActual}>{fundador ? tr('Todas las funciones, sin límites de usuarios ni cuotas. Abajo tienes los planes que ven los clientes nuevos.') : despacho ? tr('Lo paga {nombre} dentro de lo que te cobra. Si deja de incluirlo, tendrás tiempo para elegir tu plan.', { nombre: despacho.nombre }) : paga ? tr('Facturación {periodo} · una empresa por suscripción', { periodo: actual.periodo === 'anio' ? tr('anual') : tr('mensual') })
          : dias === 0 ? tr('Tu cuenta está en solo lectura: puedes consultar y exportar todos tus datos. Elige un plan y vuelves a crear y editar al momento, sin perder nada.')
          : dias > 0 ? tr('Prueba sin tarjeta: no se cobra nada si no activas un plan. Si al acabar no has elegido, tu cuenta pasa a solo lectura: ves y exportas todo, pero no puedes crear ni editar.')
          : tr('Consulta las opciones disponibles para tu empresa.')}</p>
        {paga && actual.estado === 'past_due' && <p className={styles.alerta}>{tr('El último cobro ha fallado. Revisa tu método de pago.')}</p>}
        {admin && !fundador && !despacho && <div className={styles.gestion}>
          {paga ? <button type="button" className={styles.botonGestion} disabled={ocupado} onClick={() => llamar({ portal: true })}>{tr('Gestionar facturación')} <span aria-hidden="true">↗</span></button>
            : actual?.nombre && <button type="button" className={styles.botonGestion} disabled={ocupado} onClick={() => llamar({ tipo: actual.tipo, nombre: actual.nombre, periodo: actual.periodo || 'mes' })}>{tr('Activar {plan} · pago {periodo}', { plan: actual.nombre, periodo: actual.periodo === 'anio' ? tr('anual') : tr('mensual') })}</button>}
          {paga && <span>{tr('Tarjeta, facturas y cancelación')}</span>}
        </div>}
      </section>
      <section className={styles.consumo} aria-labelledby="plan-consumo">
        <h2 id="plan-consumo">{tr('Lectura de facturas y tickets')}</h2>
        <CupoEscaneo />
      </section>
    </div>
    {!paga && !fundador && uso?.perdidas?.length > 0 && <section className={styles.aviso}>
      <h2>{tr('Conserva las herramientas que has probado')}</h2>
      <p>{tr('Tu plan {plan} no incluye lo siguiente:', { plan: actual.nombre })}</p>
      <ul>{uso.perdidas.map((t) => <li key={t}>{perdida(tr, t)}</li>)}</ul>
      {uso.recomendado ? <p>{planRecomendado[0]}<strong>{uso.recomendado}</strong>{planRecomendado[1]}{admin && <> <button type="button" className={styles.enlaceBoton} disabled={ocupado} onClick={() => { llamar({ tipo: actual.tipo, nombre: uso.recomendado, periodo }); }}>{tr('Elegir {plan}', { plan: uso.recomendado })}</button></>}</p>
        : <p>{tr('Contacta con nosotros para acordar un plan a medida.')}</p>}
    </section>}
    {!fundador && actual.version !== VERSION_PLAN && <p className={styles.condiciones}>{tr('Tu suscripción conserva las condiciones anteriores. Los planes siguientes se ofrecen por empresa.')}</p>}
    <section className={styles.comparacion} aria-labelledby="planes-titulo">
      <div className={styles.cabecera}>
        <div><h2 id="planes-titulo">{tr('Un plan para cada etapa')}</h2><p>{tr('Planes para {quien}. Todos incluyen una empresa y un acceso separado para tu gestoría.', { quien: tr(tipo === 'pym' ? 'pymes y sociedades' : 'autónomos') })}</p></div>
        <a className={styles.enlace} href="/precios" target="_blank" rel="noopener">{tr('Comparar todas las funciones')} <span aria-hidden="true">↗</span></a>
      </div>
      {!sociedad && <p className={styles.condiciones}>{tipo === 'aut' ? tr('¿Facturas como sociedad (S.L., S.A.…)?') : tr('Planes para sociedades.')}{' '}<button type="button" className={styles.enlaceBoton} onClick={() => setTipo(tipo === 'aut' ? 'pym' : 'aut')}>{tipo === 'aut' ? tr('Ver planes de Pymes') : tr('Volver a los planes de Autónomos')}</button></p>}
      <div className={styles.controles}>
        <fieldset className={styles.selector} disabled={ocupado}><legend>{tr('Forma de pago', { contexto: 'plan' })}</legend>
          <div className={styles.opciones}><label className={periodo === 'mes' ? styles.seleccionado : ''}><input type="radio" name="periodo-plan" value="mes" checked={periodo === 'mes'} onChange={() => setPeriodo('mes')} />{tr('Mensual')}</label>
          <label className={periodo === 'anio' ? styles.seleccionado : ''}><input type="radio" name="periodo-plan" value="anio" checked={periodo === 'anio'} onChange={() => setPeriodo('anio')} />{tr('Anual')} <span>−{DESCUENTO} %</span></label></div>
        </fieldset>
      </div>
      <div className={styles.planes} role="region" tabIndex={0} aria-label={tr('Planes disponibles')}>
        {PLANES[tipo].map((p) => {
          const anual = Math.round(p.p * 12 * (100 - DESCUENTO)) / 100;
          const elegido = esActual(p.n);
          return <article key={p.n} className={`${styles.plan} ${p.fuerte ? styles.destacado : ''}`} aria-labelledby={`plan-${p.n}`}>
            <div className={styles.planPrincipal}><div className={styles.planCabecera}><h3 id={`plan-${p.n}`}>{p.n}</h3>{p.fuerte && <span className={styles.recomendado}>{tr('Recomendado')}</span>}</div>
            <p className={styles.para}>{p.fuerte ? tr('Operaciones, previsión y análisis en un solo plan') : tr(p.para)}</p>
            <p className={styles.precio}><strong>{eurPrecio(periodo === 'anio' ? anual / 12 : p.p)}</strong><span>{tr('/mes')}</span></p>
            <p className={styles.facturacion}>{periodo === 'anio' ? tr('{importe} facturados al año', { importe: eurPrecio(anual) }) : tr('Facturación mensual')} · {tr('sin IVA')}</p>
            {fundador || despacho ? <p className={styles.incluido}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{fundador ? tr('Incluido en tu plan Fundador') : elegido ? tr('Tu plan actual, incluido por tu gestoría') : tr('Lo gestiona tu gestoría')}</p> : elegido ? <p className={styles.planElegido}>{tr('Tu plan actual')}</p> : admin ? <button type="button" className={`${styles.botonPlan} ${p.fuerte ? styles.botonPro : ''}`} disabled={ocupado} onClick={() => elegir(p.n)}>{paga ? tr('Cambiar a {plan}', { plan: p.n }) : tr('Elegir {plan}', { plan: p.n })}</button> : <p className={styles.soloAdmin}>{tr('Gestionado por el administrador')}</p>}
            </div><div className={styles.funciones}>
              <p>{p.herencia ? tr('Todo lo de {plan}, más:', { plan: p.herencia }) : tr('Lo esencial para tu día a día:')}</p>
              <ul>{p.l.map((t) => <li key={t}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg><span>{tr(t)}</span></li>)}</ul>
            </div>
          </article>;
        })}
      </div>
    </section>
    <aside className={styles.business}><div><h2>{tr('¿Gestionas varias empresas?')}</h2><p>{tr('Fisquo Business adapta el alcance y la capacidad a tu equipo.')}</p></div><a className={styles.enlace} href="/business">{tr('Consultar Business')} <span aria-hidden="true">→</span></a></aside>
    <details className={styles.detalles}><summary>{tr('Condiciones de contratación y lecturas IA')}</summary>
      <p>{tr('Los precios que ves son sin IVA y sin permanencia; al contratar se añade el IVA y ves el importe final antes de pagar. El pago anual tiene un descuento del {descuento} % y se cobra en un solo pago al año.', { descuento: DESCUENTO })}</p>
      <p>{tr('La prueba no pide tarjeta e incluye 50 páginas en total de lectura IA. Si contratas cuando quedan menos de dos días, el primer cobro es al contratar; la fecha aparece en el pago.')}</p>
      <p>{tr('Si la prueba termina sin plan, la cuenta pasa a solo lectura: tus datos no se borran, puedes consultarlos y exportarlos, y todo se reactiva al elegir un plan.')}</p>
      <p>{tr('La cuota de lectura IA se comparte por empresa con el equipo y la gestoría. Se renueva cada mes natural, también con pago anual, y no se acumula. Las páginas enviadas a la IA cuentan aunque no guardes el gasto. Al agotarlas, puedes seguir introduciendo gastos a mano o solicitar una ampliación sin cargos automáticos.')}</p>
      {paga && <p>{tr('Los cambios de plan ajustan la diferencia en tu próxima factura.')}</p>}
    </details>
    {!admin && !fundador && <p className={styles.condiciones}>{tr('Solo el administrador de la empresa puede cambiar el plan.')}</p>}
    {ocupado && <p className={styles.mensaje} role="status">{tr('Preparando tu suscripción…')}</p>}
    {estado && !ocupado && <p className={styles.mensaje} role={estado.startsWith('Hecho') ? 'status' : 'alert'}>{tr(estado)}</p>}
  </div>;
}

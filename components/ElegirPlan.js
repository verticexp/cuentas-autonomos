'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { diasPrueba, esFundador, TIPOS } from '@/lib/prueba';
import CupoEscaneo from '@/components/CupoEscaneo';
import styles from './ElegirPlan.module.css';

const euros = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

// Ajustes › Tu plan: contratar con Stripe Checkout, cambiar de plan y gestionar el pago en el portal de Stripe
// (app/api/suscripcion). En la app de iOS no se enseña la compra (lib/app.js); solo el administrador puede cambiarlo.
// El tipo de negocio sale de los datos fiscales de la empresa (autónomo o sociedad): no se elige aquí.
export default function ElegirPlan({ plan, tipoEmpresa, uso, admin, app }) {
  const tipo = tipoEmpresa === 'pym' ? 'pym' : 'aut';
  const [periodo, setPeriodo] = useState(plan?.periodo || 'mes');
  const [estado, setEstado] = useState('');
  const [actual, setActual] = useState(plan);
  const router = useRouter();
  const paga = Boolean(actual?.pagado && actual?.suscripcion);
  // Fundador (lib/prueba.js): gratis de por vida; ve los mismos planes que los clientes, sin poder contratarlos.
  const fundador = esFundador(actual);

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
    const sesion = new URLSearchParams(window.location.search).get('sesion');
    if (!sesion) return;
    window.history.replaceState(null, '', window.location.pathname);
    llamar({ sesion }).then((d) => { if (d?.plan) { setActual(d.plan); setEstado(`Hecho: ya tienes el plan ${d.plan.nombre}.`); router.refresh(); } });
  }, []);

  async function elegir(nombre) {
    if (paga && !window.confirm(`¿Pasar al plan ${TIPOS[tipo]} ${nombre} (${periodo === 'anio' ? 'anual' : 'mensual'})? Stripe ajusta la diferencia en tu próxima factura.`)) return;
    const d = await llamar({ tipo, nombre, periodo });
    if (d?.plan) { setActual(d.plan); setEstado(`Hecho: ahora tienes el plan ${d.plan.nombre}.`); router.refresh(); }
  }

  const dias = diasPrueba(actual);
  if (app) return <>
    {dias !== null && <p className="nota">{dias === 0 ? 'Tu prueba ha terminado. Tus datos siguen disponibles para consultar y exportar.' : `Te quedan ${dias} días de prueba.`}</p>}
    <p className="nota">El plan se gestiona desde la web de Netto, entrando con tu cuenta en un navegador.</p>
  </>;
  const ocupado = estado === 'enviando';
  const esActual = (n) => actual?.tipo === tipo && actual?.nombre === n && (actual.periodo || 'mes') === periodo;
  const estadoPlan = fundador ? 'Gratis de por vida' : paga ? actual.estado === 'past_due' ? 'Revisar pago' : actual.estado === 'trialing' ? 'Prueba con tarjeta' : 'Activo'
    : dias === 0 ? 'Prueba finalizada' : dias > 0 ? `Prueba · ${dias} días` : actual?.nombre ? 'Pendiente de activación' : 'Condiciones anteriores';

  return <div className={styles.contenido} aria-busy={ocupado}>
    <p className={styles.intro}>Gestiona tu suscripción y elige el alcance que necesita tu empresa.</p>
    <div className={styles.resumen}>
      <section className={styles.actual} aria-labelledby="plan-actual">
        <div className={styles.cabeceraActual}><h2 id="plan-actual">Tu suscripción</h2><span className={styles.estado}>{estadoPlan}</span></div>
        <p className={styles.nombreActual}>{fundador ? 'Plan Fundador' : `${TIPOS[actual.tipo]} ${actual.nombre}`}</p>
        <p className={styles.detalleActual}>{fundador ? 'Todas las funciones, sin límites de usuarios ni cuotas. Abajo tienes los planes que ven los clientes nuevos.' : paga ? `Facturación ${actual.periodo === 'anio' ? 'anual' : 'mensual'} · una empresa por suscripción`
          : dias === 0 ? 'Tus datos siguen disponibles para consultar y exportar. Elige un plan para volver a crear y editar.'
          : dias > 0 ? 'Prueba sin compromiso. Revisa los planes antes de activar tu suscripción.'
          : 'Consulta las opciones disponibles para tu empresa.'}</p>
        {paga && actual.estado === 'past_due' && <p className={styles.alerta}>El último cobro ha fallado. Revisa tu método de pago.</p>}
        {admin && !fundador && <div className={styles.gestion}>
          {paga ? <button type="button" className={styles.botonGestion} disabled={ocupado} onClick={() => llamar({ portal: true })}>Gestionar facturación <span aria-hidden="true">↗</span></button>
            : actual?.nombre && <button type="button" className={styles.botonGestion} disabled={ocupado} onClick={() => llamar({ tipo: actual.tipo, nombre: actual.nombre, periodo: actual.periodo || 'mes' })}>Activar {actual.nombre} · pago {actual.periodo === 'anio' ? 'anual' : 'mensual'}</button>}
          {paga && <span>Tarjeta, facturas y cancelación</span>}
        </div>}
      </section>
      <section className={styles.consumo} aria-labelledby="plan-consumo">
        <h2 id="plan-consumo">Lectura de facturas y tickets</h2>
        <CupoEscaneo />
      </section>
    </div>
    {!paga && !fundador && uso?.perdidas?.length > 0 && <section className={styles.aviso}>
      <h2>Conserva las herramientas que has probado</h2>
      <p>Tu plan {actual.nombre} no incluye lo siguiente:</p>
      <ul>{uso.perdidas.map((t) => <li key={t}>{t}</li>)}</ul>
      {uso.recomendado ? <p>El plan <strong>{uso.recomendado}</strong> cubre este uso.{admin && <> <button type="button" className={styles.enlaceBoton} disabled={ocupado} onClick={() => { llamar({ tipo: actual.tipo, nombre: uso.recomendado, periodo }); }}>Elegir {uso.recomendado}</button></>}</p>
        : <p>Contacta con nosotros para acordar un plan a medida.</p>}
    </section>}
    {!fundador && actual.version !== 2 && <p className={styles.condiciones}>Tu suscripción conserva las condiciones anteriores. Los planes siguientes se ofrecen por empresa.</p>}
    <section className={styles.comparacion} aria-labelledby="planes-titulo">
      <div className={styles.cabecera}>
        <div><h2 id="planes-titulo">Un plan para cada etapa</h2><p>Planes para {tipo === 'pym' ? 'pymes y sociedades' : 'autónomos'}. Todos incluyen una empresa y un acceso separado para tu gestoría.</p></div>
        <a className={styles.enlace} href="/precios" target="_blank" rel="noopener">Comparar todas las funciones <span aria-hidden="true">↗</span></a>
      </div>
      <div className={styles.controles}>
        <fieldset className={styles.selector} disabled={ocupado}><legend>Forma de pago</legend>
          <div className={styles.opciones}><label className={periodo === 'mes' ? styles.seleccionado : ''}><input type="radio" name="periodo-plan" value="mes" checked={periodo === 'mes'} onChange={() => setPeriodo('mes')} />Mensual</label>
          <label className={periodo === 'anio' ? styles.seleccionado : ''}><input type="radio" name="periodo-plan" value="anio" checked={periodo === 'anio'} onChange={() => setPeriodo('anio')} />Anual <span>−{DESCUENTO} %</span></label></div>
        </fieldset>
      </div>
      <div className={styles.planes} aria-label="Planes disponibles">
        {PLANES[tipo].map((p) => {
          const anual = Math.round(p.p * 12 * (100 - DESCUENTO)) / 100;
          const elegido = esActual(p.n);
          return <article key={p.n} className={`${styles.plan} ${p.fuerte ? styles.destacado : ''}`} aria-labelledby={`plan-${p.n}`}>
            <div className={styles.planPrincipal}><div className={styles.planCabecera}><h3 id={`plan-${p.n}`}>{p.n}</h3>{p.fuerte && <span className={styles.recomendado}>Recomendado</span>}</div>
            <p className={styles.para}>{p.fuerte ? 'Operaciones, previsión y análisis en un solo plan' : p.para}</p>
            <p className={styles.precio}><strong>{euros(periodo === 'anio' ? anual / 12 : p.p)} €</strong><span>/mes</span></p>
            <p className={styles.facturacion}>{periodo === 'anio' ? `${euros(anual)} € facturados al año` : 'Facturación mensual'} · sin IVA</p>
            {fundador ? <p className={styles.incluido}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>Incluido en tu plan Fundador</p> : elegido ? <p className={styles.planElegido}>Tu plan actual</p> : admin ? <button type="button" className={`${styles.botonPlan} ${p.fuerte ? styles.botonPro : ''}`} disabled={ocupado} onClick={() => elegir(p.n)}>{paga ? `Cambiar a ${p.n}` : `Elegir ${p.n}`}</button> : <p className={styles.soloAdmin}>Gestionado por el administrador</p>}
            </div><div className={styles.funciones}>
              <p>{p.herencia ? `Todo lo de ${p.herencia}, más:` : 'Lo esencial para tu día a día:'}</p>
              <ul>{p.l.map((t) => <li key={t}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg><span>{t}</span></li>)}</ul>
            </div>
          </article>;
        })}
      </div>
    </section>
    <aside className={styles.business}><div><h2>¿Gestionas varias empresas?</h2><p>Netto Business adapta el alcance y la capacidad a tu equipo.</p></div><a className={styles.enlace} href="/business">Consultar Business <span aria-hidden="true">→</span></a></aside>
    <details className={styles.detalles}><summary>Condiciones de contratación y lecturas IA</summary>
      <p>Precios sin IVA y sin permanencia. El pago anual tiene un descuento del {DESCUENTO} % y se cobra en un solo pago al año. El importe final y las condiciones se muestran al contratar.</p>
      <p>La prueba incluye 50 páginas en total. El cobro puede comenzar al contratar si quedan menos de dos días de prueba; revisa la fecha que aparece en el pago.</p>
      <p>La cuota de lectura IA se comparte por empresa con el equipo y la gestoría. Se renueva cada mes natural, también con pago anual, y no se acumula. Las páginas enviadas a la IA cuentan aunque no guardes el gasto. Al agotarlas, puedes seguir introduciendo gastos a mano o solicitar una ampliación sin cargos automáticos.</p>
      {paga && <p>Los cambios de plan ajustan la diferencia en tu próxima factura.</p>}
    </details>
    {!admin && !fundador && <p className={styles.condiciones}>Solo el administrador de la empresa puede cambiar el plan.</p>}
    {ocupado && <p className={styles.mensaje} role="status">Preparando tu suscripción…</p>}
    {estado && !ocupado && <p className={styles.mensaje} role={estado.startsWith('Hecho') ? 'status' : 'alert'}>{estado}</p>}
  </div>;
}

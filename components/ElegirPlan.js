'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { TIPOS, TIPOS_ALTA } from '@/lib/prueba';

const euros = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

// Ajustes › Tu plan: contratar con Stripe Checkout, cambiar de plan y gestionar el pago en el portal de Stripe
// (app/api/suscripcion). En la app de iOS no se enseña la compra (lib/app.js); solo el administrador puede cambiarlo.
export default function ElegirPlan({ plan, uso, admin, app }) {
  const [tipo, setTipo] = useState(plan?.tipo === 'gra' ? 'pym' : plan?.tipo || 'aut');
  const [periodo, setPeriodo] = useState(plan?.periodo || 'mes');
  const [estado, setEstado] = useState('');
  const [actual, setActual] = useState(plan);
  const router = useRouter();
  const paga = Boolean(actual?.pagado && actual?.suscripcion);

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

  if (app) return <p className="nota">El plan se gestiona desde la web de Netto, entrando con tu cuenta en un navegador.</p>;
  const esActual = (n) => actual?.tipo === tipo && actual?.nombre === n && (!paga || (actual.periodo || 'mes') === periodo);

  return (
    <section className="tarjeta formulario elegir-plan">
      {paga && (
        <div className="plan-pagado">
          <p>Plan <strong>{TIPOS[actual.tipo]} {actual.nombre}</strong>, pago {actual.periodo === 'anio' ? 'anual' : 'mensual'}{actual.estado === 'past_due' ? ' · el último cobro ha fallado: revisa tu tarjeta' : ''}.</p>
          {admin && <button type="button" className="boton secundario" disabled={estado === 'enviando'} onClick={() => llamar({ portal: true })}>Tarjeta, facturas y baja</button>}
        </div>
      )}
      {!paga && actual?.nombre && admin && (
        <div className="plan-pagado">
          <p>Tu plan: <strong>{TIPOS[actual.tipo]} {actual.nombre}</strong>. Añade la tarjeta y sigues sin cortes; si te queda prueba, no se cobra hasta que acabe.</p>
          <button type="button" className="boton" disabled={estado === 'enviando'} onClick={() => llamar({ tipo: actual.tipo, nombre: actual.nombre, periodo })}>Añadir tarjeta · {periodo === 'anio' ? 'anual' : 'mensual'}</button>
        </div>
      )}
      {!paga && uso?.perdidas?.length > 0 && (
        <div className="plan-uso">
          <p>Durante la prueba has usado cosas que el plan {actual.nombre} no incluye:</p>
          <ul>{uso.perdidas.map((t) => <li key={t}>{t}</li>)}</ul>
          {uso.recomendado
            ? <p>Con el plan <strong>{uso.recomendado}</strong> lo sigues teniendo todo.{admin && <> <button type="button" className="enlace" disabled={estado === 'enviando'} onClick={() => { setTipo(actual.tipo); llamar({ tipo: actual.tipo, nombre: uso.recomendado, periodo }); }}>Contratar {uso.recomendado}</button></>}</p>
            : <p>Para seguir con todo, escríbenos y te preparamos un plan a medida.</p>}
        </div>
      )}
      {actual && actual.version !== 2 && <p className="nota">Tu suscripción conserva las condiciones anteriores. Los planes de esta página se ofrecen por empresa.</p>}
      <div className="segmentado" role="tablist">
        {Object.entries(TIPOS_ALTA).map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tipo === k} className={tipo === k ? 'activo' : ''} onClick={() => setTipo(k)}>{t}</button>)}
      </div>
      <div className="segmentado" role="tablist">
        <button type="button" role="tab" aria-selected={periodo === 'mes'} className={periodo === 'mes' ? 'activo' : ''} onClick={() => setPeriodo('mes')}>Mensual</button>
        <button type="button" role="tab" aria-selected={periodo === 'anio'} className={periodo === 'anio' ? 'activo' : ''} onClick={() => setPeriodo('anio')}>Anual −{DESCUENTO} %</button>
      </div>
      <ul className="planes-app">
        {PLANES[tipo].map((p) => (
          <li key={p.n} className={esActual(p.n) ? 'actual' : ''}>
            <div>
              <strong>{p.n}</strong>
              <span>{periodo === 'anio' ? `${euros((p.p * 12 * (100 - DESCUENTO)) / 100)} €/año` : `${p.p} €/mes`}</span>
              <small>{p.para}</small>
            </div>
            {esActual(p.n) ? <em>Tu plan</em> : admin && (
              <button type="button" className="boton" disabled={estado === 'enviando'} onClick={() => elegir(p.n)}>{paga ? 'Cambiar' : 'Contratar'}</button>
            )}
          </li>
        ))}
      </ul>
      <p className="nota">Cada suscripción incluye una empresa y un acceso de gestoría aparte. ¿Gestionas varias sociedades o necesitas más equipo? <a href="/business">Consulta Netto Business</a>.</p>
      <p className="nota">Precios sin IVA, sin permanencia. {paga ? '' : 'Si aún te queda prueba, no se cobra nada hasta que acabe. '}Todo lo que incluye cada plan, en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
      {!admin && <p className="nota">Solo el administrador de la empresa puede cambiar el plan.</p>}
      {estado && estado !== 'enviando' && <p className={estado.startsWith('Hecho') ? 'nota' : 'error'}>{estado}</p>}
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLANES } from '@/components/web/datos';
import { TIPOS } from '@/lib/prueba';
import { diaDe, fechaCorta } from '@/lib/formato';
import { mostrarHecho } from '@/lib/hecho';
import { comprarApple, datosCompras, gestionarApple, hayCompras, productosApple, restaurarApple, sincronizarApple, vigentesApple } from '@/lib/comprasNativas';
import { useT } from '@/components/Idioma';
import styles from './ElegirPlan.module.css';

// Ajustes › Tu plan en la app de iOS: los planes se contratan con compras dentro de la app (StoreKit 2, normas 3.1.1 y
// 3.1.2 de Apple). Precio y moneda los da el App Store; el servidor comprueba cada compra (lib/compraApple.js). Con lo que
// pide Apple para las suscripciones: precio y periodo claros, renovación automática, cómo cancelar, «Restaurar compras» y
// enlaces a las condiciones de uso y a la política de privacidad. En una app sin el plugin (versiones anteriores) no sale.
// actual: el plan de la empresa; alCambiar(plan): para que la tarjeta de arriba se ponga al día.
const id = (tipo, nombre, periodo) => `com.fisquo.app.${tipo}.${nombre.toLowerCase()}.${periodo}`;
const fecha = (ms) => (ms ? fechaCorta(diaDe(new Date(ms).toISOString())) : '');

export default function PlanesApple({ actual, tipoEmpresa, alCambiar }) {
  const tr = useT();
  const router = useRouter();
  const [datos, setDatos] = useState(null);
  const [productos, setProductos] = useState(null);
  const [vigentes, setVigentes] = useState([]);
  const [fallo, setFallo] = useState('');
  const [tipo, setTipo] = useState(tipoEmpresa === 'pym' || actual?.tipo === 'pym' ? 'pym' : 'aut');
  const [periodo, setPeriodo] = useState(actual?.periodo === 'anio' ? 'anio' : 'mes');
  const [ocupado, setOcupado] = useState('');
  const [estado, setEstado] = useState('');
  const [visible, setVisible] = useState(false);

  async function cargar() {
    setFallo('');
    const d = await datosCompras();
    if (!d.ok) { setFallo(d.error || 'No se han podido cargar los planes.'); return; }
    setDatos(d);
    if (d.motivo && d.motivo !== 'admin') return;
    if (d.tipos?.length && !d.tipos.includes(tipo)) setTipo(d.tipos[0]);
    const [p, v] = await Promise.all([productosApple(d.productos).catch(() => null), vigentesApple()]);
    setVigentes(v);
    if (!p || !Object.keys(p).length) { setFallo('No se han podido cargar los planes del App Store. Comprueba la conexión y vuelve a intentarlo.'); return; }
    setProductos(p);
  }

  useEffect(() => {
    if (!hayCompras()) return;
    setVisible(true);
    cargar();
  }, []);

  if (!visible) return null;

  // Lo que devuelve el servidor tras una compra: el plan nuevo arriba y en el resto de la app.
  function alDia(r) {
    if (r?.plan) alCambiar?.(r.plan);
    setDatos((d) => (d ? { ...d, apple: r.apple ?? d.apple, vigente: r.vigente ?? d.vigente } : d));
    router.refresh();
  }

  async function comprar(p) {
    setOcupado(p);
    setEstado('');
    const r = await comprarApple(p, datos.token);
    setOcupado('');
    if (r.error && r.estado !== 'comprado') { setEstado(r.error); return; }
    if (r.estado === 'pendiente') { setEstado('Tu compra está pendiente de aprobación. El plan se activará solo en cuanto se apruebe.'); return; }
    if (r.estado !== 'comprado') return;
    if (r.pendienteServidor) { setEstado('La compra está hecha. Estamos activando tu plan: si no se activa en unos minutos, toca «Restaurar compras».'); return; }
    alDia(r);
    setVigentes(await vigentesApple());
    if (r.apple?.producto && r.apple.producto !== p) setEstado('Hecho: tu plan cambiará en la próxima renovación.');
    else mostrarHecho(tr('Ya tienes el plan {plan}', { plan: r.plan?.nombre || '' }));
  }

  async function restaurar() {
    setOcupado('restaurar');
    setEstado('');
    const r = await restaurarApple();
    setOcupado('');
    if (r.cancelado) return;
    if (!r.ok) { setEstado(r.error || 'No se ha podido conectar con el App Store.'); return; }
    if (r.vacio) { setEstado('Este ID de Apple no tiene ninguna suscripción a Fisquo vigente.'); return; }
    alDia(r);
    setVigentes(await vigentesApple());
    setEstado(r.deOtra && !r.vigente ? 'La suscripción de este ID de Apple es de otra empresa de Fisquo.' : 'Hecho: compras restauradas.');
  }

  async function gestionar() {
    setOcupado('gestionar');
    try { await gestionarApple(); } catch { /* cerrada o sin escena */ }
    const r = await sincronizarApple();
    setOcupado('');
    if (r?.ok && !r.vacio) alDia(r);
    setVigentes(await vigentesApple());
  }

  if (fallo && !datos) return <p className={styles.condiciones} role="alert">{tr(fallo)} <button type="button" className={styles.enlaceBoton} onClick={cargar}>{tr('Reintentar')}</button></p>;
  if (!datos) return <p className={styles.condiciones} role="status">{tr('Cargando los planes…')}</p>;
  if (datos.motivo === 'admin') return <p className={styles.condiciones}>{tr('Solo el administrador de la empresa puede cambiar el plan.')}</p>;
  if (datos.motivo) return null;

  const apple = datos.vigente ? datos.apple : null;
  // ¿La suscripción de la empresa es de este ID de Apple? Si la contrató otra persona, solo ella puede cambiarla.
  const mia = apple && vigentes.some((v) => v.original === apple.original);
  // Este ID de Apple ya paga otra empresa: una suscripción del App Store es para una sola empresa.
  const deOtra = !apple && vigentes.some((v) => v.token && v.token !== datos.token);
  const puedeElegir = !apple || mia;
  const tipos = datos.tipos?.length ? datos.tipos : ['aut', 'pym'];
  const cobro = (p) => (p?.periodo === 'anio' ? tr('{precio} al año', { precio: p.precio }) : tr('{precio} al mes', { precio: p?.precio }));

  return <section className={styles.comparacion} aria-labelledby="planes-app" aria-busy={Boolean(ocupado)}>
    {apple && <div className={styles.aviso}>
      <h2>{tr('Suscripción del App Store')}</h2>
      <p>{apple.estado === 'grace' ? tr('Apple no ha podido cobrar la renovación. Revisa tu forma de pago en el App Store para no perder el acceso.')
        : apple.renueva === false ? tr('No se renovará: tu plan sigue activo hasta el {fecha}.', { fecha: fecha(apple.expira) })
        : tr('Se renueva sola el {fecha}.', { fecha: fecha(apple.expira) })}</p>
      {apple.siguiente && productos?.[apple.siguiente] && <p>{tr('En la próxima renovación pasas a {plan}.', { plan: productos[apple.siguiente].nombre })}</p>}
      {mia ? <button type="button" className={styles.botonGestion} disabled={Boolean(ocupado)} onClick={gestionar}>{tr('Gestionar suscripción')}</button>
        : <p>{tr('La contrató otra persona con su ID de Apple: solo ella puede cambiarla o cancelarla.')}</p>}
    </div>}
    <div className={styles.cabecera}><div>
      <h2 id="planes-app">{tr(apple ? 'Cambiar de plan' : 'Elige tu plan')}</h2>
      <p>{tr('Planes para {quien}. Todos incluyen una empresa y un acceso separado para tu gestoría.', { quien: tr(tipo === 'pym' ? 'pymes y sociedades' : 'autónomos') })}</p>
    </div></div>
    {tipos.length > 1 && <p className={styles.condiciones}>{tipo === 'aut' ? tr('¿Facturas como sociedad (S.L., S.A.…)?') : tr('Planes para sociedades.')}{' '}<button type="button" className={styles.enlaceBoton} onClick={() => setTipo(tipo === 'aut' ? 'pym' : 'aut')}>{tipo === 'aut' ? tr('Ver planes de Pymes') : tr('Volver a los planes de Autónomos')}</button></p>}
    <div className={styles.controles}>
      <fieldset className={styles.selector} disabled={Boolean(ocupado)}><legend>{tr('Forma de pago', { contexto: 'plan' })}</legend>
        <div className={styles.opciones}><label className={periodo === 'mes' ? styles.seleccionado : ''}><input type="radio" name="periodo-app" value="mes" checked={periodo === 'mes'} onChange={() => setPeriodo('mes')} />{tr('Mensual')}</label>
        <label className={periodo === 'anio' ? styles.seleccionado : ''}><input type="radio" name="periodo-app" value="anio" checked={periodo === 'anio'} onChange={() => setPeriodo('anio')} />{tr('Anual')}</label></div>
      </fieldset>
    </div>
    {fallo && <p className={styles.condiciones} role="alert">{tr(fallo)} <button type="button" className={styles.enlaceBoton} onClick={cargar}>{tr('Reintentar')}</button></p>}
    {deOtra && <p className={styles.alerta} role="note">{tr('Tu ID de Apple ya tiene una suscripción a Fisquo para otra empresa. Cada suscripción del App Store es para una sola empresa.')}</p>}
    {productos && <div className={styles.planes} role="region" tabIndex={0} aria-label={tr('Planes disponibles')}>
      {PLANES[tipo].map((p) => {
        const pid = id(tipo, p.n, periodo);
        const prod = productos[pid];
        const elegido = apple?.producto === pid;
        return <article key={p.n} className={`${styles.plan} ${p.fuerte ? styles.destacado : ''}`} aria-labelledby={`plan-app-${p.n}`}>
          <div className={styles.planPrincipal}><div className={styles.planCabecera}><h3 id={`plan-app-${p.n}`}>{p.n}</h3>{p.fuerte && <span className={styles.recomendado}>{tr('Recomendado')}</span>}</div>
          <p className={styles.para}>{p.fuerte ? tr('Operaciones, previsión y análisis en un solo plan') : tr(p.para)}</p>
          <p className={styles.precio}><strong>{prod ? prod.precio : '—'}</strong><span>{tr(periodo === 'anio' ? '/año' : '/mes')}</span></p>
          <p className={styles.facturacion}>{prod ? `${cobro(prod)} · ${tr('renovación automática')}` : tr('No disponible ahora mismo')}</p>
          {elegido ? <p className={styles.planElegido}>{tr('Tu plan actual')}</p>
            : puedeElegir && !deOtra && prod ? <button type="button" className={`${styles.botonPlan} ${p.fuerte ? styles.botonPro : ''}`} disabled={Boolean(ocupado)} onClick={() => comprar(pid)}>
              {ocupado === pid ? tr('Abriendo el App Store…') : apple ? tr('Cambiar a {plan}', { plan: p.n }) : tr('Suscribirme a {plan}', { plan: p.n })}</button>
            : null}
          </div><div className={styles.funciones}>
            <p>{p.herencia ? tr('Todo lo de {plan}, más:', { plan: p.herencia }) : tr('Lo esencial para tu día a día:')}</p>
            <ul>{p.l.map((t) => <li key={t}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg><span>{tr(t)}</span></li>)}</ul>
          </div>
        </article>;
      })}
    </div>}
    <div className={styles.legal}>
      <p>{tr('Suscripción con renovación automática, mensual o anual según elijas, para una empresa ({tipo}). El pago se carga a tu cuenta de Apple al confirmar la compra, aunque te queden días de prueba, y la suscripción se renueva sola al mismo precio salvo que la canceles al menos 24 horas antes de que acabe el periodo. Puedes cambiarla o cancelarla cuando quieras en «Gestionar suscripción» o en los ajustes de tu cuenta del App Store.', { tipo: tr(TIPOS[tipo]) })}</p>
      <p><a href="/condiciones" target="_blank" rel="noopener">{tr('Condiciones de uso')}</a> · <a href="/privacidad" target="_blank" rel="noopener">{tr('Política de privacidad')}</a></p>
      <button type="button" className={styles.botonGestion} disabled={Boolean(ocupado)} onClick={restaurar}>{ocupado === 'restaurar' ? tr('Restaurando…') : tr('Restaurar compras')}</button>
    </div>
    {estado && <p className={styles.mensaje} role={estado.startsWith('Hecho') ? 'status' : 'alert'}>{tr(estado)}</p>}
  </section>;
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/Idioma';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import { fechaCorta } from '@/lib/formato';
import { TRAMOS, textoTramo } from '@/lib/tarifasDocumentos';

// Mi despacho › Solo documentos (app/despacho/solo-documentos): la suscripción del panel, el alta de clientes que solo
// envían documentos (lib/documentos.js) y su lista, con su invitación.
const euros = (cent) => `${String(cent / 100).replace('.', ',')} €`;

export default function SoloDocumentosDespacho({ clientes, cuenta, tramo, panel, titular, demo, app = false }) {
  const tr = useT();
  const router = useRouter();
  const [form, setForm] = useState({ nombre: '', nif: '', email: '', contacto: '', tipo: 'autonomo' });
  const [estado, setEstado] = useState({});
  const [subir, setSubir] = useState(null);
  const cambia = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = async (cuerpo, ruta = '/api/despacho/documentos/clientes') => {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null);
    return { r, d: (await r?.json().catch(() => ({}))) || {} };
  };
  const activar = async (portal = false) => {
    setEstado({ ocupado: true });
    const { r, d } = await enviar(portal ? { portal: true } : {}, '/api/despacho/panel');
    if (r?.ok && d.url) { window.location.href = d.url; return; }
    setEstado({ error: d.error || tr('No se ha podido abrir el pago') });
  };
  const alta = async (e, confirmado = false) => {
    e?.preventDefault();
    setEstado({ ocupado: true });
    const { r, d } = await enviar({ accion: 'alta', ...form, ...(confirmado ? { subirTramo: true } : {}) });
    if (r?.status === 409 && d.subirTramo) { setSubir(d.subirTramo); setEstado({}); return; }
    setSubir(null);
    if (!r?.ok) { setEstado({ error: d.error || tr('No se ha podido dar de alta') }); return; }
    setForm({ nombre: '', nif: '', email: '', contacto: '', tipo: 'autonomo' });
    setEstado({ hecho: d.enviado ? tr('Invitación enviada a {email}.', { email: form.email }) : tr('Cliente dado de alta. No se ha podido enviar el correo: pásale este enlace.'), enlace: d.enviado ? '' : d.enlace });
    router.refresh();
  };
  const reenviar = async (id) => {
    const { r, d } = await enviar({ accion: 'reenviar', empresa: id });
    setEstado(r?.ok ? { hecho: d.enviado ? tr('Invitación reenviada.') : tr('No se ha podido enviar el correo: pásale este enlace.'), enlace: d.enviado ? '' : d.enlace } : { error: d.error || tr('No se ha podido reenviar') });
  };

  const siguiente = TRAMOS[tramo]?.hasta === Infinity ? null : TRAMOS[tramo].hasta;
  return <>
    <section className="grupo" aria-labelledby="docs-sus">
      <h2 id="docs-sus" className="grupo-t">{tr('Suscripción del panel')}</h2>
      <div className="grupo-c">
        <div className="celda"><span className="txt">{demo ? tr('Despacho de demostración') : panel.activo ? (panel.estado === 'trialing' ? tr('En prueba gratis') : panel.estado === 'past_due' ? tr('Pago pendiente') : tr('Activa')) : panel.estado ? tr('En pausa: solo lectura') : tr('Sin activar')}
          <small>{demo ? tr('El panel está activo sin cobro.')
            : panel.activo ? (panel.estado === 'trialing' && panel.finPrueba ? tr('Gratis hasta el {fecha}. Después, la cuota de tu tramo cada mes.', { fecha: fechaCorta(panel.finPrueba) }) : panel.estado === 'past_due' ? tr('El último pago no ha pasado: revisa la tarjeta para que tus clientes no se queden en solo lectura.') : tr('Tus clientes «solo documentos» no pagan nada.'))
            : panel.estado ? tr('Tus clientes «solo documentos» no pueden subir nada nuevo. Puedes seguir viendo y exportando lo que ya hay.') : tr('Para dar de alta clientes que solo envían documentos. Tus clientes no pagan nada.')}</small></span>
          <span className="v">{cuenta === 1 ? tr('1 cliente') : tr('{n} clientes', { n: cuenta })}</span></div>
        {!app && <div className="celda"><span className="txt">{tr('Tu tramo: {tramo}', { tramo: tr(textoTramo(tramo)) })}<small>{siguiente !== null ? tr('Al pasar de {n} clientes, {precio} al mes', { n: siguiente, precio: euros(TRAMOS[tramo + 1].cent) }) : tr('Clientes sin límite')}</small></span><span className="v"><b>{euros(TRAMOS[tramo].cent)}</b><small> {tr('al mes')}</small></span></div>}
        {titular && !demo && !app && (panel.activo
          ? <button type="button" className="celda ir desp-celda-boton" onClick={() => activar(true)} disabled={estado.ocupado}><span className="txt">{tr('Tarjeta, facturas y baja')}<small>{tr('El tramo se ajusta solo según tus clientes')}</small></span></button>
          : <button type="button" className="celda ir desp-celda-boton" onClick={() => activar(false)} disabled={estado.ocupado}><span className="txt">{panel.pruebaUsada ? tr('Activar la suscripción') : tr('Empezar 30 días gratis')}<small>{tr('Cuota mensual del despacho, no por cliente')}</small></span></button>)}
        {!app && <details className="celda desp-plegable">
          <summary>{tr('Cómo funciona y cuánto cuesta')}</summary>
          <p>{tr('El panel de Mi despacho es gratis con los clientes que llevan sus cuentas en Fisquo. Para los clientes «solo documentos» pagas una cuota mensual según cuántos tengas, sin IVA:')}</p>
          <ul>{TRAMOS.map((t, i) => <li key={i}><b>{tr(textoTramo(i))}</b>: {euros(t.cent)}</li>)}</ul>
          <p>{tr('Si un cliente pasa a llevar sus cuentas en Fisquo, deja de contar y conserva lo que subió. Si la suscripción se cancela o no se paga, sus documentos quedan en solo lectura.')}</p>
        </details>}
      </div>
      {app && <p className="grupo-pie">{tr('La suscripción se gestiona desde la web.')}</p>}
      {!titular && !panel.activo && <p className="grupo-pie">{tr('La activa el titular del despacho.')}</p>}
    </section>

    {titular && panel.activo && !demo && <section className="grupo" aria-labelledby="docs-alta">
      <h2 id="docs-alta" className="grupo-t">{tr('Dar de alta un cliente')}</h2>
      <form className="formulario tarjeta" onSubmit={alta}>
        <label>{tr('Nombre o razón social')}<input className="campo" required value={form.nombre} onChange={cambia('nombre')} maxLength={80} autoComplete="off" /></label>
        <label>{tr('NIF')}<input className="campo" value={form.nif} onChange={cambia('nif')} maxLength={20} autoComplete="off" /></label>
        <label>{tr('Forma')}<select className="campo" value={form.tipo} onChange={cambia('tipo')}><option value="autonomo">{tr('Autónomo')}</option><option value="sociedad">{tr('Sociedad')}</option></select></label>
        <label>{tr('Persona de contacto')}<input className="campo" value={form.contacto} onChange={cambia('contacto')} maxLength={60} autoComplete="off" /></label>
        <label>{tr('Email')}<input className="campo" required type="email" value={form.email} onChange={cambia('email')} maxLength={254} autoComplete="off" /></label>
        {subir ? <><p role="alert">{tr('Con este cliente pasas al tramo de {precio} al mes.', { precio: euros(subir) })}</p>
          <div className="desp-acciones"><button type="button" className="boton" onClick={() => alta(null, true)} disabled={estado.ocupado}>{tr('Sí, dar de alta')}</button><button type="button" className="boton sec" onClick={() => setSubir(null)}>{tr('Cancelar')}</button></div></>
          : <div className="desp-acciones"><button type="submit" className="boton" disabled={estado.ocupado}>{tr('Dar de alta y enviar invitación')}</button></div>}
      </form>
      <p className="grupo-pie">{tr('Le llega una invitación para elegir su contraseña. Solo podrá subir tickets y facturas y ver lo que le pides.')}</p>
    </section>}
    {(estado.error || estado.hecho) && <p className={estado.error ? 'error' : 'grupo-pie'} role="status">{estado.error || estado.hecho}{estado.enlace && <> <code>{estado.enlace}</code></>}</p>}

    <section className="grupo" aria-labelledby="docs-lista">
      <h2 id="docs-lista" className="grupo-t">{tr('Clientes «solo documentos»')}</h2>
      {clientes.length ? <ul className="grupo-lista desp-lista">{clientes.map((c) => <li key={c.id}>
        <Ir prefetch={false} className="fila desp-fila" href={`/despacho/${encodeURIComponent(c.id)}`}>
          <span className="txt"><strong>{c.nombre}</strong><small>{[c.nif, c.contacto?.email, c.documentos === 1 ? tr('1 documento') : tr('{n} documentos', { n: c.documentos })].filter(Boolean).join(' · ')}</small></span>
          {c.contacto?.pendiente && <span className="desp-estado e-listo">{tr('Sin entrar aún')}</span>}
        </Ir>
        {c.contacto?.pendiente && panel.activo && <button type="button" className="enlace desp-docs-reenviar" onClick={() => reenviar(c.id)}>{tr('Reenviar la invitación')}</button>}
      </li>)}</ul> : <Vacio compacto icono="usuarios" titulo={tr('Aún no tienes clientes «solo documentos»')}><p>{tr('Para los clientes que nunca llevarán sus cuentas en una app: te envían fotos y PDF desde el móvil y tú lo exportas a tu programa.')}</p></Vacio>}
    </section>
  </>;
}

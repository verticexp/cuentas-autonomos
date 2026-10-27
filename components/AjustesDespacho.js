'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur, fechaCorta } from '@/lib/formato';
import Ir from './Ir';
import useEnvio from './useEnvio';
import { useT } from '@/components/Idioma';
import { conHuecos } from '@/lib/huecos';

const euros = (c) => eur(c / 100);

// Ajustes de Mi despacho, como los Ajustes de la app: invitar a clientes (un solo enlace), Fisquo en tu cuota, los datos
// del despacho y lo que hace cada uno. Lo largo va plegado.
export default function AjustesDespacho({ despacho, titular, licencias, tarifa, oferta, nombres, diasGratis, stripe, sesion, enlace }) {
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const tr = useT();
  const [d, setD] = useState({ nombre: despacho.nombre, nif: despacho.nif, email: despacho.email, soloAsignados: despacho.soloAsignados, empresaPropia: despacho.empresaPropia });
  const [editar, setEditar] = useState(false);
  const [msg, setMsg] = useState('');
  const [cobro, setCobro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [compartible, setCompartible] = useState(false);

  useEffect(() => { setCompartible(typeof navigator !== 'undefined' && Boolean(navigator.share)); }, []);
  // Al volver del pago de Stripe: se confirma sin esperar al aviso.
  useEffect(() => {
    if (!sesion) return;
    llamar(`/api/despacho/cobro?sesion=${encodeURIComponent(sesion)}`).then(() => { setCobro('✓ Cobro activado'); router.replace('/despacho/ajustes'); router.refresh(); }).catch((e) => setCobro(e.message));
  }, [sesion, router]);

  const guardar = async (cambios, cerrar = true) => {
    setMsg('Guardando…');
    try { await llamar('/api/despacho', { method: 'PATCH', body: JSON.stringify(cambios) }); setMsg('✓ Guardado'); if (cerrar) setEditar(false); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const pagar = async (portal = false) => {
    setCobro('Abriendo…');
    try { const r = await llamar('/api/despacho/cobro', { method: 'POST', body: JSON.stringify({ portal }) }); window.location.assign(r.url); } catch (err) { setCobro(err.message); }
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setCopiado(false); } };
  const compartir = () => navigator.share?.({ title: `${despacho.nombre} en Fisquo`, text: `Para llevar tus cuentas en Fisquo con ${despacho.nombre}, entra aquí:`, url: enlace }).catch(() => {});
  const licenciasTotal = licencias ? licencias.aut.total + licencias.pym.total : 0;
  const tramos = (tipo) => tarifa[tipo].map((x, i) => (i === 0 ? tr('hasta {hasta}: {importe}', { hasta: x.hasta, importe: euros(x.cent) }) : x.hasta ? tr('{desde} a {hasta}: {importe}', { desde: tarifa[tipo][i - 1].hasta + 1, hasta: x.hasta, importe: euros(x.cent) }) : tr('{desde} o más: {importe}', { desde: tarifa[tipo][i - 1].hasta + 1, importe: euros(x.cent) }))).join(' · ');

  return <>
    <section className="grupo" aria-labelledby="ad-gestion">
      <h2 className="grupo-t" id="ad-gestion">{tr('Tu despacho')}</h2>
      <div className="grupo-c">
        <Ir className="celda ir" href="/despacho/equipo"><span className="txt">{tr('Equipo')}<small>{tr('Quién trabaja contigo y qué tiene pendiente cada uno')}</small></span></Ir>
        {titular && <Ir className="celda ir" href="/despacho/facturacion"><span className="txt">{tr('Facturación')}<small>{tr('Lo que te paga cada cliente y lo que te cuesta Fisquo')}</small></span></Ir>}
        <Ir className="celda ir" href="/despacho/ajustes/plantillas"><span className="txt">{tr('Mensajes guardados')}<small>{tr('Plantillas para lo que escribes a menudo')}</small></span></Ir>
      </div>
    </section>

    <section className="grupo" aria-labelledby="ad-invitar">
      <h2 className="grupo-t" id="ad-invitar">{tr('Invitar a un cliente')}</h2>
      <div className="grupo-c">
        <div className="celda columna">
          <span className="txt">{tr('Pásale este enlace')}<small>{tr('Si es nuevo en Fisquo, se registra con 3 meses gratis. Si ya lo usa, solo tiene que aceptar. En los dos casos, te da acceso a sus cuentas.')}</small></span>
          <div className="desp-enlace"><code>{enlace.replace(/^https?:\/\//, '')}</code></div>
          <div className="desp-acciones">
            <button type="button" className="boton" onClick={copiar}>{copiado ? tr('✓ Copiado') : tr('Copiar enlace')}</button>
            {compartible && <button type="button" className="boton sec" onClick={compartir}>{tr('Compartir')}</button>}
          </div>
        </div>
      </div>
      <p className="grupo-pie">{conHuecos(tr('También pueden escribir tu código, {codigo}, en su Fisquo (Ajustes › Tu gestoría). Siempre lo decide el cliente, y puede quitarte el acceso cuando quiera.'), { codigo: <b>{despacho.codigo}</b> })}</p>
    </section>

    {titular && licencias && <section className="grupo" aria-labelledby="ad-lic">
      <h2 className="grupo-t" id="ad-lic">{tr('Fisquo en tu cuota')}</h2>
      <div className="grupo-c">
        <div className="celda">
          <span className="txt">{licenciasTotal ? (licenciasTotal === 1 ? tr('1 cliente con Fisquo incluido') : tr('{n} clientes con Fisquo incluido', { n: licenciasTotal })) : tr('Ningún cliente incluido todavía')}<small>{licenciasTotal ? tr('{n} en sus {dias} días gratis', { n: licencias.aut.gratis + licencias.pym.gratis, dias: diasGratis }) : tr('Se activa en la ficha de cada cliente, en «Quién lo lleva».')}</small></span>
          <span className="v"><b>{euros(licencias.importe)}</b><small> {tr('al mes')}</small></span>
        </div>
        {oferta?.activa && <div className="celda"><span className="txt">{tr('Precio de lanzamiento')}<small>{oferta.acaba ? tr('Acaba pronto: desde el día siguiente, tarifa normal') : tr('Tu despacho está entre los primeros: lo mantienes 2 años')}</small></span><span className="v">{tr('hasta el {fecha}', { fecha: fechaCorta(oferta.hasta) })}</span></div>}
        {oferta?.plazas && <div className="celda"><span className="txt">{tr('Oferta de lanzamiento')}<small>{tr('Quedan {plazas} de 30 plazas: al activar el cobro, mantienes este precio {anios} años', { plazas: oferta.plazas, anios: oferta.anios })}</small></span></div>}
        {despacho.cobro?.activo
          ? <button type="button" className="celda ir desp-celda-boton" onClick={() => pagar(true)}><span className="txt">{tr('Facturas y tarjeta')}<small>{tr('El número de licencias se ajusta solo cada día')}</small></span></button>
          : licencias.importe > 0 && !despacho.demo && <button type="button" className="celda ir desp-celda-boton" disabled={!stripe} onClick={() => pagar(false)}><span className="txt">{tr('Activar el cobro con tarjeta')}<small>{stripe ? tr('Se te cobra cada mes lo que salga') : tr('Aún no está disponible: te escribiremos para hacerlo a mano')}</small></span></button>}
        <details className="celda desp-plegable">
          <summary>{tr('Cómo funciona y cuánto cuesta')}</summary>
          <p>{oferta?.activa || oferta?.plazas ? tr('Si incluyes Fisquo en lo que cobras a un cliente, tu despacho paga su licencia y el cliente no paga nada a Fisquo. Cada cliente tiene {dias} días gratis la primera vez. Sin el cobro con tarjeta activo, al acabar esos días tienes 15 más para activarlo; después la licencia se retira y el cliente tiene un mes para elegir su plan. Precio al mes por cliente, sin IVA (de lanzamiento):', { dias: diasGratis }) : tr('Si incluyes Fisquo en lo que cobras a un cliente, tu despacho paga su licencia y el cliente no paga nada a Fisquo. Cada cliente tiene {dias} días gratis la primera vez. Sin el cobro con tarjeta activo, al acabar esos días tienes 15 más para activarlo; después la licencia se retira y el cliente tiene un mes para elegir su plan. Precio al mes por cliente, sin IVA:', { dias: diasGratis })}</p>
          <ul>{['aut', 'pym'].map((tipo) => <li key={tipo}><b>{tr(nombres[tipo])}</b>: {tramos(tipo)}</li>)}</ul>
        </details>
      </div>
      {cobro && <p role="status" className={cobro.startsWith('✓') || cobro === 'Abriendo…' ? 'grupo-pie' : 'error'}>{tr(cobro)}</p>}
    </section>}

    <section className="grupo" aria-labelledby="ad-datos">
      <h2 className="grupo-t" id="ad-datos">{tr('Datos del despacho')}</h2>
      {!editar ? <div className="grupo-c">
        <div className="celda"><span className="txt">{tr('Nombre')}</span><span className="v">{despacho.nombre}</span></div>
        <div className="celda"><span className="txt">{tr('NIF')}</span><span className="v">{despacho.nif || '—'}</span></div>
        <div className="celda"><span className="txt">{tr('Email')}</span><span className="v">{despacho.email || '—'}</span></div>
        {titular && <label className="celda desp-interruptor sino"><span className="txt">{tr('Cada gestor ve solo sus clientes')}<small>{tr('Los que le asignes en la ficha de cada cliente. El titular los ve todos.')}</small></span>
          <input type="checkbox" role="switch" checked={d.soloAsignados} onChange={(e) => { setD({ ...d, soloAsignados: e.target.checked }); guardar({ soloAsignados: e.target.checked }, false); }} /></label>}
        {titular && <label className="celda desp-interruptor sino"><span className="txt">{tr('También llevo las cuentas del despacho en Fisquo')}<small>{tr('Facturas a tus clientes, gastos e impuestos del propio despacho, en «Mi empresa». Si no, entras siempre directo a Mi despacho.')}</small></span>
          <input type="checkbox" role="switch" checked={d.empresaPropia} onChange={(e) => { setD({ ...d, empresaPropia: e.target.checked }); guardar({ empresaPropia: e.target.checked }, false); }} /></label>}
        {titular && <button type="button" className="celda ir desp-celda-boton" onClick={() => { setEditar(true); setMsg(''); }}><span className="txt">{tr('Cambiar los datos')}</span></button>}
      </div> : <form className="formulario tarjeta" onSubmit={envolver(async (e) => { e.preventDefault(); await guardar({ nombre: d.nombre, nif: d.nif, email: d.email }); })}>
        <label>{tr('Nombre')}<input className="campo" value={d.nombre} maxLength={120} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
        <label>{tr('NIF')}<input className="campo" value={d.nif} maxLength={20} onChange={(e) => setD({ ...d, nif: e.target.value })} /></label>
        <label>{tr('Email de contacto')}<input className="campo" type="email" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
        <div className="desp-acciones"><button className="boton" disabled={enviando}>{tr('Guardar')}</button><button type="button" className="boton sec" onClick={() => setEditar(false)}>{tr('Cancelar')}</button></div>
      </form>}
      {msg && <p role="status" className={msg.startsWith('✓') || msg === 'Guardando…' ? 'grupo-pie' : 'error'}>{tr(msg)}</p>}
    </section>

    <section className="grupo" aria-labelledby="ad-resp">
      <h2 className="grupo-t" id="ad-resp">{tr('Quién hace qué')}</h2>
      <div className="grupo-c">
        <div className="celda"><span className="txt">Fisquo<small>{tr('Guarda los datos de tus clientes, lee sus tickets y facturas y calcula libros y modelos con lo apuntado. No presenta impuestos ni sustituye tu revisión.')}</small></span></div>
        <div className="celda"><span className="txt">{tr('Tu despacho')}<small>{tr('Revisa, decide y presenta. Lo que cierras queda bloqueado y lo que cambia después, a la vista.')}</small></span></div>
        <div className="celda"><span className="txt">{tr('El cliente')}<small>{tr('Es dueño de sus datos: decide quién los ve y puede exportarlos o llevárselos cuando quiera.')}</small></span></div>
      </div>
      <p className="grupo-pie">{tr('El detalle está en las condiciones de Fisquo. Si necesitas un acuerdo por escrito para tu despacho, escríbenos.')}</p>
    </section>

    <section className="grupo desp-solo-movil" aria-label={tr('Sesión')}>
      <div className="grupo-c">
        {titular && d.empresaPropia && <form method="post" action="/api/despacho/salir?a=empresa"><button className="celda ir desp-celda-boton"><span className="txt">{tr('Mi empresa en Fisquo')}<small>{tr('La contabilidad de tu propio despacho')}</small></span></button></form>}
        <form method="post" action="/api/logout"><button className="celda desp-celda-boton rojo"><span className="txt">{tr('Cerrar sesión')}</span></button></form>
      </div>
    </section>
  </>;
}

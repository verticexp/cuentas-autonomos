'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';

const euros = (c) => eur(c / 100);

// Ajustes de Mi despacho: datos, cómo traer a los clientes, licencias y cobro, y el reparto de responsabilidades.
export default function AjustesDespacho({ despacho, titular, licencias, tarifa, nombres, diasGratis, stripe, sesion, enlaces }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: despacho.nombre, nif: despacho.nif, email: despacho.email, soloAsignados: despacho.soloAsignados });
  const [msg, setMsg] = useState('');
  const [cobro, setCobro] = useState('');
  const [copiado, setCopiado] = useState('');

  // Al volver del pago de Stripe: se confirma sin esperar al aviso.
  useEffect(() => {
    if (!sesion) return;
    llamar(`/api/despacho/cobro?sesion=${encodeURIComponent(sesion)}`).then(() => { setCobro('✓ Cobro activado'); router.replace('/despacho/ajustes'); router.refresh(); }).catch((e) => setCobro(e.message));
  }, [sesion, router]);

  const guardar = async (e) => {
    e.preventDefault(); setMsg('Guardando…');
    try { await llamar('/api/despacho', { method: 'PATCH', body: JSON.stringify(d) }); setMsg('✓ Guardado'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const pagar = async (portal = false) => {
    setCobro('Abriendo…');
    try { const r = await llamar('/api/despacho/cobro', { method: 'POST', body: JSON.stringify({ portal }) }); window.location.assign(r.url); } catch (err) { setCobro(err.message); }
  };
  const copiar = async (texto, que) => { try { await navigator.clipboard.writeText(texto); setCopiado(que); } catch { setCopiado(''); } };
  const tramos = (tipo) => tarifa[tipo].map((x, i) => `${i === 0 ? 'hasta' : x.hasta ? `de ${tarifa[tipo][i - 1].hasta + 1} a` : `${tarifa[tipo][i - 1].hasta + 1} o más:`} ${x.hasta || ''}${x.hasta ? ': ' : ' '}${euros(x.cent)}`).join(' · ');

  return <>
    <section className="grupo" aria-labelledby="ad-clientes">
      <h2 className="grupo-t" id="ad-clientes">Cómo llegan tus clientes</h2>
      <div className="grupo-c relleno">
        <p>Tu código es <b>{despacho.codigo}</b>. Con él, tus clientes tienen 3 meses gratis y te dan acceso a sus cuentas.</p>
        <ul className="desp-registro">
          <li><span>Clientes nuevos: se registran con este enlace</span><button type="button" className="boton sec" onClick={() => copiar(enlaces.registro, 'registro')}>{copiado === 'registro' ? '✓ Copiado' : 'Copiar enlace'}</button></li>
          <li><span>Clientes que ya usan Fisquo: te dan acceso con este</span><button type="button" className="boton sec" onClick={() => copiar(enlaces.existente, 'existente')}>{copiado === 'existente' ? '✓ Copiado' : 'Copiar enlace'}</button></li>
        </ul>
        <p className="nota">Siempre lo decide el cliente, y puede quitarte el acceso cuando quiera en Ajustes › Tu gestoría. Ve todo lo que haces en sus cuentas.</p>
      </div>
    </section>

    {titular && <form className="formulario tarjeta" onSubmit={guardar}>
      <h3>Datos del despacho</h3>
      <label>Nombre<input className="campo" value={d.nombre} maxLength={120} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
      <label>NIF<input className="campo" value={d.nif} maxLength={20} onChange={(e) => setD({ ...d, nif: e.target.value })} /></label>
      <label>Email de contacto<input className="campo" type="email" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={d.soloAsignados} onChange={(e) => setD({ ...d, soloAsignados: e.target.checked })} />
        <span>Cada gestor ve solo sus clientes<small>Los que le asignes en la ficha de cada cliente. El titular los ve todos.</small></span></label>
      {msg && <p role="status" className={msg.startsWith('✓') || msg === 'Guardando…' ? 'nota' : 'error'}>{msg}</p>}
      <button className="boton">Guardar</button>
    </form>}

    {titular && licencias && <section className="grupo" aria-labelledby="ad-lic">
      <h2 className="grupo-t" id="ad-lic">Fisquo incluido en tu cuota</h2>
      <div className="grupo-c relleno">
        <p>Si incluyes Fisquo en lo que cobras a un cliente, tu despacho paga su licencia y el cliente no paga nada a Fisquo. Cada cliente nuevo tiene {diasGratis} días gratis. Se activa en la ficha de cada cliente.</p>
        <table className="desp-licencias">
          <thead><tr><th scope="col">Licencia</th><th scope="col" className="num">Clientes</th><th scope="col" className="num">En días gratis</th><th scope="col" className="num">Al mes</th></tr></thead>
          <tbody>{['aut', 'pym'].map((tipo) => <tr key={tipo}><td>{nombres[tipo]}<br /><small className="nota">{tramos(tipo)} por cliente</small></td><td className="num">{licencias[tipo].total}</td><td className="num">{licencias[tipo].gratis}</td><td className="num">{euros(licencias[tipo].importe)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={3}>Total al mes (sin IVA)</th><td className="num"><b>{euros(licencias.importe)}</b></td></tr></tfoot>
        </table>
        {despacho.cobro?.activo
          ? <p className="nota">Cobro activo: cada día se ajusta el número de licencias. <button type="button" className="boton sec" onClick={() => pagar(true)}>Facturas y tarjeta</button></p>
          : licencias.importe > 0 ? <p><button type="button" className="boton" disabled={!stripe} onClick={() => pagar(false)}>Activar el cobro con tarjeta</button>{!stripe && <small className="nota"> El cobro con tarjeta aún no está activo: te escribiremos para hacerlo a mano.</small>}</p>
            : <p className="nota">Aún no tienes licencias que pagar.</p>}
        {cobro && <p role="status" className={cobro.startsWith('✓') || cobro === 'Abriendo…' ? 'nota' : 'error'}>{cobro}</p>}
      </div>
    </section>}

    <section className="grupo" aria-labelledby="ad-resp">
      <h2 className="grupo-t" id="ad-resp">Quién hace qué</h2>
      <div className="grupo-c relleno">
        <ul>
          <li><b>Fisquo</b> guarda los datos de tus clientes, lee sus tickets y facturas y calcula libros y modelos. Responde de que sus cálculos sigan la norma con los datos apuntados. No presenta impuestos.</li>
          <li><b>Tu despacho</b> revisa, decide y presenta. Lo que cierras queda bloqueado y lo que cambia después, a la vista.</li>
          <li><b>El cliente</b> es dueño de sus datos: decide quién los ve y puede exportarlos o llevárselos cuando quiera.</li>
        </ul>
        <p className="nota">El detalle está en las condiciones de Fisquo. Si necesitas un acuerdo por escrito para tu despacho, escríbenos.</p>
      </div>
    </section>

    <section className="grupo desp-solo-movil" aria-label="Sesión">
      <div className="grupo-c relleno desp-acciones">
        <form method="post" action="/api/despacho/salir?a=empresa"><button className="boton sec">Mi empresa en Fisquo</button></form>
        <form method="post" action="/api/logout"><button className="boton sec">Cerrar sesión</button></form>
      </div>
    </section>
  </>;
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import Link from 'next/link';
import { eur } from '@/lib/formato';

// Elegir albaranes sin facturar de un cliente y hacer con ellos una factura.
export function FacturarAlbaranes({ grupos, hoy, actividades }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState(new Set());
  const [fecha, setFecha] = useState(hoy);
  const [actividad, setActividad] = useState(actividades[0].id);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cliente = grupos.find((g) => g.albaranes.some((a) => elegidos.has(a.id)))?.clave;
  const cambiar = (g, id) => setElegidos((s) => {
    const n = new Set(g.clave === cliente ? s : []);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const total = grupos.flatMap((g) => g.albaranes).filter((a) => elegidos.has(a.id)).reduce((s, a) => s + a.base, 0);
  const facturar = async () => {
    setOcupado(true); setMsg('');
    try {
      const d = await llamar('/api/albaranes', { method: 'POST', body: JSON.stringify({ accion: 'facturar', ids: [...elegidos], fecha, actividad }) });
      navegar(router, `/facturas/${d.factura.id}`, 'fundido');
      router.refresh();
    } catch (e) { setMsg(e.message); setOcupado(false); }
  };
  return (
    <>
      {grupos.map((g) => (
        <section key={g.clave} className="bloque">
          <h2 className="grupo-t">{g.nombre}</h2>
          <ul className="grupo-lista">
            {g.albaranes.map((a) => (
              <li key={a.id} className="alb-fila">
                <input type="checkbox" aria-label={`Elegir ${a.numero}`} checked={elegidos.has(a.id)} onChange={() => cambiar(g, a.id)} />
                <Link href={`/albaranes/${a.id}`} className="fila"><span className="txt"><strong>{a.numero}</strong><small>{a.fecha} · {a.resumen}</small></span><span className="imp">{eur(a.base)}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {elegidos.size > 0 && (
        <div className="tarjeta alb-facturar">
          <div className="dos-col">
            <label>Fecha de la factura<input className="campo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            {actividades.length > 1 && <label>Actividad<select className="campo" value={actividad} onChange={(e) => setActividad(e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
          </div>
          {msg && <p className="error">{msg}</p>}
          <button type="button" className="boton" disabled={ocupado} onClick={facturar}>{ocupado ? 'Facturando…' : `Facturar ${elegidos.size} ${elegidos.size === 1 ? 'albarán' : 'albaranes'} (${eur(total)} sin IVA)`}</button>
        </div>
      )}
    </>
  );
}

// Cerrar (o reabrir) un pedido que ya no se va a servir entero.
export function CerrarPedido({ id, cerrado }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const cambiar = async () => {
    setError('');
    try { await llamar('/api/albaranes', { method: 'POST', body: JSON.stringify({ accion: 'cerrar', id, cerrado: !cerrado }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="boton sec" onClick={cambiar}>{cerrado ? 'Reabrir el pedido' : 'Cerrar el pedido'}</button>{error && <span className="error" role="alert">{error}</span>}</>;
}

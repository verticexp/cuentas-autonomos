'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import '@/app/envios.css';

const cuando = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

// Envía la factura en PDF por email y enseña cada envío con si el cliente lo ha abierto.
export default function EnviarFactura({ id, email, asunto, mensaje, envios = [], editar }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ para: email || '', asunto, mensaje });
  const [estado, setEstado] = useState('');
  const poner = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const enviar = async (e) => {
    e.preventDefault();
    setEstado('enviando');
    try {
      await llamar('/api/facturas/enviar', { method: 'POST', body: JSON.stringify({ id, ...d }) });
      setEstado(''); setAbierto(false); router.refresh();
    } catch (err) { setEstado(err.message); }
  };
  return (
    <section className="envios">
      {editar && !abierto && <button type="button" className="boton sec ancho" onClick={() => setAbierto(true)}>{envios.length ? 'Volver a enviar por email' : 'Enviar por email'}</button>}
      {abierto && (
        <form className="formulario tarjeta" onSubmit={enviar}>
          <label>Para<input className="campo" type="email" required value={d.para} onChange={(e) => poner('para', e.target.value)} placeholder="cliente@empresa.com" /></label>
          <label>Asunto<input className="campo" value={d.asunto} onChange={(e) => poner('asunto', e.target.value)} /></label>
          <label>Mensaje<textarea className="campo" rows={5} value={d.mensaje} onChange={(e) => poner('mensaje', e.target.value)} /></label>
          <p className="envios-nota">Va con la factura en PDF adjunta.</p>
          {estado && estado !== 'enviando' && <p className="error">{estado}</p>}
          <div className="dos-col">
            <button type="button" className="boton sec" onClick={() => setAbierto(false)}>Cancelar</button>
            <button className="boton" disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : 'Enviar'}</button>
          </div>
        </form>
      )}
      {envios.length > 0 && (
        <ul className="envios-lista">
          {[...envios].reverse().map((x) => (
            <li key={x.token}>
              <span>Enviada a {x.para}<small>{cuando(x.fecha)}</small></span>
              <span className={`envio-estado ${x.abierta ? 'ok' : ''}`}>{x.abierta ? `Abierta · ${cuando(x.abierta)}` : 'Sin abrir'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

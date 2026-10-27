'use client';

import { useT } from '@/components/Idioma';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { fechaHora } from '@/lib/formato';
import '@/app/envios.css';

const cuando = fechaHora;

// Envía la factura (o el presupuesto) en PDF por email y enseña cada envío. De las facturas se sabe si el cliente lo ha
// abierto; de los presupuestos, no (seguimiento=false).
// principal: aún no se ha enviado y mandarlo es lo siguiente (botón principal en vez de secundario).
export default function EnviarFactura({ id, email, asunto, mensaje, envios = [], editar, asuntoFijo = false, principal = false, ruta = '/api/facturas/enviar', doc = 'factura', seguimiento = true }) {
  const tr = useT();
  const pres = doc === 'presupuesto';
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ para: email || '', asunto, mensaje });
  const [estado, setEstado] = useState('');
  const poner = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const enviar = async (e) => {
    e.preventDefault();
    setEstado('enviando');
    try {
      await llamar(ruta, { method: 'POST', body: JSON.stringify({ id, ...d }) });
      setEstado(''); setAbierto(false); router.refresh();
    } catch (err) { setEstado(err.message); }
  };
  return (
    <section className="envios">
      {editar && !abierto && <button type="button" className={`boton ancho${principal ? '' : ' sec'}`} onClick={() => setAbierto(true)}>{(envios.length ? tr("Volver a enviar por email") : (principal ? tr("Enviar al cliente por email") : tr("Enviar por email")))}</button>}
      {abierto && (
        <form className="formulario tarjeta" onSubmit={enviar}>
          <label>{tr("Para")}<input className="campo" type="email" required value={d.para} onChange={(e) => poner('para', e.target.value)} placeholder={tr("cliente@empresa.com")} /></label>
          <label>{tr("Asunto")}<input className="campo" value={d.asunto} readOnly={asuntoFijo} onChange={(e) => poner('asunto', e.target.value)} /></label>
          {asuntoFijo && <p className="envios-nota">{tr("Durante la prueba el asunto es el de tu plantilla.")}</p>}
          <label>{tr("Mensaje")}<textarea className="campo" rows={5} value={d.mensaje} onChange={(e) => poner('mensaje', e.target.value)} /></label>
          <p className="envios-nota">{(pres ? tr("Va con el presupuesto en PDF adjunto y un botón para aceptarlo.") : tr("Va con la factura en PDF adjunta."))}</p>
          {estado && estado !== 'enviando' && <p className="error" role="alert">{tr(estado)}</p>}
          <div className="dos-col">
            <button type="button" className="boton sec" onClick={() => setAbierto(false)}>{tr("Cancelar")}</button>
            <button className="boton" disabled={estado === 'enviando'}>{(estado === 'enviando' ? tr("Enviando…") : tr("Enviar"))}</button>
          </div>
        </form>
      )}
      {envios.length > 0 && (
        <ul className="envios-lista">
          {[...envios].reverse().map((x) => (
            <li key={x.token || x.fecha}>
              <span>{(x.tipo === 'recordatorio' ? tr("Recordatorio a") : (pres ? tr("Enviado a") : tr("Enviada a")))} {x.para}<small>{cuando(x.fecha)}</small></span>
              {seguimiento && <span className={`envio-estado ${x.abierta ? 'ok' : ''}`}>{(x.abierta ? tr("Abierta · {v1}", { v1: cuando(x.abierta) }) : tr("Sin abrir"))}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

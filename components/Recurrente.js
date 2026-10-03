'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { llamar } from './Acciones';
import '@/app/recurrentes.css';

// En el detalle de una factura: repetirla cada mes (o ver que ya se repite).
export function RepetirFactura({ factura, dia, existente }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ dia, enviar: false });
  const [estado, setEstado] = useState('');
  if (existente) {
    return <p className="recurrente-aviso">Se repite el día {existente.dia} de cada mes{existente.activa ? '' : ' (en pausa)'} · <Link href="/facturas/recurrentes">Ver recurrentes</Link></p>;
  }
  const crear = async (e) => {
    e.preventDefault();
    setEstado('guardando');
    try { await llamar('/api/recurrentes', { method: 'POST', body: JSON.stringify({ factura, ...d }) }); router.refresh(); } catch (err) { setEstado(err.message); }
  };
  if (!abierto) return <button type="button" className="boton sec ancho recurrente-boton" onClick={() => setAbierto(true)}>Repetir cada mes</button>;
  return (
    <form className="formulario tarjeta recurrente-form" onSubmit={crear}>
      <p className="nota">Se creará una factura igual, con el número siguiente, cada mes a partir del que viene.</p>
      <label>Día del mes<input className="campo" type="number" min="1" max="28" value={d.dia} onChange={(e) => setD((x) => ({ ...x, dia: e.target.value }))} /></label>
      <label className="check"><input type="checkbox" checked={d.enviar} onChange={(e) => setD((x) => ({ ...x, enviar: e.target.checked }))} /> Enviarla por email al cliente</label>
      {estado && estado !== 'guardando' && <p className="error">{estado}</p>}
      <div className="dos-col">
        <button type="button" className="boton sec" onClick={() => setAbierto(false)}>Cancelar</button>
        <button className="boton" disabled={estado === 'guardando'}>Repetir</button>
      </div>
    </form>
  );
}

// En la lista de recurrentes: pausar/reanudar y borrar.
export function AccionesRecurrente({ id, activa }) {
  const router = useRouter();
  const pedir = async (url, opciones) => { try { await llamar(url, opciones); router.refresh(); } catch (e) { alert(e.message); } };
  return (
    <span className="recurrente-acciones">
      <button type="button" className="boton sec pequeno" onClick={() => pedir('/api/recurrentes', { method: 'PATCH', body: JSON.stringify({ id, activa: !activa }) })}>{activa ? 'Pausar' : 'Reanudar'}</button>
      <button type="button" className="borrar" onClick={() => confirm('¿Dejar de repetir esta factura? Las ya creadas no se tocan.') && pedir(`/api/recurrentes?id=${id}`, { method: 'DELETE' })}>Quitar</button>
    </span>
  );
}

'use client';

import { conHuecos } from '@/lib/huecos';
import { useT } from '@/components/Idioma';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { llamar } from './Acciones';
import '@/app/recurrentes.css';

// En el detalle de una factura: repetirla cada mes (o ver que ya se repite).
export function RepetirFactura({ factura, dia, existente }) {
  const tr = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ dia, enviar: false });
  const [estado, setEstado] = useState('');
  if (existente) {
    return <p className="recurrente-aviso">{conHuecos(tr(existente.activa ? 'Se repite el día {dia} de cada mes · {recurrentes}' : 'Se repite el día {dia} de cada mes (en pausa) · {recurrentes}'), { dia: existente.dia, recurrentes: <Link href="/facturas/recurrentes">{tr('Ver recurrentes')}</Link> })}</p>;
  }
  const crear = async (e) => {
    e.preventDefault();
    setEstado('guardando');
    try { await llamar('/api/recurrentes', { method: 'POST', body: JSON.stringify({ factura, ...d }) }); router.refresh(); } catch (err) { setEstado(err.message); }
  };
  if (!abierto) return <button type="button" className="boton sec ancho recurrente-boton" onClick={() => setAbierto(true)}>{tr('Repetir cada mes')}</button>;
  return (
    <form className="formulario tarjeta recurrente-form" onSubmit={crear}>
      <p className="nota">{tr('Se creará una factura igual, con el número siguiente, cada mes a partir del que viene.')}</p>
      <label>{tr('Día del mes')}<input className="campo" type="number" min="1" max="28" value={d.dia} onChange={(e) => setD((x) => ({ ...x, dia: e.target.value }))} /></label>
      <label className="check"><input type="checkbox" checked={d.enviar} onChange={(e) => setD((x) => ({ ...x, enviar: e.target.checked }))} />{(" " + tr('Enviarla por email al cliente'))}</label>
      {estado && estado !== 'guardando' && <p className="error" role="alert">{tr(estado)}</p>}
      <div className="dos-col">
        <button type="button" className="boton sec" onClick={() => setAbierto(false)}>{tr('Cancelar')}</button>
        <button className="boton" disabled={estado === 'guardando'}>{tr('Repetir')}</button>
      </div>
    </form>
  );
}

// En la lista de recurrentes: pausar/reanudar y borrar.
export function AccionesRecurrente({ id, activa }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const pedir = async (url, opciones) => {
    setError(''); try { await llamar(url, opciones); router.refresh(); } catch (e) { setError(e.message); } };
  return (
    <span className="recurrente-acciones">
      <button type="button" className="boton sec pequeno" onClick={() => pedir('/api/recurrentes', { method: 'PATCH', body: JSON.stringify({ id, activa: !activa }) })}>{(activa ? tr('Pausar') : tr('Reanudar'))}</button>
      <button type="button" className="borrar" onClick={async () => (await confirmarAccion({ titulo: tr('Dejar de repetir'), texto: tr('¿Dejar de repetir esta factura? Las ya creadas no se tocan.'), aceptar: tr('Quitar'), peligro: true })) && pedir(`/api/recurrentes?id=${id}`, { method: 'DELETE' })}>{tr('Quitar')}</button>
      {error && <span className="error" role="alert">{tr(error)}</span>}
    </span>
  );
}

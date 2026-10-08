'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';

// Cuota del Impuesto sobre Sociedades de un año (la base del 202 del año siguiente o del otro).
export default function CuotaIS({ anio, valor, uso }) {
  const router = useRouter();
  const [v, setV] = useState(valor === null ? '' : String(valor).replace('.', ','));
  const [msg, setMsg] = useState('');
  const guardar = async (importe) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ cuotaIS: { anio, importe } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  return (
    <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>Cuota del Impuesto sobre Sociedades de {anio}</strong></p>
      <p className="nota">Para {uso}. {valor !== null ? `Guardada: ${eur(valor)}.` : 'Está en tu declaración (modelo 200) o te la da tu gestor.'}</p>
      <div className="fila-act">
        <input className="campo" inputMode="decimal" placeholder="Cuota" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Cuota del Impuesto sobre Sociedades de ${anio}`} />
        <button className="boton sec">Guardar</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </form>
  );
}

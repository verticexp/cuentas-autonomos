'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { tarifaPlana } from '@/lib/cuotas';

export default function Cuotas({ desde }) {
  const router = useRouter();
  const [d, setD] = useState({ importe: String(tarifaPlana(Number(desde.slice(0, 4)))).replace('.', ','), desde });
  const [msg, setMsg] = useState('');
  const enviar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    try {
      const r = await llamar('/api/gastos/cuotas', { method: 'POST', body: JSON.stringify(d) });
      setMsg(`✓ ${r.meses} meses de cuota al día${r.unidas ? ` (${r.unidas} repetidas unidas)` : ''}`);
      router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      <h3>Cuota de autónomos</h3>
      <p className="nota" style={{ margin: 0 }}>Añade la cuota de cada mes como gasto deducible (sin IVA). Si ya estaba (también la que viene del banco), se actualiza, no se duplica. Por defecto, la tarifa plana del año; cámbiala si pagas otra.</p>
      <div className="dos-col">
        <label>Cuota mensual<input className="campo" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} required /></label>
        <label>Desde el mes<input className="campo" type="month" value={d.desde} onChange={(e) => setD({ ...d, desde: e.target.value })} required /></label>
      </div>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{msg}</p>}
      <button className="boton">Añadir cuotas hasta este mes</button>
    </form>
  );
}

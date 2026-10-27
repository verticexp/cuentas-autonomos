'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { tarifaPlana } from '@/lib/cuotas';
import useEnvio from './useEnvio';
import { useT } from '@/components/Idioma';

export default function Cuotas({ desde }) {
  const tr = useT();
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const [d, setD] = useState({ importe: String(tarifaPlana(Number(desde.slice(0, 4)))).replace('.', ','), desde });
  const [msg, setMsg] = useState('');
  const enviar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    try {
      const r = await llamar('/api/gastos/cuotas', { method: 'POST', body: JSON.stringify(d) });
      setMsg(`✓ ${tr('{n} meses de cuota al día', { n: r.meses })}${r.unidas ? ` (${tr('{u} repetidas unidas', { u: r.unidas })})` : ''}`);
      router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="formulario tarjeta" onSubmit={envolver(enviar)}>
      <h3>{tr('Cuota de autónomos')}</h3>
      <p className="nota" style={{ margin: 0 }}>{tr('Añade la cuota de cada mes como gasto deducible (sin IVA). Si ya estaba (también la que viene del banco), se actualiza, no se duplica. Por defecto, la tarifa plana del año; cámbiala si pagas otra.')}</p>
      <div className="dos-col">
        <label>{tr('Cuota mensual')}<input className="campo" inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} required /></label>
        <label>{tr('Desde el mes')}<input className="campo" type="month" value={d.desde} onChange={(e) => setD({ ...d, desde: e.target.value })} required /></label>
      </div>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'} role={msg.startsWith('✓') ? 'status' : 'alert'}>{tr(msg)}</p>}
      <button className="boton" disabled={enviando}>{tr('Añadir cuotas hasta este mes')}</button>
    </form>
  );
}

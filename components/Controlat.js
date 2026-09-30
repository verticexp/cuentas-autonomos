'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

export default function Controlat({ activo }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const cambiar = async (activar) => {
    setMsg(activar ? 'Enviando…' : '');
    try {
      const r = await llamar('/api/controlat', { method: 'POST', body: JSON.stringify({ activar }) });
      setMsg(r.activo ? `✓ Enviados ${r.meses} meses a Controla'T` : '');
      router.refresh();
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="formulario tarjeta bloque">
      <h3>Nómina en Controla'T</h3>
      <p className="nota" style={{ margin: 0 }}>Cada mes pasa a Controla'T un ingreso «Nómina autónomo» con tu neto: lo facturado, menos los gastos puntuales del mes y menos el 20 % de IRPF sobre el beneficio (facturado − gastos). La cuota de autónomos no se resta: métela como gasto fijo en Controla'T. Se actualiza solo al crear, editar o borrar facturas y gastos.</p>
      <label className="check"><input type="checkbox" checked={activo} onChange={(e) => cambiar(e.target.checked)} /> Enviar mi neto mensual a Controla'T</label>
      {msg && <p className={msg.startsWith('✓') || msg.endsWith('…') ? 'nota' : 'error'}>{msg}</p>}
    </div>
  );
}

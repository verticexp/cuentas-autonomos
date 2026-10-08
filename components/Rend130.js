'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';

// Rendimiento neto de la actividad del año anterior: si fue de 12.000 € o menos, el 130 resta hasta 100 € cada trimestre
// (casilla 13). Netto sugiere el suyo, pero solo vale si ese año está entero en Netto: lo confirma la persona.
export default function Rend130({ anio, valor, sugerido, minoracion }) {
  const router = useRouter();
  const [v, setV] = useState(valor === null ? '' : String(valor).replace('.', ','));
  const [msg, setMsg] = useState('');
  const guardar = async (importe) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ rend130: { anio, importe } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={(e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>¿Cuánto ganaste con tu actividad en {anio}?</strong> Si fueron 12.000 € o menos, cada trimestre restas hasta 100 € del 130 (casilla 13).</p>
      {valor !== null
        ? <p className="nota">Guardado: {eur(valor)}. {minoracion ? `Restas ${eur(minoracion)} cada trimestre.` : 'Pasa de 12.000 €: no hay minoración.'}</p>
        : sugerido !== null && <p className="nota">Con lo que hay en Netto de {anio} sale {eur(sugerido)}. Si ese año no está entero aquí, pon el rendimiento neto de tu declaración de la renta.</p>}
      <div className="fila-act">
        <input className="campo" inputMode="decimal" placeholder={sugerido !== null ? String(sugerido).replace('.', ',') : 'Rendimiento neto'} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Rendimiento neto de ${anio}`} />
        <button className="boton sec">Guardar</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';

// Rendimiento neto de la actividad del año anterior: si fue de 12.000 € o menos, el 130 resta hasta 100 € cada trimestre
// (casilla 13). Fisquo sugiere el suyo, pero solo vale si ese año está entero en Fisquo: lo confirma la persona.
// modelo: '130' o '131' (en módulos la misma minoración va en la casilla 09).
// texto: otra explicación (en territorio foral, el rendimiento del penúltimo año es la base del pago fraccionado).
export default function Rend130({ anio, valor, sugerido, minoracion, soloLectura = false, modelo = '130', texto }) {
  const router = useRouter();
  const [v, setV] = useState(valor === null ? '' : String(valor).replace('.', ','));
  const [msg, setMsg] = useState('');
  const guardar = async (importe) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ rend130: { anio, importe } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  const Caja = soloLectura ? 'div' : 'form';
  return (
    <Caja className="formulario tarjeta bloque" onSubmit={soloLectura ? undefined : (e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>¿Cuánto ganaste con tu actividad en {anio}?</strong> {texto || `Si fueron 12.000 € o menos, cada trimestre restas hasta 100 € del ${modelo} (casilla ${modelo === '131' ? '09' : '13'}).`}</p>
      {valor !== null
        ? <p className="nota">Guardado: {eur(valor)}.{texto ? '' : minoracion ? ` Restas ${eur(minoracion)} cada trimestre.` : ' Pasa de 12.000 €: no hay minoración.'}</p>
        : sugerido !== null && <p className="nota">Con lo que hay en Fisquo de {anio} sale {eur(sugerido)}. Si ese año no está entero aquí, pon el rendimiento neto de tu declaración de la renta.</p>}
      {soloLectura ? <p className="nota">Lo cambia quien tiene el permiso «Contabilidad».</p> : <div className="fila-act">
        <input className="campo" inputMode="decimal" placeholder={sugerido !== null ? String(sugerido).replace('.', ',') : 'Rendimiento neto'} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Rendimiento neto de ${anio}`} />
        <button className="boton sec">Guardar</button>
      </div>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </Caja>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';

// Un importe de un año que guarda la empresa en /api/cuenta (cuotaIS, binsPrevias o fondosPropios).
// anioEditable: el año también se escribe (bases negativas de antes de Fisquo).
export function ImporteAnio({ campo, anio, valor, titulo, ayuda, sugerido = null, textoSugerido, soloLectura = false, anioEditable = false, etiqueta = 'Importe' }) {
  const router = useRouter();
  const [v, setV] = useState(valor === null || valor === undefined ? '' : String(valor).replace('.', ','));
  const [y, setY] = useState(anio ? String(anio) : '');
  const [msg, setMsg] = useState('');
  const guardar = async (importe) => {
    setMsg('');
    const a = Number(y);
    if (!Number.isInteger(a)) { setMsg('Escribe el año'); return; }
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ [campo]: { anio: a, importe } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  const Caja = soloLectura ? 'div' : 'form';
  return (
    <Caja className="formulario tarjeta" onSubmit={soloLectura ? undefined : (e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>{titulo}</strong></p>
      <p className="nota">{ayuda}{valor !== null && valor !== undefined ? ` Guardado: ${eur(valor)}.` : ''}</p>
      {sugerido !== null && sugerido !== undefined && <p className="nota">{textoSugerido || 'Con lo que hay en Fisquo sale'} {eur(sugerido)}.{!soloLectura && sugerido !== valor && <> <button type="button" className="enlace" onClick={() => { setV(String(sugerido).replace('.', ',')); guardar(String(sugerido)); }}>Usar este importe</button></>}</p>}
      {soloLectura ? <p className="nota">Lo cambia quien tiene el permiso «Contabilidad».</p> : <div className="fila-act">
        {anioEditable && <input className="campo" inputMode="numeric" placeholder="Año" value={y} onChange={(e) => setY(e.target.value)} aria-label="Año" />}
        <input className="campo" inputMode="decimal" placeholder={etiqueta} value={v} onChange={(e) => setV(e.target.value)} aria-label={`${titulo}: ${etiqueta.toLowerCase()}`} />
        <button className="boton sec">Guardar</button>
      </div>}
      {msg && <p className="error">{msg}</p>}
    </Caja>
  );
}

// Base del 202 de la modalidad del art. 40.2 LIS: la «cuota del ejercicio a ingresar o devolver» del Impuesto sobre
// Sociedades de un año (cuota íntegra menos deducciones, bonificaciones y retenciones, sin restar los pagos del 202; casilla
// «Resultado» del 200). sugerido: lo que sale del borrador de ese año en Fisquo (cuota − retenciones).
// foral: el pago fraccionado de Navarra (S-91), con su propia base: la cuota, como antes.
export default function CuotaIS({ anio, valor, uso, soloLectura = false, sugerido = null, foral = false }) {
  if (foral) return <ImporteAnio campo="cuotaIS" anio={anio} valor={valor} soloLectura={soloLectura} etiqueta="Cuota" titulo={`Cuota del Impuesto sobre Sociedades de ${anio}`} ayuda={`Para ${uso}. Está en tu declaración o te la da tu gestor.`} />;
  return (
    <ImporteAnio campo="cuotaIS" anio={anio} valor={valor} soloLectura={soloLectura} sugerido={sugerido} etiqueta="Cuota"
      titulo={`Cuota del ejercicio a ingresar o devolver de ${anio}`}
      textoSugerido={`Con lo que hay en Fisquo de ${anio} (cuota menos retenciones) sale`}
      ayuda={`Para ${uso}. Es la cuota íntegra menos deducciones, bonificaciones y retenciones (sin restar los pagos del 202): está en tu declaración (modelo 200) o te la da tu gestor.`} />
  );
}

'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur, fechaTexto } from '@/lib/formato';
import '@/app/cobro.css';

const VIA = { stripe: ' con tarjeta o Bizum', banco: ' por el banco', sepa: ' por remesa' };
const aTexto = (n) => String(n).replace('.', ',');

// Cobrar una factura desde su ficha. Un toque la cobra entera con la fecha de hoy; «Cambiar fecha o importe» abre un
// formulario para otra fecha o un cobro parcial. Ya cobrada, dice cuándo y deja «Deshacer» (si se cobró a mano).
// deshacer: 'cobrada' | 'parcial' | null (lib/cobroManual.js deshacerDe). hoy y desde: AAAA-MM-DD (límites de la fecha).
export default function Cobro({ id, cobrada, total, pagado, pendiente, cobro, deshacer, hoy, desde }) {
  const router = useRouter();
  const pref = useId();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [importe, setImporte] = useState(aTexto(pendiente));

  const enviar = async (cuerpo) => {
    if (ocupado) return;
    setOcupado(true); setError('');
    try {
      await llamar('/api/facturas', { method: 'PATCH', body: JSON.stringify({ id, ...cuerpo }) });
      navigator.vibrate?.(8);
      setAbierto(false);
      router.refresh();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  const cobrarTodo = () => enviar({ accion: 'cobrar' });
  const cobrarConDatos = (e) => { e.preventDefault(); enviar({ accion: 'cobrar', fecha, importe }); };
  const quitar = () => enviar({ accion: 'deshacer' });

  if (cobrada) {
    return (
      <div className="cobro cobro-hecho">
        <p className="cobro-texto">✓ Cobrada{cobro?.fecha ? ` el ${fechaTexto(cobro.fecha.slice(0, 10))}` : ''}{VIA[cobro?.metodo] || ''}</p>
        {deshacer === 'cobrada' && <button type="button" className="cobro-enlace" disabled={ocupado} onClick={quitar}>Deshacer</button>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="cobro">
      {pagado > 0 && <p className="cobro-parcial">Cobrado {eur(pagado)} de {eur(total)} · faltan <strong>{eur(pendiente)}</strong></p>}
      <button type="button" className="cobro-boton" disabled={ocupado} onClick={cobrarTodo}>
        {ocupado ? 'Cobrando…' : pagado > 0 ? `✓ Cobrar lo que falta (${eur(pendiente)})` : '✓ Marcar como cobrada'}
      </button>
      <div className="cobro-menores">
        {pendiente > 0 && <button type="button" className="cobro-enlace" aria-expanded={abierto} aria-controls={`${pref}-form`} onClick={() => setAbierto((v) => !v)}>Cambiar fecha o importe</button>}
        {deshacer === 'parcial' && <button type="button" className="cobro-enlace" disabled={ocupado} onClick={quitar}>Deshacer el último cobro</button>}
      </div>
      {abierto && (
        <form id={`${pref}-form`} className="cobro-form" onSubmit={cobrarConDatos}>
          <label>¿Cuándo la cobraste?<input className="campo" type="date" value={fecha} min={desde} max={hoy} required onChange={(e) => setFecha(e.target.value)} /></label>
          <label>Importe cobrado (€)<input className="campo" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} required /></label>
          <p className="nota">Si cobras menos de lo que falta, la factura sigue pendiente por el resto.</p>
          <div className="cobro-form-botones">
            <button className="boton" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Registrar cobro'}</button>
            <button type="button" className="boton sec" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

'use client';

import { useT } from '@/components/Idioma';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur, fechaTexto } from '@/lib/formato';
import { vibrar } from '@/lib/haptica';
import '@/app/cobro.css';

const VIA = { stripe: ' con tarjeta o Bizum', banco: ' por el banco', sepa: ' por remesa', efectivo: ' en efectivo' };
const aTexto = (n) => String(n).replace('.', ',');

// Cobrar una factura desde su ficha. Un toque la cobra entera con la fecha de hoy; «Cambiar fecha, importe o forma» abre un
// formulario para otra fecha, un cobro parcial o un cobro en efectivo (cuenta para el 347, lib/cobroManual.js FORMAS_COBRO).
// formaInicial: 'efectivo' si la factura se cobra en efectivo (su forma de cobro); si no, ''. Ya cobrada, dice cuándo y deja «Deshacer» (si se cobró a mano).
// deshacer: 'cobrada' | 'parcial' | null (lib/cobroManual.js deshacerDe). hoy y desde: AAAA-MM-DD (límites de la fecha).
// secundario: la factura aún no se ha enviado y lo principal es mandarla (auditoría U-10); cobrar sigue a mano, en suave.
export default function Cobro({ id, cobrada, total, pagado, pendiente, cobro, deshacer, hoy, desde, secundario = false, formaInicial = '' }) {
  const tr = useT();
  const router = useRouter();
  const pref = useId();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [importe, setImporte] = useState(aTexto(pendiente));
  const [forma, setForma] = useState(formaInicial);

  const enviar = async (cuerpo) => {
    if (ocupado) return;
    setOcupado(true); setError('');
    try {
      await llamar('/api/facturas', { method: 'PATCH', body: JSON.stringify({ id, ...cuerpo }) });
      vibrar('exito');
      setAbierto(false);
      router.refresh();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  const cobrarTodo = () => enviar({ accion: 'cobrar', ...(formaInicial ? { forma: formaInicial } : {}) });
  const cobrarConDatos = (e) => { e.preventDefault(); enviar({ accion: 'cobrar', fecha, importe, forma }); };
  const quitar = () => enviar({ accion: 'deshacer' });

  if (cobrada) {
    return (
      <div className="cobro cobro-hecho">
        <p className="cobro-texto">{tr("✓ Cobrada")}{(cobro?.fecha ? (" " + tr("el {v1}", { v1: fechaTexto(cobro.fecha.slice(0, 10)) })) : "")}{VIA[cobro?.metodo] ? ' ' + tr(VIA[cobro.metodo].trim()) : ''}</p>
        {deshacer === 'cobrada' && <button type="button" className="cobro-enlace" disabled={ocupado} onClick={quitar}>{tr("Deshacer")}</button>}
        {error && <p className="error" role="alert">{tr(error)}</p>}
      </div>
    );
  }
  return (
    <div className="cobro">
      {pagado > 0 && <p className="cobro-parcial">{(tr("Cobrado") + " ")}{eur(pagado)}{(" " + tr("de") + " ")}{eur(total)}{(" " + tr("· faltan") + " ")}<strong>{eur(pendiente)}</strong></p>}
      <button type="button" className={`cobro-boton${secundario ? ' sec' : ''}`} disabled={ocupado} onClick={cobrarTodo}>
        {(ocupado ? tr("Cobrando…") : (pagado > 0 ? tr("✓ Cobrar lo que falta ({v1})", { v1: eur(pendiente) }) : tr("✓ Marcar como cobrada")))}
      </button>
      <div className="cobro-menores">
        {pendiente > 0 && <button type="button" className="cobro-enlace" aria-expanded={abierto} aria-controls={`${pref}-form`} onClick={() => setAbierto((v) => !v)}>{tr("Cambiar fecha, importe o forma")}</button>}
        {deshacer === 'parcial' && <button type="button" className="cobro-enlace" disabled={ocupado} onClick={quitar}>{tr("Deshacer el último cobro")}</button>}
      </div>
      {abierto && (
        <form id={`${pref}-form`} className="cobro-form" onSubmit={cobrarConDatos}>
          <label>{tr("¿Cuándo la cobraste?")}<input className="campo" type="date" value={fecha} min={desde} max={hoy} required onChange={(e) => setFecha(e.target.value)} /></label>
          <label>{tr("Importe cobrado (€)")}<input className="campo" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} required /></label>
          <label>{tr("¿Cómo te pagó?")}<select className="campo" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">{tr("Transferencia, tarjeta u otra forma")}</option>
            <option value="efectivo">{tr("Efectivo")}</option>
          </select></label>
          {forma === 'efectivo' && <p className="nota">{tr("Si en el año cobras a un cliente más de 6.000 € en efectivo, el 347 lo declara aparte.")}</p>}
          <p className="nota">{tr("Si cobras menos de lo que falta, la factura sigue pendiente por el resto.")}</p>
          <div className="cobro-form-botones">
            <button className="boton" disabled={ocupado}>{(ocupado ? tr("Guardando…") : tr("Registrar cobro"))}</button>
            <button type="button" className="boton sec" onClick={() => setAbierto(false)}>{tr("Cancelar")}</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}

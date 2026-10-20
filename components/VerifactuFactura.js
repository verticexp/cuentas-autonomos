'use client';

import { pedirTexto } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { volverA } from '@/lib/transicion';

// En la ficha de una factura con Verifactu: subsanar un registro rechazado o aceptado con errores (corrigiendo el
// cliente) y anular el registro de una factura expedida por error.
export default function VerifactuFactura({ factura, admin }) {
  const router = useRouter();
  const v = factura.verifactu;
  const [cliente, setCliente] = useState({ nombre: factura.cliente.nombre || '', nif: factura.cliente.nif || '' });
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const subsanable = ['Incorrecto', 'AceptadoConErrores'].includes(v.estado);
  const hacer = async (cuerpoPeticion, despues) => {
    setOcupado(true); setMsg('');
    try { await llamar('/api/facturas/verifactu', { method: 'POST', body: JSON.stringify(cuerpoPeticion) }); despues(); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  const anular = async () => {
    const motivo = await pedirTexto({ titulo: 'Anular el registro', etiqueta: 'Motivo de anulación', aceptar: 'Anular registro', peligro: true, texto: 'Anular el registro solo si la factura se expidió por error (no existió). Si existió y estaba mal, haz una rectificativa.\n\n¿Por qué se anula?' });
    if (motivo) hacer({ accion: 'anular', id: factura.id, motivo }, () => { volverA(router, '/facturas'); router.refresh(); });
  };
  return (
    <section className="bloque">
      {subsanable && (
        <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); hacer({ accion: 'subsanar', id: factura.id, cliente }, () => router.refresh()); }}>
          <h3>Subsanar el registro</h3>
          <p className="nota">{v.estado === 'Incorrecto' ? 'La AEAT lo ha rechazado' : 'La AEAT lo ha aceptado con errores'}{v.codigo ? ` (código ${v.codigo})` : ''}{v.error ? `: ${v.error}` : ''}. Corrige los datos del cliente y se enviará otra vez como subsanación. Si lo que está mal son los importes o los conceptos, haz una rectificativa.</p>
          <div className="dos-col">
            <label>Cliente<input className="campo" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} required /></label>
            <label>NIF<input spellCheck={false} autoCorrect="off" autoCapitalize="characters" className="campo" value={cliente.nif} onChange={(e) => setCliente({ ...cliente, nif: e.target.value })} required /></label>
          </div>
          <button className="boton" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Subsanar y reenviar'}</button>
        </form>
      )}
      {v.subsanaciones > 0 && <p className="nota">Subsanada {v.subsanaciones === 1 ? 'una vez' : `${v.subsanaciones} veces`}.</p>}
      {admin && <button type="button" className="borrar" disabled={ocupado} onClick={anular}>Anular el registro (factura expedida por error)</button>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}

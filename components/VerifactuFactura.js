'use client';

import { useT } from '@/components/Idioma';

import { pedirTexto } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { volverA } from '@/lib/transicion';

// En la ficha de una factura con Verifactu: subsanar un registro rechazado o aceptado con errores (corrigiendo el
// cliente) y anular el registro de una factura expedida por error.
export default function VerifactuFactura({ factura, admin }) {
  const tr = useT();
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
    const motivo = await pedirTexto({ titulo: tr("Anular el registro"), etiqueta: tr("Motivo de anulación"), aceptar: tr("Anular registro"), peligro: true, texto: tr(`Anular el registro solo si la factura se expidió por error (no existió). Si existió y estaba mal, haz una rectificativa.

¿Por qué se anula?`) });
    if (motivo) hacer({ accion: 'anular', id: factura.id, motivo }, () => volverA(router, '/facturas', 'atras', true));
  };
  return (
    <section className="bloque">
      {subsanable && (
        <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); hacer({ accion: 'subsanar', id: factura.id, cliente }, () => router.refresh()); }}>
          <h3>{tr("Subsanar el registro")}</h3>
          <p className="nota">{(v.estado === 'Incorrecto' ? tr("La AEAT lo ha rechazado") : tr("La AEAT lo ha aceptado con errores"))}{(v.codigo ? (" " + tr("(código {v1})", { v1: v.codigo })) : "")}{(v.error ? `: ${tr(v.error)}` : "")}{tr(". Corrige los datos del cliente y se enviará otra vez como subsanación. Si lo que está mal son los importes o los conceptos, haz una rectificativa.")}</p>
          <div className="dos-col">
            <label>{tr("Cliente")}<input className="campo" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} required /></label>
            <label>NIF<input spellCheck={false} autoCorrect="off" autoCapitalize="characters" className="campo" value={cliente.nif} onChange={(e) => setCliente({ ...cliente, nif: e.target.value })} required /></label>
          </div>
          <button className="boton" disabled={ocupado}>{(ocupado ? tr("Enviando…") : tr("Subsanar y reenviar"))}</button>
        </form>
      )}
      {v.subsanaciones > 0 && <p className="nota">{(tr("Subsanada") + " ")}{(v.subsanaciones === 1 ? tr("una vez") : tr("{v1} veces", { v1: v.subsanaciones }))}.</p>}
      {admin && <button type="button" className="borrar" disabled={ocupado} onClick={anular}>{tr("Anular el registro (factura expedida por error)")}</button>}
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
    </section>
  );
}

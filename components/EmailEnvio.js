'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { CAMPOS_PLANTILLA, asuntoFactura, mensajeFactura } from '@/lib/plantillaEnvio.js';

const EJEMPLO = {
  importada: '2026-015', numero: 15, anio: 2026, fecha: '2026-10-01',
  cliente: { nombre: 'Cliente Ejemplo S.L.' }, base: 1000, ivaPct: 21, irpfPct: 0,
};

export default function EmailEnvio({ inicial = {}, empresa = {} }) {
  const router = useRouter();
  const [datos, setDatos] = useState(() => ({ asunto: inicial?.asunto || '', mensaje: inicial?.mensaje || '', firma: inicial?.firma || '' }));
  const [msg, setMsg] = useState('');
  const guardando = msg === 'Guardando…';
  const emisor = { ...empresa, plazo: 30 };
  const poner = (campo, valor) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setMsg('');
  };
  const guardar = async (e) => {
    e.preventDefault();
    if (guardando) return;
    setMsg('Guardando…');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ envio: datos }) });
      setMsg('Guardado');
      router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="formulario tarjeta" onSubmit={guardar}>
      <h3>Email de las facturas</h3>
      <label>Asunto<input className="campo" value={datos.asunto} placeholder={asuntoFactura(EJEMPLO, emisor)} disabled={guardando} onChange={(e) => poner('asunto', e.target.value)} /></label>
      <label>Mensaje<textarea className="campo" rows={6} value={datos.mensaje} placeholder={mensajeFactura(EJEMPLO, emisor)} disabled={guardando} onChange={(e) => poner('mensaje', e.target.value)} /></label>
      <label>Firma<textarea className="campo" rows={3} value={datos.firma} placeholder={emisor.nombre || 'Nombre de la empresa'} disabled={guardando} onChange={(e) => poner('firma', e.target.value)} /></label>
      <p className="nota">Deja los campos vacíos para usar los textos por defecto. Puedes usar estos marcadores:</p>
      <ul className="nota">
        {CAMPOS_PLANTILLA.map(([campo, explicacion]) => <li key={campo}><code>{campo}</code>: {explicacion}</li>)}
      </ul>
      <section aria-label="Vista previa del email" style={{ overflowWrap: 'anywhere' }}>
        <h4>Vista previa</h4>
        <p className="nota">Factura de ejemplo · vencimiento a 30 días</p>
        <p><strong>Asunto:</strong> {asuntoFactura(EJEMPLO, emisor, datos)}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{mensajeFactura(EJEMPLO, emisor, datos)}</p>
      </section>
      {msg && <p role="status" className={msg === 'Guardado' ? 'nota guardado' : guardando ? 'nota' : 'error'}>{msg === 'Guardado' ? '✓ Guardado' : msg}</p>}
      <button className="boton" disabled={guardando}>Guardar</button>
      <button type="button" className="boton sec" disabled={guardando} onClick={() => { setDatos({ asunto: '', mensaje: '', firma: '' }); setMsg(''); }}>Volver a los textos por defecto</button>
    </form>
  );
}

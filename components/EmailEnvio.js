'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { CAMPOS_PLANTILLA, asuntoFactura, mensajeFactura } from '@/lib/plantillaEnvio.js';
import { useT } from '@/components/Idioma';

const EJEMPLO = {
  importada: '2026-015', numero: 15, anio: 2026, fecha: '2026-10-01',
  cliente: { nombre: 'Cliente Ejemplo S.L.' }, base: 1000, ivaPct: 21, irpfPct: 0,
};

export default function EmailEnvio({ inicial = {}, empresa = {} }) {
  const tr = useT();
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
    <form className="formulario aj-form" onSubmit={guardar}>
      <h3 aria-level={2}>{tr('Email de las facturas')}</h3>
      <div className="aj-grupo">
        <label>{tr('Asunto')}<input className="campo" value={datos.asunto} placeholder={asuntoFactura(EJEMPLO, emisor)} disabled={guardando} onChange={(e) => poner('asunto', e.target.value)} /></label>
        <label>{tr('Mensaje')}<textarea className="campo" rows={6} value={datos.mensaje} placeholder={mensajeFactura(EJEMPLO, emisor)} disabled={guardando} onChange={(e) => poner('mensaje', e.target.value)} /></label>
        <label>{tr('Firma')}<textarea className="campo" rows={3} value={datos.firma} placeholder={emisor.nombre || tr('Nombre de la empresa')} disabled={guardando} onChange={(e) => poner('firma', e.target.value)} /></label>
      </div>
      <p className="nota aj-pie">{tr('Deja los campos vacíos para usar los textos por defecto. Puedes usar estos marcadores:')}</p>
      <ul className="nota aj-pie">
        {CAMPOS_PLANTILLA.map(([campo, explicacion]) => <li key={campo}><code>{campo}</code>: {tr(explicacion)}</li>)}
      </ul>
      <section className="aj-vista-previa" aria-label={tr('Vista previa del email')} style={{ overflowWrap: 'anywhere' }}>
        <h4>{tr('Vista previa')}</h4>
        <p className="nota">{tr('Factura de ejemplo · vencimiento a 30 días')}</p>
        <p><strong>{tr('Asunto:')}</strong> {asuntoFactura(EJEMPLO, emisor, datos)}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{mensajeFactura(EJEMPLO, emisor, datos)}</p>
      </section>
      {msg && <p role="status" className={msg === 'Guardado' ? 'nota aj-pie guardado' : guardando ? 'nota aj-pie' : 'error aj-pie'}>{msg === 'Guardado' ? tr('✓ Guardado') : tr(msg)}</p>}
      <button className="boton" disabled={guardando}>{tr('Guardar')}</button>
      <button type="button" className="boton sec" disabled={guardando} onClick={() => { setDatos({ asunto: '', mensaje: '', firma: '' }); setMsg(''); }}>{tr('Volver a los textos por defecto')}</button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';

// Lo que Fisquo no puede saber de las cuentas anuales: administradores, datos registrales, fechas y retoques de la memoria.
// memoria: { n: texto actual }; borrador: { n: texto que propone Fisquo }; secciones: [[n, título]]
export default function CuentasAnuales({ anio, datos, memoria, borrador, secciones }) {
  const tr = useT();
  const router = useRouter();
  const [x, setX] = useState({ ...datos, memoria: { ...memoria } });
  const [estado, setEstado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k) => (e) => { setX({ ...x, [k]: e.target.value }); setEstado(''); };
  const ponerMem = (n, v) => { setX({ ...x, memoria: { ...x.memoria, [n]: v } }); setEstado(''); };

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true); setEstado('');
    // Lo que coincide con el borrador no se guarda: así sigue al día si cambian las cifras.
    const mem = Object.fromEntries(Object.entries(x.memoria).filter(([n, v]) => v.trim() && v.trim() !== String(borrador[n]).trim()));
    try {
      await llamar('/api/cuentas-anuales', { method: 'POST', body: JSON.stringify({ ...x, anio, memoria: mem }) });
      setEstado('✓ Guardado');
      router.refresh();
    } catch (err) { setEstado(err.message); }
    setEnviando(false);
  };

  return (
    <form className="formulario tarjeta ca-form" onSubmit={guardar}>
      <h3>{tr('Datos para el Registro')}</h3>
      <label className="asiento-campo">{tr('Administradores (uno por línea, con su cargo)')}<textarea className="campo" rows={2} placeholder={tr('Laura Puig Ferrer, administradora única')} value={x.administradores} onChange={poner('administradores')} /></label>
      <label className="asiento-campo">{tr('Datos registrales')}<input className="campo" placeholder={tr('Registro Mercantil de Barcelona, tomo, folio, hoja')} value={x.registro} onChange={poner('registro')} /></label>
      <div className="dos-col">
        <label className="asiento-campo">{tr('Formulación')}<input className="campo" type="date" value={x.formulacion} onChange={poner('formulacion')} /></label>
        <label className="asiento-campo">{tr('Junta de socios')}<input className="campo" type="date" value={x.junta} onChange={poner('junta')} /></label>
      </div>
      <h3 className="ca-memoria-t">{tr('Memoria')}</h3>
      <p className="nota">{tr('Fisquo la rellena con tus cifras. Revisa lo que está entre corchetes y cambia lo que quieras; si borras una sección, vuelve la de Fisquo.')}</p>
      {secciones.map(([n, t]) => (
        <details key={n} className="ca-seccion">
          <summary>{n}. {tr(t)}{x.memoria[n].includes('[') ? <span className="ca-falta"> · {tr('por revisar')}</span> : ''}</summary>
          <textarea className="campo" rows={6} aria-label={tr('Memoria: {n}. {titulo}', { n, titulo: tr(t) })} value={x.memoria[n]} onChange={(e) => ponerMem(n, e.target.value)} />
          {x.memoria[n].trim() !== String(borrador[n]).trim() && <button type="button" className="boton sec pequeno" onClick={() => ponerMem(n, borrador[n])}>{tr('Volver al texto de Fisquo')}</button>}
        </details>
      ))}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando}>{enviando ? tr('Guardando…') : tr('Guardar')}</button>
        {estado && <span className="nota">{tr(estado)}</span>}
      </div>
    </form>
  );
}

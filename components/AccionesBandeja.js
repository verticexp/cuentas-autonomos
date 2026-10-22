'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmar } from './Confirmar';

const llamar = async (accion, id) => {
  const r = await fetch('/api/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, id }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido hacer');
  return d;
};

// En la revisión de una factura de la bandeja: descartarla o volver a leerla.
export function AccionesDocumento({ id, estado, remitente = '' }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const hacer = async (accion) => {
    if (accion === 'deshacer' && !(await confirmar({ titulo: 'Deshacer', texto: 'Se borra el gasto que se guardó solo y la factura vuelve a «Por revisar».', aceptar: 'Deshacer', peligro: true }))) return;
    if (accion === 'descartar' && !(await confirmar({ titulo: 'Descartar factura', texto: estado === 'aprobado' ? 'Se quita de la bandeja; el gasto ya guardado no se toca.' : 'Se quita de la bandeja y se borra su archivo.', aceptar: 'Descartar', peligro: true }))) return;
    setOcupado(true); setError('');
    try {
      await llamar(accion, id);
      if (accion === 'descartar') router.push('/gastos/bandeja');
      router.refresh();
    } catch (e) { setError(e.message); }
    setOcupado(false);
  };
  return (
    <div className="gasto-guardar">
      {['error', 'revisar', 'cuarentena'].includes(estado) && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('releer')}>{estado === 'cuarentena' ? 'Leerla con IA' : 'Leer otra vez'}</button>}
      {estado === 'aprobado' && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('deshacer')}>Deshacer: borrar el gasto y revisarla</button>}
      {estado === 'cuarentena' && remitente && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('permitir')}>Permitir siempre a {remitente}</button>}
      {estado !== 'leyendo' && <button type="button" className="boton sec" disabled={ocupado} onClick={() => hacer('descartar')}>{estado === 'aprobado' ? 'Quitar de la bandeja' : 'Descartar'}</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// Mientras se lee: se pregunta cada pocos segundos y, al terminar, se recarga con lo leído.
export function EsperarLectura({ id }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const d = await (await fetch('/api/bandeja', { cache: 'no-store' })).json();
        const doc = d.documentos?.find((x) => x.id === id);
        if (!doc || doc.estado !== 'leyendo') { clearInterval(t); router.refresh(); }
      } catch { /* se reintenta */ }
    }, 3000);
    return () => clearInterval(t);
  }, [id, router]);
  return <p className="nota" role="status">Leyendo la factura… En unos segundos aparecen aquí los datos para revisarlos.</p>;
}

// En la página del proveedor: que sus facturas de la bandeja que cuadran se aprueben solas.
export function ConfianzaProveedor({ clave, proveedor, proveedorNif, inicial = false }) {
  const [activo, setActivo] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const cambiar = async (v) => {
    setOcupado(true); setError('');
    try {
      const r = await fetch('/api/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'confianza', clave, proveedor, proveedorNif, activo: v }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se ha podido guardar');
      setActivo(v);
    } catch (e) { setError(e.message); }
    setOcupado(false);
  };
  return (
    <div className="bloque">
      <label className="gasto-pendiente"><input type="checkbox" checked={activo} disabled={ocupado} onChange={(e) => cambiar(e.target.checked)} />Aprobar solas sus facturas de la bandeja cuando cuadren</label>
      <p className="nota">Solo las que cuadran (base, IVA y total coinciden, fecha clara, un tipo de IVA y sin posibles duplicados), con la clasificación de su último gasto. Se ven un mes en la bandeja por si quieres deshacerlo.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

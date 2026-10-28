'use client';

import { useT } from '@/components/Idioma';

import { useRef, useState } from 'react';
import { llamar } from './Acciones';
import { preparar, subir } from '@/lib/justificanteCliente';

// Botones de la vista previa de un documento (components/VistaDocumento.js) según quién mira: el despacho le pide el
// ticket al cliente; el cliente lo sube ahí mismo (una foto o un PDF) y la petición queda entregada.
// d: lo que devuelve la vista previa; empresa: el cliente (lado del despacho); alHacer: cerrar y recargar.
export default function AccionesDocumento({ d, lado, empresa, alHacer }) {
  const tr = useT();
  const [estado, setEstado] = useState('');
  const sinTicket = d.tipo === 'gasto' && !d.archivo;
  if (!sinTicket) return null;
  if (lado === 'despacho') {
    const pedir = async () => {
      setEstado('Pidiendo…');
      try { await llamar('/api/despacho/peticiones', { method: 'POST', body: JSON.stringify({ empresa, tipo: 'ticket', gasto: d.id }) }); alHacer(); } catch (e) { setEstado(e.message); }
    };
    return <><button type="button" className="boton" disabled={estado === 'Pidiendo…'} onClick={pedir}>{tr('Pedir el ticket')}</button>{estado && estado !== 'Pidiendo…' && <p className="error" role="alert">{tr(estado)}</p>}</>;
  }
  return <SubirArchivo texto={tr('Subir el ticket')} alElegir={async (archivo) => {
    const j = await preparar(archivo);
    if (j.error) throw new Error(j.error);
    const fallo = await subir(d.id, j.blob);
    if (fallo) throw new Error(fallo);
    // Si la gestoría lo había pedido, queda entregado (y se lo dice en el chat).
    await llamar('/api/tu-despacho/peticiones', { method: 'PATCH', body: JSON.stringify({ gasto: d.id }) }).catch(() => {});
    alHacer();
  }} />;
}

// Botón que abre la cámara o los archivos (foto o PDF) y llama a alElegir(archivo), con su estado y su error.
export function SubirArchivo({ texto = 'Subir foto o PDF', alElegir, className = 'boton' }) {
  const tr = useT();
  const input = useRef(null);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/^image\//.test(archivo.type) && archivo.type !== 'application/pdf') { setError('Sube una foto (JPG, PNG o WebP) o un PDF'); return; }
    setError(''); setEstado('Subiendo…');
    try { await alElegir(archivo); setEstado(''); } catch (err) { setEstado(''); setError(err.message || 'No se ha podido subir'); }
  };
  return <>
    <button type="button" className={className} disabled={Boolean(estado)} onClick={() => input.current?.click()}>{tr(estado || texto)}</button>
    <input ref={input} type="file" accept="image/*,application/pdf" onChange={elegir} hidden />
    {error && <p className="error" role="alert">{tr(error)}</p>}
  </>;
}

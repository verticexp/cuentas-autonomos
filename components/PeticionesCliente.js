'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { SubirArchivo } from './AccionesDocumento';
import VistaDocumento from './VistaDocumento';
import { preparar, subir } from '@/lib/justificanteCliente';
import { fechaCorta } from '@/lib/formato';

// Lo que la gestoría le ha pedido al cliente (lib/peticionesDespacho.js), cada cosa con su botón para subirla: una foto
// (se abre la cámara en el móvil) o un PDF. El ticket de un gasto va a ese gasto; otro documento queda para la gestoría.
// compacta: encima del chat (app/tu-gestoria), plegable.
export default function PeticionesCliente({ peticiones = [], compacta = false }) {
  const router = useRouter();
  const [ver, setVer] = useState(null);
  const [abierta, setAbierta] = useState(!compacta || peticiones.length <= 2);
  if (!peticiones.length) return null;
  const ticket = (p) => async (archivo) => {
    const j = await preparar(archivo);
    if (j.error) throw new Error(j.error);
    const fallo = await subir(p.gasto.id, j.blob);
    if (fallo) throw new Error(fallo);
    await llamar('/api/tu-despacho/peticiones', { method: 'PATCH', body: JSON.stringify({ gasto: p.gasto.id }) });
    router.refresh();
  };
  const documento = (p) => async (archivo) => {
    const j = await preparar(archivo);
    if (j.error) throw new Error(j.error);
    const r = await fetch(`/api/tu-despacho/peticiones?id=${encodeURIComponent(p.id)}`, { method: 'PUT', headers: { 'Content-Type': j.blob.type || 'application/octet-stream' }, body: j.blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se ha podido subir');
    router.refresh();
  };
  const titulo = peticiones.length === 1 ? 'Tu gestoría te pide un documento' : `Tu gestoría te pide ${peticiones.length} documentos`;
  return <section className={`peticiones${compacta ? ' compacta' : ''}`} aria-label={titulo}>
    {compacta ? <button type="button" className="peticiones-t" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>📎 {titulo}<span className="chevron" aria-hidden /></button> : <h2 className="grupo-t">{titulo}</h2>}
    {abierta && <ul>
      {peticiones.map((p) => <li key={p.id}>
        <span className="txt">
          <strong>{p.tipo === 'ticket' ? `Ticket de ${p.gasto?.texto || 'un gasto'}` : p.texto}</strong>
          <small>{p.tipo === 'ticket' && p.texto ? `${p.texto} · ` : ''}Te lo pidió {p.por?.nombre || 'tu gestoría'} el {fechaCorta(String(p.creada).slice(0, 10))}</small>
        </span>
        <span className="peticiones-botones">
          {p.tipo === 'ticket' && <button type="button" className="boton sec" onClick={() => setVer({ tipo: 'gasto', id: p.gasto.id })}>Ver</button>}
          <SubirArchivo texto="Subir" alElegir={p.tipo === 'ticket' ? ticket(p) : documento(p)} />
        </span>
      </li>)}
    </ul>}
    <VistaDocumento base="/api/tu-despacho/documento" doc={ver} alCerrar={() => setVer(null)} />
  </section>;
}

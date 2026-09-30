'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MARCA, activarFaceId, faceIdDisponible, nombreDispositivo } from '@/lib/faceid';
import { fechaCorta } from '@/lib/formato';

// Ajustes → Face ID: activarlo en este dispositivo y ver en cuáles está.
export default function FaceId({ lista }) {
  const router = useRouter();
  const [disponible, setDisponible] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { faceIdDisponible().then(setDisponible); }, []);

  async function activar() {
    setMsg('');
    try { await activarFaceId(nombreDispositivo()); setMsg('Listo: la próxima vez entrarás con Face ID.'); router.refresh(); }
    catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Cancelado.' : e.message); }
  }

  async function quitar(id) {
    await fetch(`/api/passkey?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (lista.length <= 1) localStorage.removeItem(MARCA);
    router.refresh();
  }

  return (
    <section className="tarjeta formulario faceid">
      <h3>Face ID</h3>
      <p className="nota">Entra sin contraseña y la app se bloquea sola si la dejas un rato. Tu cara nunca sale del móvil.</p>
      {lista.length > 0 && (
        <ul className="dispositivos">
          {lista.map((k) => (
            <li key={k.id}>
              <span className="txt"><strong>{k.nombre}</strong><small>Activado el {fechaCorta(k.creada.slice(0, 10))}{k.usada ? ` · último uso ${fechaCorta(k.usada.slice(0, 10))}` : ''}</small></span>
              <button type="button" className="borrar" onClick={() => quitar(k.id)}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {disponible === false && <p className="nota">Este dispositivo no tiene Face ID ni huella.</p>}
      {disponible && <button type="button" className="boton" onClick={activar}>Activar en este dispositivo</button>}
      {msg && <p className={msg.startsWith('Listo') ? 'nota' : 'error'}>{msg}</p>}
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MARCA, activarFaceId, faceIdDisponible, nombreDispositivo } from '@/lib/faceid';
import { fechaCorta } from '@/lib/formato';

// Ajustes → Face ID: activarlo en este dispositivo y ver en cuáles está.
export default function FaceId({ lista, bloqueo = false, app = false }) {
  const router = useRouter();
  const [disponible, setDisponible] = useState(null);
  const [msg, setMsg] = useState('');
  const [bloquear, setBloquear] = useState(bloqueo);

  useEffect(() => { if (!app) faceIdDisponible().then(setDisponible); }, [app]);

  async function activar() {
    setMsg('');
    try { await activarFaceId(nombreDispositivo()); setMsg('Listo: la próxima vez entrarás con Face ID.'); router.refresh(); }
    catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Cancelado.' : e.message); }
  }

  async function cambiarBloqueo(e) {
    const valor = e.target.checked;
    setBloquear(valor);
    const r = await fetch('/api/cuenta', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bloqueoPantalla: valor }) }).catch(() => null);
    if (!r?.ok) { setBloquear(!valor); setMsg('No se ha podido guardar. Inténtalo otra vez.'); }
  }

  async function quitar(id) {
    await fetch(`/api/passkey?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (lista.length <= 1) localStorage.removeItem(MARCA);
    router.refresh();
  }

  return (
    <section className="tarjeta formulario faceid">
      <h3>{app ? 'Bloqueo de pantalla' : 'Face ID'}</h3>
      {!app && <p className="nota">Con Face ID (o la huella) entras sin escribir la contraseña. Tu cara nunca sale del dispositivo.</p>}
      <label className="check">
        <input type="checkbox" checked={bloquear} onChange={cambiarBloqueo} />
        {app ? 'Pedir la contraseña cada vez que abra Netto' : 'Pedir Face ID o contraseña cada vez que abra Netto'}
      </label>
      {!app && lista.length > 0 && (
        <ul className="dispositivos">
          {lista.map((k) => (
            <li key={k.id}>
              <span className="txt"><strong>{k.nombre}</strong><small>Activado el {fechaCorta(k.creada.slice(0, 10))}{k.usada ? ` · último uso ${fechaCorta(k.usada.slice(0, 10))}` : ''}</small></span>
              <button type="button" className="borrar" onClick={() => quitar(k.id)}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {!app && disponible === false && <p className="nota">Este dispositivo no tiene Face ID ni huella.</p>}
      {!app && disponible && <button type="button" className="boton" onClick={activar}>Activar en este dispositivo</button>}
      {msg && <p className={msg.startsWith('Listo') ? 'nota' : 'error'}>{msg}</p>}
    </section>
  );
}

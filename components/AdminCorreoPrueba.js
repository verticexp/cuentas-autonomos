'use client';

import { useState } from 'react';

export default function AdminCorreoPrueba({ id }) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function enviar() {
    setEnviando(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/correos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const datos = await res.json();
      setMensaje(res.ok && !datos.error ? 'Enviado a tu email' : datos.error || 'No se ha podido enviar el correo.');
    } catch {
      setMensaje('No se ha podido enviar el correo. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return <div className="adm-correo-prueba">
    <button type="button" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviarme una prueba'}</button>
    <p className="adm-pie" role="status">{mensaje}</p>
  </div>;
}

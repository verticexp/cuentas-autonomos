'use client';

import { useState } from 'react';

export default function CrearAurora() {
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [ocupada, setOcupada] = useState(false);
  async function pedir(method) {
    setOcupada(true); setError('');
    try {
      const r = await fetch('/api/aurora', { method, headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo completar la operación');
      setResultado(d);
    } catch (e) { setError(e.message); }
    finally { setOcupada(false); }
  }
  return <div>
    <button type="button" disabled={ocupada} onClick={() => pedir('GET')}>Comprobar estado de Aurora</button>{' '}
    <button type="button" disabled={ocupada || Boolean(resultado?.password)} onClick={() => pedir('POST')}>{ocupada ? 'Procesando…' : 'Crear Aurora y mostrar su acceso'}</button>
    {error && <p role="alert">{error}</p>}
    {resultado && <section aria-live="polite"><h2>{resultado.password ? 'Aurora creada' : 'Estado de Aurora'}</h2><pre>{JSON.stringify(resultado, null, 2)}</pre>{resultado.password && <p>Guarda el acceso: la contraseña solo se muestra al crear la cuenta.</p>}</section>}
  </div>;
}

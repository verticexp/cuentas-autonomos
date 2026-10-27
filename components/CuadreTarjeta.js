'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { vibrar } from '@/lib/haptica';

// «Cuadrar» o «Deshacer» el cuadre de la tarjeta de unos cierres con el ingreso del banco (app/api/caja/tarjeta).
export default function CuadreTarjeta({ mov, cierres = [], deshacer = false }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const enviar = async () => {
    setEnviando(true); setError('');
    try {
      await llamar('/api/caja/tarjeta', { method: 'POST', body: JSON.stringify(deshacer ? { mov, deshacer: true } : { mov, cierres }) });
      if (!deshacer) vibrar();
      router.refresh();
    } catch (e) { setError(e.message); }
    setEnviando(false);
  };
  return (
    <span className="caja-cuadre-acc">
      <button type="button" className={`boton pequeno${deshacer ? ' sec' : ''}`} onClick={enviar} disabled={enviando}>{enviando ? (deshacer ? 'Deshaciendo…' : 'Cuadrando…') : deshacer ? 'Deshacer' : 'Cuadrar'}</button>
      {error && <small className="error" role="alert">{error}</small>}
    </span>
  );
}

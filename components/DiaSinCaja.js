'use client';

import { useT } from '@/components/Idioma';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// «No abrí»: marca un día sin cierre de caja como cerrado para que deje de avisarse (app/api/caja/cerrados).
export default function DiaSinCaja({ fecha }) {
  const tr = useT();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const marcar = async () => {
    setEnviando(true); setError('');
    try { await llamar('/api/caja/cerrados', { method: 'POST', body: JSON.stringify({ fecha }) }); router.refresh(); }
    catch (e) { setError(e.message); setEnviando(false); }
  };
  return (
    <>
      <button type="button" className="boton sec pequeno" onClick={marcar} disabled={enviando}>{(enviando ? tr('Marcando…') : tr('No abrí'))}</button>
      {error && <small className="error" role="alert">{tr(error)}</small>}
    </>
  );
}

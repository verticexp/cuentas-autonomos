'use client';

import { useT } from '@/components/Idioma';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Forma de cobro de un efecto y, si es cheque, confirming o pagaré, si ya se ha recibido (app/cartera/page.js).
export default function EfectoCobro({ id, forma, formas, requiere, recibido, fecha }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (cambio) => {
    setError('');
    setOcupado(true);
    try {
      const r = await fetch('/api/cartera/efecto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...cambio }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      if (!r.ok) throw new Error(d.error || 'No se ha podido guardar el cobro. Revisa la conexión e inténtalo otra vez.');
      router.refresh();
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  return (
    <div className="car-efecto">
      <label className="car-forma">
        <span className="car-etq">{tr("Forma de cobro")}</span>
        <select value={forma} disabled={ocupado} onChange={(e) => enviar({ forma: e.target.value })}>
          <option value="">{tr("Sin indicar")}</option>
          {formas.map((f) => <option key={f.id} value={f.id}>{tr(f.nombre)}</option>)}
        </select>
      </label>
      {requiere ? (
        <button type="button" disabled={ocupado} className={`estado ${recibido ? 'ok' : 'pend'}`} onClick={() => enviar({ recibido: !recibido })}>
          {(recibido ? tr("Recibido{v1}", { v1: (fecha ? (" " + tr("el {v1}", { v1: fecha })) : "") }) : tr("Pendiente de recibir"))}
        </button>
      ) : null /* transferencia, tarjeta o domiciliación: no hay papel que recibir, así que nada que marcar */}
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}

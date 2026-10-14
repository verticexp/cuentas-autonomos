'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Forma de cobro de un efecto y, si es cheque, confirming o pagaré, si ya se ha recibido (app/cartera/page.js).
export default function EfectoCobro({ id, forma, formas, requiere, recibido, fecha }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (cambio) => {
    setOcupado(true);
    try {
      const r = await fetch('/api/cartera/efecto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...cambio }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
      router.refresh();
    } catch (e) { alert(e.message); } finally { setOcupado(false); }
  };
  return (
    <div className="car-efecto">
      <label className="car-forma">
        <span className="car-etq">Forma de cobro</span>
        <select value={forma} disabled={ocupado} onChange={(e) => enviar({ forma: e.target.value })}>
          <option value="">Sin indicar</option>
          {formas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </label>
      {requiere ? (
        <button type="button" disabled={ocupado} className={`estado ${recibido ? 'ok' : 'pend'}`} onClick={() => enviar({ recibido: !recibido })}>
          {recibido ? `Recibido${fecha ? ` el ${fecha}` : ''}` : 'Pendiente de recibir'}
        </button>
      ) : forma ? <span className="car-recibido">Recibido · no hace falta recibirlo</span> : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Saldo en el banco hoy: de ahí parte la previsión.
export default function SaldoBanco({ saldo, fecha, banco = false }) {
  const router = useRouter();
  const [v, setV] = useState(saldo === null ? '' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(saldo));
  const [msg, setMsg] = useState('');
  const guardar = async (e) => {
    e.preventDefault();
    setMsg('');
    const r = await fetch('/api/tesoreria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saldo: v.trim() || null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || 'Algo ha fallado'); return; }
    router.refresh();
  };
  // Con el banco conectado o un extracto subido, el saldo es el real: no se escribe a mano.
  if (banco) {
    return (
      <div className="teso-saldo">
        <label>Saldo en el banco hoy<small>De tus cuentas · {fecha ? `a ${fecha.split('-').reverse().join('-')}` : 'sin fecha'}</small></label>
        <strong className="teso-saldo-real">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(saldo)}</strong>
      </div>
    );
  }
  return (
    <form className="teso-saldo" onSubmit={guardar}>
      <label htmlFor="saldo">Saldo en el banco hoy<small>{fecha ? `Apuntado el ${fecha.split('-').reverse().join('-')}` : 'Escríbelo para ver cuánto tendrás'}</small></label>
      <div className="teso-saldo-fila">
        <input id="saldo" className="campo" inputMode="decimal" placeholder="0,00" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="boton pequeno">Guardar</button>
      </div>
      {msg && <p className="rojo teso-msg">{msg}</p>}
    </form>
  );
}

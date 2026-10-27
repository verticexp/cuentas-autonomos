'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { eur, eurSin, fechaCorta } from '@/lib/formato';
import useEnvio from './useEnvio';

// Saldo en el banco hoy: de ahí parte la previsión.
// editable: false para quien solo ve (la gestoría): lo ve pero no lo cambia.
export default function SaldoBanco({ saldo, fecha, banco = false, editable = true }) {
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const [v, setV] = useState(saldo === null ? '' : eurSin(saldo));
  const [msg, setMsg] = useState('');
  const guardar = async (e) => {
    e.preventDefault();
    setMsg('');
    const r = await fetch('/api/tesoreria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saldo: v.trim() || null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || 'No se ha podido guardar el saldo. Revisa la conexión e inténtalo otra vez.'); return; }
    router.refresh();
  };
  // Con el banco conectado o un extracto subido, el saldo es el real: no se escribe a mano.
  if (banco || !editable) {
    return (
      <div className="teso-saldo">
        <label>Saldo en el banco hoy<small>{banco ? `De tus cuentas · ${fecha ? `a ${fechaCorta(fecha)}` : 'sin fecha'}` : fecha ? `Apuntado el ${fechaCorta(fecha)}` : 'Sin apuntar'}</small></label>
        <strong className="teso-saldo-real">{saldo === null ? '—' : eur(saldo)}</strong>
      </div>
    );
  }
  return (
    <form className="teso-saldo" onSubmit={envolver(guardar)}>
      <label htmlFor="saldo">Saldo en el banco hoy<small>{fecha ? `Apuntado el ${fechaCorta(fecha)}` : 'Escríbelo para ver cuánto tendrás'}</small></label>
      <div className="teso-saldo-fila">
        <input id="saldo" className="campo" inputMode="decimal" placeholder="0,00" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="boton pequeno" disabled={enviando}>Guardar</button>
      </div>
      {msg && <p className="rojo teso-msg" role="alert">{msg}</p>}
    </form>
  );
}

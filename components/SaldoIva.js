'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';
import useEnvio from './useEnvio';

// Saldo del IVA a compensar que se trae de antes de usar Fisquo (lib/calculos.js liquidaciones303): lo que dice la
// casilla 87 del último 303 presentado fuera. Se descuenta en los trimestres siguientes, con su caducidad de cuatro años.
// anio: el año que se ve en Impuestos; los trimestres que se ofrecen son los de ese año y el anterior.
export default function SaldoIva({ anio, valor, soloLectura = false }) {
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const opciones = [anio - 1, anio].flatMap((y) => [1, 2, 3, 4].map((t) => ({ y, t }))).filter(({ y, t }) => y < anio || t < 4);
  const [importe, setImporte] = useState(valor ? String(valor.importe).replace('.', ',') : '');
  const [trimestre, setTrimestre] = useState(valor ? `${valor.anio}-${valor.t}` : `${anio - 1}-4`);
  const [msg, setMsg] = useState('');
  const guardar = async (saldoIva) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ saldoIva }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  const enviar = (e) => {
    e.preventDefault();
    const [y, t] = trimestre.split('-').map(Number);
    guardar(importe.trim() === '' ? null : { importe, anio: y, t });
  };
  return (
    <details className="tarjeta bloque" open={Boolean(valor) || undefined}>
      <summary><strong>¿Traías IVA a compensar de antes de usar Fisquo?</strong></summary>
      <p className="nota">Pon lo que dice la casilla 87 («a compensar en periodos posteriores») de tu último 303 presentado fuera de Fisquo: se descuenta en los trimestres siguientes.</p>
      {valor && <p className="nota">Guardado: {eur(valor.importe)} tras el {valor.t}T {valor.anio}.</p>}
      {soloLectura ? <p className="nota">Lo cambia quien tiene el permiso «Contabilidad».</p> : (
        <form className="formulario" onSubmit={envolver(enviar)}>
          <div className="fila-act">
            <input className="campo" inputMode="decimal" placeholder="Saldo a compensar" value={importe} onChange={(e) => setImporte(e.target.value)} aria-label="Saldo del IVA a compensar" />
            <select className="campo" value={trimestre} onChange={(e) => setTrimestre(e.target.value)} aria-label="Trimestre de ese 303">
              {opciones.map(({ y, t }) => <option key={`${y}-${t}`} value={`${y}-${t}`}>Del 303 del {t}T {y}</option>)}
            </select>
            <button className="boton sec" disabled={enviando}>Guardar</button>
          </div>
          {valor && <button type="button" className="enlace" onClick={() => guardar(null)}>Quitar el saldo</button>}
        </form>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </details>
  );
}

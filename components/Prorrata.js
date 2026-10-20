'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Prorrata del IVA (arts. 102-106 de la Ley del IVA): quien hace operaciones exentas y otras con derecho a deducir solo
// se deduce un porcentaje de su IVA soportado. Durante el año se usa el provisional (el definitivo del año anterior, o el
// que se propuso a Hacienda al empezar) y en el 4T se regulariza con el definitivo (casilla 44). Netto lo calcula con
// lo facturado; aquí se puede guardar el provisional de verdad si es otro.
export default function Prorrata({ anio, guardado, provisional, definitiva, anterior }) {
  const router = useRouter();
  const [v, setV] = useState(guardado === null || guardado === undefined ? '' : String(guardado));
  const [msg, setMsg] = useState('');
  const guardar = async (pct) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ prorrata: { anio, pct } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={(e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>Prorrata del IVA en {anio}</strong>: como tienes facturas exentas y otras con IVA, solo te deduces una parte del IVA de tus gastos.</p>
      <p className="nota">
        Durante el año se aplica el {provisional} % {guardado !== null && guardado !== undefined ? '(el que has guardado)' : anterior !== null ? `(el definitivo de ${anio - 1})` : '(con lo facturado este año, porque el año pasado no hubo prorrata: propón el tuyo a Hacienda y guárdalo aquí)'}.
        {definitiva !== null && ` Con todo lo facturado en ${anio}, el definitivo sale del ${definitiva} %: en el 4T se regulariza la diferencia (casilla 44).`}
        {' '}Solo cuentan como exentas las facturas marcadas como «Exenta». Si alguna operación no debe contar (venta de un bien de inversión, operaciones financieras o inmobiliarias ocasionales), revísalo con tu gestor.
      </p>
      <div className="fila-act">
        <input className="campo" inputMode="numeric" placeholder={String(provisional)} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Prorrata provisional de ${anio} (%)`} />
        <button className="boton sec">Guardar</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </form>
  );
}

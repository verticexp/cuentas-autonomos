'use client';

import Termino from '@/components/Termino';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Prorrata del IVA (arts. 102-106 de la Ley del IVA): quien hace operaciones exentas y otras con derecho a deducir solo
// se deduce un porcentaje de su IVA soportado. Durante el año se usa el provisional (el definitivo del año anterior, o el
// que se propuso a Hacienda al empezar) y en el 4T se regulariza con el definitivo (casilla 44). Fisquo lo calcula con
// lo facturado; aquí se puede guardar el provisional de verdad si es otro.
export default function Prorrata({ anio, especial = false, guardado, provisional, definitiva, anterior, titulo, soloLectura = false }) {
  const router = useRouter();
  const [v, setV] = useState(guardado === null || guardado === undefined ? '' : String(guardado));
  const [msg, setMsg] = useState('');
  const guardar = async (pct) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ prorrata: { anio, pct } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  const cambiarEspecial = async (valor) => {
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ prorrataEspecial: { anio, especial: valor } }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  const Caja = soloLectura ? 'div' : 'form';
  return (
    <Caja className="formulario tarjeta bloque" onSubmit={soloLectura ? undefined : (e) => { e.preventDefault(); guardar(v.trim() === '' ? null : v); }}>
      <p><strong>{titulo || <Termino id="prorrata">Prorrata del IVA</Termino>} en {anio}</strong>: como tienes facturas exentas y otras con IVA, solo te deduces una parte del IVA de tus gastos.</p>
      <p className="nota">
        {guardado !== null && guardado !== undefined ? `Durante el año se aplica el ${provisional} %, el que has guardado.`
          : anterior !== null ? `Durante el año se aplica el ${provisional} %, el definitivo de ${anio - 1}.`
          : `En ${anio - 1} no hubo prorrata, así que Fisquo aplica en cada trimestre la que sale con lo facturado hasta entonces (ahora, el ${provisional} %). Si propusiste otro porcentaje a Hacienda (art. 105.Dos de la Ley del IVA), guárdalo aquí.`}
        {definitiva !== null && ` Con todo lo facturado en ${anio}, el definitivo sale del ${definitiva} %: en el 4T se regulariza la diferencia (casilla 44).`}
        {' '}Solo cuentan como exentas las facturas marcadas como «Exenta». Si alguna operación no debe contar (venta de un bien de inversión, operaciones financieras o inmobiliarias ocasionales), revísalo con tu gestor.
      </p>
      {/* Prorrata especial (art. 106 de la Ley del IVA): se opta en el 303 del 4T del año anterior. Es obligatoria si con la
          general se deduciría un 10 % más (art. 103.Dos.2.º): eso lo decide la gestoría con el uso real de cada gasto. */}
      <label className="gasto-pendiente"><input type="checkbox" checked={especial} disabled={soloLectura} onChange={(e) => cambiarEspecial(e.target.checked)} />Aplico la prorrata especial en {anio}: el IVA de lo que uso solo en operaciones con IVA lo deduzco entero, el de lo que uso solo en las exentas, nada, y el porcentaje va solo a lo común (cada gasto lo dice en «Uso en la prorrata especial»)</label>
      {soloLectura ? <p className="nota">Lo cambia quien tiene el permiso «Contabilidad».</p> : <div className="fila-act">
        <input className="campo" inputMode="numeric" placeholder={String(provisional)} value={v} onChange={(e) => setV(e.target.value)} aria-label={`Prorrata provisional de ${anio} (%)`} />
        <button className="boton sec">Guardar</button>
      </div>}
      {msg && <p className="error">{msg}</p>}
    </Caja>
  );
}

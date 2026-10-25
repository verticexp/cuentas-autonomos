'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { numeroFactura } from '@/lib/calculos';

// Ajustes › Series y numeración. actividades: [{ id, nombre, serie, bloqueada (ya tiene facturas), siguiente }].
// Cada actividad factura con su serie; el número vuelve a empezar cada año y nunca va hacia atrás (lib/facturas.js).
export default function Series({ actividades, anio, rectificativas, caja, simplificadas = 1, serieFs = 'FS' }) {
  return (
    <>
      <section className="grupo">
        <h2 className="grupo-t">Tus series</h2>
        <div className="grupo-c">{actividades.map((a) => <Serie key={a.id} a={a} anio={anio} />)}</div>
        <p className="grupo-pie">Cada actividad numera sus facturas con su serie. La letra solo se puede cambiar mientras la actividad no tenga facturas. Si vienes de otro programa a mitad de año, pon el número por el que vas: solo se puede subir, porque Hacienda exige numeración correlativa y sin repetidos.</p>
      </section>

      <section className="grupo">
        <h2 className="grupo-t">Series reservadas</h2>
        <div className="grupo-c">
          <div className="celda"><span className="txt">R · Facturas rectificativas<small>Siguiente: {numeroFactura({ serie: 'R', anio, numero: rectificativas })}</small></span></div>
          <div className="celda"><span className="txt">{serieFs} · Facturas simplificadas (sin NIF del cliente)<small>Siguiente: {numeroFactura({ serie: serieFs, anio, numero: simplificadas })}</small></span></div>
          <div className="celda"><span className="txt">Z · Cierres de caja<small>{caja ? `Siguiente: ${numeroFactura({ serie: 'Z', anio, numero: caja })}` : 'Para las ventas del día del TPV o el mostrador'}</small></span></div>
        </div>
        <p className="grupo-pie">La numeración de cada serie vuelve a empezar en 1 cada año.</p>
      </section>
    </>
  );
}

function Serie({ a, anio }) {
  const router = useRouter();
  const ayudaId = useId();
  const [abierto, setAbierto] = useState(false);
  const [letra, setLetra] = useState(a.serie || '');
  const [n, setN] = useState(String(a.siguiente));
  const [msg, setMsg] = useState('');
  const cerrar = () => { setAbierto(false); setMsg(''); setLetra(a.serie || ''); setN(String(a.siguiente)); };
  const guardar = async (e) => {
    e.preventDefault();
    setMsg('Guardando…');
    try {
      if (letra !== (a.serie || '')) await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ series: { [a.id]: letra } }) });
      else if (Number(n) !== a.siguiente) await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ numeracion: { serie: a.serie || '', anio, siguiente: Number(n) } }) });
      setMsg(''); setAbierto(false); router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  const resumen = `${a.serie ? `Serie ${a.serie}` : 'Sin letra'} · siguiente ${numeroFactura({ serie: a.serie, anio, numero: a.siguiente })}`;
  if (!abierto) {
    return (
      <button type="button" className="celda ir" onClick={() => setAbierto(true)} aria-expanded="false">
        <span className="txt">{a.nombre}<small>{resumen}</small></span>
      </button>
    );
  }
  const cambiaLetra = letra !== (a.serie || '');
  return (
    <form className="celda columna" onSubmit={guardar}>
      <strong>{a.nombre}</strong>
      {!a.bloqueada && (
        <label>Letra de la serie (vacía: sin letra)
          <input className="campo" value={letra} maxLength={3} autoCapitalize="characters" placeholder="Sin letra" onChange={(e) => setLetra(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
        </label>
      )}
      <label>Siguiente factura
        <input className="campo" type="number" inputMode="numeric" min={a.siguiente} max="999999" value={n} disabled={cambiaLetra} onChange={(e) => setN(e.target.value)} required />
      </label>
      <small className="nota">{cambiaLetra ? 'Guarda primero la letra; luego podrás cambiar el número.' : `Será la ${Number(n) > 0 ? numeroFactura({ serie: a.serie, anio, numero: Number(n) }) : '…'}`}</small>
      {msg && <p role="status" className={msg === 'Guardando…' ? 'nota' : 'error'}>{msg}</p>}
      {!cambiaLetra && Number(n) === a.siguiente && <small id={ayudaId} className="nota">Cambia la letra o el número para guardar.</small>}
      <div className="linea">
        <button type="button" className="boton sec" onClick={cerrar}>Cancelar</button>
        <button className="boton" disabled={!cambiaLetra && Number(n) === a.siguiente} aria-describedby={!cambiaLetra && Number(n) === a.siguiente ? ayudaId : undefined}>Guardar</button>
      </div>
    </form>
  );
}

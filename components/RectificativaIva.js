'use client';

import { useState } from 'react';
import { rectificativa303 } from '@/lib/calculos';
import { eur } from '@/lib/formato';

// «Preparar la rectificativa» de un 303 ya presentado (Impuestos): con lo que se ingresó (y, en el 4T, lo que devolvió la
// AEAT) y el justificante de la anterior, las casillas de la autoliquidación rectificativa (lib/calculos.js
// rectificativa303) y su fichero para la Sede. c69: el resultado del trimestre con los datos de ahora.
const leer = (v) => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;

export default function RectificativaIva({ anio, t, c69, abierta = false }) {
  const [ingresado, setIngresado] = useState('');
  const [devuelto, setDevuelto] = useState('');
  const [justificante, setJustificante] = useState('');
  const [baja, setBaja] = useState(false);
  const r = rectificativa303(c69, { ingresado: leer(ingresado), devuelto: leer(devuelto), justificante: justificante.trim(), bajaDomiciliacion: baja });
  const url = `/api/aeat?${new URLSearchParams({ modelo: '303', anio: String(anio), t: String(t), rectificativa: '1', ingresado: String(r.c70), devuelto: String(r.c109), justificante: r.justificante, ...(baja ? { baja: '1' } : {}) })}`;
  return (
    <details className="rectificativa" open={abierta || undefined}>
      <summary>¿Hay que corregirlo? Preparar la rectificativa</summary>
      <p className="nota">Si cambió algo de este trimestre después de presentarlo, se corrige con una autoliquidación rectificativa (desde 2025 sustituye a la complementaria). Pon lo que ingresaste y el justificante del resguardo.</p>
      <div className="dos-col">
        <label>Lo que ingresaste con la anterior (casilla 71)<input className="campo" inputMode="decimal" placeholder="0,00" value={ingresado} onChange={(e) => setIngresado(e.target.value)} /></label>
        {t === 4 && <label>Lo que te devolvió Hacienda por ella (si te devolvió algo)<input className="campo" inputMode="decimal" placeholder="0,00" value={devuelto} onChange={(e) => setDevuelto(e.target.value)} /></label>}
        <label>Número de justificante de la anterior (13 cifras)<input className="campo" inputMode="numeric" maxLength={13} value={justificante} onChange={(e) => setJustificante(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={baja} onChange={(e) => setBaja(e.target.checked)} /> Domicilié el pago de la anterior y quiero darlo de baja o cambiarlo</label>
      <dl className="desglose">
        <div><dt>69 · Resultado con los datos de ahora</dt><dd>{eur(r.c69)}</dd></div>
        <div><dt>70 · Ingresado con la anterior</dt><dd>{eur(r.c70)}</dd></div>
        {r.c109 > 0 && <div><dt>109 · Devuelto por Hacienda</dt><dd>{eur(r.c109)}</dd></div>}
        <div><dt>71 · Resultado de la rectificativa</dt><dd>{eur(r.c71)}</dd></div>
        {r.c111 > 0 && <div><dt>111 · Pides que te devuelvan</dt><dd>{eur(r.c111)}</dd></div>}
      </dl>
      <p className="nota">{r.aPagar > 0 ? `Falta por pagar ${eur(r.aPagar)}: si la presentas tarde sin requerimiento, lleva el recargo del art. 27 de la Ley General Tributaria.` : r.aDevolver > 0 ? `Pides que te devuelvan ${eur(r.aDevolver)} de lo que ingresaste de más${r.aCompensar > 0 ? ` y quedan ${eur(r.aCompensar)} a compensar` : ''}.` : r.aCompensar > 0 ? `Quedan ${eur(r.aCompensar)} a tu favor para compensar.` : 'No cambia lo que había que pagar.'}</p>
      {r.error ? <p className="nota">{justificante ? r.error : 'Escribe el justificante para descargar el fichero.'}</p>
        : <a className="boton sec" href={url} download>Descargar el fichero de la rectificativa</a>}
    </details>
  );
}

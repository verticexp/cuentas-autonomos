'use client';

import { useEffect, useState } from 'react';

// Pasos para presentar; el de la Sede nombra el modelo si solo se presenta uno.
const pasos = (nums) => [
  'Revisa que las facturas y gastos del trimestre estén todos en Netto.',
  'Comprueba estos importes con tu gestor.',
  nums.length === 1 ? `Presenta el modelo ${nums[0]} en la Sede de la AEAT.` : 'Presenta los modelos en la Sede de la AEAT.',
  'Vuelve aquí y marca el trimestre como presentado.',
];

// Tarjeta de arriba de Impuestos: el trimestre que toca presentar, con sus importes, una lista de pasos
// (se recuerda en este dispositivo), un botón para copiar o compartir el resumen y el enlace a la Sede de cada modelo.
// `importes`: [{ num, modelo, href, texto, aeat?, plazo? }], todos los modelos que vencen con el trimestre (lib/presentar.js);
// `plazo`, solo si vence otro día (el 111 y el 115 del 4T); `aeat`, la página de la Sede si la hay.
export default function PresentarAhora({ t, anio, aviso, importes, texto }) {
  const clave = `presentar:${anio}:${t}`;
  const [hechos, setHechos] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { try { setHechos(JSON.parse(localStorage.getItem(clave)) || []); } catch { /* sin almacenamiento */ } }, [clave]);
  const marcar = (i) => {
    const n = hechos.includes(i) ? hechos.filter((x) => x !== i) : [...hechos, i];
    setHechos(n);
    try { localStorage.setItem(clave, JSON.stringify(n)); } catch { /* sin almacenamiento */ }
  };
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else { await navigator.clipboard.writeText(texto); setMsg('Resumen copiado'); setTimeout(() => setMsg(''), 2500); }
    } catch (e) { if (e?.name !== 'AbortError') setMsg('No se ha podido copiar'); }
  };
  return (
    <section className="bloque presentar-ahora" aria-labelledby="presentar-t">
      <h2 className="grupo-t" id="presentar-t">Toca presentar el {t}T {anio}</h2>
      <div className="tarjeta">
        <p className="presentar-plazo">{aviso}</p>
        <ul className="presentar-importes">
          {importes.map((m) => <li key={m.num}><a href={m.href}><span>{m.modelo}{m.plazo && <small> · hasta el {m.plazo}</small>}</span><strong>{m.texto}</strong></a></li>)}
        </ul>
        <ol className="presentar-pasos">
          {pasos(importes.map((m) => m.num)).map((p, i) => (
            <li key={i}><label><input type="checkbox" checked={hechos.includes(i)} onChange={() => marcar(i)} /><span>{p}</span></label></li>
          ))}
        </ol>
        <div className="presentar-acc">
          <button type="button" className="boton" onClick={compartir}>Compartir resumen</button>
          {importes.filter((m) => m.aeat).map((m) => (
            <a key={m.num} className="boton secundario" href={m.aeat} target="_blank" rel="noopener noreferrer">Presentar el {m.num} en la AEAT</a>
          ))}
        </div>
        <p className="nota" role="status" aria-live="polite">{msg}</p>
      </div>
    </section>
  );
}

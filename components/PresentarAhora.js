'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/Idioma';

// Pasos para presentar; el de la Sede nombra el modelo si solo se presenta uno. hacienda: la Hacienda foral (Navarra y País
// Vasco), donde se presentan en su lugar.
const pasos = (nums, hacienda, tr) => [
  tr('Revisa que las facturas y gastos del trimestre estén todos en Fisquo.'),
  tr('Comprueba estos importes con tu gestor.'),
  hacienda ? (nums.length === 1 ? tr('Presenta el modelo {n} en la sede de la {hacienda}.', { n: nums[0], hacienda: tr(hacienda) }) : tr('Presenta los modelos en la sede de la {hacienda}.', { hacienda: tr(hacienda) })) : nums.includes('420') ? tr('Presenta el 420 en la Sede de la Agencia Tributaria Canaria y los demás modelos en la AEAT.') : nums.length === 1 ? tr('Presenta el modelo {n} en la Sede de la AEAT.', { n: nums[0] }) : tr('Presenta los modelos en la Sede de la AEAT.'),
  tr('Vuelve aquí y marca el trimestre como presentado.'),
];

// Tarjeta de arriba de Impuestos: el trimestre que toca presentar, con sus importes, una lista de pasos
// (se recuerda en este dispositivo), un botón para copiar o compartir el resumen y el enlace a la Sede de cada modelo.
// `importes`: [{ num, modelo, href, texto, aeat?, plazo? }], todos los modelos que vencen con el trimestre (lib/presentar.js);
// `plazo`, solo si vence otro día (el 111 y el 115 del 4T); `aeat`, la página de la Sede si la hay. domiciliar: hasta cuándo
// se puede domiciliar el pago (lib/domiciliacion.js), en texto.
export default function PresentarAhora({ t, anio, aviso, importes, texto, hacienda, domiciliar = '' }) {
  const tr = useT();
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
      else { await navigator.clipboard.writeText(texto); setMsg(tr('Resumen copiado')); setTimeout(() => setMsg(''), 2500); }
    } catch (e) { if (e?.name !== 'AbortError') setMsg(tr('No se ha podido copiar')); }
  };
  return (
    <section className="bloque presentar-ahora" aria-labelledby="presentar-t">
      <h2 className="grupo-t" id="presentar-t">{tr('Toca presentar el {t}T {anio}', { t, anio })}</h2>
      <div className="tarjeta">
        <p className="presentar-plazo">{tr(aviso)}</p>
        {domiciliar && <p className="nota">{tr(domiciliar)}</p>}
        <ul className="presentar-importes">
          {importes.map((m) => <li key={m.num}><a href={m.href}><span>{tr(m.modelo)}{m.plazo && <small> · {tr('hasta el {plazo}', { plazo: tr(m.plazo) })}</small>}</span><strong>{tr(m.texto)}</strong></a></li>)}
        </ul>
        <ol className="presentar-pasos">
          {pasos(importes.map((m) => m.num), hacienda, tr).map((p, i) => (
            <li key={i}><label><input type="checkbox" checked={hechos.includes(i)} onChange={() => marcar(i)} /><span>{p}</span></label></li>
          ))}
        </ol>
        <div className="presentar-acc">
          <button type="button" className="boton" onClick={compartir}>{tr('Compartir resumen')}</button>
          {importes.filter((m) => m.aeat).map((m) => (
            <a key={m.num} className="boton secundario" href={m.aeat} target="_blank" rel="noopener noreferrer">{tr('Presentar el {n} en la {sede}', { n: m.num, sede: tr(m.sede || 'AEAT') })}</a>
          ))}
        </div>
        <p className="nota" role="status" aria-live="polite">{msg}</p>
      </div>
    </section>
  );
}

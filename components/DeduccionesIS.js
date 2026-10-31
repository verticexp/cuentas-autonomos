'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from '@/components/Acciones';
import { confirmar } from '@/components/Confirmar';
import { TIPOS_DEDUCCION_IS } from '@/lib/modelos';
import { eur } from '@/lib/formato';
import Termino from '@/components/Termino';
import Vacio from '@/components/Vacio';
import { useT } from '@/components/Idioma';

// Deducciones y bonificaciones del Impuesto sobre Sociedades (lib/modelos.js borradorSociedades): apuntarlas y quitarlas.
// Fisquo no las saca de los gastos: las pone quien lleva la contabilidad, con su tipo, el ejercicio del que vienen y su
// importe (en los donativos, lo donado y a quién, que hace falta para la recurrencia del art. 20 de la Ley 49/2002).
const GRUPOS = { ddi: 'Para evitar la doble imposición', bonificacion: 'Bonificaciones', donativo: 'Donativos', capIV: 'I+D+i y otras del capítulo IV' };

export default function DeduccionesIS({ anio, deducciones = [], soloLectura = false }) {
  const router = useRouter();
  const tr = useT();
  const vacio = { tipo: 'idi', de: String(anio), importe: '', entidad: '' };
  const [d, setD] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const t = TIPOS_DEDUCCION_IS[d.tipo];

  const guardar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ deduccionIS: { tipo: d.tipo, de: Number(d.de), importe: d.importe, entidad: d.entidad } }) });
      setD({ ...vacio, tipo: d.tipo, de: d.de });
      setAbierto(false);
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  };
  const quitar = async (x) => {
    const n = TIPOS_DEDUCCION_IS[x.tipo];
    if (!(await confirmar({ titulo: tr('Quitar la deducción'), texto: tr('{nombre} de {anio} ({importe}). Deja de restar en el borrador del Impuesto sobre Sociedades.', { nombre: tr(n?.nombre || x.tipo), anio: x.de, importe: eur(x.importe) }), aceptar: tr('Quitar'), peligro: true }))) return;
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ deduccionIS: { id: x.id, importe: null } }) }); router.refresh(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="formulario tarjeta bloque">
      <p><strong><Termino id="deduccionIS">{tr('Deducciones y bonificaciones')}</Termino></strong></p>
      {deducciones.length ? (
        <ul className="lista-pagos">
          {deducciones.map((x) => {
            const n = TIPOS_DEDUCCION_IS[x.tipo];
            return (
              <li key={x.id}>
                <span>{tr(n?.nombre || x.tipo)}{x.entidad ? ` · ${x.entidad}` : ''} · {n ? tr(n.norma) : ''}</span>
                <span>{tr(n?.donado ? 'donado en {anio}: {importe}' : 'de {anio}: {importe}', { anio: x.de, importe: eur(x.importe) })}{!soloLectura && <> <button type="button" className="enlace-claro" onClick={() => quitar(x)}>{tr('Quitar')}</button></>}</span>
              </li>
            );
          })}
        </ul>
      ) : <Vacio compacto icono="hacienda" titulo={tr('Sin deducciones ni bonificaciones apuntadas')}>{tr('Fisquo no las adivina. Apunta aquí las que te corresponden y las que te quedaron pendientes de años anteriores: restan de la cuota, cada una con su límite y su arrastre.')}</Vacio>}
      <p className="nota">{tr('Pon el importe de la deducción o la bonificación (en los donativos, lo donado) y el ejercicio del que viene. Lo generado en un año que Fisquo calcula se aplica desde ese año; de los años de antes, pon solo lo que te quedara por aplicar en tu último modelo 200. Te lo da tu gestoría.')} {tr('Los donativos de un año que Fisquo no calcula solo cuentan para la recurrencia: lo que te quede por deducir de ellos va en «Donativos pendientes de ejercicios anteriores».')}</p>
      {!soloLectura && !abierto && <button type="button" className="boton sec pequeno" onClick={() => setAbierto(true)}>{tr('Apuntar una deducción')}</button>}
      {!soloLectura && abierto && (
        <form onSubmit={guardar}>
          <label>{tr('Qué es')}
            <select className="campo" value={d.tipo} onChange={(e) => poner('tipo', e.target.value)}>
              {Object.entries(GRUPOS).map(([g, nombre]) => (
                <optgroup key={g} label={tr(nombre)}>
                  {Object.entries(TIPOS_DEDUCCION_IS).filter(([, x]) => x.grupo === g).map(([k, x]) => <option key={k} value={k}>{tr(x.nombre)} ({tr(x.norma)})</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="dos-col">
            <label>{tr('Ejercicio del que viene')}<input className="campo" inputMode="numeric" required value={d.de} onChange={(e) => poner('de', e.target.value)} placeholder={String(anio)} /></label>
            <label>{tr(t?.donado ? 'Lo donado (€)' : 'Importe de la deducción (€)')}<input className="campo" inputMode="decimal" required value={d.importe} onChange={(e) => poner('importe', e.target.value)} placeholder="1.000,00" /></label>
          </div>
          {t?.donado && <>
            <label>{tr('Entidad que lo recibió')}<input className="campo" required maxLength={120} value={d.entidad} onChange={(e) => poner('entidad', e.target.value)} placeholder={tr('Nombre de la fundación o asociación')} /></label>
            <p className="nota">{tr('Deduce el 40 % de lo donado (el 35 % antes de 2024) y el 50 % si en los dos ejercicios anteriores donaste a la misma entidad sin bajar el importe. La base de la deducción no pasa del 15 % de la base imponible del año (el 10 % antes de 2024); lo que sobra se pierde.')}</p>
          </>}
          {t && !t.donado && <p className="nota">{tr(t.norma)}. {tr(t.arrastre === 0 ? 'Las bonificaciones no se arrastran: o caben en la cuota de su año o se pierden.'
            : t.arrastre === Infinity ? 'Resta antes que las demás y lo que no cabe en la cuota se aplica en los años siguientes, sin plazo.'
            : t.arrastre === 18 ? 'Entra en el límite conjunto del art. 39.1 (el 25 % de la cuota, o el 50 % si las deducciones de I+D+i del año pasan del 10 % de esa cuota) y lo que no cabe se arrastra 18 años.'
            : 'Entra en el límite conjunto del art. 39.1 (el 25 % de la cuota, o el 50 % si las deducciones de I+D+i del año pasan del 10 % de esa cuota) y lo que no cabe se arrastra 15 años.')}</p>}
          {error && <p className="error" role="alert">{tr(error)}</p>}
          <div className="fila-act">
            <button className="boton pequeno" disabled={enviando}>{tr(enviando ? 'Guardando…' : 'Guardar')}</button>
            <button type="button" className="boton sec pequeno" onClick={() => { setAbierto(false); setError(''); }}>{tr('Cancelar')}</button>
          </div>
        </form>
      )}
      {error && !abierto && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}

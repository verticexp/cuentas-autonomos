'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from '@/components/Acciones';
import { confirmar } from '@/components/Confirmar';
import { NATURALEZAS_C, NATURALEZAS_C_NOMBRES, RET_CAPITAL, TIPOS_RENDIMIENTO } from '@/lib/capitalMobiliario';
import { eur, fechaCorta } from '@/lib/formato';
import Vacio from '@/components/Vacio';
import { useT } from '@/components/Idioma';

// Dividendos e intereses pagados en el año (modelos 123 y 193): apuntarlos y borrarlos. La retención del 19 % se calcula
// sola (se puede cambiar si un convenio o una exención dice otra cosa). En «otros», la naturaleza de la clave C del 193; en
// intereses, si es el préstamo de un socio vinculado, los intereses del exceso (clave D, lib/capitalMobiliario.js).
export default function PagosCapital({ anio, pagos, hoy, sociedad = true, soloLectura = false }) {
  const router = useRouter();
  const tr = useT();
  const vacio = { fecha: hoy.startsWith(`${anio}-`) ? hoy : `${anio}-12-31`, tipo: sociedad ? 'dividendos' : 'intereses', nombre: '', nif: '', bruto: '', retencionPct: String(RET_CAPITAL), naturaleza: '', vinculado: false, exceso: '' };
  const [p, setP] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const bruto = Number(String(p.bruto).replace(/\./g, '').replace(',', '.')) || 0;
  const pct = Number(String(p.retencionPct).replace(',', '.')) || 0;

  const guardar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      await llamar('/api/capital', { method: 'POST', body: JSON.stringify({ fecha: p.fecha, tipo: p.tipo, perceptor: { nombre: p.nombre, nif: p.nif }, bruto: p.bruto, retencionPct: p.retencionPct,
        ...(p.tipo === 'otros' && p.naturaleza ? { naturaleza: p.naturaleza } : {}), ...(p.tipo === 'intereses' && p.vinculado ? { vinculado: true, exceso: p.exceso } : {}) }) });
      setP(vacio); setAbierto(false);
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  };
  const quitar = async (x) => {
    if (!(await confirmar({ titulo: tr('Borrar el pago'), texto: tr('{fecha} · {nombre} · {importe}. Deja de contar en el 123, el 193 y la contabilidad.', { fecha: fechaCorta(x.fecha), nombre: x.perceptor.nombre, importe: eur(x.bruto) }), aceptar: tr('Borrar'), peligro: true }))) return;
    try { await llamar(`/api/capital?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setError(err.message); }
  };

  return (
    <div className="formulario tarjeta bloque pagos-capital">
      {pagos.length ? (
        <ul className="lista-pagos">
          {pagos.map((x) => (
            <li key={x.id}>
              <span>{fechaCorta(x.fecha)} · {x.perceptor.nombre}{x.perceptor.nif ? ` (${x.perceptor.nif})` : ''} · {tr(TIPOS_RENDIMIENTO[x.tipo])}{x.vinculado ? ` · ${x.exceso > 0 ? tr('socio vinculado ({importe} del exceso, clave D)', { importe: eur(x.exceso) }) : tr('socio vinculado')}` : ''}</span>
              <span>{tr('{bruto} · retención {retencion} · pagado {liquido}', { bruto: eur(x.bruto), retencion: eur(x.retencion), liquido: eur(x.liquido) })}{!soloLectura && <> <button type="button" className="enlace-claro" onClick={() => quitar(x)}>{tr('Borrar')}</button></>}</span>
            </li>
          ))}
        </ul>
      ) : <Vacio compacto icono="cobrar" titulo={tr('Aún no has apuntado pagos de {anio}', { anio })}>{tr('Apunta aquí los dividendos o intereses que pagues: Fisquo calcula la retención y rellena los modelos 123 y 193.')}</Vacio>}
      {!soloLectura && !abierto && <button type="button" className="boton sec pequeno" onClick={() => setAbierto(true)}>{tr('Apuntar un pago')}</button>}
      {!soloLectura && abierto && (
        <form onSubmit={guardar}>
          <div className="dos-col">
            <label>{tr('Fecha del pago')}<input className="campo" type="date" required value={p.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
            <label>{tr('Qué es')}
              <select className="campo" value={p.tipo} onChange={(e) => poner('tipo', e.target.value)}>
                {Object.entries(TIPOS_RENDIMIENTO).filter(([k]) => sociedad || k !== 'dividendos').map(([k, n]) => <option key={k} value={k}>{tr(n)}</option>)}
              </select>
            </label>
          </div>
          <div className="dos-col">
            <label>{tr('A quién')}<input className="campo" required maxLength={120} value={p.nombre} onChange={(e) => poner('nombre', e.target.value)} placeholder={tr('Nombre o razón social')} /></label>
            <label>{tr('Su NIF')}<input className="campo" required value={p.nif} onChange={(e) => poner('nif', e.target.value)} placeholder="12345678Z" /></label>
          </div>
          <div className="dos-col">
            <label>{tr('Importe bruto (antes de la retención)')}<input className="campo" inputMode="decimal" required value={p.bruto} onChange={(e) => poner('bruto', e.target.value)} placeholder="1.000,00" /></label>
            <label>{tr('Retención (%)')}<input className="campo" inputMode="decimal" value={p.retencionPct} onChange={(e) => poner('retencionPct', e.target.value)} /></label>
          </div>
          {p.tipo === 'otros' && (
            <label>{tr('Naturaleza en el 193 (clave C)')}
              <select className="campo" value={p.naturaleza} onChange={(e) => poner('naturaleza', e.target.value)}>
                <option value="">{tr('Sin indicar: otros a la base general (o la 14 si cobra una empresa)')}</option>
                {NATURALEZAS_C.map((k) => <option key={k} value={k}>{k} · {tr(NATURALEZAS_C_NOMBRES[k])}</option>)}
              </select>
            </label>
          )}
          {p.tipo === 'intereses' && <>
            <label className="check"><input type="checkbox" checked={p.vinculado} onChange={(e) => poner('vinculado', e.target.checked)} /> {tr('Es un préstamo de un socio vinculado (persona física) a la sociedad')}</label>
            {p.vinculado && <>
              <label>{tr('Intereses que corresponden al exceso (€)')}<input className="campo" inputMode="decimal" value={p.exceso} onChange={(e) => poner('exceso', e.target.value)} placeholder="0,00" /></label>
              <p className="nota">{tr('Si lo que el socio te ha prestado pasa del triple de su parte en los fondos propios de la sociedad, los intereses de lo que pasa de ese triple van en el 193 con la clave D (y tributan en su base general, art. 46 de la Ley del IRPF); el resto, con la B. Ejemplo: tiene el 50 % de unos fondos propios de 20.000 € (10.000 €; el triple, 30.000 €) y presta 40.000 €: la cuarta parte de los intereses (lo de los 10.000 € de más) es el exceso. Si no pasa del triple, déjalo en 0.')}</p>
            </>}
          </>}
          {bruto > 0 && <p className="nota">{tr('Retienes {retencion} y le pagas {liquido}.', { retencion: eur(Math.round(bruto * pct) / 100), liquido: eur(bruto - Math.round(bruto * pct) / 100) })}</p>}
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

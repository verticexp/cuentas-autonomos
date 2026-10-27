'use client';

import { useT } from '@/components/Idioma';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { vibrar } from '@/lib/haptica';
import { r2 } from '@/lib/calculos';
import { COMISION_MAX_MANUAL } from '@/lib/caja';
import { eur, fechaTexto } from '@/lib/formato';

const pct = (c, t) => (t ? `${(Math.round((c / t) * 1000) / 10).toLocaleString('es-ES')} %` : '');

// Cuadre a mano (app/api/caja/tarjeta con manual): cuando Fisquo no propone el cuadre (días sueltos, una comisión alta,
// un ingreso con otro concepto…), se elige el ingreso del banco y los cierres cuya tarjeta liquida. La comisión puede
// llegar al 10 %. movs: ingresos pendientes { id, fecha, importe, concepto }; cierres: con tarjeta sin cuadrar { id, fecha, tarjeta, numero }.
export default function CuadreManual({ movs = [], cierres = [] }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const [mov, setMov] = useState('');
  const [elegidos, setElegidos] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const m = movs.find((x) => x.id === mov);
  // Solo los cierres del día del ingreso o del mes anterior (el banco no liquida lo que aún no se ha cobrado).
  const desde = m ? new Date(Date.parse(`${m.fecha}T12:00:00Z`) - 31 * 864e5).toISOString().slice(0, 10) : '';
  const posibles = m ? cierres.filter((f) => f.fecha <= m.fecha && f.fecha >= desde) : [];
  const tarjeta = r2(posibles.filter((f) => elegidos.has(f.id)).reduce((s, f) => s + f.tarjeta, 0));
  const comision = m ? r2(tarjeta - m.importe) : 0;
  const estado = !m ? 'Elige el ingreso del banco'
    : !elegidos.size ? 'Marca los días cuya tarjeta liquida'
      : comision < -0.01 ? `Faltan ${eur(-comision)}: el ingreso es mayor que la tarjeta elegida`
        : comision > r2(tarjeta * COMISION_MAX_MANUAL) + 0.01 ? `La comisión sería del ${pct(comision, tarjeta)}: como mucho el ${COMISION_MAX_MANUAL * 100} %`
          : null;
  const cambiarMov = (id) => { setMov(id); setElegidos(new Set()); setError(''); };
  const alternar = (id) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const enviar = async () => {
    setEnviando(true); setError('');
    try {
      await llamar('/api/caja/tarjeta', { method: 'POST', body: JSON.stringify({ mov, cierres: [...elegidos], manual: true }) });
      vibrar();
      setMov(''); setElegidos(new Set());
      router.refresh();
    } catch (e) { setError(e.message); }
    setEnviando(false);
  };

  return (
    <details className="caja-mano">
      <summary>{tr("Cuadrar a mano")}</summary>
      <p className="nota">{tr("Si Fisquo no propone el cuadre de un ingreso, elígelo aquí con los días cuya tarjeta liquida.")}</p>
      <label>{tr("Ingreso del banco")}<select className="campo" value={mov} onChange={(e) => cambiarMov(e.target.value)}>
          <option value="">{tr("Elige un ingreso…")}</option>
          {movs.map((x) => <option key={x.id} value={x.id}>{fechaTexto(x.fecha)} · {eur(x.importe)}{(x.concepto ? ` · ${x.concepto.slice(0, 40)}` : "")}</option>)}
        </select>
      </label>
      {m && (
        posibles.length ? (
          <fieldset className="caja-mano-dias">
            <legend>{tr("Tarjeta que liquida")}</legend>
            {posibles.map((f) => (
              <label key={f.id} className="check caja-mano-dia">
                <input type="checkbox" checked={elegidos.has(f.id)} onChange={() => alternar(f.id)} />
                <span>{fechaTexto(f.fecha)} <small>{f.numero}</small></span>
                <strong>{eur(f.tarjeta)}</strong>
              </label>
            ))}
          </fieldset>
        ) : <p className="nota">{(tr("No hay cierres con tarjeta sin cuadrar del mes anterior al") + " ")}{fechaTexto(m.fecha)}.</p>
      )}
      {m && elegidos.size > 0 && (
        <p className="caja-mano-res" aria-live="polite">{(tr("Tarjeta") + " ")}{eur(tarjeta)}{(" " + tr("· ingreso") + " ")}{eur(m.importe)}{!estado ? ` · ${comision > 0 ? tr('comisión {importe} ({porcentaje})', { importe: eur(comision), porcentaje: pct(comision, tarjeta) }) : tr('sin comisión')}` : ''}</p>
      )}
      {estado && <p id={ayudaId} className={m && elegidos.size ? 'error' : 'nota'}>{tr(estado)}</p>}
      {error && <p className="error" role="alert">{tr(error)}</p>}
      <button type="button" className="boton" onClick={enviar} disabled={enviando || Boolean(estado)} aria-describedby={estado ? ayudaId : undefined}>{(enviando ? tr("Cuadrando…") : tr("Cuadrar a mano"))}</button>
    </details>
  );
}

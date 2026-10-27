'use client';

import { useT } from '@/components/Idioma';

import { confirmar as confirmarAccion } from './Confirmar';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { volverA } from '@/lib/transicion';
import { textoSituacion } from '@/lib/formato';

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  // App bloqueada (el servidor ya no da datos): a la pantalla de desbloqueo, para volver aquí después.
  if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  if (!r.ok) throw new Error(d.error || 'No se ha podido guardar el cambio. Revisa la conexión e inténtalo otra vez.');
  return d;
}

export function Borrar({ url, pregunta, volver }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const borrar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: tr("Borrar"), texto: tr(pregunta), aceptar: tr("Borrar"), peligro: true }))) return;
    try {
      await llamar(url, { method: 'DELETE' });
      if (volver) volverA(router, volver, 'atras', true);
      else router.refresh();
    } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="borrar" onClick={borrar}>{tr("Borrar")}</button>{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}

export function Imprimir() {
  const tr = useT();
  return <button type="button" className="boton" onClick={() => window.print()}>{tr("Descargar PDF")}</button>;
}

// Icono de cada estado (`situacion` = { estado: 'curso' | 'listo' | 'fuera', dias }, de situacionTrimestre en lib/calculos.js).
const PUNTO = { hecho: '✓', fuera: '!', listo: '', curso: '' };

// Franja de estado (solo lectura): la usa la tarjeta del 303 cuando el trimestre se marca en el 130.
export function EstadoTrimestre({ hecho, situacion, plazo, nota }) {
  const tr = useT();
  const clave = hecho ? 'hecho' : situacion.estado;
  return (
    <div className={`pres pres-${clave}`}>
      <p className="pres-estado"><span className="pres-txt"><span className="pres-punto" aria-hidden="true">{PUNTO[clave]}</span>{(hecho ? tr("Presentado") : tr(textoSituacion(situacion, plazo, nota)))}</span></p>
    </div>
  );
}

// Estado del trimestre: pendiente, presentado y 130 pagado (resta en los siguientes) o presentado sin pagar el 130 (se arrastra).
// Con `situacion` y `plazo` (página de Impuestos) va dentro de una franja con el estado por fecha y una confirmación al marcarlo.
// El selector queda bloqueado durante todo el guardado (PATCH + refresco) y muestra al momento la opción elegida;
// si falla, vuelve a la de antes y se desbloquea. Se bloquea con aria-disabled y una guarda, no con `disabled`,
// para no quitarle el foco a quien usa el teclado.
// modelo="303": solo el 303 (pendiente o presentado), guardado aparte del 130; `pagado` es entonces true o false.
// devolucion: en el 303 del 4T con saldo a favor, la opción de presentarlo pidiendo la devolución (pagado === 'devolucion').
// soloLectura: sin el permiso «Contabilidad», el estado sin selector.
export function Presentado({ anio, t, importe, pagado, con130 = true, situacion, plazo, modelo, devolucion = false, soloLectura = false }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [guardando, empezar] = useTransition();
  const ocupado = useRef(false);
  const [confirmado, setConfirmado] = useState(false);
  const servidor = ['303', '420'].includes(modelo) ? (pagado === 'devolucion' ? 'devolucion' : pagado ? 'sinpagar' : 'pendiente') : pagado === undefined || pagado === null ? 'pendiente' : pagado > 0 && con130 ? 'pagado' : 'sinpagar';
  // Lo ya guardado manda hasta que el refresco trae ese mismo valor: así ni la franja ni el selector vuelven
  // un instante al estado anterior si la transición termina antes de que lleguen los datos nuevos.
  const [guardado, setGuardado] = useState(null);
  if (guardado !== null && guardado === servidor) setGuardado(null);
  const valor = guardado ?? servidor;
  const [elegido, elegir] = useOptimistic(valor);
  const cambiar = (e) => {
    if (ocupado.current || guardando) return;
    ocupado.current = true;
    setError('');
    const v = e.target.value;
    const imp = v === 'pendiente' ? null : v === 'pagado' ? importe : 0;
    setConfirmado(false);
    empezar(async () => {
      elegir(v);
      try {
        await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify(['303', '420'].includes(modelo) ? { presentado303: { anio, t, hecho: v !== 'pendiente', ...(v === 'devolucion' ? { devolucion: true } : {}) } } : modelo === '131' ? { presentado131: { anio, t, importe: imp } } : { presentado: { anio, t, importe: imp } }) });
        setGuardado(v);
        setConfirmado(v !== 'pendiente');
        empezar(() => router.refresh());
      } catch (err) { setError(err.message); } finally { ocupado.current = false; }
    });
  };
  const selector = (
    <select className={`estado ${elegido === 'pagado' || (!con130 && elegido !== 'pendiente') ? 'ok' : `pend${situacion?.estado === 'fuera' ? ' fuera' : ''}`}`} value={elegido} onChange={cambiar} aria-label={tr("Estado del {v1} del {v2}T {v3}", { v1: (modelo || (con130 ? "130" : "303")), v2: t, v3: anio })} aria-disabled={guardando || undefined} aria-busy={guardando || undefined}>
      <option value="pendiente">{tr("Pendiente")}</option>
      {con130 ? <>
        <option value="pagado">{tr("Presentado y 130 pagado")}</option>
        <option value="sinpagar">{tr("Presentado, 130 sin pagar")}</option>
      </> : <><option value="sinpagar">{(devolucion ? tr("Presentado, a compensar") : tr("Presentado"))}</option>{(devolucion || elegido === 'devolucion') && <option value="devolucion">{tr("Presentado, pido la devolución")}</option>}</>}
    </select>
  );
  if (soloLectura) {
    const texto = { pendiente: 'Pendiente', pagado: 'Presentado y 130 pagado', sinpagar: con130 ? 'Presentado, 130 sin pagar' : 'Presentado', devolucion: 'Presentado, con devolución' }[valor];
    return situacion ? <EstadoTrimestre hecho={valor !== 'pendiente'} situacion={situacion} plazo={plazo} /> : <span className={`estado-txt ${valor === 'pendiente' ? 'e-pendiente' : 'e-ok'}`}>{tr(texto)}</span>;
  }
  // Sin situación (Resumen): solo el selector, como antes.
  if (!situacion) return <>{selector}{error && <span className="error" role="alert">{tr(error)}</span>}</>;
  const hecho = valor !== 'pendiente';
  const clave = hecho ? 'hecho' : situacion.estado;
  const texto = guardando ? 'Guardando…' : hecho ? (confirmado ? `Hecho: ${t}T ${anio} presentado` : `${t}T ${anio} presentado`) : textoSituacion(situacion, plazo);
  // La región «live» está siempre montada y solo cambia su texto (así los lectores de pantalla lo anuncian);
  // el <span> interior cambia de key para repetir la animación de entrada.
  return (
    <div className={`pres pres-${clave}`} data-busy={guardando || undefined}>
      <p className="pres-estado" role="status" aria-live="polite">
        <span key={guardando ? 'g' : `${clave}-${confirmado}`} className="pres-txt">
          <span className="pres-punto" aria-hidden="true">{(guardando ? "" : PUNTO[clave])}</span>{tr(texto)}
        </span>
      </p>
      {selector}
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}

// Pago del 202 (sociedades): pendiente o presentado y pagado. Lo pagado se resta del Impuesto sobre Sociedades.
export function Presentado202({ anio, p, importe, pagado, soloLectura = false }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const cambiar = async (e) => {
    setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ presentado202: { anio, p, importe: e.target.value === 'pagado' ? importe : null } }) });
      router.refresh();
    } catch (err) { setError(err.message); }
  };
  const hecho = pagado !== undefined && pagado !== null;
  if (soloLectura) return <span className={`estado-txt ${hecho ? 'e-ok' : 'e-pendiente'}`}>{(hecho ? tr("Presentado y pagado") : tr("Pendiente"))}</span>;
  return (
    <><select className={`estado ${hecho ? 'ok' : 'pend'}`} value={hecho ? 'pagado' : 'pendiente'} onChange={cambiar} aria-label={tr("Pago {v1} del 202", { v1: p })}>
      <option value="pendiente">{tr("Pendiente")}</option>
      <option value="pagado">{tr("Presentado y pagado")}</option>
    </select>{error && <span className="error" role="alert">{tr(error)}</span>}</>
  );
}

// 111 y 115: presentado o pendiente con su propia marca (lib/empresa.js marcaRet; sin ella, como el trimestre). También el
// 123, el 216 y el 369, que solo cuentan como presentados con ella.
// soloLectura: sin el permiso «Contabilidad», el estado sin selector.
export function PresentadoRet({ modelo, anio, t, hecho, soloLectura = false }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  if (soloLectura) return <span className={`estado-txt ${hecho ? 'e-ok' : 'e-pendiente'}`}>{(hecho ? tr("Presentado") : tr("Pendiente"))}</span>;
  const cambiar = async (e) => {
    setError('');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ presentadoRet: { modelo, anio, t, hecho: e.target.value === 'hecho' } }) });
      router.refresh();
    } catch (err) { setError(err.message); }
  };
  return (
    <><select className={`estado ${hecho ? 'ok' : 'pend'}`} value={hecho ? 'hecho' : 'pendiente'} onChange={cambiar} aria-label={tr("Estado del {v1} del {v2}T {v3}", { v1: modelo, v2: t, v3: anio })}>
      <option value="pendiente">{tr("Pendiente")}</option>
      <option value="hecho">{tr("Presentado")}</option>
    </select>{error && <span className="error" role="alert">{tr(error)}</span>}</>
  );
}

export { llamar };

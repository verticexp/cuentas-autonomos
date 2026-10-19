'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { volverA } from '@/lib/transicion';
import { textoSituacion } from '@/lib/formato';

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  // App bloqueada (el servidor ya no da datos): a la pantalla de desbloqueo, para volver aquí después.
  if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
  return d;
}

export function Borrar({ url, pregunta, volver }) {
  const router = useRouter();
  const borrar = async () => {
    if (!confirm(pregunta)) return;
    try {
      await llamar(url, { method: 'DELETE' });
      if (volver) volverA(router, volver);
      router.refresh();
    } catch (e) { alert(e.message); }
  };
  return <button className="borrar" onClick={borrar}>Borrar</button>;
}

export function Imprimir() {
  return <button className="boton" onClick={() => window.print()}>Descargar PDF</button>;
}

// Icono de cada estado (`situacion` = { estado: 'curso' | 'listo' | 'fuera', dias }, de situacionTrimestre en lib/calculos.js).
const PUNTO = { hecho: '✓', fuera: '!', listo: '', curso: '' };

// Franja de estado (solo lectura): la usa la tarjeta del 303 cuando el trimestre se marca en el 130.
export function EstadoTrimestre({ hecho, situacion, plazo, nota }) {
  const clave = hecho ? 'hecho' : situacion.estado;
  return (
    <div className={`pres pres-${clave}`}>
      <p className="pres-estado"><span className="pres-txt"><span className="pres-punto" aria-hidden="true">{PUNTO[clave]}</span>{hecho ? 'Presentado' : textoSituacion(situacion, plazo, nota)}</span></p>
    </div>
  );
}

// Estado del trimestre: pendiente, presentado y 130 pagado (resta en los siguientes) o presentado sin pagar el 130 (se arrastra).
// Con `situacion` y `plazo` (página de Impuestos) va dentro de una franja con el estado por fecha y una confirmación al marcarlo.
// El selector queda bloqueado durante todo el guardado (PATCH + refresco) y muestra al momento la opción elegida;
// si falla, vuelve a la de antes y se desbloquea. Se bloquea con aria-disabled y una guarda, no con `disabled`,
// para no quitarle el foco a quien usa el teclado.
export function Presentado({ anio, t, importe, pagado, con130 = true, situacion, plazo }) {
  const router = useRouter();
  const [guardando, empezar] = useTransition();
  const ocupado = useRef(false);
  const [confirmado, setConfirmado] = useState(false);
  const servidor = pagado === undefined || pagado === null ? 'pendiente' : pagado > 0 && con130 ? 'pagado' : 'sinpagar';
  // Lo ya guardado manda hasta que el refresco trae ese mismo valor: así ni la franja ni el selector vuelven
  // un instante al estado anterior si la transición termina antes de que lleguen los datos nuevos.
  const [guardado, setGuardado] = useState(null);
  if (guardado !== null && guardado === servidor) setGuardado(null);
  const valor = guardado ?? servidor;
  const [elegido, elegir] = useOptimistic(valor);
  const cambiar = (e) => {
    if (ocupado.current || guardando) return;
    ocupado.current = true;
    const v = e.target.value;
    const imp = v === 'pendiente' ? null : v === 'pagado' ? importe : 0;
    setConfirmado(false);
    empezar(async () => {
      elegir(v);
      try {
        await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ presentado: { anio, t, importe: imp } }) });
        setGuardado(v);
        setConfirmado(v !== 'pendiente');
        empezar(() => router.refresh());
      } catch (err) { alert(err.message); } finally { ocupado.current = false; }
    });
  };
  const selector = (
    <select className={`estado ${elegido === 'pagado' || (!con130 && elegido !== 'pendiente') ? 'ok' : 'pend'}`} value={elegido} onChange={cambiar} aria-label={`Estado del ${t}T ${anio}`} aria-disabled={guardando || undefined} aria-busy={guardando || undefined}>
      <option value="pendiente">Pendiente</option>
      {con130 ? <>
        <option value="pagado">Presentado y 130 pagado</option>
        <option value="sinpagar">Presentado, 130 sin pagar</option>
      </> : <option value="sinpagar">Presentado</option>}
    </select>
  );
  // Sin situación (Resumen): solo el selector, como antes.
  if (!situacion) return selector;
  const hecho = valor !== 'pendiente';
  const clave = hecho ? 'hecho' : situacion.estado;
  const texto = guardando ? 'Guardando…' : hecho ? (confirmado ? `Hecho: ${t}T ${anio} presentado` : `${t}T ${anio} presentado`) : textoSituacion(situacion, plazo);
  // La región «live» está siempre montada y solo cambia su texto (así los lectores de pantalla lo anuncian);
  // el <span> interior cambia de key para repetir la animación de entrada.
  return (
    <div className={`pres pres-${clave}`} data-busy={guardando || undefined}>
      <p className="pres-estado" role="status" aria-live="polite">
        <span key={guardando ? 'g' : `${clave}-${confirmado}`} className="pres-txt">
          <span className="pres-punto" aria-hidden="true">{guardando ? '' : PUNTO[clave]}</span>{texto}
        </span>
      </p>
      {selector}
    </div>
  );
}

// Pago del 202 (sociedades): pendiente o presentado y pagado. Lo pagado se resta del Impuesto sobre Sociedades.
export function Presentado202({ anio, p, importe, pagado }) {
  const router = useRouter();
  const cambiar = async (e) => {
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ presentado202: { anio, p, importe: e.target.value === 'pagado' ? importe : null } }) });
      router.refresh();
    } catch (err) { alert(err.message); }
  };
  const hecho = pagado !== undefined && pagado !== null;
  return (
    <select className={`estado ${hecho ? 'ok' : 'pend'}`} value={hecho ? 'pagado' : 'pendiente'} onChange={cambiar} aria-label={`Pago ${p} del 202`}>
      <option value="pendiente">Pendiente</option>
      <option value="pagado">Presentado y pagado</option>
    </select>
  );
}

export { llamar };

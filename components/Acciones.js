'use client';

import { useRouter } from 'next/navigation';

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
  return d;
}

export function Borrar({ url, pregunta, volver }) {
  const router = useRouter();
  const borrar = async () => {
    if (!confirm(pregunta)) return;
    try {
      await llamar(url, { method: 'DELETE' });
      if (volver) router.push(volver);
      router.refresh();
    } catch (e) { alert(e.message); }
  };
  return <button className="borrar" onClick={borrar}>Borrar</button>;
}

export function Cobrada({ id, cobrada }) {
  const router = useRouter();
  const cambiar = async () => {
    try { await llamar('/api/facturas', { method: 'PATCH', body: JSON.stringify({ id, cobrada: !cobrada }) }); router.refresh(); } catch (e) { alert(e.message); }
  };
  return <button className={`estado ${cobrada ? 'ok' : 'pend'}`} onClick={cambiar}>{cobrada ? 'Cobrada' : 'Pendiente'}</button>;
}

export function Imprimir() {
  return <button className="boton" onClick={() => window.print()}>Descargar PDF</button>;
}

// Estado del trimestre: pendiente, presentado y 130 pagado (resta en los siguientes) o presentado sin pagar el 130 (se arrastra).
export function Presentado({ anio, t, importe, pagado, con130 = true }) {
  const router = useRouter();
  const valor = pagado === undefined || pagado === null ? 'pendiente' : pagado > 0 && con130 ? 'pagado' : 'sinpagar';
  const cambiar = async (e) => {
    const v = e.target.value;
    const imp = v === 'pendiente' ? null : v === 'pagado' ? importe : 0;
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ presentado: { anio, t, importe: imp } }) });
      router.refresh();
    } catch (err) { alert(err.message); }
  };
  return (
    <select className={`estado ${valor === 'pagado' || (!con130 && valor !== 'pendiente') ? 'ok' : 'pend'}`} value={valor} onChange={cambiar}>
      <option value="pendiente">Pendiente</option>
      {con130 ? <>
        <option value="pagado">Presentado y 130 pagado</option>
        <option value="sinpagar">Presentado, 130 sin pagar</option>
      </> : <option value="sinpagar">Presentado</option>}
    </select>
  );
}

export { llamar };

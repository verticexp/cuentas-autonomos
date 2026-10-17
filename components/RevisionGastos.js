'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { eur, fechaCorta } from '@/lib/formato';

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
  return d;
}

const MOTIVO = {
  conflicto: 'Otro cargo apunta al mismo gasto: elige cuál es.',
  alternativa: 'Otro gasto encajaba mejor, pero ya está reservado para otro cargo.',
};

// Un cargo sin conciliar: el gasto que puede ser (emparejar o borrarlo si no cuadra), elegir otro, añadirlo o apartarlo.
function Cargo({ x, abierto, abrir }) {
  const router = useRouter();
  const { m, sugerencia: s, otras } = x;
  const [elegido, setElegido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  async function hacer(fn) {
    setOcupado(true); setAviso('');
    try { await fn(); router.refresh(); } catch (e) { setAviso(e.message); } finally { setOcupado(false); }
  }
  const emparejar = (gasto) => hacer(() => llamar('/api/gastos/revision', { method: 'POST', body: JSON.stringify({ accion: 'emparejar', id: m.id, gasto }) }));
  const apartar = () => confirm('¿Apartar este cargo? No es un gasto (un traspaso, un préstamo…) y deja de salir aquí. Puedes recuperarlo en Banco.')
    && hacer(() => llamar('/api/gastos/revision', { method: 'POST', body: JSON.stringify({ accion: 'ignorar', id: m.id }) }));
  const borrar = (g) => confirm(`¿Eliminar el gasto «${g.texto}» del ${fechaCorta(g.fecha)} (${eur(g.importe)})? Se borra con su justificante y no se puede deshacer.`)
    && hacer(() => llamar(`/api/gastos?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' }));
  const quien = m.contraparte || m.concepto;
  const elegida = otras.find((o) => o.id === elegido);
  return (
    <li className={`rev-cargo${abierto ? ' abierto' : ''}`}>
      <button type="button" className="fila rev-cab" aria-expanded={abierto} onClick={abrir}>
        <span className="txt"><strong>{quien}</strong><small>{fechaCorta(m.fecha)} · {s ? `puede ser «${s.texto}»` : otras.length ? 'elige su gasto o añádelo' : 'falta su gasto'}</small></span>
        <span className="imp-col"><span className="imp">{eur(Math.abs(m.importe))}</span><span className="estado-txt e-pendiente">{s ? 'Revisar' : 'Añadir'}</span></span>
      </button>
      {abierto && (
        <div className="rev-cuerpo">
          {m.contraparte && m.concepto && <p className="nota">Banco: {m.concepto}</p>}
          {s && (
            <div className="rev-sug">
              <p className="rev-sug-t">{s.segura ? 'Es este gasto' : 'Puede ser este gasto'}</p>
              <Link href={`/gastos/${encodeURIComponent(s.id)}`} className="rev-sug-d"><strong>{s.texto}</strong><small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ' · sin pagar' : ''}</small></Link>
              {s.motivo && MOTIVO[s.motivo] && <small className="nota">{MOTIVO[s.motivo]}</small>}
              <div className="rev-botones">
                <button type="button" className="boton pequeno" disabled={ocupado} onClick={() => emparejar(s.id)}>Emparejar</button>
                <button type="button" className="boton pequeno sec peligro" disabled={ocupado} onClick={() => borrar(s)}>No cuadra: eliminar gasto</button>
              </div>
            </div>
          )}
          {otras.length > 0 && (
            <div className="rev-elegir">
              <label className="rev-sug-t" htmlFor={`rev-${m.id}`}>{s ? 'O es otro gasto' : 'Elige el gasto'}</label>
              <select id={`rev-${m.id}`} className="campo" value={elegido} onChange={(e) => setElegido(e.target.value)}>
                <option value="">Gastos de fechas cercanas…</option>
                {otras.map((o) => <option key={o.id} value={o.id}>{o.texto} · {fechaCorta(o.fecha)} · {eur(o.importe)}{o.cuadra ? ' ✓' : ''}</option>)}
              </select>
              {elegida && !elegida.cuadra && <small className="nota">El importe no coincide con el cargo ({eur(Math.abs(m.importe))}): corrige el gasto antes de emparejarlo.</small>}
              {elegida && (
                <div className="rev-botones">
                  <button type="button" className="boton pequeno" disabled={ocupado || !elegida.cuadra} onClick={() => emparejar(elegida.id)}>Emparejar</button>
                  <button type="button" className="boton pequeno sec peligro" disabled={ocupado} onClick={() => borrar(elegida)}>Eliminar gasto</button>
                </div>
              )}
            </div>
          )}
          <div className="rev-botones">
            <Link href={`/gastos?banco=${encodeURIComponent(m.id)}`} className="boton pequeno sec">Añadir con su factura</Link>
            <button type="button" className="boton pequeno sec" disabled={ocupado} onClick={apartar}>No es un gasto</button>
          </div>
          {aviso && <p className="error" role="alert">{aviso}</p>}
        </div>
      )}
    </li>
  );
}

export default function RevisionGastos({ items, total }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <section className="grupo gastos-revision">
      <h2 className="grupo-t">En revisión · {total}</h2>
      <p className="grupo-pie arriba">Cargos de tu banco sin su gasto en Netto. Toca uno para emparejarlo, borrar el gasto que no cuadra o añadirlo con su factura.</p>
      <ul className="grupo-lista">
        {items.map((x) => <Cargo key={x.m.id} x={x} abierto={abierto === x.m.id} abrir={() => setAbierto(abierto === x.m.id ? null : x.m.id)} />)}
      </ul>
      {total > items.length && <p className="grupo-pie"><Link href="/banco">Y {total - items.length} más en Banco ›</Link></p>}
    </section>
  );
}

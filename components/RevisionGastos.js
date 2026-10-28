'use client';

import { fraseBanco } from '@/lib/textoBanco';
import { confirmar as confirmarAccion } from './Confirmar';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { eur, fechaCorta } from '@/lib/formato';
import { useT } from '@/components/Idioma';

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido guardar la revisión. Revisa la conexión e inténtalo otra vez.');
  return d;
}

const MOTIVO = {
  conflicto: 'Otro cargo apunta al mismo gasto: elige cuál es.',
  alternativa: 'Otro gasto encajaba mejor, pero ya está reservado para otro cargo.',
};

// Un cargo sin conciliar: revisar su gasto, elegir otro, añadirlo o apartarlo.
function Cargo({ x, abierto, abrir }) {
  const tr = useT();
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
  const apartar = async () => (await confirmarAccion({ titulo: tr('Apartar cargo'), texto: tr('¿Apartar este cargo? No es un gasto (un traspaso, un préstamo…) y deja de salir aquí. Puedes recuperarlo en Banco.'), aceptar: tr('Apartar cargo'), peligro: true }))
    && hacer(() => llamar('/api/gastos/revision', { method: 'POST', body: JSON.stringify({ accion: 'ignorar', id: m.id }) }));
  const quien = m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto);
  const elegida = otras.find((o) => o.id === elegido);
  return (
    <li className={`rev-cargo${abierto ? ' abierto' : ''}`}>
      <button type="button" className="fila rev-cab" aria-expanded={abierto} onClick={abrir}>
        <span className="txt"><strong>{quien}</strong><small>{fechaCorta(m.fecha)} · {s ? tr('puede ser «{texto}»', { texto: s.texto }) : otras.length ? tr('elige su gasto o añádelo') : tr('falta su gasto')}</small></span>
        <span className="imp-col"><span className="imp">{eur(Math.abs(m.importe))}</span><span className="estado-txt e-pendiente">{s ? tr('Revisar') : tr('Añadir')}</span></span>
      </button>
      {abierto && (
        <div className="rev-cuerpo">
          {m.contraparte && m.concepto && <p className="nota">{tr('Banco: {concepto}', { concepto: m.concepto })}</p>}
          {s && (
            <div className="rev-sug">
              <p className="rev-sug-t">{s.segura ? tr('Es este gasto') : tr('Puede ser este gasto')}</p>
              <Link href={`/gastos/${encodeURIComponent(s.id)}`} className="rev-sug-d"><strong>{s.texto}</strong><small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ` · ${tr('sin pagar')}` : ''}</small></Link>
              {s.motivo && MOTIVO[s.motivo] && <small className="nota">{tr(MOTIVO[s.motivo])}</small>}
              <div className="rev-botones">
                <button type="button" className="boton pequeno" disabled={ocupado} onClick={() => emparejar(s.id)}>{tr('Emparejar')}</button>
                <Link className="boton pequeno sec" href={`/gastos/${encodeURIComponent(s.id)}`}>{tr('Revisar gasto')}</Link>
              </div>
            </div>
          )}
          {otras.length > 0 && (
            <div className="rev-elegir">
              <label className="rev-sug-t" htmlFor={`rev-${m.id}`}>{s ? tr('O es otro gasto') : tr('Elige el gasto')}</label>
              <select id={`rev-${m.id}`} className="campo" value={elegido} onChange={(e) => setElegido(e.target.value)}>
                <option value="">{tr('Gastos de fechas cercanas…')}</option>
                {otras.map((o) => <option key={o.id} value={o.id}>{o.texto} · {fechaCorta(o.fecha)} · {eur(o.importe)}{o.cuadra ? ' ✓' : ''}</option>)}
              </select>
              {elegida && !elegida.cuadra && <small id={`rev-${m.id}-importe`} className="nota">{tr('El importe no coincide con el cargo ({importe}): corrige el gasto antes de emparejarlo.', { importe: eur(Math.abs(m.importe)) })}</small>}
              {elegida && (
                <div className="rev-botones">
                  <button type="button" className="boton pequeno" disabled={ocupado || !elegida.cuadra} aria-describedby={!elegida.cuadra ? `rev-${m.id}-importe` : undefined} onClick={() => emparejar(elegida.id)}>{tr('Emparejar')}</button>
                  <Link className="boton pequeno sec" href={`/gastos/${encodeURIComponent(elegida.id)}`}>{tr('Revisar gasto')}</Link>
                </div>
              )}
            </div>
          )}
          <div className="rev-botones">
            <Link href={`/gastos?banco=${encodeURIComponent(m.id)}`} className="boton pequeno sec">{tr('Añadir con su factura')}</Link>
            <button type="button" className="boton pequeno sec" disabled={ocupado} onClick={apartar}>{tr('No es un gasto')}</button>
          </div>
          {aviso && <p className="error" role="alert">{tr(aviso)}</p>}
        </div>
      )}
    </li>
  );
}

// Los primeros cinco: con trece, la lista de gastos (lo que se viene a ver) quedaba dos pantallas más abajo.
const VISIBLES = 5;

export default function RevisionGastos({ items, total }) {
  const tr = useT();
  const [abierto, setAbierto] = useState(null);
  const [todos, setTodos] = useState(false);
  const vistos = todos ? items : items.slice(0, VISIBLES);
  return (
    <section className="grupo gastos-revision">
      <h2 className="grupo-t">{tr('Cargos del banco sin gasto')} · {total}</h2>
      <p className="grupo-pie arriba">{tr('Cargos de tu banco sin su gasto en Fisquo. Toca uno para revisar la coincidencia, elegir otro gasto o añadirlo con su factura.')}</p>
      <ul className="grupo-lista">
        {vistos.map((x) => <Cargo key={x.m.id} x={x} abierto={abierto === x.m.id} abrir={() => setAbierto(abierto === x.m.id ? null : x.m.id)} />)}
      </ul>
      {!todos && items.length > VISIBLES && <button type="button" className="boton pequeno sec rev-ver-todos" onClick={() => setTodos(true)}>{tr('Ver los {n} restantes', { n: items.length - VISIBLES })}</button>}
      {(todos || items.length <= VISIBLES) && total > items.length && <p className="grupo-pie"><Link href="/banco">{tr('Y {n} más en Banco ›', { n: total - items.length })}</Link></p>}
    </section>
  );
}

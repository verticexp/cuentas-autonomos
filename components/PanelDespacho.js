'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Ir from '@/components/Ir';
import { navegar } from '@/lib/transicion';
import { eur } from '@/lib/formato';
import { ESTADOS_TEXTO } from '@/components/despachoTextos';

// Lista de clientes de Mi despacho, como las listas de la app (Facturas, Gastos): una fila por cliente que abre su ficha.
// Las cifras del trimestre (api/despacho/resumen) se piden de cuatro en cuatro al abrir la pantalla (la primera vez de un
// cliente se calcula su año entero). Cada fila tiene siempre la misma altura: mientras llegan, su hueco espera vacío y
// aparecen con un fundido, sin mover nada.
const A_LA_VEZ = 4;

export async function entrarEn(empresa, ir = '/') {
  const r = await fetch('/api/despacho/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, ir }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido entrar en este cliente.');
  try { sessionStorage.removeItem('fisquo-arranque'); } catch {}
  window.location.assign(d.ir || '/');
}

// Importe del IVA o del IRPF: a pagar, a compensar o a devolver. null: no presenta ese modelo.
function Cifra({ v }) {
  if (!v) return <span className="desp-nada">No presenta</span>;
  if (v.compensar > 0) return <>{eur(0)}<small>a compensar {eur(v.compensar)}</small></>;
  if (v.devolver > 0) return <>{eur(0)}<small>a devolver {eur(v.devolver)}</small></>;
  return <>{eur(v.importe)}<small>a ingresar</small></>;
}

function Avisos({ r }) {
  if (!r) return <span className="desp-hueco" aria-hidden />;
  if (r.error) return <span>No se han podido calcular sus cifras</span>;
  const l = [
    r.porRevisar > 0 && <b key="b">{r.porRevisar} por revisar</b>,
    r.comentarios?.noLeidos > 0 && <b key="c">{r.comentarios.noLeidos === 1 ? '1 mensaje nuevo' : `${r.comentarios.noLeidos} mensajes nuevos`}</b>,
    r.comentarios?.abiertos > 0 && !r.comentarios.noLeidos && <span key="p">{r.comentarios.abiertos === 1 ? '1 pregunta abierta' : `${r.comentarios.abiertos} preguntas abiertas`}</span>,
    r.sinJustificante > 0 && <span key="j">{r.sinJustificante} sin justificante</span>,
  ].filter(Boolean);
  return l.length ? l.reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), []) : <span>Todo al día</span>;
}

export default function PanelDespacho({ filas, equipo = [], anio, t, hoy }) {
  const router = useRouter();
  const [buscar, setBuscar] = useState('');
  const [gestor, setGestor] = useState('');
  const [resumen, setResumen] = useState({});
  const nombres = useMemo(() => Object.fromEntries(equipo.map((x) => [x.id, x.nombre || x.email])), [equipo]);

  useEffect(() => {
    let vivo = true;
    const cola = filas.map((f) => f.id);
    const uno = async () => {
      while (vivo && cola.length) {
        const id = cola.shift();
        for (let intento = 0; intento < 4 && vivo; intento++) {
          const r = await fetch(`/api/despacho/resumen?empresa=${encodeURIComponent(id)}&anio=${anio}&t=${t}`).catch(() => null);
          if (r?.status === 429) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
          const d = r?.ok ? await r.json().catch(() => null) : null;
          if (vivo) setResumen((x) => ({ ...x, [id]: d || { error: true } }));
          break;
        }
      }
    };
    setResumen({});
    Promise.all(Array.from({ length: A_LA_VEZ }, uno));
    return () => { vivo = false; };
  }, [filas, anio, t]);

  const periodos = useMemo(() => {
    const y = Number(hoy.slice(0, 4));
    return [y, y - 1].flatMap((a) => [4, 3, 2, 1].map((q) => ({ anio: a, t: q }))).filter((p) => `${p.anio}-${String(p.t * 3 - 2).padStart(2, '0')}-01` <= hoy);
  }, [hoy]);
  const cambiarPeriodo = (v) => { const [a, q] = v.split('-'); navegar(router, `/despacho?anio=${a}&t=${q}`, 'pestana-der', undefined, false, { scroll: false }); };
  const texto = buscar.trim().toLowerCase();
  const visibles = filas.filter((f) => (!texto || `${f.nombre} ${f.nif}`.toLowerCase().includes(texto)) && (!gestor || (gestor === '-' ? !f.gestor : f.gestor === gestor)));
  const filtros = equipo.length > 1 ? [['', 'Todos'], ...equipo.map((x) => [x.id, (x.nombre || x.email).split(' ')[0]]), ['-', 'Sin asignar']] : [];

  return <div className="desp-panel">
    <div className="desp-herramientas">
      <div className="buscar" role="search">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
        <input type="search" placeholder="Buscar cliente" aria-label="Buscar cliente" value={buscar} onChange={(e) => setBuscar(e.target.value)} enterKeyHint="search" autoComplete="off" />
      </div>
      <label className="desp-select">
        <span className="sr">Trimestre</span>
        <select value={`${anio}-${t}`} onChange={(e) => cambiarPeriodo(e.target.value)}>
          {periodos.map((p) => <option key={`${p.anio}-${p.t}`} value={`${p.anio}-${p.t}`}>{p.t}T {p.anio}</option>)}
        </select>
      </label>
    </div>
    {filtros.length > 0 && <div className="chips desp-chips" role="radiogroup" aria-label="Gestor">
      {filtros.map(([id, nombre]) => <button key={id || 'todos'} type="button" role="radio" aria-checked={gestor === id} className={gestor === id ? 'activo' : ''} onClick={() => setGestor(id)}>{nombre}</button>)}
    </div>}

    {visibles.length ? <>
      <div className="desp-cols" aria-hidden><span>Cliente</span><span>Estado</span><span>IVA</span><span>IRPF</span></div>
      <ul className="grupo-lista desp-lista">{visibles.map((f) => {
        const r = resumen[f.id];
        const estado = r?.cambiosTrasCierre ? 'cambios' : f.estado;
        const meta = [f.nif, f.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo', f.territorio !== 'Territorio común' && f.territorio, f.gestor && nombres[f.gestor], f.licencia && 'En tu cuota'].filter(Boolean).join(' · ');
        return <li key={f.id}>
          <Ir className="fila desp-fila" href={`/despacho/${encodeURIComponent(f.id)}?anio=${anio}&t=${t}`}>
            <span className="txt">
              <strong>{f.nombre}</strong>
              <small>{meta}</small>
              <small className={`desp-avisos${r ? ' listo' : ''}`}><Avisos r={r} /></small>
            </span>
            <span className="desp-col-estado"><span className={`desp-estado e-${estado}`}>{ESTADOS_TEXTO[estado]}</span></span>
            <span className={`desp-num${r ? ' listo' : ''}`} data-t="IVA">{r && !r.error ? <Cifra v={r.iva} /> : <span className="desp-hueco" aria-label="Calculando" />}</span>
            <span className={`desp-num${r ? ' listo' : ''}`} data-t="IRPF">{r && !r.error ? <Cifra v={r.irpf} /> : <span className="desp-hueco" aria-hidden />}</span>
          </Ir>
        </li>;
      })}</ul>
    </> : <p className="nota desp-vacio">Ningún cliente con estos filtros.</p>}
  </div>;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Ir from '@/components/Ir';
import { navegar } from '@/lib/transicion';
import { eur, fechaCorta } from '@/lib/formato';
import { ESTADOS_TEXTO } from '@/components/despachoTextos';

// Tabla de clientes de Mi despacho. Las cifras del trimestre de cada uno (api/despacho/resumen) se piden de cuatro en
// cuatro al abrir la pantalla: la primera vez de un cliente se calcula todo su año.
const A_LA_VEZ = 4;

export async function entrarEn(empresa, ir = '/') {
  const r = await fetch('/api/despacho/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, ir }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido entrar en este cliente.');
  try { sessionStorage.removeItem('fisquo-arranque'); } catch {}
  window.location.assign(d.ir || '/');
}

function Cifra({ v, titulo }) {
  if (v === undefined) return <span className="desp-cargando" aria-label="Calculando" />;
  if (!v) return <span aria-label={`${titulo}: no presenta`}>—</span>;
  if (v.compensar > 0) return <>{eur(0)}<small>a compensar {eur(v.compensar)}</small></>;
  if (v.devolver > 0) return <>{eur(0)}<small>a devolver {eur(v.devolver)}</small></>;
  return eur(v.importe);
}

export default function PanelDespacho({ filas, equipo = [], anio, t, hoy }) {
  const router = useRouter();
  const [buscar, setBuscar] = useState('');
  const [gestor, setGestor] = useState('');
  const [resumen, setResumen] = useState({});
  const [error, setError] = useState('');
  const nombres = useMemo(() => Object.fromEntries(equipo.map((x) => [x.id, x.nombre || x.email])), [equipo]);

  useEffect(() => {
    let vivo = true;
    const cola = [...filas.map((f) => f.id)];
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
  const entrar = (id) => entrarEn(id, '/modelos').catch((e) => setError(e.message));

  return <>
    <div className="desp-barra">
      <input className="campo" type="search" placeholder="Buscar por nombre o NIF" aria-label="Buscar cliente" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      {equipo.length > 1 && <select className="campo" aria-label="Gestor" value={gestor} onChange={(e) => setGestor(e.target.value)}>
        <option value="">Todos los gestores</option>
        <option value="-">Sin asignar</option>
        {equipo.map((x) => <option key={x.id} value={x.id}>{x.nombre || x.email}</option>)}
      </select>}
      <select className="campo" aria-label="Trimestre" value={`${anio}-${t}`} onChange={(e) => cambiarPeriodo(e.target.value)}>
        {periodos.map((p) => <option key={`${p.anio}-${p.t}`} value={`${p.anio}-${p.t}`}>{p.t}T {p.anio}</option>)}
      </select>
      <a className="boton sec" href={`/api/despacho/paquete?todos=1&anio=${anio}&t=${t}`} download>Descargar todos los paquetes</a>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {visibles.length ? <table className="desp-tabla">
      <thead><tr><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col" className="num">IVA</th><th scope="col" className="num">IRPF</th><th scope="col">Pendiente</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{visibles.map((f) => {
        const r = resumen[f.id];
        const estado = r?.cambiosTrasCierre ? 'cambios' : f.estado;
        const avisos = r && !r.error ? [
          r.porRevisar > 0 && <span key="b" className="aviso">{r.porRevisar} por revisar</span>,
          r.sinJustificante > 0 && <span key="j">{r.sinJustificante} sin justificante</span>,
          r.comentarios?.respuestas > 0 && <span key="c" className="aviso">{r.comentarios.respuestas === 1 ? '1 respuesta' : `${r.comentarios.respuestas} respuestas`}</span>,
          r.comentarios?.abiertos > 0 && !r.comentarios.respuestas && <span key="p">{r.comentarios.abiertos} preguntas abiertas</span>,
        ].filter(Boolean) : [];
        return <tr key={f.id}>
          <td className="desp-cliente"><Ir href={`/despacho/${encodeURIComponent(f.id)}?anio=${anio}&t=${t}`}>{f.nombre}</Ir>
            <small>{[f.nif, f.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo', f.territorio !== 'Territorio común' && f.territorio, f.gestor && nombres[f.gestor], f.licencia && 'Incluido en tu cuota'].filter(Boolean).join(' · ')}</small></td>
          <td><span className={`desp-estado e-${estado}`}>{ESTADOS_TEXTO[estado]}</span>{f.cierre && estado !== 'presentado' && <small className="nota"> {fechaCorta(f.cierre.fecha.slice(0, 10))}</small>}</td>
          <td className="num" data-t="IVA">{r?.error ? '—' : <Cifra v={r ? r.iva : undefined} titulo="IVA" />}</td>
          <td className="num" data-t="IRPF">{r?.error ? '—' : <Cifra v={r ? r.irpf : undefined} titulo="IRPF" />}</td>
          <td>{r?.error ? <span className="nota">No se ha podido calcular</span> : <span className="desp-avisos">{r ? (avisos.length ? avisos : 'Nada') : <span className="desp-cargando" aria-label="Calculando" />}</span>}</td>
          <td><div className="desp-fila-acc"><Ir className="boton sec" href={`/despacho/${encodeURIComponent(f.id)}?anio=${anio}&t=${t}`}>Revisar</Ir><button type="button" className="boton sec" onClick={() => entrar(f.id)}>Entrar</button></div></td>
        </tr>;
      })}</tbody>
    </table> : <p className="nota">Ningún cliente con estos filtros.</p>}
  </>;
}

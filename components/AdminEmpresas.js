'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import Vacio from '@/components/Vacio';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ESTADOS, ORIGENES } from '@/lib/admin';

const euros = (c) => (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

// Panel /admin: todas las empresas, con búsqueda, filtro por estado y las acciones de app/api/admin.
export default function AdminEmpresas({ filas }) {
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState('');
  const [origen, setOrigen] = useState('');
  const [forma, setForma] = useState('');
  const [abierta, setAbierta] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return filas.filter((f) => (!estado || f.estado === estado) && (!origen || f.origen === origen) && (!forma || f.forma === forma) && (!q || `${f.nombre} ${f.nif} ${f.id}`.toLowerCase().includes(q)));
  }, [filas, busca, estado, origen, forma]);
  const noCuadran = filas.filter((f) => f.forma === 'no-cuadra').length;

  async function accion(empresa, datos, pregunta) {
    if (pregunta && !(await confirmarAccion({ titulo: datos.accion === 'quitar-fundador' ? 'Quitar plan Fundador' : 'Regalar plan Fundador', texto: pregunta, aceptar: datos.accion === 'quitar-fundador' ? 'Quitar plan' : 'Regalar plan', peligro: datos.accion === 'quitar-fundador' }))) return;
    setOcupado(true); setMsg('');
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa, ...datos }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setOcupado(false);
    if (!r?.ok) { setMsg(d?.error || 'No se ha podido conectar.'); return; }
    setMsg('Hecho.'); router.refresh();
  }

  return <section className="adm-empresas" aria-labelledby="adm-empresas-t" aria-busy={ocupado}>
    <h2 id="adm-empresas-t">Empresas</h2>
    <div className="adm-filtros">
      <input className="campo" type="search" placeholder="Buscar por nombre, NIF o id" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar empresa" />
      <select className="campo" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
        <option value="">Todos los estados</option>
        {Object.entries(ESTADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      <select className="campo" value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Filtrar por origen">
        <option value="">Todos los orígenes</option>
        {Object.entries(ORIGENES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      {noCuadran > 0 && <select className="campo" value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Filtrar por forma jurídica">
        <option value="">Todos los planes</option>
        <option value="no-cuadra">Planes que no cuadran ({noCuadran})</option>
      </select>}
    </div>
    {msg && <p className={msg === 'Hecho.' ? 'adm-ok' : 'adm-mal'} role="status">{msg}</p>}
    <p className="adm-pie">{lista.length} de {filas.length}</p>
    {!lista.length && <Vacio compacto tipo="resultados" icono="cliente" titulo="Ninguna empresa con estos filtros" accion={<button type="button" className="boton sec" onClick={() => { setBusca(''); setEstado(''); setOrigen(''); setForma(''); }}>Quitar filtros</button>} />}
    <ul className="adm-tabla">
      {lista.map((f) => <li key={f.id} className={abierta === f.id ? 'abierta' : ''}>
        <button type="button" className="adm-fila" aria-expanded={abierta === f.id} onClick={() => setAbierta(abierta === f.id ? '' : f.id)}>
          <span className="adm-nombre"><strong>{f.nombre}</strong><small>{f.nif || f.id} · alta {f.creada || '—'}{f.forma === 'no-cuadra' ? <b className="adm-mal"> · plan que no cuadra</b> : ''}</small></span>
          <span className={`adm-estado adm-${f.estado}`}>{ESTADOS[f.estado]}{f.estado === 'prueba' && f.dias !== null ? ` · ${f.dias} d` : ''}</span>
          <span className="adm-plan">{f.plan ? `${f.tipo} ${f.plan}${f.periodo === 'anio' ? ' anual' : ''}` : '—'}</span>
          <span className="adm-num">{f.mensual ? `${euros(f.mensual)}/mes` : ''}</span>
          <span className="adm-num">{f.personas} {f.personas === 1 ? 'persona' : 'personas'}</span>
          <span className="adm-num">{f.ultima ? `Activa ${f.ultima}` : 'Sin actividad'}</span>
        </button>
        {abierta === f.id && <div className="adm-acciones">
          <p className="adm-pie">Id {f.id} · {ORIGENES[f.origen]}{f.hasta ? ` · prueba hasta ${f.hasta}` : ''}{f.gestoria ? ` · gestoría ${f.gestoria}` : ''}{f.recomendadaPor ? ` · recomendada por ${f.recomendadaPor}${f.premiada ? ` (premio dado el ${f.premiada})` : ''}` : ''}{f.cupon ? ` · cupón ${f.cupon}` : ''}{f.mesesGanados ? ` · ${f.mesesGanados} meses ganados recomendando` : ''}{f.motivoForma ? ` · plan de Autónomos que no cuadra: ${f.motivoForma}` : ''}</p>
          {f.estado !== 'fundador' && <button type="button" className="boton pequeno" disabled={ocupado} onClick={() => accion(f.id, { accion: 'fundador' }, `¿Dar a ${f.nombre} el plan Fundador, gratis de por vida?`)}>Regalar plan Fundador</button>}
          {f.regalo && <button type="button" className="boton pequeno sec" disabled={ocupado} onClick={() => accion(f.id, { accion: 'quitar-fundador' }, `¿Quitar el plan Fundador a ${f.nombre}? Vuelve a su plan y, si su prueba ya acabó, queda en solo lectura.`)}>Quitar plan Fundador</button>}
          {['prueba', 'caducada'].includes(f.estado) && [7, 15, 30].map((n) => <button key={n} type="button" className="boton pequeno sec" disabled={ocupado} onClick={() => accion(f.id, { accion: 'alargar', dias: n })}>+{n} días de prueba</button>)}
        </div>}
      </li>)}
    </ul>
  </section>;
}

'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import Vacio from '@/components/Vacio';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ESTADOS, ORIGENES } from '@/lib/admin';
import { PLANES } from '@/components/web/datos';
import { TIPOS_ALTA } from '@/lib/prueba';

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
    if (pregunta && !(await confirmarAccion({ titulo: datos.accion === 'quitar-fundador' ? 'Quitar plan Fundador' : datos.accion === 'plan' ? 'Cambiar plan' : 'Regalar plan Fundador', texto: pregunta, aceptar: datos.accion === 'quitar-fundador' ? 'Quitar plan' : datos.accion === 'plan' ? 'Cambiar plan' : 'Regalar plan', peligro: datos.accion === 'quitar-fundador' }))) return;
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
          <p className="adm-pie">Id {f.id} · {ORIGENES[f.origen]}{f.hasta && !f.suscripcion ? ` · prueba hasta ${f.hasta}` : ''}{f.gestoria ? ` · gestoría ${f.gestoria}` : ''}{f.recomendadaPor ? ` · recomendada por ${f.recomendadaPor}${f.premiada ? ` (premio dado el ${f.premiada})` : ''}` : ''}{f.cupon ? ` · cupón ${f.cupon}` : ''}{f.mesesGanados ? ` · ${f.mesesGanados} meses ganados recomendando` : ''}{f.motivoForma ? ` · plan de Autónomos que no cuadra: ${f.motivoForma}` : ''}</p>
          {!f.registrada && <p className="adm-pie">Cuenta anterior a los planes (o tuya): es gratis, no tiene límites ni caduca. No hay nada que cambiar.</p>}
          {f.estado !== 'fundador' && !f.suscripcion && <button type="button" className="boton pequeno" disabled={ocupado} onClick={() => accion(f.id, { accion: 'fundador' }, `¿Dar a ${f.nombre} el plan Fundador, gratis de por vida?`)}>Regalar plan Fundador</button>}
          {f.regalo && <button type="button" className="boton pequeno sec" disabled={ocupado} onClick={() => accion(f.id, { accion: 'quitar-fundador' }, `¿Quitar el plan Fundador a ${f.nombre}? Vuelve a su plan y, si su prueba ya acabó, queda en solo lectura.`)}>Quitar plan Fundador</button>}
          {!f.suscripcion && f.estado !== 'fundador' && f.registrada && <label className="adm-cambiar">Cambiar plan
            <select className="campo" disabled={ocupado} value="" onChange={(e) => { const [tipo, nombre] = e.target.value.split('|'); if (tipo) accion(f.id, { accion: 'plan', tipo, nombre }, `¿Pasar ${f.nombre} a ${TIPOS_ALTA[tipo]} ${nombre}? No se le cobra nada: solo cambia lo que puede usar mientras dure su prueba.`); }}>
              <option value="">Elige un plan…</option>
              {Object.entries(TIPOS_ALTA).map(([t, tt]) => <optgroup key={t} label={tt}>{PLANES[t].map((p) => <option key={p.n} value={`${t}|${p.n}`} disabled={f.tipoId === t && f.plan === p.n}>{tt} {p.n} · {p.p} €/mes</option>)}</optgroup>)}
            </select>
          </label>}
          {f.suscripcion && <a className="boton pequeno sec" href={`https://dashboard.stripe.com/subscriptions/${f.suscripcion}`} target="_blank" rel="noopener noreferrer">Abrir su suscripción en Stripe ↗</a>}
          {!f.suscripcion && f.clienteStripe && <a className="boton pequeno sec" href={`https://dashboard.stripe.com/customers/${f.clienteStripe}`} target="_blank" rel="noopener noreferrer">Abrir cliente en Stripe ↗</a>}
          {f.suscripcion && <p className="adm-pie">Paga con Stripe: el plan y el precio se cambian en Stripe y Fisquo se pone al día solo.</p>}
          {['prueba', 'caducada'].includes(f.estado) && [7, 15, 30].map((n) => <button key={n} type="button" className="boton pequeno sec" disabled={ocupado} onClick={() => accion(f.id, { accion: 'alargar', dias: n })}>+{n} días de prueba</button>)}
        </div>}
      </li>)}
    </ul>
  </section>;
}

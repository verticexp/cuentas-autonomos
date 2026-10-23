import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles } from '@/lib/despachos';
import { plazosDespacho } from '@/lib/plazosDespacho';
import { fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plazos · Mi despacho' };

const DIAS = 90;
const enDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// Los vencimientos de todos los clientes en los próximos 90 días, con los que ya están marcados como presentados.
export default async function Plazos() {
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const clientes = (await clientesVisibles(d, u.id)).map(({ id, empresa: e }) => ({ id, nombre: e.emisor?.nombre || e.nombre, fiscal: e.fiscal || {}, pres: { pres303: e.pres303, pagos130: e.pagos130, pres111: e.pres111, pres115: e.pres115, pres123: e.pres123 } }));
  const plazos = plazosDespacho(clientes, { hoy: dia, dias: DIAS });
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">Plazos</h1>
    <p className="desp-sub">Lo que vence en los próximos {DIAS} días para tus {clientes.length === 1 ? 'cliente' : `${clientes.length} clientes`}. «Presentado» sale de lo que se marca en los Impuestos de cada uno.</p>
    {plazos.length ? <ul className="desp-plazos">{plazos.map((p) => {
      const faltan = p.clientes.filter((c) => c.presentado === false);
      const hechos = p.clientes.filter((c) => c.presentado === true).length;
      const n = enDias(dia, p.fecha);
      return <li key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}`}>
        <time dateTime={p.fecha}>{fechaTexto(p.fecha)}<small>{n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`}</small></time>
        <div>
          <h3>{p.modelo} · {p.nombre} · {p.periodo}</h3>
          <p>{p.hacienda} · {p.clientes.length === 1 ? '1 cliente' : `${p.clientes.length} clientes`}{hechos ? ` · ${hechos} presentados` : ''}</p>
          {faltan.length > 0 && <p className="falta">Sin marcar como presentado: {faltan.slice(0, 8).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Ir href={`/despacho/${encodeURIComponent(c.id)}`}>{c.nombre}</Ir></span>)}{faltan.length > 8 ? ` y ${faltan.length - 8} más` : ''}</p>}
          {faltan.length === 0 && hechos === 0 && <p>{p.clientes.slice(0, 8).map((c) => c.nombre).join(', ')}{p.clientes.length > 8 ? ` y ${p.clientes.length - 8} más` : ''}</p>}
        </div>
      </li>;
    })}</ul> : <Vacio icono="plazo" titulo="Nada que venza pronto">{clientes.length ? `Ningún modelo vence antes del ${fechaCorta(new Date(Date.parse(`${dia}T12:00:00Z`) + DIAS * 864e5).toISOString().slice(0, 10))}.` : 'Cuando tengas clientes, aquí verás sus plazos.'}</Vacio>}
  </main>;
}

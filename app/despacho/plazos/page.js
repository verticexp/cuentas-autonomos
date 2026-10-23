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

const DIAS = 120;
const enDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const ATRASO = 90;
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// La ficha del cliente abierta en el trimestre del modelo («3T 2026»); los anuales, en el último trimestre.
const fichaDe = (id, periodo) => {
  const m = /^(\d)T (\d{4})$/.exec(periodo);
  return `/despacho/${encodeURIComponent(id)}${m ? `?anio=${m[2]}&t=${m[1]}` : ''}`;
};
const nombres = (lista, max = 8) => <>{lista.slice(0, max).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Ir href={c.href}>{c.nombre}</Ir></span>)}{lista.length > max ? ` y ${lista.length - max} más` : ''}</>;

function Plazo({ p, dia }) {
  const n = enDias(dia, p.fecha);
  const clientes = p.clientes.map((c) => ({ ...c, href: fichaDe(c.id, p.periodo) }));
  const faltan = clientes.filter((c) => c.presentado === false);
  const hechos = clientes.filter((c) => c.presentado === true).length;
  return <li className={p.vencido ? 'vencido' : ''}>
    <time dateTime={p.fecha}>{fechaTexto(p.fecha)}{p.fecha.slice(0, 4) !== dia.slice(0, 4) ? ` de ${p.fecha.slice(0, 4)}` : ''}<small>{p.vencido ? `venció hace ${-n} ${n === -1 ? 'día' : 'días'}` : n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`}</small></time>
    <div>
      <h3>{p.modelo} · {p.nombre} · {p.periodo}</h3>
      <p>{p.hacienda}{p.vencido ? '' : ` · ${clientes.length === 1 ? '1 cliente' : `${clientes.length} clientes`}${hechos ? ` · ${hechos} ya presentados` : ''}`}</p>
      {p.vencido ? <p className="falta">Sin presentar: {nombres(faltan)}</p>
        : faltan.length > 0 && n <= 20 ? <p className="falta">Por presentar: {nombres(faltan)}</p>
          : <p>{nombres(clientes)}</p>}
    </div>
  </li>;
}

// Los vencimientos de todos los clientes: lo que ya venció sin marcar como presentado (los últimos 90 días) y lo que vence
// en los próximos 120, por meses. «Presentado» sale de lo que se marca en los Impuestos de cada cliente.
export default async function Plazos() {
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const clientes = (await clientesVisibles(d, u.id)).map(({ id, empresa: e }) => ({ id, nombre: e.nombre || e.emisor?.nombre, fiscal: e.fiscal || {}, pres: { pres303: e.pres303, pagos130: e.pagos130, pres111: e.pres111, pres115: e.pres115, pres123: e.pres123 } }));
  const plazos = plazosDespacho(clientes, { hoy: dia, dias: DIAS, atraso: ATRASO });
  const vencidos = plazos.filter((p) => p.vencido);
  const proximos = plazos.filter((p) => !p.vencido);
  const meses = [...new Set(proximos.map((p) => p.fecha.slice(0, 7)))];
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">Plazos</h1>
    <p className="desp-sub">Los modelos de {clientes.length === 1 ? 'tu cliente' : `tus ${clientes.length} clientes`} que vencen en los próximos {DIAS} días y lo que venció sin presentar. «Presentado» sale de lo que se marca en los Impuestos de cada uno.</p>
    {vencidos.length > 0 && <section className="grupo" aria-labelledby="pl-vencidos">
      <h2 className="grupo-t rojo" id="pl-vencidos">Fuera de plazo</h2>
      <ul className="desp-plazos">{vencidos.map((p) => <Plazo key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}`} p={p} dia={dia} />)}</ul>
      <p className="grupo-pie">Si ya los presentaste, márcalos en los Impuestos del cliente y dejan de salir aquí.</p>
    </section>}
    {meses.map((m) => <section key={m} className="grupo" aria-labelledby={`pl-${m}`}>
      <h2 className="grupo-t" id={`pl-${m}`}>{MESES[Number(m.slice(5, 7)) - 1]}{m.slice(0, 4) !== dia.slice(0, 4) ? ` de ${m.slice(0, 4)}` : ''}</h2>
      <ul className="desp-plazos">{proximos.filter((p) => p.fecha.startsWith(m)).map((p) => <Plazo key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}-${p.nombre}`} p={p} dia={dia} />)}</ul>
    </section>)}
    {!plazos.length && <Vacio icono="plazo" titulo="Nada que venza pronto">{clientes.length ? `Ningún modelo vence antes del ${fechaCorta(new Date(Date.parse(`${dia}T12:00:00Z`) + DIAS * 864e5).toISOString().slice(0, 10))}.` : 'Cuando tengas clientes, aquí verás sus plazos.'}</Vacio>}
  </main>;
}

import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles } from '@/lib/despachos';
import { plazosDespacho } from '@/lib/plazosDespacho';
import { fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Ir from '@/components/Ir';
import CalendarioDespacho from '@/components/CalendarioDespacho';
import { headers } from 'next/headers';
import Vacio from '@/components/Vacio';
import { conHuecos } from '@/lib/huecos';
import { idiomaActual, textos } from '@/lib/idiomaServidor';
import { localeDe } from '@/lib/i18n';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Plazos · Mi despacho') }; }

const DIAS = 120;
const enDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const ATRASO = 90;
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const periodoTexto = (tr, periodo) => { const m = /^(\d)T (\d{4})$/.exec(periodo); return m ? tr('{t}T {anio}', { t: m[1], anio: m[2] }) : periodo; };
// La ficha del cliente abierta en el trimestre del modelo («3T 2026»); los anuales, en el último trimestre.
const fichaDe = (id, periodo) => {
  const m = /^(\d)T (\d{4})$/.exec(periodo);
  return `/despacho/${encodeURIComponent(id)}${m ? `?anio=${m[2]}&t=${m[1]}` : ''}`;
};
const nombres = (tr, lista, max = 8) => {
  const enlaces = <>{lista.slice(0, max).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Ir prefetch={false} href={c.href}>{c.nombre}</Ir></span>)}</>;
  return lista.length > max ? <>{conHuecos(tr('{lista} y {n} más'), { lista: enlaces, n: lista.length - max })}</> : enlaces;
};
// El mes de un encabezado: «Octubre» o «Octubre de 2027». En castellano, el de siempre; en los demás, con Intl.
const mesTexto = (idioma, m, anioDistinto) => {
  if (idioma === 'es') return `${MESES[Number(m.slice(5, 7)) - 1]}${anioDistinto ? ` de ${m.slice(0, 4)}` : ''}`;
  const texto = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1, 12)).toLocaleDateString(localeDe(idioma), { month: 'long', ...(anioDistinto ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

function Plazo({ p, dia, tr }) {
  const n = enDias(dia, p.fecha);
  const clientes = p.clientes.map((c) => ({ ...c, href: fichaDe(c.id, p.periodo) }));
  const faltan = clientes.filter((c) => c.presentado === false);
  const hechos = clientes.filter((c) => c.presentado === true).length;
  return <li className={p.vencido ? 'vencido' : ''}>
    <time dateTime={p.fecha}>{tr(`${fechaTexto(p.fecha)}${p.fecha.slice(0, 4) !== dia.slice(0, 4) ? ` de ${p.fecha.slice(0, 4)}` : ''}`)}<small>{p.vencido ? (n === -1 ? tr('venció hace {n} día', { n: -n }) : tr('venció hace {n} días', { n: -n })) : n === 0 ? tr('hoy') : n === 1 ? tr('mañana') : tr('en {n} días', { n })}</small></time>
    <div>
      <h3>{p.modelo} · {tr(p.nombre)} · {periodoTexto(tr, p.periodo)}</h3>
      <p>{[tr(p.hacienda), ...(p.vencido ? [] : [clientes.length === 1 ? tr('1 cliente') : tr('{n} clientes', { n: clientes.length }), hechos ? tr('{n} ya presentados', { n: hechos }) : ''])].filter(Boolean).join(' · ')}</p>
      {p.vencido ? <p className="falta">{conHuecos(tr('Sin presentar: {lista}'), { lista: nombres(tr, faltan) })}</p>
        : faltan.length > 0 && n <= 20 ? <p className="falta">{conHuecos(tr('Por presentar: {clientes}'), { clientes: nombres(tr, faltan) })}</p>
          : <p>{nombres(tr, clientes)}</p>}
    </div>
  </li>;
}

// Los vencimientos de todos los clientes: lo que ya venció sin marcar como presentado (los últimos 90 días) y lo que vence
// en los próximos 120, por meses. «Presentado» sale de lo que se marca en los Impuestos de cada cliente.
export default async function Plazos() {
  const tr = await textos();
  const idioma = await idiomaActual();
  const { u, d } = await requerirDespacho();
  const token = d.miembros[u.id]?.calendario;
  const cabeceras = token ? await headers() : null;
  const url = token ? `https://${cabeceras.get('host')}/api/abierta/calendario?t=${encodeURIComponent(token)}` : '';
  const dia = hoy();
  const clientes = (await clientesVisibles(d, u.id)).map(({ id, empresa: e }) => ({ id, nombre: e.nombre || e.emisor?.nombre, fiscal: e.fiscal || {}, pres: { pres303: e.pres303, pagos130: e.pagos130, pres111: e.pres111, pres115: e.pres115, pres123: e.pres123 } }));
  const plazos = plazosDespacho(clientes, { hoy: dia, dias: DIAS, atraso: ATRASO });
  const vencidos = plazos.filter((p) => p.vencido);
  const proximos = plazos.filter((p) => !p.vencido);
  const meses = [...new Set(proximos.map((p) => p.fecha.slice(0, 7)))];
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">{tr('Plazos')}</h1>
    <p className="desp-sub">{clientes.length === 1 ? tr('Los modelos de tu cliente que vencen en los próximos {dias} días y lo que venció sin presentar. «Presentado» sale de lo que se marca en los Impuestos de cada uno.', { dias: DIAS }) : tr('Los modelos de tus {n} clientes que vencen en los próximos {dias} días y lo que venció sin presentar. «Presentado» sale de lo que se marca en los Impuestos de cada uno.', { n: clientes.length, dias: DIAS })}</p>
    <CalendarioDespacho token={token} url={url} />
    {vencidos.length > 0 && <section className="grupo" aria-labelledby="pl-vencidos">
      <h2 className="grupo-t rojo" id="pl-vencidos">{tr('Fuera de plazo')}</h2>
      <ul className="desp-plazos">{vencidos.map((p) => <Plazo key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}`} p={p} dia={dia} tr={tr} />)}</ul>
      <p className="grupo-pie">{tr('Si ya los presentaste, márcalos en los Impuestos del cliente y dejan de salir aquí.')}</p>
    </section>}
    {meses.map((m) => <section key={m} className="grupo" aria-labelledby={`pl-${m}`}>
      <h2 className="grupo-t" id={`pl-${m}`}>{mesTexto(idioma, m, m.slice(0, 4) !== dia.slice(0, 4))}</h2>
      <ul className="desp-plazos">{proximos.filter((p) => p.fecha.startsWith(m)).map((p) => <Plazo key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}-${p.nombre}`} p={p} dia={dia} tr={tr} />)}</ul>
    </section>)}
    {!plazos.length && <Vacio icono="plazo" titulo={tr('Nada que venza pronto')}>{clientes.length ? tr('Ningún modelo vence antes del {fecha}.', { fecha: fechaCorta(new Date(Date.parse(`${dia}T12:00:00Z`) + DIAS * 864e5).toISOString().slice(0, 10)) }) : tr('Cuando tengas clientes, aquí verás sus plazos.')}</Vacio>}
  </main>;
}

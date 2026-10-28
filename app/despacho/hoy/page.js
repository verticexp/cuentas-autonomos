import { requerirDespacho } from '@/lib/despachoPagina';
import { datosHoy } from '@/lib/hoyDespacho';
import { fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Hoy · Mi despacho') }; }

const enDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const cuando = (tr, dia, fecha) => { const n = enDias(dia, fecha); return n < 0 ? (n === -1 ? tr('venció hace {n} día', { n: -n }) : tr('venció hace {n} días', { n: -n })) : n === 0 ? tr('vence hoy') : n === 1 ? tr('vence mañana') : tr('vence en {n} días', { n }); };
const periodoTexto = (tr, periodo) => { const m = /^(\d)T (\d{4})$/.exec(periodo); return m ? tr('{t}T {anio}', { t: m[1], anio: m[2] }) : periodo; };
const ticket = (tr, p) => (p.tipo === 'ticket' ? (p.gasto?.texto ? tr('Ticket de {gasto}', { gasto: p.gasto.texto }) : tr('Ticket de un gasto')) : p.texto);
const ficha = (id, q = '') => `/despacho/${encodeURIComponent(id)}${q}`;
const lista = (tr, nombres, max = 4) => (nombres.length > max ? tr('{lista} y {n} más', { lista: nombres.slice(0, max).join(', '), n: nombres.length - max }) : nombres.slice(0, max).join(', '));

// Lo primero de Mi despacho: lo que pide atención hoy en todos tus clientes (lib/hoyDespacho.js), cada cosa con su
// botón para ir directo. Si no hay nada, lo dice.
export default async function Hoy() {
  const tr = await textos();
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const h = await datosHoy(d, u, dia);
  const total = h.mensajes.length + h.recibidos.length + h.porRevisar.length + h.plazos.length;
  const hora = Number(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(11, 13));
  const saludo = hora < 14 ? tr('Buenos días') : hora < 21 ? tr('Buenas tardes') : tr('Buenas noches');
  const nombrePila = u.nombre ? u.nombre.split(' ')[0] : '';
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">{nombrePila ? tr(hora < 14 ? 'Buenos días, {nombre}' : hora < 21 ? 'Buenas tardes, {nombre}' : 'Buenas noches, {nombre}', { nombre: nombrePila }) : saludo}</h1>
    <p className="desp-sub">{tr('Hoy, {fecha}.', { fecha: tr(fechaTexto(dia)) })} {total ? tr('Esto es lo que te espera en tus clientes:') : ''}</p>
    {h.clientes === 0 ? <Vacio icono="usuarios" titulo={tr('Aún no tienes clientes')}>
      <p>{tr('Invítalos desde Ajustes con tu enlace: en cuanto entren, verás aquí lo que necesitan.')}</p>
    </Vacio> : total === 0 && !h.esperando.length ? <Vacio icono="plazo" titulo={tr('Todo al día')}>
      <p>{tr('Ningún mensaje sin leer, nada por revisar y ningún plazo cerca sin presentar.')}</p>
    </Vacio> : <>
      <div className="desp-hoy-cifras" role="list">
        {[[h.mensajes.reduce((s, c) => s + c.noLeidos, 0), tr('mensajes sin leer'), '#hoy-mensajes'], [h.recibidos.length, tr('documentos recibidos'), '#hoy-recibidos'], [h.porRevisar.length, tr('por revisar del {t}T', { t: h.t }), '#hoy-revisar'], [h.plazos.length, tr('plazos cerca'), '#hoy-plazos']]
          .map(([n, t, href]) => <a key={href} role="listitem" href={href} className={n ? 'activa' : ''}><b>{n}</b><span>{t}</span></a>)}
      </div>

      {h.mensajes.length > 0 && <section className="grupo" id="hoy-mensajes" aria-labelledby="hoy-m">
        <h2 className="grupo-t" id="hoy-m">{tr('Mensajes sin leer')}</h2>
        <ul className="grupo-lista">{h.mensajes.map((c) => <li key={c.id}><Ir prefetch={false} className="fila desp-hoy-fila" href={`/despacho/mensajes/${encodeURIComponent(c.id)}`}>
          <span className="txt"><strong>{c.nombre}</strong><small>{c.ultimo?.texto || ''}</small></span>
          <b className="tab-n desp-hoy-n">{c.noLeidos}</b>
        </Ir></li>)}</ul>
      </section>}

      {h.recibidos.length > 0 && <section className="grupo" id="hoy-recibidos" aria-labelledby="hoy-r">
        <h2 className="grupo-t" id="hoy-r">{tr('Te han subido')}</h2>
        <ul className="grupo-lista">{h.recibidos.map((p) => <li key={`${p.cliente}-${p.id}`}><Ir prefetch={false} className="fila desp-hoy-fila" href={ficha(p.cliente, '#desp-pet')}>
          <span className="txt"><strong>{ticket(tr, p)}</strong><small>{p.clienteNombre}{p.entrega?.fecha ? ` · ${fechaCorta(String(p.entrega.fecha).slice(0, 10))}` : ''}</small></span>
        </Ir></li>)}</ul>
      </section>}

      {h.porRevisar.length > 0 && <section className="grupo" id="hoy-revisar" aria-labelledby="hoy-v">
        <h2 className="grupo-t" id="hoy-v">{tr('{t}T {anio}: por revisar y cerrar', { t: h.t, anio: h.anio })}</h2>
        <ul className="grupo-lista">{h.porRevisar.map((f) => <li key={f.id}><Ir prefetch={false} className="fila desp-hoy-fila" href={ficha(f.id, `?anio=${h.anio}&t=${h.t}`)}>
          <span className="txt"><strong>{f.nombre}</strong><small>{tr('Plazo hasta el {fecha} · {cuando}', { fecha: fechaCorta(f.limite), cuando: cuando(tr, dia, f.limite) })}</small></span>
        </Ir></li>)}</ul>
      </section>}

      {h.plazos.length > 0 && <section className="grupo" id="hoy-plazos" aria-labelledby="hoy-p">
        <h2 className="grupo-t" id="hoy-p">{tr('Plazos de Hacienda')}</h2>
        <ul className="grupo-lista">{h.plazos.map((p) => <li key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}`}><Ir prefetch={false} className={`fila desp-hoy-fila${p.vencido ? ' vencido' : ''}`} href="/despacho/plazos">
          <span className="txt"><strong>{p.modelo} · {tr(p.nombre)} · {periodoTexto(tr, p.periodo)}</strong><small>{p.faltan.length ? tr('Sin presentar: {lista}', { lista: lista(tr, p.faltan.map((c) => c.nombre)) }) : p.clientes.length === 1 ? tr('1 cliente') : tr('{n} clientes', { n: p.clientes.length })}</small></span>
          <span className={`desp-hoy-cuando${p.vencido ? ' rojo' : ''}`}>{cuando(tr, dia, p.fecha)}</span>
        </Ir></li>)}</ul>
      </section>}

      {h.esperando.length > 0 && <section className="grupo" aria-labelledby="hoy-e">
        <h2 className="grupo-t" id="hoy-e">{tr('Esperando a que te suban')}</h2>
        <ul className="grupo-lista">{h.esperando.slice(0, 20).map((p) => <li key={`${p.cliente}-${p.id}`}><Ir prefetch={false} className="fila desp-hoy-fila" href={ficha(p.cliente, '#desp-pet')}>
          <span className="txt"><strong>{ticket(tr, p)}</strong><small>{tr('{cliente} · pedido el {fecha}', { cliente: p.clienteNombre, fecha: fechaCorta(String(p.creada).slice(0, 10)) })}</small></span>
        </Ir></li>)}</ul>
        {h.esperando.length > 20 && <p className="grupo-pie">{tr('Y {n} más.', { n: h.esperando.length - 20 })}</p>}
      </section>}
    </>}
  </main>;
}

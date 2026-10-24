import { requerirDespacho } from '@/lib/despachoPagina';
import { datosHoy } from '@/lib/hoyDespacho';
import { fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import Espacio from '@/components/Espacio';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hoy · Mi despacho' };

const enDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const cuando = (dia, fecha) => { const n = enDias(dia, fecha); return n < 0 ? `venció hace ${-n} ${n === -1 ? 'día' : 'días'}` : n === 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : `vence en ${n} días`; };
const ficha = (id, q = '') => `/despacho/${encodeURIComponent(id)}${q}`;
const lista = (nombres, max = 4) => `${nombres.slice(0, max).join(', ')}${nombres.length > max ? ` y ${nombres.length - max} más` : ''}`;

// Lo primero de Mi despacho: lo que pide atención hoy en todos tus clientes (lib/hoyDespacho.js), cada cosa con su
// botón para ir directo. Si no hay nada, lo dice.
export default async function Hoy() {
  const { u, d, rol } = await requerirDespacho();
  const dia = hoy();
  const h = await datosHoy(d, u, dia);
  const total = h.mensajes.length + h.recibidos.length + h.porRevisar.length + h.plazos.length;
  const hora = Number(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(11, 13));
  const saludo = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
  return <main className="pagina mk-look despacho">
    {rol === 'titular' && <Espacio actual="despacho" className="espacio-movil" />}
    <h1 className="titulo">{saludo}{u.nombre ? `, ${u.nombre.split(' ')[0]}` : ''}</h1>
    <p className="desp-sub">Hoy, {fechaTexto(dia)}. {total ? 'Esto es lo que te espera en tus clientes:' : ''}</p>
    {h.clientes === 0 ? <Vacio icono="usuarios" titulo="Aún no tienes clientes">
      <p>Invítalos desde Ajustes con tu enlace: en cuanto entren, verás aquí lo que necesitan.</p>
    </Vacio> : total === 0 && !h.esperando.length ? <Vacio icono="plazo" titulo="Todo al día">
      <p>Ningún mensaje sin leer, nada por revisar y ningún plazo cerca sin presentar.</p>
    </Vacio> : <>
      <div className="desp-hoy-cifras" role="list">
        {[[h.mensajes.reduce((s, c) => s + c.noLeidos, 0), 'mensajes sin leer', '#hoy-mensajes'], [h.recibidos.length, 'documentos recibidos', '#hoy-recibidos'], [h.porRevisar.length, `por revisar del ${h.t}T`, '#hoy-revisar'], [h.plazos.length, 'plazos cerca', '#hoy-plazos']]
          .map(([n, t, href]) => <a key={t} role="listitem" href={href} className={n ? 'activa' : ''}><b>{n}</b><span>{t}</span></a>)}
      </div>

      {h.mensajes.length > 0 && <section className="grupo" id="hoy-mensajes" aria-labelledby="hoy-m">
        <h2 className="grupo-t" id="hoy-m">Mensajes sin leer</h2>
        <ul className="grupo-lista">{h.mensajes.map((c) => <li key={c.id}><Ir className="fila desp-hoy-fila" href={`/despacho/mensajes/${encodeURIComponent(c.id)}`}>
          <span className="txt"><strong>{c.nombre}</strong><small>{c.ultimo?.texto || ''}</small></span>
          <b className="tab-n desp-hoy-n">{c.noLeidos}</b>
        </Ir></li>)}</ul>
      </section>}

      {h.recibidos.length > 0 && <section className="grupo" id="hoy-recibidos" aria-labelledby="hoy-r">
        <h2 className="grupo-t" id="hoy-r">Te han subido</h2>
        <ul className="grupo-lista">{h.recibidos.map((p) => <li key={`${p.cliente}-${p.id}`}><Ir className="fila desp-hoy-fila" href={ficha(p.cliente, '#desp-pet')}>
          <span className="txt"><strong>{p.tipo === 'ticket' ? `Ticket de ${p.gasto?.texto || 'un gasto'}` : p.texto}</strong><small>{p.clienteNombre}{p.entrega?.fecha ? ` · ${fechaCorta(String(p.entrega.fecha).slice(0, 10))}` : ''}</small></span>
        </Ir></li>)}</ul>
      </section>}

      {h.porRevisar.length > 0 && <section className="grupo" id="hoy-revisar" aria-labelledby="hoy-v">
        <h2 className="grupo-t" id="hoy-v">{h.t}T {h.anio}: por revisar y cerrar</h2>
        <ul className="grupo-lista">{h.porRevisar.map((f) => <li key={f.id}><Ir className="fila desp-hoy-fila" href={ficha(f.id, `?anio=${h.anio}&t=${h.t}`)}>
          <span className="txt"><strong>{f.nombre}</strong><small>Plazo hasta el {fechaCorta(f.limite)} · {cuando(dia, f.limite)}</small></span>
        </Ir></li>)}</ul>
      </section>}

      {h.plazos.length > 0 && <section className="grupo" id="hoy-plazos" aria-labelledby="hoy-p">
        <h2 className="grupo-t" id="hoy-p">Plazos de Hacienda</h2>
        <ul className="grupo-lista">{h.plazos.map((p) => <li key={`${p.fecha}-${p.modelo}-${p.periodo}-${p.hacienda}`}><Ir className={`fila desp-hoy-fila${p.vencido ? ' vencido' : ''}`} href="/despacho/plazos">
          <span className="txt"><strong>{p.modelo} · {p.nombre} · {p.periodo}</strong><small>{p.faltan.length ? `Sin presentar: ${lista(p.faltan.map((c) => c.nombre))}` : `${p.clientes.length === 1 ? '1 cliente' : `${p.clientes.length} clientes`}`}</small></span>
          <span className={`desp-hoy-cuando${p.vencido ? ' rojo' : ''}`}>{cuando(dia, p.fecha)}</span>
        </Ir></li>)}</ul>
      </section>}

      {h.esperando.length > 0 && <section className="grupo" aria-labelledby="hoy-e">
        <h2 className="grupo-t" id="hoy-e">Esperando a que te suban</h2>
        <ul className="grupo-lista">{h.esperando.slice(0, 20).map((p) => <li key={`${p.cliente}-${p.id}`}><Ir className="fila desp-hoy-fila" href={ficha(p.cliente, '#desp-pet')}>
          <span className="txt"><strong>{p.tipo === 'ticket' ? `Ticket de ${p.gasto?.texto || 'un gasto'}` : p.texto}</strong><small>{p.clienteNombre} · pedido el {fechaCorta(String(p.creada).slice(0, 10))}</small></span>
        </Ir></li>)}</ul>
        {h.esperando.length > 20 && <p className="grupo-pie">Y {h.esperando.length - 20} más.</p>}
      </section>}
    </>}
  </main>;
}

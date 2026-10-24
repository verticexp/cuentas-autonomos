'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Ir from './Ir';
import { confirmar } from './Confirmar';
import { entrarEn } from './PanelDespacho';
import { ESTADOS_TEXTO } from './despachoTextos';
import { navegar } from '@/lib/transicion';
import { eur, fechaCorta } from '@/lib/formato';
import VistaDocumento from './VistaDocumento';
import AccionesDocumento from './AccionesDocumento';

const fechaDe = (iso) => fechaCorta(String(iso || '').slice(0, 10));
const horaDe = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ENTRAR = [['/modelos', 'Impuestos', 'Modelos del trimestre y del año'], ['/facturas', 'Facturas', 'Emitidas, cobros y rectificativas'], ['/gastos', 'Gastos', 'Con sus justificantes'], ['/contabilidad', 'Contabilidad', 'Diario, balance y resultados'], ['/contabilidad?ver=libros', 'Libros registro', 'Los libros de IVA e IRPF']];

// mensajes: { ultimo, noLeidos, preguntas } de la conversación con el cliente (components/Chat.js, en Mensajes).
export default function ClienteDespacho({ cliente, anio, t, hoy, rol, estado, limite, presentados, cierre, resumen, docs, mensajes, accesos, equipo, peticiones = [], informe = null }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [formato, setFormato] = useState('a3');
  const [codigo, setCodigo] = useState('1');
  const [anioDiario, setAnioDiario] = useState(anio);
  const [ver, setVer] = useState(null);
  const [pedido, setPedido] = useState('');
  const titular = rol === 'titular';
  const id = encodeURIComponent(cliente.id);

  const accion = async (cuerpo, texto) => {
    setOcupado(cuerpo.accion); setMsg('');
    try { await llamar('/api/despacho/cliente', { method: 'POST', body: JSON.stringify({ empresa: cliente.id, anio, t, ...cuerpo }) }); setMsg(texto); router.refresh(); } catch (e) { setMsg(e.message); }
    setOcupado('');
  };
  const cerrar = () => accion({ accion: 'cerrar' }, `✓ ${t}T ${anio} revisado y cerrado`);
  const reabrir = async () => { if (await confirmar({ titulo: `¿Reabrir el ${t}T ${anio}?`, texto: 'El cliente podrá volver a crear, cambiar y borrar facturas y gastos de este trimestre.', aceptar: 'Reabrir' })) accion({ accion: 'reabrir' }, `${t}T ${anio} reabierto`); };
  const separar = async () => { if (await confirmar({ titulo: `¿Dejar de llevar a ${cliente.nombre}?`, texto: `Tu despacho dejará de ver sus cuentas.${cliente.licencia ? ' Como pagas su licencia, tendrá un mes de prueba para elegir su plan.' : ''} Sus datos siguen siendo suyos.`, aceptar: 'Dejar de llevarlo', peligro: true })) { await accion({ accion: 'separar' }, ''); navegar(router, '/despacho', 'atras'); } };
  const licencia = async (si) => {
    const ok = si
      ? await confirmar({ titulo: 'Incluir Fisquo en tu cuota', texto: `${cliente.nombre} pasa a ${cliente.licenciaNombre}, pagado por tu despacho. Los 90 primeros días son gratis; después se suma a tus licencias del mes.`, aceptar: 'Incluir' })
      : await confirmar({ titulo: 'Dejar de incluirlo', texto: `${cliente.nombre} tendrá un mes de prueba para elegir y pagar su plan.`, aceptar: 'Dejar de incluirlo', peligro: true });
    if (ok) accion({ accion: si ? 'licencia' : 'sinLicencia' }, si ? '✓ Incluido en tu cuota' : 'Ya no está incluido en tu cuota');
  };
  const periodos = useMemo(() => {
    const y = Number(hoy.slice(0, 4));
    return [y, y - 1].flatMap((a) => [4, 3, 2, 1].map((q) => ({ anio: a, t: q }))).filter((p) => `${p.anio}-${String(p.t * 3 - 2).padStart(2, '0')}-01` <= hoy);
  }, [hoy]);
  const r = resumen;
  const cifra = (x) => (!x ? { v: '—', n: 'No lo presenta' } : x.compensar > 0 ? { v: eur(0), n: `A compensar ${eur(x.compensar)}` } : x.devolver > 0 ? { v: eur(0), n: `A devolver ${eur(x.devolver)}` } : { v: eur(x.importe), n: 'A ingresar' });
  const pendientes = r ? [
    r.porRevisar > 0 && `${r.porRevisar} ${r.porRevisar === 1 ? 'documento' : 'documentos'} en su bandeja por revisar`,
    r.sinJustificante > 0 && `${r.sinJustificante} ${r.sinJustificante === 1 ? 'gasto' : 'gastos'} sin justificante`,
    r.comentarios?.noLeidos > 0 && `${r.comentarios.noLeidos === 1 ? 'Un mensaje' : `${r.comentarios.noLeidos} mensajes`} del cliente sin leer`,
  ].filter(Boolean) : [];
  const irA = (href) => () => entrarEn(cliente.id, href).catch((e) => setMsg(e.message));
  // Documentos pedidos al cliente (lib/peticionesDespacho.js).
  const pedir = async (cuerpo) => { await llamar('/api/despacho/peticiones', { method: 'POST', body: JSON.stringify({ empresa: cliente.id, ...cuerpo }) }); };
  const pedirDocumento = async (e) => {
    e.preventDefault();
    if (!pedido.trim()) return;
    setOcupado('pedir'); setMsg('');
    try { await pedir({ tipo: 'documento', texto: pedido }); setPedido(''); setMsg('✓ Pedido. Le llega a su Fisquo con un botón para subirlo.'); router.refresh(); } catch (err) { setMsg(err.message); }
    setOcupado('');
  };
  // Los tickets que faltan, de una vez (los que ya se le han pedido no se repiten).
  const sinTicket = docs.gastos.filter((g) => g.sinJustificante && !peticiones.some((p) => p.estado === 'pendiente' && p.gasto?.id === g.id));
  const pedirTickets = async () => {
    if (!(await confirmar({ titulo: `¿Pedirle ${sinTicket.length === 1 ? 'el ticket que falta' : `los ${sinTicket.length} tickets que faltan`}?`, texto: 'Le llega un mensaje por cada gasto, con un botón para hacerle una foto o subir el PDF.', aceptar: 'Pedir' }))) return;
    setOcupado('tickets'); setMsg('');
    let n = 0;
    try { for (const g of sinTicket.slice(0, 30)) { await pedir({ tipo: 'ticket', gasto: g.id }); n += 1; } setMsg(`✓ ${n === 1 ? 'Pedido 1 ticket' : `Pedidos ${n} tickets`}`); } catch (err) { setMsg(n ? `Pedidos ${n}; el resto, no: ${err.message}` : err.message); }
    setOcupado(''); router.refresh();
  };
  const anularPeticion = async (p) => {
    try { await llamar(`/api/despacho/peticiones?empresa=${id}&id=${encodeURIComponent(p.id)}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const enviarInforme = () => accion({ accion: 'informe' }, `✓ Informe del ${t}T enviado: lo ve en su chat`);
  const informeUrl = `/api/despacho/informe?empresa=${id}&anio=${anio}&t=${t}`;
  const pidiendo = peticiones.filter((p) => p.estado === 'pendiente');
  // Cierre guiado: cada paso con su estado (hecho o no) y lo que se puede hacer.
  const presentado = presentados && [presentados.iva, presentados.irpf].filter((x) => x !== null);
  const pasos = [
    { id: 'falta', t: 'Lo que falta', hecho: pendientes.length === 0 && !pidiendo.length },
    { id: 'impuestos', t: 'Revisa sus impuestos', hecho: Boolean(presentado?.length && presentado.every(Boolean)) },
    { id: 'paquete', t: 'Descarga el paquete', hecho: false, opcional: true },
    { id: 'cerrar', t: 'Cierra el trimestre', hecho: Boolean(cierre) && !cierre.cambios },
    { id: 'informe', t: 'Envíale el informe', hecho: Boolean(informe) },
  ];
  const chat = (doc) => `/despacho/mensajes/${id}${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`;

  return <>
    <div className="desp-cabecera">
      <div className="desp-titulo">
        <h1 className="titulo">{cliente.nombre}</h1>
        <p className="resumen-linea">{[cliente.nif, cliente.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo', cliente.territorio, cliente.plan, cliente.licencia && 'En tu cuota'].filter(Boolean).join(' · ')}</p>
      </div>
      <label className="desp-select">
        <span className="sr">Trimestre</span>
        <select value={`${anio}-${t}`} onChange={(e) => { const [a, q] = e.target.value.split('-'); navegar(router, `/despacho/${id}?anio=${a}&t=${q}`, 'pestana-der', undefined, false, { scroll: false }); }}>
          {periodos.map((p) => <option key={`${p.anio}-${p.t}`} value={`${p.anio}-${p.t}`}>{p.t}T {p.anio}</option>)}
        </select>
      </label>
    </div>
    {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{msg}</p>}

    <section className="grupo" aria-labelledby="desp-rev">
      <h2 className="grupo-t" id="desp-rev">Cierre del {t}T {anio}, paso a paso</h2>
      <p className="desp-estado-linea"><span className={`desp-estado e-${estado}`}>{ESTADOS_TEXTO[estado]}</span>
        <small>{cierre ? <>Cerrado por {cierre.por || cierre.despacho} el {fechaDe(cierre.fecha)}.{cierre.cambios && <b className="rojo"> Hay facturas o gastos que han cambiado desde entonces.</b>}</> : estado === 'curso' ? 'El trimestre aún no ha terminado.' : `Plazo hasta el ${fechaDe(limite)}.`}</small></p>
      <ol className="desp-pasos">
        {pasos.map((p, i) => <li key={p.id} className={p.hecho ? 'hecho' : ''}>
          <span className="desp-paso-n" aria-hidden>{p.hecho ? '✓' : i + 1}</span>
          <div className="desp-paso">
            <strong>{p.t}{p.hecho && <span className="sr"> (hecho)</span>}</strong>
            {p.id === 'falta' && <>
              {pendientes.length || pidiendo.length ? <ul className="desp-paso-lista">
                {pendientes.map((x) => <li key={x}>{x}</li>)}
                {pidiendo.length > 0 && <li>{pidiendo.length === 1 ? 'Le has pedido 1 documento y aún no lo ha subido' : `Le has pedido ${pidiendo.length} documentos y aún no los ha subido`}</li>}
              </ul> : <small>Nada pendiente: todo tiene su justificante y no hay mensajes sin leer.</small>}
              {sinTicket.length > 0 && <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={pedirTickets}>{sinTicket.length === 1 ? 'Pedirle el ticket que falta' : `Pedirle los ${sinTicket.length} tickets que faltan`}</button>}
            </>}
            {p.id === 'impuestos' && <>
              <small>{presentado?.length ? [presentados.iva !== null && `IVA: ${presentados.iva ? 'presentado' : 'sin presentar'}`, presentados.irpf !== null && `IRPF: ${presentados.irpf ? 'presentado' : 'sin presentar'}`].filter(Boolean).join(' · ') : 'Comprueba los modelos y márcalos como presentados.'}</small>
              <button type="button" className="boton sec desp-mini" onClick={irA('/modelos')}>Abrir sus impuestos</button>
            </>}
            {p.id === 'paquete' && <>
              <small>Excel, PDF y justificantes del trimestre, para tu programa o tu archivo.</small>
              <a className="boton sec desp-mini" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}`} download>Descargar el paquete</a>
            </>}
            {p.id === 'cerrar' && <>
              <small>Cerrado, nadie puede crear, cambiar ni borrar sus facturas y gastos de este trimestre (sí cobrarlos, pagarlos o añadir justificantes).</small>
              {cierre ? <span className="desp-acciones">
                {cierre.cambios && <button type="button" className="boton desp-mini" disabled={Boolean(ocupado)} onClick={cerrar}>Revisado de nuevo</button>}
                <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={reabrir}>Reabrir</button>
              </span> : <button type="button" className="boton desp-mini" disabled={Boolean(ocupado) || estado === 'curso'} onClick={cerrar}>Revisado: cerrar el {t}T</button>}
            </>}
            {p.id === 'informe' && <>
              <small>{informe ? `Enviado el ${fechaDe(informe.fecha)}${informe.por ? ` por ${informe.por}` : ''}.` : 'Un PDF sencillo con lo que ha facturado, lo que paga y cómo va el año. Le llega a su chat.'}</small>
              <span className="desp-acciones">
                <a className="boton sec desp-mini" href={informeUrl} target="_blank" rel="noopener">Ver el informe</a>
                <button type="button" className="boton desp-mini" disabled={Boolean(ocupado)} onClick={enviarInforme}>{informe ? 'Enviarlo otra vez' : 'Enviárselo'}</button>
              </span>
            </>}
          </div>
        </li>)}
      </ol>
    </section>

    {r ? <dl className="desp-cifras">
      <div><dt>Ventas</dt><dd>{eur(r.ventas)}<small>{r.facturas} facturas · sin IVA</small></dd></div>
      <div><dt>Gastos</dt><dd>{eur(r.compras)}<small>{r.gastos} gastos · sin IVA</small></dd></div>
      <div><dt>IVA</dt><dd>{cifra(r.iva).v}<small>{cifra(r.iva).n}</small></dd></div>
      <div><dt>IRPF</dt><dd>{cifra(r.irpf).v}<small>{cifra(r.irpf).n}</small></dd></div>
    </dl> : <p className="error">No se han podido calcular sus cifras. Entra en sus Impuestos para verlas.</p>}

    <section className="grupo" aria-labelledby="desp-entrar">
      <h2 className="grupo-t" id="desp-entrar">Sus cuentas</h2>
      <div className="grupo-c">
        {ENTRAR.map(([href, texto, detalle]) => <button key={href} type="button" className="celda ir desp-celda-boton" onClick={irA(href)}><span className="txt">{texto}<small>{detalle}</small></span></button>)}
      </div>
      <p className="grupo-pie">Entras con el perfil Gestoría. Arriba verás siempre en qué cliente estás y podrás volver al despacho.</p>
    </section>

    <section className="grupo" aria-labelledby="desp-desc">
      <h2 className="grupo-t" id="desp-desc">Descargas</h2>
      <div className="grupo-c">
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}`} download><span className="txt">Paquete del {t}T<small>Excel, PDF y justificantes en un .zip</small></span></a>
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}&formato=xlsx`} download><span className="txt">Solo el Excel</span></a>
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}&formato=pdf`} download><span className="txt">Solo el PDF</span></a>
        <div className="celda columna desp-exportar">
          <span className="txt">Contabilidad para tu programa<small>El libro diario del año, listo para importar.</small></span>
          <div className="desp-exportar-campos">
            <label>Programa<select className="campo" value={formato} onChange={(e) => setFormato(e.target.value)}><option value="a3">A3</option><option value="contaplus">ContaPlus</option><option value="contasol">ContaSol</option></select></label>
            <label>Año<select className="campo" value={anioDiario} onChange={(e) => setAnioDiario(Number(e.target.value))}>{[anio, anio - 1].map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
            {formato === 'a3' && <label>Código en A3<input className="campo" inputMode="numeric" maxLength={5} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} /></label>}
            <a className="boton sec" href={`/api/despacho/contable?empresa=${id}&anio=${anioDiario}&formato=${formato}${formato === 'a3' ? `&codigo=${codigo || 1}` : ''}`} download>Exportar</a>
          </div>
        </div>
      </div>
    </section>

    <section className="grupo" aria-labelledby="desp-preg">
      <h2 className="grupo-t" id="desp-preg">Mensajes</h2>
      <div className="grupo-c">
        <Ir className="celda ir desp-mensajes-ficha" href={chat()}>
          <span className="txt">
            {mensajes.noLeidos > 0 ? <b className="rojo">{mensajes.noLeidos === 1 ? '1 mensaje nuevo' : `${mensajes.noLeidos} mensajes nuevos`}</b> : mensajes.ultimo ? 'Conversación' : 'Escribir al cliente'}
            {mensajes.ultimo ? <span className={`desp-burbuja-mini${mensajes.ultimo.lado === 'despacho' ? ' mia' : ''}`}>{mensajes.ultimo.texto}</span> : <small>Le llega a su Fisquo y te contesta aquí.</small>}
            {mensajes.preguntas > 0 && <small>{mensajes.preguntas === 1 ? '1 pregunta sobre un documento sin resolver' : `${mensajes.preguntas} preguntas sobre documentos sin resolver`}</small>}
          </span>
        </Ir>
      </div>
    </section>

    <section className="grupo" aria-labelledby="desp-docs">
      <h2 className="grupo-t" id="desp-docs">Facturas y gastos del {t}T</h2>
      {docs.facturas.length + docs.gastos.length === 0 ? <p className="nota">No hay facturas ni gastos en este trimestre.</p> : <ul className="grupo-lista desp-docs">
        {[...docs.facturas.map((f) => ({ ...f, tipo: 'factura', titulo: `Factura ${f.texto}` })), ...docs.gastos.map((g) => ({ ...g, tipo: 'gasto', titulo: g.texto }))].map((x) => <li key={`${x.tipo}-${x.id}`} className="fila">
          <button type="button" className="desp-doc-ver" onClick={() => setVer({ tipo: x.tipo, id: x.id })} aria-label={`Ver ${x.titulo}`}>
            <span className="txt"><strong>{x.titulo}</strong><small>{fechaDe(x.fecha)}{x.tipo === 'gasto' ? ' · gasto' : ''}{x.sinJustificante ? ' · sin justificante' : ''}</small></span>
            <span className="imp">{eur(x.base)}</span>
          </button>
          <Ir className="boton sec desp-mini" href={chat(`${x.tipo}:${x.id}`)}>Preguntar</Ir>
        </li>)}
      </ul>}
      {docs.mas > 0 && <p className="grupo-pie">Y {docs.mas} más: entra en sus Facturas o Gastos para verlos todos.</p>}
      <VistaDocumento base={`/api/despacho/documento?empresa=${id}`} doc={ver} alCerrar={() => setVer(null)}
        acciones={(d, cerrarVista) => <>
          <Ir className="boton sec" href={chat(`${d.tipo}:${d.id}`)}>Preguntar por {d.tipo === 'factura' ? 'esta factura' : 'este gasto'}</Ir>
          <AccionesDocumento d={d} lado="despacho" empresa={cliente.id} alHacer={() => { cerrarVista(); setMsg('✓ Ticket pedido: le llega a su Fisquo'); router.refresh(); }} />
        </>} />
    </section>

    <section className="grupo" aria-labelledby="desp-pet">
      <h2 className="grupo-t" id="desp-pet">Documentos que le pides</h2>
      <form className="desp-pedir" onSubmit={pedirDocumento}>
        <input className="campo" value={pedido} maxLength={300} onChange={(e) => setPedido(e.target.value)} placeholder="Por ejemplo: el contrato de alquiler del local" aria-label="Qué documento necesitas" />
        <button className="boton" disabled={!pedido.trim() || Boolean(ocupado)}>Pedir</button>
      </form>
      {peticiones.length > 0 && <ul className="grupo-lista desp-peticiones">
        {peticiones.slice(0, 30).map((p) => <li key={p.id} className="fila">
          <span className="txt">
            <strong>{p.tipo === 'ticket' ? `Ticket de ${p.gasto?.texto || 'un gasto'}` : p.texto}</strong>
            <small>{p.estado === 'pendiente' ? `Pedido el ${fechaDe(p.creada)}${p.por?.nombre ? ` por ${p.por.nombre}` : ''}` : p.estado === 'entregada' ? `Subido${p.entrega?.fecha ? ` el ${fechaDe(p.entrega.fecha)}` : ''}` : p.motivo || 'Anulado'}</small>
          </span>
          <span className={`desp-estado ${p.estado === 'pendiente' ? 'e-revisar' : p.estado === 'entregada' ? 'e-presentado' : 'e-curso'}`}>{p.estado === 'pendiente' ? 'Pendiente' : p.estado === 'entregada' ? 'Recibido' : 'Anulado'}</span>
          {p.estado === 'entregada' && (p.tipo === 'ticket'
            ? <button type="button" className="boton sec desp-mini" onClick={() => setVer({ tipo: 'gasto', id: p.gasto.id })}>Ver</button>
            : p.entrega?.archivo && <a className="boton sec desp-mini" href={`/api/despacho/peticiones?empresa=${id}&id=${encodeURIComponent(p.id)}&archivo=1`} target="_blank" rel="noopener">Ver</a>)}
          {p.estado === 'pendiente' && <button type="button" className="boton sec desp-mini" onClick={() => anularPeticion(p)}>Anular</button>}
        </li>)}
      </ul>}
      <p className="grupo-pie">Le llega un mensaje a su Fisquo con un botón para hacer una foto o subir un PDF. Los tickets van directos a su gasto.</p>
    </section>

    {titular && <section className="grupo" aria-labelledby="desp-gest">
      <h2 className="grupo-t" id="desp-gest">Quién lo lleva</h2>
      <div className="grupo-c">
        {equipo.length > 1 && <label className="celda"><span className="txt">Gestor asignado</span>
          <select className="desp-select-celda" value={cliente.gestor || ''} disabled={Boolean(ocupado)} onChange={(e) => accion({ accion: 'gestor', gestor: e.target.value || null }, '✓ Asignado')}>
            <option value="">Sin asignar</option>
            {equipo.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select></label>}
        <div className="celda">
          <span className="txt">Fisquo en tu cuota<small>{cliente.licencia ? `Lo pagas tú desde el ${fechaDe(cliente.licencia.desde)} (${cliente.licenciaNombre}).` : cliente.pagaSuPlan ? 'El cliente paga su plan con tarjeta.' : 'El cliente aún no paga Fisquo.'}</small></span>
          {cliente.licencia ? <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={() => licencia(false)}>Quitar</button>
            : <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado) || cliente.pagaSuPlan} onClick={() => licencia(true)}>Incluir</button>}
        </div>
        <button type="button" className="celda desp-celda-boton rojo" disabled={Boolean(ocupado)} onClick={separar}><span className="txt">Dejar de llevar este cliente</span></button>
      </div>
      {cliente.desde && <p className="grupo-pie">Cliente de tu despacho en Fisquo desde el {fechaDe(cliente.desde)}.</p>}
    </section>}

    <section className="grupo" aria-labelledby="desp-reg">
      <h2 className="grupo-t" id="desp-reg">Lo que ha hecho el despacho</h2>
      {accesos.length ? <ul className="grupo-lista">{accesos.slice(0, 15).map((a, i) => <li key={i} className="fila"><span className="txt">{a.accion}{a.detalle ? ` · ${a.detalle}` : ''}<small>{a.nombre}</small></span><span className="v nota">{horaDe(a.fecha)}</span></li>)}</ul> : <p className="nota">Todavía nada.</p>}
      <p className="grupo-pie">El cliente ve esta misma lista en Ajustes › Tu gestoría.</p>
    </section>
  </>;
}

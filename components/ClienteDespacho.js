'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Ir from './Ir';
import Vacio from './Vacio';
import { confirmar } from './Confirmar';
import { entrarEn } from './PanelDespacho';
import { ESTADOS_TEXTO, accionParaDespacho } from './despachoTextos';
import { navegar } from '@/lib/transicion';
import { eur, fechaCorta, fechaHora } from '@/lib/formato';
import VistaDocumento from './VistaDocumento';
import AccionesDocumento from './AccionesDocumento';
import { useT } from '@/components/Idioma';

const fechaDe = (iso) => fechaCorta(String(iso || '').slice(0, 10));
const horaDe = fechaHora;
const ENTRAR = [['/modelos', 'Impuestos', 'Modelos del trimestre y del año'], ['/facturas', 'Facturas', 'Emitidas, cobros y rectificativas'], ['/gastos', 'Gastos', 'Con sus justificantes'], ['/contabilidad', 'Contabilidad', 'Diario, balance y resultados'], ['/contabilidad?ver=libros', 'Libros registro', 'Los libros de IVA e IRPF']];

// mensajes: { ultimo, noLeidos, preguntas } de la conversación con el cliente (components/Chat.js, en Mensajes).
export default function ClienteDespacho({ cliente, anio, t, hoy, rol, estado, limite, presentados, cierre, resumen, docs, mensajes, accesos, equipo, peticiones = [], informe = null }) {
  const router = useRouter();
  const tr = useT();
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
  const reabrir = async () => { if (await confirmar({ titulo: tr('¿Reabrir el {t}T {anio}?', { t, anio }), texto: tr('El cliente podrá volver a crear, cambiar y borrar facturas y gastos de este trimestre.'), aceptar: tr('Reabrir') })) accion({ accion: 'reabrir' }, `${t}T ${anio} reabierto`); };
  const separar = async () => { if (await confirmar({ titulo: tr('¿Dejar de llevar a {nombre}?', { nombre: cliente.nombre }), texto: cliente.licencia ? tr('Tu despacho dejará de ver sus cuentas. Como pagas su licencia, tendrá un mes de prueba para elegir su plan. Sus datos siguen siendo suyos.') : tr('Tu despacho dejará de ver sus cuentas. Sus datos siguen siendo suyos.'), aceptar: tr('Dejar de llevarlo'), peligro: true })) { await accion({ accion: 'separar' }, ''); navegar(router, '/despacho', 'atras'); } };
  const licencia = async (si) => {
    const ok = si
      ? await confirmar({ titulo: tr('Incluir Fisquo en tu cuota'), texto: tr('{nombre} pasa a {plan}, pagado por tu despacho. Los 90 primeros días son gratis; después se suma a tus licencias del mes.', { nombre: cliente.nombre, plan: tr(cliente.licenciaNombre) }), aceptar: tr('Incluir') })
      : await confirmar({ titulo: tr('Dejar de incluirlo'), texto: tr('{nombre} tendrá un mes de prueba para elegir y pagar su plan.', { nombre: cliente.nombre }), aceptar: tr('Dejar de incluirlo'), peligro: true });
    if (ok) accion({ accion: si ? 'licencia' : 'sinLicencia' }, si ? '✓ Incluido en tu cuota' : 'Ya no está incluido en tu cuota');
  };
  const periodos = useMemo(() => {
    const y = Number(hoy.slice(0, 4));
    return [y, y - 1].flatMap((a) => [4, 3, 2, 1].map((q) => ({ anio: a, t: q }))).filter((p) => `${p.anio}-${String(p.t * 3 - 2).padStart(2, '0')}-01` <= hoy);
  }, [hoy]);
  const r = resumen;
  const cifra = (x) => (!x ? { v: '—', n: tr('No lo presenta') } : x.compensar > 0 ? { v: eur(0), n: tr('A compensar {importe}', { importe: eur(x.compensar) }) } : x.devolver > 0 ? { v: eur(0), n: tr('A devolver {importe}', { importe: eur(x.devolver) }) } : { v: eur(x.importe), n: tr('A ingresar') });
  const pendientes = r ? [
    r.porRevisar > 0 && (r.porRevisar === 1 ? tr('1 documento en su bandeja por revisar') : tr('{n} documentos en su bandeja por revisar', { n: r.porRevisar })),
    r.sinJustificante > 0 && (r.sinJustificante === 1 ? tr('1 gasto sin justificante') : tr('{n} gastos sin justificante', { n: r.sinJustificante })),
    r.comentarios?.noLeidos > 0 && (r.comentarios.noLeidos === 1 ? tr('Un mensaje del cliente sin leer') : tr('{n} mensajes del cliente sin leer', { n: r.comentarios.noLeidos })),
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
    if (!(await confirmar({ titulo: sinTicket.length === 1 ? tr('¿Pedirle el ticket que falta?') : tr('¿Pedirle {n} tickets?', { n: Math.min(30, sinTicket.length) }), texto: tr('Le llega un mensaje por cada gasto, con un botón para hacerle una foto o subir el PDF.'), aceptar: tr('Pedir') }))) return;
    setOcupado('tickets'); setMsg('');
    let n = 0;
    try { for (const g of sinTicket.slice(0, 30)) { await pedir({ tipo: 'ticket', gasto: g.id }); n += 1; } setMsg(n === 1 ? '✓ Pedido 1 ticket' : `✓ Pedidos ${n} tickets`); } catch (err) { setMsg(n ? `Pedidos ${n}; el resto, no: ${err.message}` : err.message); }
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
    { id: 'falta', t: tr('Lo que falta'), hecho: pendientes.length === 0 && !pidiendo.length },
    { id: 'impuestos', t: tr('Revisa sus impuestos'), hecho: Boolean(presentado?.length && presentado.every(Boolean)) },
    { id: 'paquete', t: tr('Descarga el paquete'), hecho: false, opcional: true },
    { id: 'cerrar', t: tr('Cierra el trimestre'), hecho: Boolean(cierre) && !cierre.cambios },
    { id: 'informe', t: tr('Envíale el informe'), hecho: Boolean(informe) },
  ];
  const chat = (doc) => `/despacho/mensajes/${id}${doc ? `?doc=${encodeURIComponent(doc)}` : ''}`;

  return <>
    <div className="desp-cabecera">
      <div className="desp-titulo">
        <h1 className="titulo">{cliente.nombre}</h1>
        <p className="resumen-linea">{[cliente.nif, cliente.tipo === 'sociedad' ? tr('Sociedad') : tr('Autónomo'), tr(cliente.territorio), tr(cliente.plan), cliente.licencia && tr('En tu cuota')].filter(Boolean).join(' · ')}</p>
      </div>
      <label className="desp-select">
        <span className="sr">{tr('Trimestre')}</span>
        <select value={`${anio}-${t}`} onChange={(e) => { const [a, q] = e.target.value.split('-'); navegar(router, `/despacho/${id}?anio=${a}&t=${q}`, 'pestana-der', undefined, false, { scroll: false }); }}>
          {periodos.map((p) => <option key={`${p.anio}-${p.t}`} value={`${p.anio}-${p.t}`}>{tr('{t}T {anio}', { t: p.t, anio: p.anio })}</option>)}
        </select>
      </label>
    </div>
    {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{tr(msg)}</p>}

    <section className="grupo" aria-labelledby="desp-rev">
      <h2 className="grupo-t" id="desp-rev">{tr('Cierre del {t}T {anio}, paso a paso', { t, anio })}</h2>
      <p className="desp-estado-linea"><span className={`desp-estado e-${estado}`}>{tr(ESTADOS_TEXTO[estado])}</span>
        <small>{cierre ? <>{tr('Cerrado por {quien} el {fecha}.', { quien: cierre.por || cierre.despacho, fecha: fechaDe(cierre.fecha) })}{cierre.cambios && <b className="rojo"> {tr('Hay facturas o gastos que han cambiado desde entonces.')}</b>}</> : estado === 'curso' ? tr('El trimestre aún no ha terminado.') : tr('Plazo hasta el {fecha}.', { fecha: fechaDe(limite) })}</small></p>
      <ol className="desp-pasos">
        {pasos.map((p, i) => <li key={p.id} className={p.hecho ? 'hecho' : ''}>
          <span className="desp-paso-n" aria-hidden>{p.hecho ? '✓' : i + 1}</span>
          <div className="desp-paso">
            <strong>{p.t}{p.hecho && <span className="sr"> {tr('(hecho)')}</span>}</strong>
            {p.id === 'falta' && <>
              {pendientes.length || pidiendo.length ? <ul className="desp-paso-lista">
                {pendientes.map((x) => <li key={x}>{x}</li>)}
                {pidiendo.length > 0 && <li>{pidiendo.length === 1 ? tr('Le has pedido 1 documento y aún no lo ha subido') : tr('Le has pedido {n} documentos y aún no los ha subido', { n: pidiendo.length })}</li>}
              </ul> : <small>{tr('Nada pendiente: todo tiene su justificante y no hay mensajes sin leer.')}</small>}
              {sinTicket.length > 0 && <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={pedirTickets}>{sinTicket.length === 1 ? tr('Pedirle el ticket que falta') : sinTicket.length > 30 ? tr('Pedirle 30 de los {n} tickets que faltan', { n: sinTicket.length }) : tr('Pedirle los {n} tickets que faltan', { n: sinTicket.length })}</button>}
            </>}
            {p.id === 'impuestos' && <>
              <small>{presentado?.length ? [presentados.iva !== null && (presentados.iva ? tr('IVA: presentado') : tr('IVA: sin presentar')), presentados.irpf !== null && (presentados.irpf ? tr('IRPF: presentado') : tr('IRPF: sin presentar'))].filter(Boolean).join(' · ') : tr('Comprueba los modelos y márcalos como presentados.')}</small>
              <button type="button" className="boton sec desp-mini" onClick={irA('/modelos')}>{tr('Abrir sus impuestos')}</button>
            </>}
            {p.id === 'paquete' && <>
              <small>{tr('Excel, PDF y justificantes del trimestre, para tu programa o tu archivo.')}</small>
              <a className="boton sec desp-mini" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}`} download>{tr('Descargar el paquete')}</a>
            </>}
            {p.id === 'cerrar' && <>
              <small>{tr('Cerrado, nadie puede crear, cambiar ni borrar sus facturas y gastos de este trimestre (sí cobrarlos, pagarlos o añadir justificantes).')}</small>
              {cierre ? <span className="desp-acciones">
                {cierre.cambios && <button type="button" className="boton desp-mini" disabled={Boolean(ocupado)} onClick={cerrar}>{tr('Revisado de nuevo')}</button>}
                <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={reabrir}>{tr('Reabrir')}</button>
              </span> : <button type="button" className="boton desp-mini" disabled={Boolean(ocupado) || estado === 'curso'} onClick={cerrar}>{tr('Revisado: cerrar el {t}T', { t })}</button>}
            </>}
            {p.id === 'informe' && <>
              <small>{informe ? (informe.por ? tr('Enviado el {fecha} por {quien}.', { fecha: fechaDe(informe.fecha), quien: informe.por }) : tr('Enviado el {fecha}.', { fecha: fechaDe(informe.fecha) })) : tr('Un PDF sencillo con lo que ha facturado, lo que paga y cómo va el año. Le llega a su chat.')}</small>
              <span className="desp-acciones">
                <a className="boton sec desp-mini" href={informeUrl} target="_blank" rel="noopener">{tr('Ver el informe')}</a>
                <button type="button" className="boton desp-mini" disabled={Boolean(ocupado)} onClick={enviarInforme}>{informe ? tr('Enviarlo otra vez') : tr('Enviárselo')}</button>
              </span>
            </>}
          </div>
        </li>)}
      </ol>
    </section>

    {r ? <dl className="desp-cifras">
      <div><dt>{tr('Ventas')}</dt><dd>{eur(r.ventas)}<small>{tr('{n} facturas · sin IVA', { n: r.facturas })}</small></dd></div>
      <div><dt>{tr('Gastos')}</dt><dd>{eur(r.compras)}<small>{tr('{n} gastos · sin IVA', { n: r.gastos })}</small></dd></div>
      <div><dt>{tr('IVA')}</dt><dd>{cifra(r.iva).v}<small>{cifra(r.iva).n}</small></dd></div>
      <div><dt>{tr('IRPF')}</dt><dd>{cifra(r.irpf).v}<small>{cifra(r.irpf).n}</small></dd></div>
    </dl> : <p className="error">{tr('No se han podido calcular sus cifras. Entra en sus Impuestos para verlas.')}</p>}

    <section className="grupo" aria-labelledby="desp-entrar">
      <h2 className="grupo-t" id="desp-entrar">{tr('Sus cuentas')}</h2>
      <div className="grupo-c">
        {ENTRAR.map(([href, texto, detalle]) => <button key={href} type="button" className="celda ir desp-celda-boton" onClick={irA(href)}><span className="txt">{tr(texto)}<small>{tr(detalle)}</small></span></button>)}
      </div>
      <p className="grupo-pie">{tr('Entras con el perfil Gestoría. Arriba verás siempre en qué cliente estás y podrás volver al despacho.')}</p>
    </section>

    <section className="grupo" aria-labelledby="desp-desc">
      <h2 className="grupo-t" id="desp-desc">{tr('Descargas')}</h2>
      <div className="grupo-c">
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}`} download><span className="txt">{tr('Paquete del {t}T', { t })}<small>{tr('Excel, PDF y justificantes en un .zip')}</small></span></a>
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}&formato=xlsx`} download><span className="txt">{tr('Solo el Excel')}</span></a>
        <a className="celda ir" href={`/api/despacho/paquete?empresa=${id}&anio=${anio}&t=${t}&formato=pdf`} download><span className="txt">{tr('Solo el PDF')}</span></a>
        <div className="celda columna desp-exportar">
          <span className="txt">{tr('Contabilidad para tu programa')}<small>{tr('El libro diario del año, listo para importar.')}</small></span>
          <div className="desp-exportar-campos">
            <label>{tr('Programa')}<select className="campo" value={formato} onChange={(e) => setFormato(e.target.value)}><option value="a3">A3</option><option value="contaplus">ContaPlus</option><option value="contasol">ContaSol</option></select></label>
            <label>{tr('Año')}<select className="campo" value={anioDiario} onChange={(e) => setAnioDiario(Number(e.target.value))}>{[anio, anio - 1].map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
            {formato === 'a3' && <label>{tr('Código en A3')}<input className="campo" inputMode="numeric" maxLength={5} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} /></label>}
            <a className="boton sec" href={`/api/despacho/contable?empresa=${id}&anio=${anioDiario}&formato=${formato}${formato === 'a3' ? `&codigo=${codigo || 1}` : ''}`} download>{tr('Exportar')}</a>
          </div>
        </div>
      </div>
    </section>

    <section className="grupo" aria-labelledby="desp-preg">
      <h2 className="grupo-t" id="desp-preg">{tr('Mensajes')}</h2>
      <div className="grupo-c">
        <Ir prefetch={false} className="celda ir desp-mensajes-ficha" href={chat()}>
          <span className="txt">
            {mensajes.noLeidos > 0 ? <b className="rojo">{mensajes.noLeidos === 1 ? tr('1 mensaje nuevo') : tr('{n} mensajes nuevos', { n: mensajes.noLeidos })}</b> : mensajes.ultimo ? tr('Conversación') : tr('Escribir al cliente')}
            {mensajes.ultimo ? <span className={`desp-burbuja-mini${mensajes.ultimo.lado === 'despacho' ? ' mia' : ''}`}>{mensajes.ultimo.texto}</span> : <small>{tr('Le llega a su Fisquo y te contesta aquí.')}</small>}
            {mensajes.preguntas > 0 && <small>{mensajes.preguntas === 1 ? tr('1 pregunta sobre un documento sin resolver') : tr('{n} preguntas sobre documentos sin resolver', { n: mensajes.preguntas })}</small>}
          </span>
        </Ir>
      </div>
    </section>

    <section className="grupo" aria-labelledby="desp-docs">
      <h2 className="grupo-t" id="desp-docs">{tr('Facturas y gastos del {t}T', { t })}</h2>
      {docs.facturas.length + docs.gastos.length === 0 ? <Vacio compacto icono="factura" titulo={tr('Sin facturas ni gastos en el {t}T', { t })}>{tr('Cuando el cliente apunte facturas o gastos de este trimestre, los verás aquí para revisarlos.')}</Vacio> : <ul className="grupo-lista desp-docs">
        {[...docs.facturas.map((f) => ({ ...f, tipo: 'factura', titulo: `${tr('Factura')} ${f.texto}` })), ...docs.gastos.map((g) => ({ ...g, tipo: 'gasto', titulo: g.texto }))].map((x) => <li key={`${x.tipo}-${x.id}`} className="fila">
          {/* Al tocarla se abre con «Preguntar por esta factura»: un botón «Preguntar» en cada fila no dejaba leer el número */}
          <button type="button" className="desp-doc-ver" onClick={() => setVer({ tipo: x.tipo, id: x.id })} aria-label={tr('Ver {titulo}', { titulo: x.titulo })}>
            <span className="txt"><strong>{x.titulo}</strong><small>{[fechaDe(x.fecha), x.tipo === 'gasto' && tr('gasto'), x.sinJustificante && tr('sin justificante')].filter(Boolean).join(' · ')}</small></span>
            <span className="imp">{eur(x.base)}</span>
          </button>
        </li>)}
      </ul>}
      {docs.mas > 0 && <p className="grupo-pie">{tr('Y {n} más: entra en sus Facturas o Gastos para verlos todos.', { n: docs.mas })}</p>}
      <VistaDocumento base={`/api/despacho/documento?empresa=${id}`} doc={ver} alCerrar={() => setVer(null)}
        acciones={(d, cerrarVista) => <>
          <Ir prefetch={false} className="boton sec" href={chat(`${d.tipo}:${d.id}`)}>{d.tipo === 'factura' ? tr('Preguntar por esta factura') : tr('Preguntar por este gasto')}</Ir>
          <AccionesDocumento d={d} lado="despacho" empresa={cliente.id} alHacer={() => { cerrarVista(); setMsg('✓ Ticket pedido: le llega a su Fisquo'); router.refresh(); }} />
        </>} />
    </section>

    <section className="grupo" aria-labelledby="desp-pet">
      <h2 className="grupo-t" id="desp-pet">{tr('Documentos que le pides')}</h2>
      <form className="desp-pedir" onSubmit={pedirDocumento}>
        <input className="campo" value={pedido} maxLength={300} onChange={(e) => setPedido(e.target.value)} placeholder={tr('Por ejemplo: el contrato de alquiler del local')} aria-label={tr('Qué documento necesitas')} />
        <button className="boton" disabled={!pedido.trim() || Boolean(ocupado)}>{tr('Pedir')}</button>
      </form>
      {peticiones.length > 0 && <ul className="grupo-lista desp-peticiones">
        {peticiones.slice(0, 30).map((p) => <li key={p.id} className="fila">
          <span className="txt">
            <strong>{p.tipo === 'ticket' ? (p.gasto?.texto ? tr('Ticket de {gasto}', { gasto: p.gasto.texto }) : tr('Ticket de un gasto')) : p.texto}</strong>
            <small>{p.estado === 'pendiente' ? (p.por?.nombre ? tr('Pedido el {fecha} por {quien}', { fecha: fechaDe(p.creada), quien: p.por.nombre }) : tr('Pedido el {fecha}', { fecha: fechaDe(p.creada) })) : p.estado === 'entregada' ? (p.entrega?.fecha ? tr('Subido el {fecha}', { fecha: fechaDe(p.entrega.fecha) }) : tr('Subido')) : p.motivo || tr('Anulado')}</small>
          </span>
          <span className={`desp-estado ${p.estado === 'pendiente' ? 'e-revisar' : p.estado === 'entregada' ? 'e-presentado' : 'e-curso'}`}>{p.estado === 'pendiente' ? tr('Pendiente') : p.estado === 'entregada' ? tr('Recibido') : tr('Anulado')}</span>
          {p.estado === 'entregada' && (p.tipo === 'ticket'
            ? <button type="button" className="boton sec desp-mini" onClick={() => setVer({ tipo: 'gasto', id: p.gasto.id })}>{tr('Ver')}</button>
            : p.entrega?.archivo && <a className="boton sec desp-mini" href={`/api/despacho/peticiones?empresa=${id}&id=${encodeURIComponent(p.id)}&archivo=1`} target="_blank" rel="noopener">{tr('Ver')}</a>)}
          {p.estado === 'pendiente' && <button type="button" className="boton sec desp-mini" onClick={() => anularPeticion(p)}>{tr('Anular')}</button>}
        </li>)}
      </ul>}
      <p className="grupo-pie">{tr('Le llega un mensaje a su Fisquo con un botón para hacer una foto o subir un PDF. Los tickets van directos a su gasto.')}</p>
    </section>

    {titular && <section className="grupo" aria-labelledby="desp-gest">
      <h2 className="grupo-t" id="desp-gest">{tr('Quién lo lleva')}</h2>
      <div className="grupo-c">
        {equipo.length > 1 && <label className="celda"><span className="txt">{tr('Gestor asignado')}</span>
          <select className="desp-select-celda" value={cliente.gestor || ''} disabled={Boolean(ocupado)} onChange={(e) => accion({ accion: 'gestor', gestor: e.target.value || null }, '✓ Asignado')}>
            <option value="">{tr('Sin asignar')}</option>
            {equipo.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select></label>}
        <div className="celda">
          <span className="txt">{tr('Fisquo en tu cuota')}<small>{cliente.licencia ? tr('Lo pagas tú desde el {fecha} ({plan}).', { fecha: fechaDe(cliente.licencia.desde), plan: tr(cliente.licenciaNombre) }) : cliente.pagaSuPlan ? tr('El cliente paga su plan con tarjeta.') : tr('El cliente aún no paga Fisquo.')}</small></span>
          {cliente.licencia ? <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado)} onClick={() => licencia(false)}>{tr('Quitar')}</button>
            : <button type="button" className="boton sec desp-mini" disabled={Boolean(ocupado) || cliente.pagaSuPlan} onClick={() => licencia(true)}>{tr('Incluir')}</button>}
        </div>
        <button type="button" className="celda desp-celda-boton rojo" disabled={Boolean(ocupado)} onClick={separar}><span className="txt">{tr('Dejar de llevar este cliente')}</span></button>
      </div>
      {cliente.desde && <p className="grupo-pie">{tr('Cliente de tu despacho en Fisquo desde el {fecha}.', { fecha: fechaDe(cliente.desde) })}</p>}
    </section>}

    <section className="grupo" aria-labelledby="desp-reg">
      <h2 className="grupo-t" id="desp-reg">{tr('Lo que ha hecho el despacho')}</h2>
      {accesos.length ? <ul className="grupo-lista">{accesos.slice(0, 15).map((a, i) => <li key={i} className="fila"><span className="txt">{accionParaDespacho(a.accion, tr)}{a.detalle ? ` · ${a.detalle}` : ''}<small>{a.nombre}</small></span><span className="v nota">{horaDe(a.fecha)}</span></li>)}</ul> : <Vacio compacto icono="actividad" titulo={tr('El despacho aún no ha hecho nada')}>{tr('Aquí quedará anotado lo que hagáis en las cuentas de este cliente.')}</Vacio>}
      <p className="grupo-pie">{tr('El cliente ve esta misma lista en Ajustes › Tu gestoría.')}</p>
    </section>
  </>;
}

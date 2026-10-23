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

const fechaDe = (iso) => fechaCorta(String(iso || '').slice(0, 10));
const horaDe = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ENTRAR = [['/modelos', 'Impuestos', 'Modelos del trimestre y del año'], ['/facturas', 'Facturas', 'Emitidas, cobros y rectificativas'], ['/gastos', 'Gastos', 'Con sus justificantes'], ['/contabilidad', 'Contabilidad', 'Diario, balance y resultados'], ['/contabilidad?ver=libros', 'Libros registro', 'Los libros de IVA e IRPF']];

// mensajes: { ultimo, noLeidos, preguntas } de la conversación con el cliente (components/Chat.js, en Mensajes).
export default function ClienteDespacho({ cliente, anio, t, hoy, rol, estado, limite, presentados, cierre, resumen, docs, mensajes, accesos, equipo }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  const [formato, setFormato] = useState('a3');
  const [codigo, setCodigo] = useState('1');
  const [anioDiario, setAnioDiario] = useState(anio);
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
      <h2 className="grupo-t" id="desp-rev">{t}T {anio}</h2>
      <div className="grupo-c">
        <div className="celda desp-trimestre">
          <span className="txt">
            <span><span className={`desp-estado e-${estado}`}>{ESTADOS_TEXTO[estado]}</span></span>
            <small>{cierre ? <>Cerrado por {cierre.por || cierre.despacho} el {fechaDe(cierre.fecha)}.{cierre.cambios && <b className="rojo"> Hay facturas o gastos que han cambiado desde entonces.</b>}</> : estado === 'curso' ? 'El trimestre aún no ha terminado.' : `Plazo hasta el ${fechaDe(limite)}.`}</small>
          </span>
          {cierre ? <span className="desp-acciones">
            {cierre.cambios && <button type="button" className="boton" disabled={Boolean(ocupado)} onClick={cerrar}>Revisado de nuevo</button>}
            <button type="button" className="boton sec" disabled={Boolean(ocupado)} onClick={reabrir}>Reabrir</button>
          </span> : <button type="button" className="boton" disabled={Boolean(ocupado)} onClick={cerrar}>Revisado: cerrar</button>}
        </div>
        {pendientes.map((x) => <div key={x} className="celda desp-pendiente"><span className="txt">{x}</span></div>)}
        {presentados && (presentados.iva !== null || presentados.irpf !== null) && <div className="celda"><span className="txt">Presentado en Hacienda<small>Se marca en sus Impuestos</small></span><span className="v">{[presentados.iva !== null && `IVA: ${presentados.iva ? 'sí' : 'no'}`, presentados.irpf !== null && `IRPF: ${presentados.irpf ? 'sí' : 'no'}`].filter(Boolean).join(' · ')}</span></div>}
      </div>
      <p className="grupo-pie">Cerrado, nadie puede crear, cambiar ni borrar sus facturas y gastos de este trimestre (sí cobrarlos, pagarlos o añadir justificantes). Si algo entra por otro camino, lo verás aquí.</p>
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
          <span className="txt"><strong>{x.titulo}</strong><small>{fechaDe(x.fecha)}{x.tipo === 'gasto' ? ' · gasto' : ''}{x.sinJustificante ? ' · sin justificante' : ''}</small></span>
          <span className="imp">{eur(x.base)}</span>
          <Ir className="boton sec desp-mini" href={chat(`${x.tipo}:${x.id}`)}>Preguntar</Ir>
        </li>)}
      </ul>}
      {docs.mas > 0 && <p className="grupo-pie">Y {docs.mas} más: entra en sus Facturas o Gastos para verlos todos.</p>}
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

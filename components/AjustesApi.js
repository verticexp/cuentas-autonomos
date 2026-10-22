'use client';

import { useRef, useState } from 'react';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';

const NOMBRES = { 'facturas:leer': 'Ver facturas', 'facturas:escribir': 'Crear facturas', 'gastos:leer': 'Ver gastos', 'clientes:leer': 'Ver clientes' };
const EVENTOS = { 'factura.creada': 'Factura creada', 'factura.cobrada': 'Factura cobrada', 'gasto.creado': 'Gasto creado' };
const fecha = (v) => v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin uso';
const alternar = (lista, valor) => lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];

export default function AjustesApi({ inicial, alcances, eventos }) {
  const [datos, setDatos] = useState(inicial);
  const [nombre, setNombre] = useState(''), [seleccion, setSeleccion] = useState([]);
  const [url, setUrl] = useState(''), [suscritos, setSuscritos] = useState([]);
  const [secreto, setSecreto] = useState(null), [copiado, setCopiado] = useState(false);
  const [msg, setMsg] = useState(''), [ocupado, setOcupado] = useState(false);
  const bloqueo = useRef(false);
  const recargar = async () => setDatos(await llamar('/api/ajustes/api'));
  const ejecutar = async (fn) => {
    if (bloqueo.current) return;
    bloqueo.current = true; setOcupado(true); setMsg('');
    try { await fn(); } catch (e) { setMsg(e.message); }
    finally { bloqueo.current = false; setOcupado(false); }
  };
  const crear = (accion) => ejecutar(async () => {
    const r = await llamar('/api/ajustes/api', { method: 'POST', body: JSON.stringify(accion === 'clave' ? { accion, nombre, alcances: seleccion } : { accion, url, eventos: suscritos }) });
    setSecreto({ tipo: accion, valor: accion === 'clave' ? r.clave : r.secreto }); setCopiado(false);
    if (accion === 'clave') { setNombre(''); setSeleccion([]); } else { setUrl(''); setSuscritos([]); }
    await recargar();
  });
  const revocar = (tipo, id) => ejecutar(async () => {
    if (!(await confirmar({ titulo: tipo === 'clave' ? 'Revocar clave' : 'Eliminar webhook', texto: tipo === 'clave' ? 'La integración dejará de tener acceso con esta clave.' : 'Se cancelarán también las entregas pendientes a este destino.', aceptar: tipo === 'clave' ? 'Revocar clave' : 'Eliminar webhook', peligro: true }))) return;
    await llamar(`/api/ajustes/api?${tipo}=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await recargar();
  });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(secreto.valor); setCopiado(true); }
    catch { setMsg('No se ha podido copiar. Selecciona el valor y cópialo manualmente.'); }
  };
  return <>
    <p className="nota">Conecta tus programas con claves de API. Cada clave conserva solo los permisos elegidos y deja de servir si su creador pierde el acceso.</p>
    {msg && <p className="error" role="alert">{msg}</p>}
    {secreto && <section className="grupo" aria-labelledby="api-secreto-titulo">
      <h2 className="grupo-t" id="api-secreto-titulo">{secreto.tipo === 'clave' ? 'Copia tu nueva clave' : 'Copia el secreto del webhook'}</h2>
      <div className="grupo-c relleno formulario">
        <p>Solo se muestra ahora. Guárdalo en la configuración segura de tu integración.</p>
        <label>Valor secreto<input className="campo" readOnly value={secreto.valor} autoComplete="off" spellCheck={false} onFocus={(e) => e.target.select()} /></label>
        <button className="boton" type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar secreto'}</button>
        <button className="boton sec" type="button" onClick={() => setSecreto(null)}>Ya lo he guardado</button>
        {copiado && <span role="status" className="nota">Secreto copiado</span>}
      </div>
    </section>}
    <section className="grupo">
      <h2 className="grupo-t">Claves de API</h2>
      <div className="grupo-c">
        {!datos.claves.length && <div className="celda"><span className="txt">Todavía no hay claves</span></div>}
        {datos.claves.map((k) => <div className="celda" key={k.id}>
          <span className="txt" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{k.nombre}</strong><small>{k.prefijo}… · {k.alcances.map((a) => NOMBRES[a]).join(', ')}</small><small>Creada: {fecha(k.creada)} · Último uso: {fecha(k.ultimoUso)}</small></span>
          <button className="borrar" type="button" disabled={ocupado} aria-label={`Revocar clave ${k.nombre}`} onClick={() => revocar('clave', k.id)}>Revocar</button>
        </div>)}
      </div>
      <p className="grupo-pie">Hasta 120 peticiones por minuto y 5.000 al día por clave. La clave completa no se puede recuperar.</p>
    </section>
    <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); crear('clave'); }}>
      <h3>Crear clave</h3>
      <label>Nombre<input className="campo" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mi tienda" /></label>
      <fieldset disabled={ocupado}><legend>Permisos de la clave</legend>
        {alcances.map((a) => <label className="check" key={a}><input type="checkbox" checked={seleccion.includes(a)} onChange={() => setSeleccion(alternar(seleccion, a))} />{NOMBRES[a]}</label>)}
        {!alcances.length && <p className="nota">Tu usuario no tiene permisos para conceder acceso a datos.</p>}
      </fieldset>
      <button className="boton" disabled={ocupado || !nombre.trim() || !seleccion.length || Boolean(secreto)}>Crear clave</button>
    </form>
    <section className="grupo">
      <h2 className="grupo-t">Webhooks</h2>
      <div className="grupo-c">
        {!datos.webhooks.length && <div className="celda"><span className="txt">Todavía no hay webhooks</span></div>}
        {datos.webhooks.map((w) => <div className="celda" key={w.id}>
          <span className="txt" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{w.url}</strong><small>{w.eventos.map((e) => EVENTOS[e]).join(', ')} · {w.activo ? 'Activo' : 'Inactivo'}</small><small>Creado: {fecha(w.creado)}</small></span>
          <button className="borrar" type="button" disabled={ocupado} aria-label={`Eliminar webhook ${w.url}`} onClick={() => revocar('webhook', w.id)}>Eliminar</button>
        </div>)}
      </div>
      <p className="grupo-pie">Hasta 5 destinos HTTPS públicos. Cada entrega lleva una firma HMAC-SHA256. El receptor debe comprobar la firma sobre el cuerpo original y evitar duplicados por el id del evento.</p>
    </section>
    <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); crear('webhook'); }}>
      <h3>Crear webhook</h3>
      <label>URL de destino<input className="campo" type="url" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-tienda.es/webhooks/fisquo" /></label>
      <fieldset disabled={ocupado}><legend>Eventos</legend>
        {eventos.map((e) => <label className="check" key={e}><input type="checkbox" checked={suscritos.includes(e)} onChange={() => setSuscritos(alternar(suscritos, e))} />{EVENTOS[e]}</label>)}
      </fieldset>
      <button className="boton" disabled={ocupado || !url.trim() || !suscritos.length || datos.webhooks.length >= 5 || Boolean(secreto)}>Crear webhook</button>
      <p className="nota">La entrega de eventos se activará cuando se conecte con los flujos de facturas y gastos.</p>
    </form>
  </>;
}

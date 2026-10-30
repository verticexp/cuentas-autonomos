'use client';

import { useEffect, useRef, useState } from 'react';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { FACTURA_EJEMPLO } from '@/lib/apiEjemplo';
import Vacio from './Vacio';
import { fechaHora } from '@/lib/formato';
import { useT } from '@/components/Idioma';

const NOMBRES = { 'facturas:leer': 'Ver facturas', 'facturas:escribir': 'Crear facturas', 'gastos:leer': 'Ver gastos', 'clientes:leer': 'Ver clientes' };
const EVENTOS = { 'factura.creada': 'Factura creada', 'factura.cobrada': 'Factura cobrada', 'gasto.creado': 'Gasto creado' };
const fecha = (v, tr) => (v ? fechaHora(v) : tr('Sin uso'));
const alternar = (lista, valor) => lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
// Factura de ejemplo para crearla desde Zapier, Make o n8n (los mismos campos que el formulario; la actividad es opcional).
const EJEMPLO = JSON.stringify(FACTURA_EJEMPLO, null, 2);

export default function AjustesApi({ inicial, alcances, eventos }) {
  const tr = useT();
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
    if (!(await confirmar({ titulo: tipo === 'clave' ? tr('Revocar clave') : tr('Borrar webhook'), texto: tipo === 'clave' ? tr('La integración dejará de tener acceso con esta clave.') : tr('Se cancelarán también las entregas pendientes a este destino.'), aceptar: tipo === 'clave' ? tr('Revocar clave') : tr('Borrar webhook'), peligro: true }))) return;
    await llamar(`/api/ajustes/api?${tipo}=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await recargar();
  });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(secreto.valor); setCopiado(true); }
    catch { setMsg('No se ha podido copiar. Selecciona el valor y cópialo manualmente.'); }
  };
  return <>
    <p className="nota">{tr('Conecta tus programas con claves de API. Cada clave conserva solo los permisos elegidos y deja de servir si su creador pierde el acceso.')}</p>
    {msg && <p className="error" role="alert">{tr(msg)}</p>}
    {secreto && <section className="grupo" aria-labelledby="api-secreto-titulo">
      <h2 className="grupo-t" id="api-secreto-titulo">{secreto.tipo === 'clave' ? tr('Copia tu nueva clave') : tr('Copia el secreto del webhook')}</h2>
      <div className="grupo-c relleno formulario">
        <p>{tr('Solo se muestra ahora. Guárdalo en la configuración segura de tu integración.')}</p>
        <label>{tr('Valor secreto')}<input className="campo" readOnly value={secreto.valor} autoComplete="off" spellCheck={false} onFocus={(e) => e.target.select()} /></label>
        <button className="boton" type="button" onClick={copiar}>{copiado ? tr('Copiado') : tr('Copiar secreto')}</button>
        <button className="boton sec" type="button" onClick={() => setSecreto(null)}>{tr('Ya lo he guardado')}</button>
        {copiado && <span role="status" className="nota">{tr('Secreto copiado')}</span>}
      </div>
    </section>}
    <section className="grupo">
      <h2 className="grupo-t">{tr('Claves de API')}</h2>
      <div className="grupo-c">
        {!datos.claves.length && <Vacio compacto icono="conexion" titulo={tr('Todavía no hay claves')}>{tr('Una clave deja que otro programa (tu tienda online, Zapier…) lea o cree datos en Fisquo. Créala en el formulario de abajo.')}</Vacio>}
        {datos.claves.map((k) => <div className="celda" key={k.id}>
          <span className="txt" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{k.nombre}</strong><small>{k.prefijo}… · {k.alcances.map((a) => tr(NOMBRES[a])).join(', ')}</small><small>{tr('Creada: {creada} · Último uso: {uso}', { creada: fecha(k.creada, tr), uso: fecha(k.ultimoUso, tr) })}</small></span>
          <button className="borrar" type="button" disabled={ocupado} aria-label={tr('Revocar clave {nombre}', { nombre: k.nombre })} onClick={() => revocar('clave', k.id)}>{tr('Revocar')}</button>
        </div>)}
      </div>
      <p className="grupo-pie">{tr('Hasta 120 peticiones por minuto y 5.000 al día por clave. La clave completa no se puede recuperar.')}</p>
    </section>
    <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); crear('clave'); }}>
      <h3>{tr('Crear clave')}</h3>
      <label>{tr('Nombre')}<input className="campo" required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tr('Mi tienda')} /></label>
      <fieldset disabled={ocupado}><legend>{tr('Permisos de la clave')}</legend>
        {alcances.map((a) => <label className="check" key={a}><input type="checkbox" checked={seleccion.includes(a)} onChange={() => setSeleccion(alternar(seleccion, a))} />{tr(NOMBRES[a])}</label>)}
        {!alcances.length && <p className="nota">{tr('Tu usuario no tiene permisos para conceder acceso a datos.')}</p>}
      </fieldset>
      <button className="boton" disabled={ocupado || !nombre.trim() || !seleccion.length || Boolean(secreto)}>{tr('Crear clave')}</button>
    </form>
    <section className="grupo">
      <h2 className="grupo-t">{tr('Webhooks')}</h2>
      <div className="grupo-c">
        {!datos.webhooks.length && <Vacio compacto icono="aviso" titulo={tr('Todavía no hay webhooks')}>{tr('Un webhook avisa a otro programa cuando creas o cobras una factura. Añade su dirección en el formulario de abajo.')}</Vacio>}
        {datos.webhooks.map((w) => <div className="celda" key={w.id}>
          <span className="txt" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{w.url}</strong><small>{w.eventos.map((e) => tr(EVENTOS[e])).join(', ')} · {w.activo ? tr('Activo') : tr('Inactivo')}</small><small>{tr('Creado: {creado}', { creado: fecha(w.creado, tr) })}</small><small>{tr('Creador')}: {w.creador || w.uid || tr('Sin registrar')}</small></span>
          <button className="borrar" type="button" disabled={ocupado} aria-label={tr('Borrar webhook {url}', { url: w.url })} onClick={() => revocar('webhook', w.id)}>{tr('Borrar')}</button>
        </div>)}
      </div>
      <p className="grupo-pie">{tr('Hasta 5 destinos HTTPS públicos. Cada entrega lleva una firma HMAC-SHA256. El receptor debe comprobar la firma sobre el cuerpo original y evitar duplicados por el id del evento.')}</p>
    </section>
    <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); crear('webhook'); }}>
      <h3>{tr('Crear webhook')}</h3>
      <label>{tr('URL de destino')}<input className="campo" type="url" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-tienda.es/webhooks/fisquo" /></label>
      <fieldset disabled={ocupado}><legend>{tr('Eventos')}</legend>
        {eventos.map((e) => <label className="check" key={e}><input type="checkbox" checked={suscritos.includes(e)} onChange={() => setSuscritos(alternar(suscritos, e))} />{tr(EVENTOS[e])}</label>)}
      </fieldset>
      <button className="boton" disabled={ocupado || !url.trim() || !suscritos.length || datos.webhooks.length >= 5 || Boolean(secreto)}>{tr('Crear webhook')}</button>
    </form>
    <Conectar />
  </>;
}

// Recetas para conectar Fisquo sin programar: Zapier, Make y n8n reciben los webhooks y llaman a la API con su paso HTTP.
function Conectar() {
  const tr = useT();
  const [origen, setOrigen] = useState('https://www.fisquo.com');
  useEffect(() => { setOrigen(window.location.origin); }, []);
  return (
    <section className="grupo" aria-labelledby="api-conectar">
      <h2 className="grupo-t" id="api-conectar">{tr('Conectar con Zapier, Make o n8n')}</h2>
      <div className="grupo-c ayuda-lista">
        <details className="ayuda-p">
          <summary>{tr('Hacer algo cuando se crea o se cobra una factura')}</summary>
          <p>{tr('1. Crea el disparador: en Zapier, «Webhooks by Zapier» › «Catch Hook»; en Make, «Webhooks» › «Custom webhook»; en n8n, el nodo «Webhook» con el método POST. Copia la dirección que te dan.')}</p>
          <p>{tr('2. Pégala arriba, en «Crear webhook», elige los eventos y guarda el secreto.')}</p>
          <p>{tr('3. Cada aviso llega con id, tipo, creado y datos (la factura o el gasto): úsalos en los pasos siguientes, como un correo, una hoja de cálculo o tu CRM. Puede llegar dos veces: filtra por el id.')}</p>
          <p>{tr('Para comprobar que el aviso es de Fisquo, verifica la cabecera Fisquo-Firma con el secreto (HMAC-SHA256 de «t.cuerpo»), con un paso de código.')}</p>
        </details>
        <details className="ayuda-p">
          <summary>{tr('Crear facturas en Fisquo desde otra aplicación')}</summary>
          <p>{tr('1. Crea una clave con el permiso «Crear facturas».')}</p>
          <p>{tr('2. Añade un paso HTTP: en Zapier, «Webhooks by Zapier» › «Custom Request»; en Make, «HTTP» › «Make a request»; en n8n, «HTTP Request». Método POST a {origen}/api/v1/facturas.', { origen })}</p>
          <p>{tr('3. Cabeceras: Authorization con «Bearer » y tu clave, Content-Type con application/json e Idempotency-Key con un valor único (el número del pedido, por ejemplo): si el paso se repite, no se duplica la factura.')}</p>
          <p>{tr('4. Cuerpo en JSON, como este:')}</p>
          <pre className="api-ejemplo">{EJEMPLO}</pre>
        </details>
        <details className="ayuda-p">
          <summary>{tr('Leer facturas, gastos o clientes')}</summary>
          <p>{tr('Con una clave que pueda verlos: GET a {origen}/api/v1/facturas (o /gastos, /clientes) con la cabecera Authorization. Puedes filtrar con ?desde=2026-01-01&hasta=2026-03-31. Llegan de 50 en 50: repite añadiendo ?cursor= con el valor de «siguiente» hasta que sea null.', { origen })}</p>
        </details>
      </div>
    </section>
  );
}

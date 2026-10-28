'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { fechaCorta, fechaHora } from '@/lib/formato';
import Ir from './Ir';
import Vacio from './Vacio';
import PeticionesCliente from './PeticionesCliente';
import { useT } from '@/components/Idioma';
import '@/app/despacho.css';

const horaDe = fechaHora;

// Un texto con un nombre en negrita en medio: lo de antes y lo de después se traducen juntos, con el nombre en un hueco.
const conNegrita = (tr, texto, nombre, vars = {}) => {
  const [antes, despues = ''] = tr(texto, { ...vars, nombre: '\u0001' }).split('\u0001');
  return <>{antes}<b>{nombre}</b>{despues}</>;
};

// Ajustes › Tu gestoría: el despacho que lleva tus cuentas en Fisquo (lib/despachos.js). Le das acceso con su código,
// ves lo que hace y le respondes; puedes quitárselo cuando quieras.
export default function TuDespacho({ despacho, accesos = [], ultimo = null, noLeidos = 0, peticiones = [], codigo: codigoInicial = '' }) {
  const tr = useT();
  const router = useRouter();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState('');
  const buscar = async (e) => {
    e.preventDefault(); setMsg(''); setNombre('');
    try { const r = await llamar(`/api/tu-despacho?codigo=${encodeURIComponent(codigo.trim())}`); setNombre(r.nombre); } catch (err) { setMsg(err.message); }
  };
  const dar = async () => {
    setMsg('');
    try { await llamar('/api/tu-despacho', { method: 'POST', body: JSON.stringify({ codigo: codigo.trim() }) }); router.replace('/ajustes/gestoria'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const quitar = async () => {
    if (!despacho.pendiente && !(await confirmar({ titulo: tr('¿Quitar el acceso a {nombre}?', { nombre: despacho.nombre }), texto: `${tr('Dejará de ver tus cuentas al momento.')}${despacho.licencia ? ` ${tr('Como tu gestoría pagaba tu plan, tendrás un mes de prueba para elegir el tuyo.')}` : ''}`, aceptar: tr('Quitar el acceso'), peligro: true }))) return;
    try { await llamar('/api/tu-despacho', { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };

  if (!despacho) return <section className="grupo" aria-labelledby="td-t">
    <h2 className="grupo-t" id="td-t">{tr('Tu gestoría en Fisquo')}</h2>
    <div className="grupo-c relleno">
      <p>{tr('Si tu gestoría trabaja con Fisquo, pídele que te lleve con su código: cuando lo acepte, verá tus cuentas, revisará cada trimestre y podrá preguntarte aquí. Tú ves todo lo que hace y se lo puedes quitar cuando quieras.')}</p>
      <form className="desp-codigo" onSubmit={buscar}>
        <input className="campo" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} placeholder={tr('Código de tu gestoría')} aria-label={tr('Código de tu gestoría')} value={codigo} onChange={(e) => { setCodigo(e.target.value); setNombre(''); }} />
        <button className="boton sec" disabled={!codigo.trim()}>{tr('Buscar')}</button>
      </form>
      {nombre && <div className="desp-codigo-ok"><span>{conNegrita(tr, 'Es {nombre}.', nombre)}</span><button type="button" className="boton" onClick={dar}>{tr('Pedir a {nombre} que me lleve', { nombre })}</button></div>}
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
    </div>
  </section>;

  if (despacho.pendiente) return <section className="grupo" aria-labelledby="td-t">
    <h2 className="grupo-t" id="td-t">{tr('Tu gestoría en Fisquo')}</h2>
    <div className="grupo-c relleno">
      <p>{conNegrita(tr, 'Has pedido a {nombre} que lleve tus cuentas. Falta que lo acepte: hasta entonces no ve nada.', despacho.nombre)}</p>
      <button type="button" className="boton sec desp-mini" onClick={quitar}>{tr('Cancelar la solicitud')}</button>
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
    </div>
  </section>;

  return <>
    <PeticionesCliente peticiones={peticiones} />
    <section className="grupo" aria-labelledby="td-p">
      <h2 className="grupo-t" id="td-p">{tr('Mensajes con {nombre}', { nombre: despacho.nombre })}</h2>
      <div className="grupo-c">
        <Ir className="celda ir desp-mensajes-ficha" href="/tu-gestoria">
          <span className="txt">
            {noLeidos > 0 ? <b className="rojo">{noLeidos === 1 ? tr('1 mensaje nuevo') : tr('{n} mensajes nuevos', { n: noLeidos })}</b> : ultimo ? tr('Abrir la conversación') : tr('Escribir a {nombre}', { nombre: despacho.nombre })}
            {ultimo ? <span className={`desp-burbuja-mini${ultimo.lado === 'cliente' ? ' mia' : ''}`}>{ultimo.texto}</span> : <small>{tr('Le llega a su Fisquo y te contesta aquí.')}</small>}
          </span>
        </Ir>
      </div>
    </section>
    <section className="grupo" aria-labelledby="td-t">
      <h2 className="grupo-t" id="td-t">{tr('Tu gestoría en Fisquo')}</h2>
      <div className="grupo-c relleno">
        <p>{conNegrita(tr, '{nombre} lleva tus cuentas en Fisquo desde el {fecha}.', despacho.nombre, { fecha: fechaCorta(String(despacho.desde).slice(0, 10)) })}{despacho.licencia ? ` ${tr('Fisquo va incluido en lo que te cobra tu gestoría: no pagas nada a Fisquo.')}` : ''}</p>
        <p className="nota">{tr('Entra con el perfil Gestoría: ve tus facturas, gastos, nóminas, contabilidad e impuestos. Cuando revisa un trimestre lo cierra: ya no se pueden cambiar sus facturas ni sus gastos hasta que lo reabra.')}</p>
        <button type="button" className="boton sec desp-mini" onClick={quitar}>{tr('Quitar el acceso')}</button>
        {msg && <p className="error" role="alert">{tr(msg)}</p>}
      </div>
    </section>
    <section className="grupo" aria-labelledby="td-a">
      <h2 className="grupo-t" id="td-a">{tr('Lo que ha hecho en tus cuentas')}</h2>
      <div className="grupo-c relleno">
        {accesos.length ? <ul className="desp-registro">{accesos.map((a, i) => <li key={i}><span>{a.nombre}{a.despacho ? ` (${a.despacho})` : ''}: {tr(a.accion)}{a.detalle ? ` · ${a.detalle}` : ''}</span><small>{horaDe(a.fecha)}</small></li>)}</ul> : <Vacio compacto icono="actividad" titulo={tr('Tu gestoría aún no ha hecho nada')}>{tr('Aquí verás lo que consulte o cambie en tus cuentas, con quién y cuándo.')}</Vacio>}
      </div>
    </section>
  </>;
}

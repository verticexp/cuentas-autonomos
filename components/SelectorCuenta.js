'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { SIN_BARRA, alPulsar } from '@/lib/transicion';
import '@/app/despacho.css';

// Dónde trabaja la gente de un despacho, como el selector de cuenta de las apps de Apple: una pastilla con el nombre de lo
// que se tiene abierto (Mi despacho, su propia empresa o un cliente) y, al tocarla, un menú para ir a otro sitio sin pasar
// por el panel: volver al despacho, la ficha del cliente, la empresa propia o uno de los clientes abiertos hace poco.
// Los recientes se recuerdan en este dispositivo (solo id y nombre).
const CLAVE = 'fisquo-clientes-recientes';
const RECIENTES = 4;
const leerRecientes = () => { try { const l = JSON.parse(localStorage.getItem(CLAVE)); return Array.isArray(l) ? l : []; } catch { return []; } };
const apuntar = (c) => { try { localStorage.setItem(CLAVE, JSON.stringify([c, ...leerRecientes().filter((x) => x.id !== c.id)].slice(0, 8))); } catch { /* sin almacenamiento: sin recientes */ } };
// Al pasar de un cliente a otro se sigue en la misma pantalla (Facturas de uno → Facturas del otro), si es de las principales.
const SECCIONES = /^\/(facturas|gastos|modelos|contabilidad|banco|clientes|presupuestos|tesoreria|cartera|analisis|nominas|mas)(?=\/|$)/;

const Casa = () => <span className="sel-casa" aria-hidden><svg viewBox="0 0 24 24"><path d="M4 21V9l8-5.5L20 9v12" /><path d="M9.5 21v-6h5v6" /></svg></span>;
const Marca = () => <svg className="sel-marca" viewBox="0 0 24 24" aria-hidden><path d="M5 12l5 5 9-10" /></svg>;

// actual: 'despacho' | 'empresa' | 'cliente'. despacho: su nombre. cliente: { id, nombre } (dentro de un cliente).
// empresas: las propias a las que puede ir (solo la titular con «Mi empresa» activada); empresa: la abierta, si es propia,
// y empresaNombre, su nombre.
export function SelectorCuenta({ actual, despacho, cliente = null, empresas = [], empresa = null, empresaNombre = '', className = '' }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [recientes, setRecientes] = useState([]);
  const [msg, setMsg] = useState('');
  const caja = useRef(null);
  useEffect(() => { if (cliente) apuntar({ id: cliente.id, nombre: cliente.nombre }); }, [cliente]);
  useEffect(() => { if (abierto) setRecientes(leerRecientes().filter((x) => x.id !== cliente?.id).slice(0, RECIENTES)); }, [abierto, cliente]);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  // Cambiar de cuenta recarga la página: la barra, los permisos y los datos son los de la otra empresa.
  const pedir = async (url, cuerpo, destino) => {
    setMsg('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido cambiar. Revisa la conexión e inténtalo otra vez.');
      try { sessionStorage.removeItem('fisquo-arranque'); sessionStorage.removeItem('fisquo-entrada'); } catch {}
      window.location.assign(d.ir || destino);
    } catch (e) { setMsg(e.message); }
  };
  const aCliente = (id) => {
    const seccion = cliente && location.pathname.match(SECCIONES)?.[0];
    pedir('/api/despacho/entrar', { empresa: id, ir: seccion || '/' }, '/');
  };

  // Con una sola empresa propia, «Mi empresa» (su nombre suele ser el del despacho y confundía); con varias, su nombre.
  const variasPropias = empresas.length > 1;
  const nombreEmpresa = (x) => (variasPropias ? x.nombre : 'Mi empresa');
  const nombre = actual === 'despacho' ? despacho : actual === 'cliente' ? cliente?.nombre : variasPropias ? empresas.find((x) => x.id === empresa)?.nombre || empresaNombre : 'Mi empresa';
  return (
    <div className={`sel-cuenta ${className}${abierto ? ' abierto' : ''}`} ref={caja}>
      <button type="button" className="sel-pastilla" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {actual === 'despacho' ? <Casa /> : <Avatar nombre={actual === 'empresa' ? empresas.find((x) => x.id === empresa)?.nombre || empresaNombre || nombre : nombre} size={24} />}
        <span className="sel-nombre">{nombre}</span>
        <svg className="sel-flecha" viewBox="0 0 24 24" aria-hidden><path d="M7 10l5 5 5-5" /></svg>
      </button>
      {abierto && (
        <div className="sel-menu" role="menu" aria-label="Cambiar de cuenta">
          {actual === 'cliente' && (
            <div className="sel-bloque">
              <form method="post" action="/api/despacho/salir" role="none"><button type="submit" role="menuitem" className="sel-op">Volver a Mi despacho<svg viewBox="0 0 24 24" aria-hidden><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg></button></form>
              <a role="menuitem" className="sel-op" href={`/despacho/${encodeURIComponent(cliente.id)}`}>Ficha y cierre del cliente<svg viewBox="0 0 24 24" aria-hidden><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></svg></a>
            </div>
          )}
          <div className="sel-bloque">
            {actual === 'despacho'
              ? <span role="menuitem" aria-current="page" className="sel-op activa"><span className="sel-izq"><Casa />Mi despacho</span><Marca /></span>
              : actual === 'cliente'
                ? null
                : <Link role="menuitem" className="sel-op" href="/despacho" onClick={(e) => { setAbierto(false); alPulsar(router, '/despacho', 'tab-izq')(e); }}><span className="sel-izq"><Casa />Mi despacho</span></Link>}
            {empresas.map((x) => (x.id === empresa && actual === 'empresa'
              ? <span key={x.id} role="menuitem" aria-current="page" className="sel-op activa"><span className="sel-izq"><Avatar nombre={x.nombre} size={24} />{nombreEmpresa(x)}</span><Marca /></span>
              : <form key={x.id} method="post" action={`/api/despacho/salir?a=empresa&e=${encodeURIComponent(x.id)}`} role="none"><button type="submit" role="menuitem" className="sel-op"><span className="sel-izq"><Avatar nombre={x.nombre} size={24} />{nombreEmpresa(x)}</span></button></form>))}
          </div>
          {recientes.length > 0 && (
            <div className="sel-bloque">
              <p className="sel-t">Clientes recientes</p>
              {recientes.map((x) => <button key={x.id} type="button" role="menuitem" className="sel-op" onClick={() => aCliente(x.id)}><span className="sel-izq"><Avatar nombre={x.nombre} size={24} />{x.nombre}</span></button>)}
            </div>
          )}
          {msg && <p className="sel-msg" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// Arriba de cada pantalla de la gente de un despacho, en lugar de la franja oscura de antes, como el «‹ Mail» de iOS al volver
// de otra app: fuera del panel (en su empresa o dentro de un cliente), «‹ Mi despacho»; en el panel, «‹ Mi empresa» si la
// tiene (la misma puerta, al revés). El selector, a la derecha. Sin barra en las conversaciones (lib/transicion.js SIN_BARRA)
// ni en las pantallas sin sesión. noLeidos: mensajes de clientes (en el panel ya van sobre «Mensajes»).
export default function BarraDespacho({ noLeidos = 0, ...selector }) {
  const path = usePathname() || '';
  const router = useRouter();
  if (SIN_BARRA.test(path) || /^\/(login|registro|bloqueo|invitacion|p\/|portal\/|pagar\/|privacidad|condiciones)(\/|$)/.test(path) || path.endsWith('/pdf')) return null;
  // El layout no se repinta al ir de la empresa al panel sin recargar: dónde se está lo dice la dirección.
  const enPanel = /^\/despacho(\/|$)/.test(path);
  const badge = noLeidos > 0 && <b className="sel-n"><span aria-hidden>{noLeidos > 99 ? '99+' : noLeidos}</span><span className="sr">{noLeidos === 1 ? '1 mensaje nuevo' : `${noLeidos} mensajes nuevos`}</span></b>;
  const volver = enPanel
    ? selector.empresas?.length > 0 && <form method="post" action="/api/despacho/salir?a=empresa"><button type="submit" className="barra-despacho-volver">‹ Mi empresa</button></form>
    : selector.actual === 'cliente'
      ? <form method="post" action="/api/despacho/salir"><button type="submit" className="barra-despacho-volver">‹ Mi despacho{badge}</button></form>
      : <Link href="/despacho" className="barra-despacho-volver" onClick={alPulsar(router, '/despacho', 'tab-izq')}>‹ Mi despacho{badge}</Link>;
  return (
    <div className="barra-despacho" data-cliente={(!enPanel && selector.actual === 'cliente') || undefined}>
      {volver || <span aria-hidden />}
      <SelectorCuenta {...selector} actual={enPanel ? 'despacho' : selector.actual} className="sel-derecha" />
    </div>
  );
}

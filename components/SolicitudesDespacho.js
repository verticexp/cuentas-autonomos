'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { fechaCorta } from '@/lib/formato';
import { useT } from '@/components/Idioma';

// Mi despacho: empresas que han escrito tu código y esperan a que las aceptes (lib/despachos.js aceptarCliente). Hasta
// entonces nadie del despacho ve sus cuentas. Solo lo ve el titular.
export default function SolicitudesDespacho({ solicitudes = [] }) {
  const router = useRouter();
  const tr = useT();
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');
  if (!solicitudes.length) return null;
  const responder = async (s, accion) => {
    if (accion === 'rechazar' && !(await confirmar({ titulo: tr('¿Rechazar a {nombre}?', { nombre: s.nombre }), texto: tr('No la verás en tu despacho. Si de verdad es cliente tuyo, podrá volver a pedirlo con tu código.'), aceptar: tr('Rechazar'), peligro: true }))) return;
    setOcupado(s.id); setMsg('');
    try { await llamar('/api/despacho/cliente', { method: 'POST', body: JSON.stringify({ empresa: s.id, accion }) }); router.refresh(); }
    catch (err) { setMsg(err.message); }
    finally { setOcupado(''); }
  };
  return <section className="grupo" aria-labelledby="desp-sol">
    <h2 className="grupo-t" id="desp-sol">{solicitudes.length === 1 ? tr('1 empresa quiere que la lleves') : tr('{n} empresas quieren que las lleves', { n: solicitudes.length })}</h2>
    <ul className="grupo-lista">
      {solicitudes.map((s) => <li key={s.id} className="fila">
        <span className="txt">
          <strong>{s.nombre}</strong>
          <small>{s.nif ? `${s.nif} · ` : ''}{s.por === 'codigo' ? tr('Se registró el {fecha}', { fecha: fechaCorta(String(s.desde).slice(0, 10)) }) : tr('Escribió tu código el {fecha}', { fecha: fechaCorta(String(s.desde).slice(0, 10)) })}</small>
        </span>
        <button type="button" className="boton sec desp-mini" disabled={ocupado === s.id} onClick={() => responder(s, 'rechazar')}>{tr('Rechazar')}</button>
        <button type="button" className="boton desp-mini" disabled={ocupado === s.id} onClick={() => responder(s, 'aceptar')}>{tr('Aceptar')}</button>
      </li>)}
    </ul>
    <p className="grupo-pie">{tr('Hasta que la aceptes, nadie de tu despacho ve sus cuentas. Acepta solo las empresas que conozcas.')}</p>
    {msg && <p className="error" role="alert">{tr(msg)}</p>}
  </section>;
}

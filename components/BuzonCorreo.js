'use client';

import { useState } from 'react';
import { confirmar } from './Confirmar';
import { useT } from '@/components/Idioma';

// La dirección de correo de la bandeja (lib/buzon.js): crearla, copiarla, cómo hacer que Gmail u Outlook reenvíen solas
// las facturas, el código con el que Gmail pide confirmar el reenvío y los remitentes que no pasan por cuarentena.
export default function BuzonCorreo({ inicial, admin = false, puedeGastar = false }) {
  const tr = useT();
  const [b, setB] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [nuevo, setNuevo] = useState('');
  if (!b?.listo) return null;

  const hacer = async (accion, email) => {
    setOcupado(true); setError('');
    try {
      const r = await fetch('/api/bandeja/correo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, email }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido hacer');
      setB(d);
      return true;
    } catch (e) { setError(e.message); return false; } finally { setOcupado(false); }
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(b.direccion); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setError(tr('Cópiala a mano: {direccion}', { direccion: b.direccion })); }
  };
  const cambiar = async () => {
    if (await confirmar({ titulo: tr('Cambiar la dirección'), texto: tr('La dirección actual dejará de recibir facturas al momento. Tendrás que cambiarla en las reglas de reenvío de tu correo.'), aceptar: tr('Cambiarla'), peligro: true })) hacer('cambiar');
  };

  if (!b.direccion) {
    return (
      <div className="tarjeta bloque buzon" id="correo">
        <strong>{tr('Recíbelas por correo')}</strong>
        <p className="nota">{tr('Te damos una dirección propia: reenvíale las facturas que te llegan (o haz que tu correo lo haga solo) y entran aquí sin que tengas que descargarlas.')}</p>
        {puedeGastar && <button type="button" className="boton" disabled={ocupado} onClick={() => hacer('crear')}>{tr('Crear mi dirección')}</button>}
        {error && <p className="error" role="alert">{tr(error)}</p>}
      </div>
    );
  }

  return (
    <div className="tarjeta bloque buzon" id="correo">
      <strong>{tr('Reenvía tus facturas a')}</strong>
      <div className="buzon-direccion">
        <code>{b.direccion}</code>
        <button type="button" className="boton sec pequeno" onClick={copiar}>{copiado ? tr('Copiada') : tr('Copiar')}</button>
      </div>
      <p className="nota">{tr('Lo que llegue desde el email con el que entras en Fisquo, o de un proveedor cuya factura ya aprobaste, se lee solo. Lo de otros remitentes espera a que lo pidas, para no gastar lecturas.')}</p>
      {b.confirmacion && (
        <div className="nota" role="status">
          <strong>{tr('Gmail te pide confirmar el reenvío.')}</strong> {tr('Código:')} <code>{b.confirmacion.codigo}</code>.{' '}
          {b.confirmacion.enlace && <a href={b.confirmacion.enlace} target="_blank" rel="noopener noreferrer">{tr('Confirmarlo en Google')}</a>}
          {puedeGastar && <> · <button type="button" className="enlace" disabled={ocupado} onClick={() => hacer('confirmada')}>{tr('Ya está')}</button></>}
        </div>
      )}
      <details>
        <summary>{tr('Que lleguen solas desde Gmail u Outlook')}</summary>
        <div className="buzon-pasos">
          <p><strong>Gmail</strong> {tr('(en el ordenador)')}</p>
          <ol>
            <li>{tr('Ajustes (rueda) › Ver todos los ajustes › Reenvío y correo POP/IMAP › Añadir una dirección de reenvío, y pega la dirección de arriba.')}</li>
            <li>{tr('Google manda un código a esa dirección: aparecerá aquí en unos segundos. Confírmalo.')}</li>
            <li>{tr('En Filtros y direcciones bloqueadas › Crear un filtro: en «De» pon el email de facturación de tu proveedor (o en «Contiene las palabras»,')} <em>{tr('factura')}</em>{tr(') › Crear filtro › Reenviarlo a la dirección de arriba.')}</li>
          </ol>
          <p><strong>Outlook</strong></p>
          <ol>
            <li>{tr('Configuración › Correo › Reglas › Agregar nueva regla.')}</li>
            <li>{tr('Condición: «De» el email de tu proveedor (o «El asunto incluye»')} <em>{tr('factura')}</em>{tr('). Acción: «Reenviar a» la dirección de arriba.')}</li>
          </ol>
          <p className="nota">{tr('También puedes reenviar a mano cualquier correo con la factura adjunta. Si la factura viene en el texto del correo, sin adjunto, se guarda como PDF.')}</p>
        </div>
      </details>
      <details>
        <summary>{tr('Remitentes conocidos ({n})', { n: b.remitentes.length })}</summary>
        <div className="buzon-pasos">
          {!b.remitentes.length && <p className="nota">{tr('Todavía ninguno. Se añaden solos al aprobar una factura que llegó por correo.')}</p>}
          <ul className="buzon-remitentes">
            {b.remitentes.map((r) => <li key={r}><span>{r}</span>{puedeGastar && <button type="button" className="enlace" disabled={ocupado} onClick={() => hacer('quitar', r)} aria-label={tr('Quitar {nombre}', { nombre: r })}>{tr('Quitar')}</button>}</li>)}
          </ul>
          {puedeGastar && <form className="buzon-anadir" onSubmit={async (e) => { e.preventDefault(); if (await hacer('anadir', nuevo)) setNuevo(''); }}>
            <input className="campo" type="email" placeholder="facturacion@proveedor.com" value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label={tr('Email del remitente')} />
            <button className="boton sec pequeno" disabled={ocupado || !nuevo}>{tr('Añadir')}</button>
          </form>}
        </div>
      </details>
      {admin && <button type="button" className="enlace" disabled={ocupado} onClick={cambiar}>{tr('Cambiar la dirección')}</button>}
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}

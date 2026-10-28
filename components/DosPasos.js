'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { fechaCorta } from '@/lib/formato';
import { useT } from '@/components/Idioma';

// Ajustes › Seguridad › Verificación en dos pasos (lib/dosPasos.js, app/api/dos-pasos): al entrar con contraseña, pide
// además el código de una app de autenticación. Activarla (QR, primer código y los diez códigos de recuperación, que solo
// se ven una vez), códigos nuevos y quitarla. activa: { desde (día en Madrid), quedan } si ya la tiene.
export default function DosPasos({ activa = null }) {
  const tr = useT();
  const router = useRouter();
  const [alta, setAlta] = useState(null);
  const [codigos, setCodigos] = useState(null);
  const [modo, setModo] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pedir = async (cuerpo, despues) => {
    setOcupado(true); setMsg('');
    try { despues(await llamar('/api/dos-pasos', { method: 'POST', body: JSON.stringify(cuerpo) })); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  const datos = (e) => Object.fromEntries(new FormData(e.currentTarget));
  const empezar = () => pedir({ accion: 'empezar' }, setAlta);
  const activar = (e) => { e.preventDefault(); pedir({ accion: 'activar', ...datos(e) }, (d) => { setAlta(null); setCodigos(d.codigos); router.refresh(); }); };
  const nuevos = (e) => { e.preventDefault(); pedir({ accion: 'codigos', ...datos(e) }, (d) => { setModo(''); setCodigos(d.codigos); router.refresh(); }); };
  const quitar = (e) => { e.preventDefault(); pedir({ accion: 'desactivar', ...datos(e) }, () => { setModo(''); setMsg('Verificación en dos pasos desactivada.'); router.refresh(); }); };
  const texto = () => `Códigos de recuperación de Fisquo (cada uno sirve una vez)\n\n${codigos.join('\n')}\n`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto()); setMsg('Códigos copiados.'); } catch { setMsg('No se han podido copiar: selecciónalos y cópialos a mano.'); }
  };
  const descargar = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto()], { type: 'text/plain;charset=utf-8' }));
    a.download = 'fisquo-codigos-recuperacion.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const aviso = tr('{codigos} en un sitio seguro (un gestor de contraseñas o impresos). Si pierdes el móvil, entrarás con uno de ellos; cada uno sirve una vez y no se volverán a enseñar.', { codigos: '\u0001' }).split('\u0001');
  const campoCodigo = <label>{tr('Código de la app (o uno de recuperación)')}<input className="campo" name="codigo" required autoComplete="one-time-code" inputMode="numeric" maxLength={9} /></label>;

  return (
    <section className="tarjeta formulario dos-pasos">
      <h3 aria-level={2}>{tr('Verificación en dos pasos')}</h3>
      {codigos ? (
        <>
          <p className="nota">{aviso[0]}<strong>{tr('Guarda estos códigos de recuperación')}</strong>{aviso[1]}</p>
          <ul className="codigos-recuperacion">{codigos.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <div className="fila-act">
            <button type="button" className="boton sec" onClick={copiar}>{tr('Copiar')}</button>
            <button type="button" className="boton sec" onClick={descargar}>{tr('Descargar')}</button>
            <button type="button" className="boton" onClick={() => { setCodigos(null); setMsg(''); }}>{tr('Ya los he guardado')}</button>
          </div>
        </>
      ) : alta ? (
        <form onSubmit={activar}>
          <p className="nota">{tr('1. Abre tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) y escanea este código.')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr-dos-pasos" src={alta.qr} alt={tr('Código QR para añadir Fisquo a tu app de autenticación')} width={220} height={220} />
          <p className="nota">{tr('¿No puedes escanearlo? Añade la cuenta a mano con esta clave:')} <code className="clave-dos-pasos">{alta.clave}</code></p>
          <p className="nota">{tr('2. Escribe el código de 6 cifras que te da la app.')}</p>
          <label>{tr('Código')}<input className="campo" name="codigo" required autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="\d{6}" /></label>
          <div className="fila-act">
            <button className="boton" disabled={ocupado}>{ocupado ? tr('Comprobando…') : tr('Activar')}</button>
            <button type="button" className="enlace" onClick={() => setAlta(null)}>{tr('Cancelar')}</button>
          </div>
        </form>
      ) : activa ? (
        <>
          <p className="nota">{activa.desde ? tr('Activada desde el {fecha}. Al entrar con tu contraseña te pedimos también el código de la app. Te quedan {n} códigos de recuperación.', { fecha: fechaCorta(activa.desde), n: activa.quedan }) : tr('Activada. Al entrar con tu contraseña te pedimos también el código de la app. Te quedan {n} códigos de recuperación.', { n: activa.quedan })}</p>
          {activa.quedan <= 3 && <p className="nota falta">{tr('Te quedan pocos códigos de recuperación: genera otros.')}</p>}
          {modo === 'codigos' ? (
            <form onSubmit={nuevos}>
              {campoCodigo}
              <div className="fila-act"><button className="boton" disabled={ocupado}>{tr('Generar códigos nuevos')}</button><button type="button" className="enlace" onClick={() => setModo('')}>{tr('Cancelar')}</button></div>
            </form>
          ) : modo === 'quitar' ? (
            <form onSubmit={quitar}>
              <label>{tr('Tu contraseña')}<input className="campo" name="password" type="password" required autoComplete="current-password" /></label>
              {campoCodigo}
              <div className="fila-act"><button className="borrar" disabled={ocupado}>{tr('Desactivar')}</button><button type="button" className="enlace" onClick={() => setModo('')}>{tr('Cancelar')}</button></div>
            </form>
          ) : (
            <div className="fila-act">
              <button type="button" className="boton sec" onClick={() => setModo('codigos')}>{tr('Códigos de recuperación nuevos')}</button>
              <button type="button" className="enlace" onClick={() => setModo('quitar')}>{tr('Desactivar')}</button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="nota">{tr('Además de la contraseña, al entrar te pediremos un código de 6 cifras de una app de tu móvil. Así, aunque alguien sepa tu contraseña, no podrá entrar. Con Face ID no hace falta: ya es otra forma segura de entrar.')}</p>
          <button type="button" className="boton" onClick={empezar} disabled={ocupado}>{ocupado ? tr('Preparando…') : tr('Activar')}</button>
        </>
      )}
      {msg && <p className="nota" role="status">{tr(msg)}</p>}
    </section>
  );
}

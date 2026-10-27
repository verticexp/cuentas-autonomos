'use client';

import { useEffect, useState } from 'react';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

// Ajustes → Avisos: activa las notificaciones push en este dispositivo.
export default function AvisosPush({ listo }) {
  const tr = useT();
  const [estado, setEstado] = useState('cargando'); // cargando | no | ios | bloqueado | off | on
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
        return setEstado(ios ? 'ios' : 'no');
      }
      if (Notification.permission === 'denied') return setEstado('bloqueado');
      const reg = await navigator.serviceWorker.getRegistration('/');
      setEstado((await reg?.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setEstado('no'));
  }, []);

  async function activar() {
    setMsg('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setEstado('bloqueado');
      const reg = await navigator.serviceWorker.register('/sw', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { clave } = await llamar('/api/push');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(clave) });
      await llamar('/api/push', { method: 'POST', body: JSON.stringify({ sub: sub.toJSON() }) });
      await llamar('/api/push', { method: 'POST', body: JSON.stringify({ prueba: true }) });
      setEstado('on');
    } catch (e) { setMsg(e.message); }
  }

  async function desactivar() {
    setMsg('');
    try {
      const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if (sub) { await llamar('/api/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setEstado('off');
    } catch (e) { setMsg(e.message); }
  }

  return (
    <section className="tarjeta formulario">
      <h3>{tr('Avisos')}</h3>
      <p className="nota">{tr('Te avisamos en este dispositivo una semana antes, el día antes y el último día de los plazos de Hacienda, y cuando una factura vence sin cobrar.')}</p>
      {!listo ? <p className="nota">{tr('Los avisos aún no están configurados en el servidor.')}</p>
        : estado === 'ios' ? <p className="nota">{tr('En iPhone, primero añade Fisquo a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.')}</p>
          : estado === 'no' ? <p className="nota">{tr('Este navegador no admite avisos.')}</p>
            : estado === 'bloqueado' ? <p className="nota">{tr('Has bloqueado los avisos de Fisquo: actívalos en los ajustes del navegador o del móvil.')}</p>
              : estado === 'on' ? <><p className="nota">{tr('Activados en este dispositivo.')}</p><button type="button" className="borrar" onClick={desactivar}>{tr('Desactivar en este dispositivo')}</button></>
                : estado === 'off' ? <button type="button" className="boton" onClick={activar}>{tr('Activar avisos en este dispositivo')}</button> : null}
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';

const ESPERA_MS = 4000;
const CADUCA_MS = 10 * 60 * 1000;

// Ajustes › WhatsApp: conectar el WhatsApp de esta persona con un código que ella envía desde su móvil.
// telefono: el ya conectado (o null). plan: mensaje si su plan no lo incluye. listo: el servidor tiene WhatsApp.
export default function ConectarWhatsApp({ telefono, plan, listo, numero }) {
  const router = useRouter();
  const [alta, setAlta] = useState(null); // { codigo, enlace, qr, numero, hasta }
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Mientras se ve el código, se pregunta de vez en cuando si ya ha llegado (solo con la pestaña visible).
  useEffect(() => {
    if (!alta) return undefined;
    const t = setInterval(async () => {
      if (document.hidden) return;
      if (Date.now() > alta.hasta) { setAlta(null); setMsg('El código ha caducado. Genera otro.'); return; }
      try {
        const r = await llamar('/api/conexion-whatsapp');
        if (r.conectado) { setAlta(null); setMsg(''); router.refresh(); }
      } catch { /* se reintenta en la siguiente vuelta */ }
    }, ESPERA_MS);
    return () => clearInterval(t);
  }, [alta, router]);

  const pedirCodigo = async () => {
    setMsg(''); setOcupado(true);
    try { setAlta({ ...(await llamar('/api/conexion-whatsapp', { method: 'POST' })), hasta: Date.now() + CADUCA_MS }); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  const desconectar = async () => {
    if (!(await confirmar({ titulo: 'Desconectar WhatsApp', texto: 'Fisquo dejará de atender los mensajes de este número. Puedes volver a conectarlo cuando quieras.', aceptar: 'Desconectar', peligro: true }))) return;
    setMsg('');
    try { await llamar('/api/conexion-whatsapp', { method: 'DELETE' }); router.refresh(); } catch (e) { setMsg(e.message); }
  };

  return (
    <section className="tarjeta formulario">
      <h3>Fisquo en WhatsApp</h3>
      <p className="nota">Pide facturas y presupuestos escribiendo o con notas de voz, como se lo dirías a una persona. Antes de emitir nada, Fisquo te enseña el resumen para que lo confirmes.</p>
      {!listo ? <p className="nota">Fisquo por WhatsApp aún no está disponible.</p>
        : plan ? <p className="nota">{plan}</p>
          : telefono ? (
            <>
              <p className="nota">✅ Conectado con <strong>{telefono}</strong>{numero ? <> · escribe a <strong>{numero}</strong></> : null}.</p>
              <button type="button" className="borrar" onClick={desconectar}>Desconectar</button>
            </>
          ) : alta ? (
            <div className="wa-codigo">
              <p className="nota">Envía este código desde tu WhatsApp{alta.numero ? <> al <strong>{alta.numero}</strong></> : null}. Caduca en 10 minutos.</p>
              <p className="wa-codigo-texto" aria-live="polite">{alta.codigo}</p>
              {alta.enlace && <a className="boton ancho" href={alta.enlace} target="_blank" rel="noopener noreferrer">Abrir WhatsApp y enviarlo</a>}
              {alta.qr && <div className="wa-qr aj-solo-ordenador"><img src={alta.qr} alt="Código QR para abrir WhatsApp con el código" width={200} height={200} /><p className="nota">¿Estás en el ordenador? Escanéalo con la cámara del móvil.</p></div>}
              <p className="nota" role="status">Esperando tu mensaje…</p>
              <button type="button" className="boton sec" onClick={() => setAlta(null)}>Cancelar</button>
            </div>
          ) : <button type="button" className="boton" disabled={ocupado} onClick={pedirCodigo}>{ocupado ? 'Generando…' : 'Conectar WhatsApp'}</button>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}

'use client';

import { useState } from 'react';
import Ir from '@/components/Ir';
import { llamar } from './Acciones';
import { PREGUNTAS, TEMAS_SOPORTE } from '@/lib/soporte';
import AyudaChat from './AyudaChat';
import { useT } from '@/components/Idioma';


// contacto: el email del equipo. Con el mensaje va la pantalla desde la que se llegó, para entender el contexto.
export default function Ayuda({ contacto, app = false }) {
  const tr = useT();
  const temas = TEMAS_SOPORTE;
  const [d, setD] = useState({ tema: temas[0], mensaje: '' });
  const [msg, setMsg] = useState('');
  const tambien = tr('También en {contacto}.', { contacto: '\u0001' }).split('\u0001');
  const enviar = async (e) => {
    e.preventDefault();
    setMsg('Enviando…');
    try {
      await llamar('/api/soporte', { method: 'POST', body: JSON.stringify({ ...d, pagina: document.referrer ? new URL(document.referrer).pathname : '' }) });
      setMsg('Enviado'); setD({ ...d, mensaje: '' });
    } catch (err) { setMsg(err.message); }
  };
  return (
    <>
      <AyudaChat />

      <section className="grupo">
        <h2 className="grupo-t">{tr('Preguntas frecuentes')}</h2>
        <div className="grupo-c ayuda-lista">
          {PREGUNTAS.map((x) => (
            <details key={x.p} className="ayuda-p">
              <summary>{tr(x.p)}</summary>
              <p>{app && x.href === '/modelos' ? tr('En Impuestos ves cada modelo (303, 130, 111, 115…) con su importe calculado y su plazo.') : tr(x.r)}</p>
              {x.href && <Ir href={x.href} className="ayuda-ir">{tr(x.ir)} ›</Ir>}
            </details>
          ))}
        </div>
      </section>

      <form className="formulario aj-form" onSubmit={enviar}>
        <h3 aria-level={2}>{tr('Escríbenos')}</h3>
        <div className="aj-grupo">
          <label>{tr('Sobre qué')}
            <select className="campo" value={d.tema} onChange={(e) => setD({ ...d, tema: e.target.value })}>{temas.map((t) => <option key={t} value={t}>{tr(app && t === 'Mi plan o mi factura de Fisquo' ? 'Mi cuenta' : t)}</option>)}</select>
          </label>
          <label>{tr('Mensaje')}<textarea className="campo" rows={5} maxLength={3000} value={d.mensaje} onChange={(e) => setD({ ...d, mensaje: e.target.value })} placeholder={tr('Cuéntanos qué necesitas o qué ha pasado')} required /></label>
        </div>
        {msg && <p role="status" className={msg === 'Enviado' ? 'nota aj-pie guardado' : msg === 'Enviando…' ? 'nota aj-pie' : 'error aj-pie'}>{msg === 'Enviado' ? tr('✓ Enviado: te respondemos a tu email, normalmente en el día.') : tr(msg)}</p>}
        <button className="boton" disabled={msg === 'Enviando…'}>{tr('Enviar')}</button>
        <p className="nota aj-pie">{tambien[0]}<a href={`mailto:${contacto}`}>{contacto}</a>{tambien[1]}</p>
      </form>

      <section className="grupo">
        <div className="grupo-c">
          <Ir href="/condiciones" className="celda ir"><span className="txt">{tr('Condiciones de uso')}</span></Ir>
          <Ir href="/privacidad" className="celda ir"><span className="txt">{tr('Privacidad')}</span></Ir>
          {/* Es de la web pública: dentro de la app de iOS lleva al resumen (lib/app.js) */}
          <a href="/seguridad" className="celda ir solo-web"><span className="txt">{tr('Seguridad de tus datos')}</span></a>
        </div>
      </section>
    </>
  );
}

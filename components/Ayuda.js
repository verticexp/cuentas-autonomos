'use client';

import { useState } from 'react';
import Ir from '@/components/Ir';
import { llamar } from './Acciones';
import { TEMAS_SOPORTE } from '@/lib/soporte';

// Preguntas frecuentes: cortas y con el camino en la app. href: dónde se hace.
const PREGUNTAS = [
  { p: '¿Cómo hago una factura?', r: 'Pulsa el «+» y elige «Nueva factura». Elige el cliente (o créalo ahí mismo), añade las líneas y emítela: el IVA y la retención salen solos según tu actividad.', href: '/facturas/nueva', ir: 'Nueva factura' },
  { p: 'Me he equivocado en una factura ya emitida', r: 'Hacienda no deja cambiar ni borrar una factura enviada: abre la factura y pulsa «Rectificar». Netto crea la rectificativa (serie R) con su número.', href: '/facturas', ir: 'Ir a Facturas' },
  { p: '¿Cómo apunto un gasto o un ticket?', r: 'En Gastos, haz una foto del ticket o sube el PDF: Netto lee el proveedor, la fecha, la base y el IVA. Revisa y guarda. Con «Varios tickets» los subes de golpe.', href: '/gastos', ir: 'Ir a Gastos' },
  { p: '¿Qué impuestos me tocan y cuándo?', r: 'En Impuestos ves cada modelo (303, 130, 111, 115…) con su importe calculado y su plazo. Los plazos también te llegan como aviso al móvil si los activas.', href: '/modelos', ir: 'Ver impuestos' },
  { p: '¿Qué es Verifactu y tengo que activarlo?', r: 'Es el sistema de Hacienda para que cada factura quede registrada y lleve un código QR. Actívalo en Ajustes › Verifactu; puedes probarlo antes en modo pruebas.', href: '/ajustes/verifactu', ir: 'Verifactu' },
  { p: '¿Cómo le paso las cuentas a mi gestoría?', r: 'En Ajustes › Tu gestoría puedes mandarle el paquete de cada trimestre (Excel, PDF y justificantes) o invitarla a Netto con su propio usuario.', href: '/ajustes/gestoria', ir: 'Tu gestoría' },
  { p: 'Vengo de otro programa o de un Excel', r: 'En Ajustes › Importar datos subes clientes, facturas, gastos y productos desde Holded o desde un Excel. Si ya llevabas numeración este año, sigue con ella en Series y numeración.', href: '/ajustes/importar', ir: 'Importar datos' },
  { p: '¿Cómo cobro con tarjeta o Bizum?', r: 'Al enviar una factura por email, Netto añade un enlace de pago si está activado. En Ajustes › Cobros pones tu Bizum y otras formas de pago para que salgan en la factura.', href: '/ajustes/cobros', ir: 'Cobros' },
  { p: '¿Quién más puede entrar en mi empresa?', r: 'En Ajustes › Usuarios y permisos invitas a quien quieras y eliges qué ve: facturar, gastos, nóminas… Cada persona entra con su email.', href: '/usuarios', ir: 'Usuarios' },
  { p: '¿Puedo llevarme mis datos?', r: 'Sí, cuando quieras: en Ajustes › Descargar todos los datos tienes un .zip con todo. Tus datos son tuyos.', href: null },
];

// contacto: el email del equipo. Con el mensaje va la pantalla desde la que se llegó, para entender el contexto.
export default function Ayuda({ contacto }) {
  const temas = TEMAS_SOPORTE;
  const [d, setD] = useState({ tema: temas[0], mensaje: '' });
  const [msg, setMsg] = useState('');
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
      <section className="grupo">
        <h2 className="grupo-t">Preguntas frecuentes</h2>
        <div className="grupo-c ayuda-lista">
          {PREGUNTAS.map((x) => (
            <details key={x.p} className="ayuda-p">
              <summary>{x.p}</summary>
              <p>{x.r}</p>
              {x.href && <Ir href={x.href} className="ayuda-ir">{x.ir} ›</Ir>}
            </details>
          ))}
        </div>
      </section>

      <form className="formulario tarjeta" onSubmit={enviar}>
        <h3>Escríbenos</h3>
        <label>Sobre qué
          <select className="campo" value={d.tema} onChange={(e) => setD({ ...d, tema: e.target.value })}>{temas.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label>Mensaje<textarea className="campo" rows={5} maxLength={3000} value={d.mensaje} onChange={(e) => setD({ ...d, mensaje: e.target.value })} placeholder="Cuéntanos qué necesitas o qué ha pasado" required /></label>
        {msg && <p role="status" className={msg === 'Enviado' ? 'nota guardado' : msg === 'Enviando…' ? 'nota' : 'error'}>{msg === 'Enviado' ? '✓ Enviado: te respondemos a tu email, normalmente en el día.' : msg}</p>}
        <button className="boton" disabled={msg === 'Enviando…'}>Enviar</button>
        <p className="nota">También en <a href={`mailto:${contacto}`}>{contacto}</a>.</p>
      </form>

      <section className="grupo">
        <div className="grupo-c">
          <a href="/condiciones" className="celda ir"><span className="txt">Condiciones de uso</span></a>
          <a href="/privacidad" className="celda ir"><span className="txt">Privacidad</span></a>
          <a href="/seguridad" className="celda ir"><span className="txt">Seguridad de tus datos</span></a>
        </div>
      </section>
    </>
  );
}

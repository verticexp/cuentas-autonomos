'use client';

import { useState } from 'react';
import Icono from '@/components/web/Icono';
import { CONTACTO, SEGMENTOS } from '@/components/web/datos';

// Sin servidor: el formulario prepara el correo y lo abre en la app de correo de quien lo envía.
export default function FormContacto({ plan }) {
  const inicial = SEGMENTOS.find((s) => plan.startsWith(s.n))?.n || '';
  const [tipo, setTipo] = useState(inicial);
  const [hecho, setHecho] = useState(false);

  const enviar = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const cuerpo = [`Nombre: ${d.nombre}`, `Email: ${d.email}`, d.empresa && `Empresa: ${d.empresa}`, `Tipo de negocio: ${tipo || '—'}`, plan && `Plan: ${plan}`, d.vengo && `Ahora uso: ${d.vengo}`, '', d.mensaje].filter((x) => x !== undefined && x !== '').join('\n');
    location.href = `mailto:${CONTACTO}?subject=${encodeURIComponent(`Acceso a Netto · ${d.nombre}`)}&body=${encodeURIComponent(cuerpo)}`;
    setHecho(true);
  };

  return (
    <form className="web-form" onSubmit={enviar}>
      {plan && <p className="web-form-plan"><Icono n="rayo" />Plan elegido: <b>{plan}</b></p>}
      <div className="web-form-dos">
        <label><span>Nombre</span><input name="nombre" required autoComplete="name" maxLength={80} /></label>
        <label><span>Email</span><input name="email" type="email" required autoComplete="email" maxLength={120} /></label>
      </div>
      <label><span>Empresa <small>(opcional)</small></span><input name="empresa" autoComplete="organization" maxLength={120} /></label>
      <fieldset>
        <legend>Tu negocio</legend>
        <div className="web-form-opciones">
          {SEGMENTOS.map((s) => (
            <label key={s.id} className={tipo === s.n ? 'on' : undefined}>
              <input type="radio" name="tipo" value={s.n} checked={tipo === s.n} onChange={() => setTipo(s.n)} />
              <Icono n={s.icono} />{s.n}
            </label>
          ))}
        </div>
      </fieldset>
      <label><span>¿Qué usas ahora? <small>(opcional)</small></span>
        <select name="vengo" defaultValue="">
          <option value="">Elige una opción</option>
          {['Holded', 'Quipu', 'Contasimple', 'Billin', 'Excel o Word', 'Mi gestoría lo lleva todo', 'Otro'].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label><span>Cuéntanos algo más <small>(opcional)</small></span><textarea name="mensaje" rows={4} maxLength={1500} placeholder="A qué te dedicas, cuántos sois, qué te gustaría resolver…" /></label>
      <button type="submit" className="web-btn web-btn-grande">Pedir acceso<Icono n="flecha" className="ico web-flecha" /></button>
      <p className="web-form-nota" aria-live="polite">{hecho ? 'Se ha abierto tu correo con el mensaje preparado. Solo tienes que enviarlo.' : 'Al enviar se abrirá tu correo con el mensaje listo.'} Consulta la <a href="/privacidad">política de privacidad</a>.</p>
    </form>
  );
}

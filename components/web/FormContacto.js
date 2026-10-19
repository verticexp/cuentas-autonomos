'use client';

import { useState } from 'react';
import Icono from '@/components/web/Icono';
import { CONTACTO, SEGMENTOS } from '@/components/web/datos';

// Envía la solicitud a /api/contacto, que la guarda y avisa por email al equipo de Netto.
export default function FormContacto({ plan = '', gestoria = false }) {
  const inicial = SEGMENTOS.find((s) => plan.startsWith(s.n))?.n || '';
  const [tipo, setTipo] = useState(inicial);
  const [estado, setEstado] = useState('listo'); // listo → enviando → hecho
  const [error, setError] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    setEstado('enviando'); setError('');
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch('/api/contacto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, tipo, plan }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se ha podido enviar.');
      setEstado('hecho');
    } catch (err) {
      setError(err.message || 'No se ha podido enviar.');
      setEstado('listo');
    }
  };

  if (estado === 'hecho') {
    return (
      <div className="web-form web-form-hecho" role="status">
        <span className="web-form-ok"><Icono n="tic" /></span>
        <h2>¡Recibido!</h2>
        <p>Te escribimos pronto para concretar lo que necesitas y los siguientes pasos.</p>
        <a href="/funciones" className="web-btn web-btn-oscuro">Mientras, mira las funciones<Icono n="flecha" className="ico web-flecha" /></a>
      </div>
    );
  }

  return (
    <form className="web-form" onSubmit={enviar}>
      {plan && <p className="web-form-plan"><Icono n="rayo" />{gestoria ? "Programa" : "Plan elegido"}: <b>{plan}</b></p>}
      <div className="web-form-dos">
        <label><span>Nombre</span><input name="nombre" required autoComplete="name" maxLength={80} /></label>
        <label><span>Email</span><input name="email" type="email" required autoComplete="email" maxLength={120} /></label>
      </div>
      {gestoria ? <label><span>Gestoría</span><input name="empresa" required autoComplete="organization" maxLength={120} /></label>
        : <label><span>Empresa <small>(opcional)</small></span><input name="empresa" autoComplete="organization" maxLength={120} /></label>}
      {!gestoria && <><fieldset>
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
          {['Holded', 'A3', 'Sage', 'Contasol', 'Quipu', 'Contasimple', 'Billin', 'Excel o Word', 'Mi gestoría lo lleva todo', 'Otro'].map((x) => <option key={x}>{x}</option>)}
        </select>
      </label></>}
      <label><span>Cuéntanos algo más <small>(opcional)</small></span><textarea name="mensaje" rows={4} maxLength={1500} placeholder={gestoria ? 'Teléfono de contacto, ciudad y cuántos clientes autónomos lleváis, más o menos…' : 'A qué te dedicas, cuántos sois, qué te gustaría resolver…'} /></label>
      {/* Trampa para bots: fuera de la vista y del teclado */}
      <input name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="web-form-trampa" />
      {error && <p className="web-form-error" role="alert">{error}</p>}
      <button type="submit" className="web-btn web-btn-grande" disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : gestoria ? 'Quiero ser partner' : 'Enviar consulta'}<Icono n="flecha" className="ico web-flecha" /></button>
      <p className="web-form-nota">Te responderemos desde {CONTACTO}. Consulta la <a href="/privacidad">política de privacidad</a>.</p>
    </form>
  );
}

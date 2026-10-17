'use client';

import { useEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import CampoPassword from '@/components/CampoPassword';
import Logo from '@/components/Logo';
import { PLANES } from '@/components/web/datos';
import { PRUEBA_DIAS, TIPOS } from '@/lib/prueba';
import { enfocar, irALaApp, useTrasArranque } from '@/lib/arranque';

const DETALLE = { aut: 'Trabajas por tu cuenta', pym: 'Sociedad con equipo pequeño', gra: 'Varias empresas o mucho equipo' };

// Crear cuenta en tres pasos: datos → tipo de negocio → plan. Se envía todo al final a /api/registro.
// Lo escrito se conserva al ir atrás y adelante (los tres pasos son el mismo formulario).
export default function FormRegistro({ inicial = { tipo: '', plan: '' } }) {
  const listo = useTrasArranque();
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [plan, setPlan] = useState(inicial.plan);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const form = useRef(null);
  const nombre = useRef(null);

  useEffect(() => { if (listo) enfocar(nombre.current); }, [listo]);

  function siguiente(e) {
    e.preventDefault();
    setError('');
    if (paso === 1) setPaso(tipo && plan ? 3 : 2); // desde Precios ya llega con tipo y plan
    else if (paso === 2) { if (!plan || !PLANES[tipo].some((p) => p.n === plan)) setPlan(PLANES[tipo].find((p) => p.fuerte)?.n || ''); setPaso(3); }
    else crear();
  }

  async function crear() {
    setEnviando(true);
    const d = new FormData(form.current);
    d.set('tipo', tipo); d.set('plan', plan);
    const r = await fetch('/api/registro', { method: 'POST', headers: { Accept: 'application/json' }, body: d }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { irALaApp(); return; }
    setEnviando(false);
    setError(j?.error || 'No se ha podido crear la cuenta. Revisa la conexión.');
    if (/email|contraseña|nombre/i.test(j?.error || '')) setPaso(1);
  }

  if (!listo) return null;
  return (
    <form ref={form} className="registro" onSubmit={siguiente} noValidate={paso !== 1}>
      <h1><Logo className="logo-login" /></h1>
      <p className="registro-paso">Paso {paso} de 3</p>

      <div hidden={paso !== 1} className="registro-bloque">
        <p className="login-titulo">Crea tu cuenta</p>
        <p className="nota">{PRUEBA_DIAS} días gratis con todo incluido. Sin tarjeta.</p>
        <BotonesSociales />
        <p className="separador"><span>o con tu email</span></p>
        <label htmlFor="nombre">Nombre</label>
        <input ref={nombre} id="nombre" name="nombre" autoComplete="name" required={paso === 1} maxLength={60} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required={paso === 1} />
        <label htmlFor="password">Contraseña</label>
        <CampoPassword id="password" autoComplete="new-password" minLength={8} required={paso === 1} />
        <p className="nota registro-ayuda">Mínimo 8 caracteres.</p>
        {/* Trampa para bots: invisible para personas. */}
        <input name="web" tabIndex={-1} autoComplete="off" className="registro-trampa" aria-hidden />
      </div>

      {paso === 2 && (
        <div className="registro-bloque">
          <p className="login-titulo">¿Qué tipo de negocio tienes?</p>
          <div className="registro-opciones" role="radiogroup">
            {Object.entries(TIPOS).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={tipo === k} className={`registro-opcion${tipo === k ? ' elegida' : ''}`} onClick={() => setTipo(k)}>
                <strong>{t}</strong><small>{DETALLE[k]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="registro-bloque">
          <p className="login-titulo">Elige tu plan</p>
          <p className="nota">{TIPOS[tipo]} · El primer mes es gratis. Podrás cambiar de plan cuando quieras.</p>
          <div className="registro-opciones" role="radiogroup">
            {PLANES[tipo].map((p) => (
              <button key={p.n} type="button" role="radio" aria-checked={plan === p.n} className={`registro-opcion registro-plan${plan === p.n ? ' elegida' : ''}`} onClick={() => setPlan(p.n)}>
                <span className="registro-plan-cab"><strong>{p.n}</strong>{p.fuerte && <em>Recomendado</em>}<b>{p.p} €<small>/mes</small></b></span>
                <small>{p.para}</small>
              </button>
            ))}
          </div>
          <p className="nota">Precios sin IVA. Puedes ver todo lo que incluye cada plan en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={enviando || (paso === 2 && !tipo) || (paso === 3 && !plan)}>
        {paso < 3 ? 'Continuar' : enviando ? 'Creando la cuenta…' : 'Empezar mes gratis'}
      </button>
      {paso > 1 && <button type="button" className="registro-atras" onClick={() => { setError(''); setPaso(paso - 1); }}>Atrás</button>}
      {paso === 1 && <p className="nota login-cambiar">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>}
    </form>
  );
}

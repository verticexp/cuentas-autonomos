'use client';

import { useState } from 'react';
import { PLANES } from '@/components/web/datos';
import { TIPOS } from '@/lib/prueba';

// Ajustes › Tu plan. Aún sin cobro: «Quiero este plan» envía la solicitud al equipo (/api/contacto), que la activa.
export default function ElegirPlan({ plan, nombre, email, empresa }) {
  const [tipo, setTipo] = useState(plan?.tipo || 'aut');
  const [estado, setEstado] = useState('');

  async function pedir(p) {
    setEstado('enviando');
    const r = await fetch('/api/contacto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, empresa, tipo: TIPOS[tipo], plan: `${TIPOS[tipo]} ${p}`, mensaje: 'Quiere pasar a este plan desde la app.' }) }).catch(() => null);
    setEstado(r?.ok ? `Hecho: te escribimos a ${email} para activar el plan ${p}.` : 'No se ha podido enviar. Escríbenos a corporate@nettohq.com.');
  }

  return (
    <section className="tarjeta formulario elegir-plan">
      <div className="segmentado" role="tablist">
        {Object.entries(TIPOS).map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tipo === k} className={tipo === k ? 'activo' : ''} onClick={() => setTipo(k)}>{t}</button>)}
      </div>
      <ul className="planes-app">
        {PLANES[tipo].map((p) => (
          <li key={p.n} className={plan?.tipo === tipo && plan?.nombre === p.n ? 'actual' : ''}>
            <div><strong>{p.n}</strong> <span>{p.p} €/mes</span><small>{p.para}</small></div>
            {plan?.tipo === tipo && plan?.nombre === p.n && <em>Tu plan</em>}
            <button type="button" className="boton" disabled={estado === 'enviando'} onClick={() => pedir(p.n)}>Quiero este plan</button>
          </li>
        ))}
      </ul>
      <p className="nota">Precios sin IVA, sin permanencia. Todo lo que incluye cada plan, en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
      {estado && estado !== 'enviando' && <p className={estado.startsWith('Hecho') ? 'nota' : 'error'}>{estado}</p>}
    </section>
  );
}

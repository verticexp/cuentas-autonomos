'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';

// Cobro con tarjeta (y Bizum, si está activado en Stripe) en la cuenta de Stripe de la empresa (lib/stripeConnect.js).
const ESTADOS = {
  activa: 'Conectada: tus clientes pueden pagar las facturas con tarjeta desde el enlace de pago y su portal. El dinero entra en tu cuenta de Stripe y Stripe te cobra su comisión.',
  revision: 'Stripe está revisando tus datos. Cuando termine, el pago con tarjeta se activa solo.',
  pendiente: 'Falta completar tus datos en Stripe (titular, cuenta bancaria, identidad) para poder cobrar.',
};

export default function StripeConnect({ estado, admin, listo, aviso }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const conectar = async () => {
    setError(''); setOcupado(true);
    try { const r = await llamar('/api/stripe/connect', { method: 'POST' }); window.location.href = r.url; }
    catch (e) { setError(e.message); setOcupado(false); }
  };
  const desconectar = async () => {
    if (!(await confirmar({ titulo: 'Desconectar Stripe', texto: 'Tus clientes dejarán de ver el pago con tarjeta. Tu cuenta de Stripe y su dinero siguen siendo tuyos.', aceptar: 'Desconectar', peligro: true }))) return;
    try { await llamar('/api/stripe/connect', { method: 'DELETE' }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return (
    <section className="grupo" aria-labelledby="stripe-t">
      <h2 className="grupo-t" id="stripe-t">Cobro con tarjeta</h2>
      <div className="grupo-c relleno formulario">
        {!listo ? <p className="nota">El cobro con tarjeta aún no está disponible en Fisquo.</p> : (
          <>
            <p className="nota">{estado ? ESTADOS[estado] : 'Conecta tu cuenta de Stripe (o crea una en el momento) para que tus clientes paguen tus facturas con tarjeta. El dinero va directo a tu cuenta; Fisquo no cobra comisión.'}</p>
            {aviso === 'error' && <p className="error" role="alert">No se ha podido comprobar tu cuenta de Stripe. Inténtalo de nuevo.</p>}
            {admin ? (
              <div className="fila-act">
                {estado !== 'activa' && <button type="button" className="boton pequeno" disabled={ocupado} onClick={conectar}>{ocupado ? 'Abriendo Stripe…' : estado ? 'Completar mis datos en Stripe' : 'Conectar con Stripe'}</button>}
                {estado === 'activa' && <a className="boton sec pequeno" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Abrir mi panel de Stripe</a>}
                {estado && <button type="button" className="boton sec pequeno" onClick={desconectar}>Desconectar</button>}
              </div>
            ) : <p className="nota">Lo conecta la administración de la empresa.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </section>
  );
}

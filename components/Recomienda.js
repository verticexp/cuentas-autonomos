'use client';

import { useState } from 'react';

// Ajustes › Recomienda Netto (lib/recomendaciones.js): el enlace de la empresa y lo que ha ganado con él.
export default function Recomienda({ enlace, resumen }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { window.prompt('Copia tu enlace:', enlace); }
  };
  const compartir = () => navigator.share?.({ title: 'Netto', text: 'Llevo las cuentas de mi negocio con Netto. Con mi enlace tienes 2 meses gratis:', url: enlace }).catch(() => {});
  return <div className="recomienda">
    <section className="tarjeta recomienda-como">
      <h2>Un mes gratis para cada uno</h2>
      <ol>
        <li>Comparte tu enlace o tu código con otro autónomo o empresa.</li>
        <li>Se registra con él y tiene <strong>2 meses de prueba</strong> en lugar de uno.</li>
        <li>Cuando hace su primer pago, <strong>tú ganas un mes gratis</strong>: te lo descontamos de la siguiente factura (o te alargamos la prueba si aún no pagas).</li>
      </ol>
      {resumen.fundador && <p className="nota">Tu empresa ya es gratis de por vida con el plan Fundador, pero a quien invites le regalas igualmente su mes extra.</p>}
    </section>
    <section className="tarjeta">
      <h2>Tu enlace</h2>
      <p className="recomienda-enlace"><code>{enlace}</code></p>
      <div className="recomienda-botones">
        <button type="button" className="boton pequeno" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
        {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="boton pequeno sec" onClick={compartir}>Compartir</button>}
      </div>
      {resumen.codigo && <p className="nota">También puede escribir tu código <strong>{resumen.codigo}</strong> en «Código promocional» al registrarse.</p>}
      <p className="nota" role="status" aria-live="polite">{copiado ? 'Enlace copiado.' : ''}</p>
    </section>
    <section className="tarjeta recomienda-cifras" aria-label="Tus recomendaciones">
      <div><strong>{resumen.registradas}</strong><span>se han registrado</span></div>
      <div><strong>{resumen.pagando}</strong><span>ya pagan</span></div>
      <div><strong>{resumen.meses}</strong><span>{resumen.meses === 1 ? 'mes ganado' : 'meses ganados'} (máx. {resumen.max})</span></div>
    </section>
  </div>;
}

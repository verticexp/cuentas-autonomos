'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Ajustes › Verifactu: activarlo en pruebas o de verdad y ver cómo van los envíos a la AEAT.
export default function Verifactu({ modo, admin, listo, faltaEmisor, netto, cuentas }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const cambiar = async (verifactu, pregunta) => {
    if (pregunta && !window.confirm(pregunta)) return;
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ verifactu }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="formulario tarjeta bloque">
      <h3>{modo === 'real' ? 'Verifactu activo' : modo === 'pruebas' ? 'Verifactu en pruebas' : 'Verifactu sin activar'}</h3>
      <p className="nota">
        <strong>{modo === 'real' ? 'Activo. ' : modo === 'pruebas' ? 'En pruebas. ' : 'Sin activar. '}</strong>
        {modo === 'real' && 'Cada factura nueva se registra en la AEAT al momento, con su huella y su QR. Se mantiene todo el año natural.'}
        {modo === 'pruebas' && 'Cada factura nueva se envía al entorno de pruebas de la AEAT: no cuenta para Hacienda y su QR es de pruebas. Úsalo solo para probar antes de activarlo de verdad.'}
        {!modo && 'Con Verifactu, cada factura se registra en la AEAT al crearla: no hay que hacer nada más. Netto la envía en tu nombre con su certificado.'}
      </p>
      {modo && <p className="nota">Registradas: {cuentas.hechas} · Pendientes de enviar: {cuentas.pendientes}{cuentas.rechazadas ? ` · Rechazadas: ${cuentas.rechazadas}` : ''}</p>}
      {!listo && <p className="nota">Netto todavía no tiene configurado su certificado para enviar a la AEAT: las facturas quedan pendientes y se enviarán solas en cuanto lo esté.</p>}
      {faltaEmisor && <p className="error">Rellena el nombre y el NIF de la empresa en Datos de facturación antes de activarlo.</p>}
      <details>
        <summary><strong>{modo === 'real' ? 'Autorización a Netto en la AEAT' : 'Antes de activarlo de verdad: autoriza a Netto en la AEAT'}</strong></summary>
        <ol className="nota">
          <li>Entra en la sede electrónica de la AEAT con tu certificado o Cl@ve y busca «Apoderamientos» → «Alta de apoderamiento».</li>
          <li>Apodera a {netto.razon || 'la entidad productora de Netto'}{netto.nif ? ` (NIF ${netto.nif})` : ''} para la remisión de los registros de facturación (VERI*FACTU).</li>
          <li>Con eso, Netto puede enviar tus facturas a la AEAT en tu nombre. Lo puedes revocar cuando quieras.</li>
        </ol>
        <p className="nota">Tu gestor puede ayudarte con el apoderamiento. Lee la <a href="/declaracion-responsable">declaración responsable</a> del programa.</p>
      </details>
      {admin && !faltaEmisor && (
        <div className="fila-act">
          {!modo && <button type="button" className="boton sec" onClick={() => cambiar('pruebas')}>Probar en el entorno de pruebas</button>}
          {modo !== 'real' && <button type="button" className="boton" onClick={() => cambiar('real', 'Desde ahora, cada factura nueva se registrará en la AEAT y Verifactu se mantendrá todo el año natural. ¿Lo activas?')}>Activar Verifactu</button>}
          {modo === 'pruebas' && <button type="button" className="boton sec" onClick={() => cambiar(null)}>Dejar de probar</button>}
        </div>
      )}
      {!admin && <p className="nota">Solo el administrador de la empresa puede activarlo.</p>}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

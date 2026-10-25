'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Ir from './Ir';
import Vacio from './Vacio';

// Ajustes › Verifactu: activarlo en pruebas o de verdad y ver cómo van los envíos a la AEAT.
export default function Verifactu({ modo, admin, listo, faltaEmisor, fisquo, cuentas }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const cambiar = async (verifactu, pregunta) => {
    if (pregunta && !(await confirmarAccion({ titulo: 'Confirmar acción', texto: pregunta, aceptar: 'Continuar' }))) return;
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
        {!modo && 'Con Verifactu, cada factura se registra en la AEAT al crearla: no hay que hacer nada más. Fisquo la envía en tu nombre con su certificado.'}
      </p>
      {modo && !cuentas.hechas && !cuentas.pendientes && !cuentas.rechazadas && !cuentas.conErrores && <Vacio compacto icono="factura" titulo="Todavía no se ha registrado ninguna factura">Cada factura nueva que emitas aparecerá aquí con su estado de envío a la AEAT.</Vacio>}
      {modo && (cuentas.hechas > 0 || cuentas.pendientes > 0 || cuentas.rechazadas > 0 || cuentas.conErrores > 0) && <p className="nota">Registradas: {cuentas.hechas} · Pendientes de enviar: {cuentas.pendientes}{cuentas.rechazadas ? ` · Rechazadas: ${cuentas.rechazadas}` : ''}{cuentas.conErrores ? ` · Aceptadas con errores: ${cuentas.conErrores}` : ''}</p>}
      {modo && cuentas.otroModo > 0 && <p className="nota">Además hay {cuentas.otroModo} {cuentas.otroModo === 1 ? 'registro' : 'registros'} del entorno de {modo === 'real' ? 'pruebas' : 'producción'}: no se mezclan con estos ni se envían aquí.</p>}
      {modo && cuentas.incidencias?.length > 0 && (
        <div className="verifactu-incidencias">
          <p className="error">Necesitan atención:</p>
          <ul className="nota">
            {cuentas.incidencias.slice(0, 20).map((i) => (
              <li key={`${i.tipo}-${i.factura}`}>
                <a href={`/facturas/${encodeURIComponent(i.factura)}`}>Factura {i.numero}</a>{' — '}
                {{ rechazada: 'rechazada por la AEAT', 'con-errores': 'aceptada con errores (hay que subsanarla)', atascada: 'lleva más de un día sin enviarse' }[i.tipo]}
                {i.codigo ? ` · código ${i.codigo}` : ''}{i.descripcion ? `: ${i.descripcion}` : ''}
              </li>
            ))}
          </ul>
          <p className="nota">Un rechazo no se arregla reenviando lo mismo: corrige el dato (por ejemplo, el NIF del cliente) y emite una rectificativa o, si la AEAT lo indica, la subsanación.</p>
        </div>
      )}
      {!listo && <p className="nota">Fisquo todavía no tiene configurado su certificado para enviar a la AEAT: las facturas quedan pendientes y se enviarán solas en cuanto lo esté.</p>}
      {faltaEmisor && <p className="error">Rellena el nombre y el NIF de la empresa en Datos de facturación antes de activarlo.</p>}
      <details>
        <summary><strong>{modo === 'real' ? 'Autorización a Fisquo en la AEAT' : 'Antes de activarlo de verdad: autoriza a Fisquo en la AEAT'}</strong></summary>
        <ol className="nota">
          <li>Entra en la sede electrónica de la AEAT con tu certificado o Cl@ve y busca «Apoderamientos» → «Alta de apoderamiento».</li>
          <li>Apodera a {fisquo.razon || 'la entidad productora de Fisquo'}{fisquo.nif ? ` (NIF ${fisquo.nif})` : ''} para la remisión de los registros de facturación (VERI*FACTU).</li>
          <li>Con eso, Fisquo puede enviar tus facturas a la AEAT en tu nombre. Lo puedes revocar cuando quieras.</li>
        </ol>
        <p className="nota">Tu gestor puede ayudarte con el apoderamiento. Lee la <Ir href="/declaracion-responsable">declaración responsable</Ir> del programa.</p>
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

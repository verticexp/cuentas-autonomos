'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Ir from './Ir';
import Vacio from './Vacio';
import { useT } from '@/components/Idioma';

// Ajustes › Verifactu: activarlo en pruebas o de verdad y ver cómo van los envíos a la AEAT.
export default function Verifactu({ modo, admin, listo, faltaEmisor, fisquo, cuentas }) {
  const tr = useT();
  const router = useRouter();
  const lee = tr('Tu gestor puede ayudarte con el apoderamiento. Lee la {x} del programa.', { x: '\u0001' }).split('\u0001');
  const [msg, setMsg] = useState('');
  const cambiar = async (verifactu, pregunta) => {
    if (pregunta && !(await confirmarAccion({ titulo: tr('Confirmar acción'), texto: pregunta, aceptar: tr('Continuar') }))) return;
    setMsg('');
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ verifactu }) }); router.refresh(); } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="formulario tarjeta bloque">
      <h3>{tr(modo === 'real' ? 'Verifactu activo' : modo === 'pruebas' ? 'Verifactu en pruebas' : 'Verifactu sin activar')}</h3>
      <p className="nota">
        <strong>{tr(modo === 'real' ? 'Activo.' : modo === 'pruebas' ? 'En pruebas.' : 'Sin activar.')}{' '}</strong>
        {modo === 'real' && tr('Cada factura nueva se registra en la AEAT al momento, con su huella y su QR. Se mantiene todo el año natural.')}
        {modo === 'pruebas' && tr('Cada factura nueva se envía al entorno de pruebas de la AEAT: no cuenta para Hacienda y su QR es de pruebas. Úsalo solo para probar antes de activarlo de verdad.')}
        {!modo && tr('Con Verifactu, cada factura se registra en la AEAT al crearla: no hay que hacer nada más. Fisquo la envía en tu nombre con su certificado.')}
      </p>
      {modo && !cuentas.hechas && !cuentas.pendientes && !cuentas.rechazadas && !cuentas.conErrores && <Vacio compacto icono="factura" titulo={tr('Todavía no se ha registrado ninguna factura')}>{tr('Cada factura nueva que emitas aparecerá aquí con su estado de envío a la AEAT.')}</Vacio>}
      {modo && (cuentas.hechas > 0 || cuentas.pendientes > 0 || cuentas.rechazadas > 0 || cuentas.conErrores > 0) && <p className="nota">{tr('Registradas: {hechas} · Pendientes de enviar: {pendientes}', { hechas: cuentas.hechas, pendientes: cuentas.pendientes })}{cuentas.rechazadas ? ` · ${tr('Rechazadas: {n}', { n: cuentas.rechazadas })}` : ''}{cuentas.conErrores ? ` · ${tr('Aceptadas con errores: {n}', { n: cuentas.conErrores })}` : ''}</p>}
      {modo && cuentas.otroModo > 0 && <p className="nota">{cuentas.otroModo === 1 ? tr('Además hay 1 registro del entorno de {entorno}: no se mezclan con estos ni se envían aquí.', { entorno: tr(modo === 'real' ? 'pruebas' : 'producción') }) : tr('Además hay {n} registros del entorno de {entorno}: no se mezclan con estos ni se envían aquí.', { n: cuentas.otroModo, entorno: tr(modo === 'real' ? 'pruebas' : 'producción') })}</p>}
      {modo && cuentas.incidencias?.length > 0 && (
        <div className="verifactu-incidencias">
          <p className="error">{tr('Necesitan atención:')}</p>
          <ul className="nota">
            {cuentas.incidencias.slice(0, 20).map((i) => (
              <li key={`${i.tipo}-${i.factura}`}>
                <a href={`/facturas/${encodeURIComponent(i.factura)}`}>{tr('Factura {numero}', { numero: i.numero })}</a>{' — '}
                {tr({ rechazada: 'rechazada por la AEAT', 'con-errores': 'aceptada con errores (hay que subsanarla)', atascada: 'lleva más de un día sin enviarse' }[i.tipo])}
                {i.codigo ? ` · ${tr('código {codigo}', { codigo: i.codigo })}` : ''}{i.descripcion ? `: ${i.descripcion}` : ''}
              </li>
            ))}
          </ul>
          <p className="nota">{tr('Un rechazo no se arregla reenviando lo mismo: corrige el dato (por ejemplo, el NIF del cliente) y emite una rectificativa o, si la AEAT lo indica, la subsanación.')}</p>
        </div>
      )}
      {!listo && <p className="nota">{tr('Fisquo todavía no tiene configurado su certificado para enviar a la AEAT: las facturas quedan pendientes y se enviarán solas en cuanto lo esté.')}</p>}
      {faltaEmisor && <p className="error">{tr('Rellena el nombre y el NIF de la empresa en Datos de facturación antes de activarlo.')}</p>}
      <details className="plegable">
        <summary><strong>{tr(modo === 'real' ? 'Autorización a Fisquo en la AEAT' : 'Antes de activarlo de verdad: autoriza a Fisquo en la AEAT')}</strong></summary>
        <ol className="nota">
          <li>{tr('Entra en la sede electrónica de la AEAT con tu certificado o Cl@ve y busca «Apoderamientos» → «Alta de apoderamiento».')}</li>
          <li>{tr('Apodera a {entidad}{nif} para la remisión de los registros de facturación (VERI*FACTU).', { entidad: fisquo.razon || tr('la entidad productora de Fisquo'), nif: fisquo.nif ? ` (NIF ${fisquo.nif})` : '' })}</li>
          <li>{tr('Con eso, Fisquo puede enviar tus facturas a la AEAT en tu nombre. Lo puedes revocar cuando quieras.')}</li>
        </ol>
        <p className="nota">{lee[0]}<Ir href="/declaracion-responsable">{tr('declaración responsable')}</Ir>{lee[1]}</p>
      </details>
      {admin && !faltaEmisor && (
        <div className="fila-act">
          {!modo && <button type="button" className="boton sec" onClick={() => cambiar('pruebas')}>{tr('Probar en el entorno de pruebas')}</button>}
          {modo !== 'real' && <button type="button" className="boton" onClick={() => cambiar('real', tr('Desde ahora, cada factura nueva se registrará en la AEAT y Verifactu se mantendrá todo el año natural. ¿Lo activas?'))}>{tr('Activar Verifactu')}</button>}
          {modo === 'pruebas' && <button type="button" className="boton sec" onClick={() => cambiar(null)}>{tr('Dejar de probar')}</button>}
        </div>
      )}
      {!admin && <p className="nota">{tr('Solo el administrador de la empresa puede activarlo.')}</p>}
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
    </div>
  );
}

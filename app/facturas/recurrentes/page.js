import { textos } from '@/lib/idiomaServidor';
import Vacio from '@/components/Vacio';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur } from '@/lib/formato';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import { AccionesRecurrente } from '@/components/Recurrente';
import { enviosPendientes } from '@/lib/recurrentes';
import { nombreMes } from '@/lib/nominas';
import '@/app/recurrentes.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Recurrentes() {
  const tr = await textos();
  const u = await requerir('facturas');
  const lista = ((await leer(u, 'recurrentes')) || []).sort((a, b) => a.dia - b.dia);
  const editar = puede(u, 'facturar');
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">{tr('Facturas')}</Volver>
      <h1 className="titulo">{tr('Facturas recurrentes')}</h1>
      {!lista.length && <Vacio icono="factura" titulo={tr('Repite una factura cada mes')} accion={{ href: '/facturas', texto: tr('Elegir factura') }}>{tr('Abre una factura y, en «Más opciones», pulsa «Repetir cada mes».')}</Vacio>}
      {lista.length > 0 && (
        <ul className="recurrentes">
          {lista.map((r) => (
            <li key={r.id} className={r.activa ? '' : 'pausa'}>
              <span className="rec-info">
                <strong>{r.plantilla.cliente.nombre}</strong>
                <small>{(r.enviar ? (r.activa ? tr('{concepto} · día {dia} de cada mes · se envía por email', { concepto: r.plantilla.concepto, dia: r.dia }) : tr('{concepto} · día {dia} de cada mes · se envía por email · en pausa', { concepto: r.plantilla.concepto, dia: r.dia })) : (r.activa ? tr('{concepto} · día {dia} de cada mes', { concepto: r.plantilla.concepto, dia: r.dia }) : tr('{concepto} · día {dia} de cada mes · en pausa', { concepto: r.plantilla.concepto, dia: r.dia })))}</small>
                {/* Lo que no salió (lib/recurrentesServidor.js): se reintenta solo cada día; aquí se ve para poder arreglarlo. */}
                {r.activa && r.fallo && <small className="rec-fallo" role="status">{tr('No se ha podido crear la de {mes}: {error}. Se vuelve a intentar cada día.', { mes: nombreMes(r.fallo.periodo), error: tr(r.fallo.error) })}</small>}
                {enviosPendientes(r).some((x) => x.error) && <small className="rec-fallo" role="status">{tr('El email de {meses} no ha salido: {error}', { meses: enviosPendientes(r).filter((x) => x.error).map((x) => tr(nombreMes(x.periodo))).reduce((meses, mes) => meses ? tr('{meses} y {mes}', { meses, mes }) : mes, ''), error: tr(enviosPendientes(r).find((x) => x.error).error) })}</small>}
              </span>
              <span className="rec-total">{eur(importes(r.plantilla).total)}</span>
              {editar && <AccionesRecurrente id={r.id} activa={r.activa} />}
            </li>
          ))}
        </ul>
      )}
      {/* Con alguna ya creada no había ninguna pista de cómo añadir otra. */}
      {lista.length > 0 && editar && <p className="grupo-pie">{(tr('Para repetir otra, abre la factura y, en «Más opciones», pulsa «Repetir cada mes».') + " ")}<Ir href="/facturas">{tr('Ir a Facturas')}</Ir></p>}
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())("Facturas recurrentes") }; }

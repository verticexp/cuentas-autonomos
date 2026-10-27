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
  const u = await requerir('facturas');
  const lista = ((await leer(u, 'recurrentes')) || []).sort((a, b) => a.dia - b.dia);
  const editar = puede(u, 'facturar');
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Facturas recurrentes</h1>
      {!lista.length && <Vacio icono="factura" titulo="Repite una factura cada mes" accion={{ href: '/facturas', texto: 'Elegir factura' }}>Abre una factura y, en «Más opciones», pulsa «Repetir cada mes».</Vacio>}
      {lista.length > 0 && (
        <ul className="recurrentes">
          {lista.map((r) => (
            <li key={r.id} className={r.activa ? '' : 'pausa'}>
              <span className="rec-info">
                <strong>{r.plantilla.cliente.nombre}</strong>
                <small>{r.plantilla.concepto} · día {r.dia} de cada mes{r.enviar ? ' · se envía por email' : ''}{r.activa ? '' : ' · en pausa'}</small>
                {/* Lo que no salió (lib/recurrentesServidor.js): se reintenta solo cada día; aquí se ve para poder arreglarlo. */}
                {r.activa && r.fallo && <small className="rec-fallo" role="status">No se ha podido crear la de {nombreMes(r.fallo.periodo)}: {r.fallo.error}. Se vuelve a intentar cada día.</small>}
                {enviosPendientes(r).some((x) => x.error) && <small className="rec-fallo" role="status">El email de {enviosPendientes(r).filter((x) => x.error).map((x) => nombreMes(x.periodo)).join(' y ')} no ha salido: {enviosPendientes(r).find((x) => x.error).error}</small>}
              </span>
              <span className="rec-total">{eur(importes(r.plantilla).total)}</span>
              {editar && <AccionesRecurrente id={r.id} activa={r.activa} />}
            </li>
          ))}
        </ul>
      )}
      {/* Con alguna ya creada no había ninguna pista de cómo añadir otra. */}
      {lista.length > 0 && editar && <p className="grupo-pie">Para repetir otra, abre la factura y, en «Más opciones», pulsa «Repetir cada mes». <Ir href="/facturas">Ir a Facturas</Ir></p>}
    </main>
  );
}

export const metadata = { title: 'Facturas recurrentes' };

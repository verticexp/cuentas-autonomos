import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur } from '@/lib/formato';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import { AccionesRecurrente } from '@/components/Recurrente';
import '@/app/recurrentes.css';

export const dynamic = 'force-dynamic';

export default async function Recurrentes() {
  const u = await requerir('facturas');
  const lista = ((await leer(u, 'recurrentes')) || []).sort((a, b) => a.dia - b.dia);
  const editar = puede(u, 'facturar');
  return (
    <main className="pagina">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Facturas recurrentes</h1>
      {!lista.length && <p className="nota">Ninguna todavía. Para repetir una factura cada mes, ábrela y pulsa «Repetir cada mes».</p>}
      {lista.length > 0 && (
        <ul className="recurrentes">
          {lista.map((r) => (
            <li key={r.id} className={r.activa ? '' : 'pausa'}>
              <span className="rec-info">
                <strong>{r.plantilla.cliente.nombre}</strong>
                <small>{r.plantilla.concepto} · día {r.dia} de cada mes{r.enviar ? ' · se envía por email' : ''}{r.activa ? '' : ' · en pausa'}</small>
              </span>
              <span className="rec-total">{eur(importes(r.plantilla).total)}</span>
              {editar && <AccionesRecurrente id={r.id} activa={r.activa} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

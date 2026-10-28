import { conHuecos } from '@/lib/huecos';
import { textos } from '@/lib/idiomaServidor';
import Vacio from '@/components/Vacio';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { ESTADOS, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { puede } from '@/lib/permisos';
import SinBD from '@/components/SinBD';
import FilaFactura from '@/components/FilaFactura';
import Volver from '@/components/Volver';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Presupuestos() {
  const tr = await textos();
  const u = await requerir('facturas');
  const todos = await leer(u, 'presupuestos');
  if (!todos) return <SinBD />;
  const h = hoy();
  const lista = todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
  const abiertos = lista.filter((p) => ['pendiente', 'aceptado'].includes(estadoDe(p, h)));
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">{tr('Facturas')}</Volver>
      <header className="cabecera">
        <h1 className="titulo">{tr('Presupuestos')}</h1>
        {puede(u, 'facturar') && <Ir href="/presupuestos/nuevo" tipo="subir" className="boton pequeno">{tr('Nuevo')}</Ir>}
      </header>
      {abiertos.length > 0 && <p className="resumen-linea"><span>{conHuecos(tr('Abiertos {importe} sin IVA'), { importe: <strong>{eur(abiertos.reduce((s, p) => s + importes(p).base, 0))}</strong> })}</span></p>}
      {lista.length > 0 && <ul className="grupo-lista">
        {lista.map((p) => {
          const [txt, clase] = ESTADOS[estadoDe(p, h)];
          return (
            <li key={p.id}>
              <FilaFactura href={`/presupuestos/${p.id}`}>
                <span className="txt">
                  <strong data-vt="cliente">{p.cliente.nombre}</strong>
                  <small>{(p.evento?.fecha ? tr('{numero} · fecha de la operación: {fecha}', { numero: numeroPresupuesto(p), fecha: tr(fechaTexto(p.evento.fecha)) }) : numeroPresupuesto(p))}</small>
                </span>
                <span className="imp-col">
                  <span className="imp" data-vt="total">{eur(importes(p).total)}</span>
                  <span className={`estado-txt ${clase}`}>{tr(txt)}</span>
                </span>
              </FilaFactura>
            </li>
          );
        })}
      </ul>}
      {!lista.length && (
        <Vacio icono="presupuesto" titulo={tr('Prepara tu primer presupuesto')} accion={puede(u, 'facturar') && { href: '/presupuestos/nuevo', texto: tr('Crear presupuesto') }}>{tr('Envíaselo al cliente con un enlace: lo acepta desde el móvil y lo conviertes en factura con un toque.')}</Vacio>
      )}
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())("Presupuestos") }; }

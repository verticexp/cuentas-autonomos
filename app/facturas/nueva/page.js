import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { numeroFactura, siguienteNumero } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormFactura from '@/components/FormFactura';
import Volver from '@/components/Volver';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { inventario } from '@/lib/inventario';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Nueva({ searchParams }) {
  const u = await requerir('facturar');
  const [facturas, todos, productos, gastos, ajustes] = await Promise.all([leer(u, 'facturas'), leer(u, 'clientes'), leer(u, 'productos'), leer(u, 'gastos'), leer(u, 'stock')]);
  if (!facturas) return <SinBD />;
  const clientes = todos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const h = hoy();
  const anio = Number(h.slice(0, 4));
  const { rectifica, duplica } = await searchParams;
  const original = facturas.find((f) => f.id === rectifica);
  const plantilla = !original && facturas.find((f) => f.id === duplica);
  const num = (serie) => numeroFactura({ numero: siguienteNumero(facturas, anio, serie), anio, serie });
  const actividades = actividadesDe(u);
  // Con inventario, cuánto queda de cada producto (para avisar al facturar más de lo que hay).
  const stock = fiscalDe(u).inventario ? Object.fromEntries(inventario({ productos: productos || [], facturas, gastos: gastos || [], ajustes: ajustes || [] }, { hoy: h }).productos.map((p) => [p.id, p.stock])) : null;
  const numeros = Object.fromEntries(actividades.map((a) => [a.id, num(original ? 'R' : a.serie)]));
  return (
    <main className="pagina mk-look">
      <Volver href={original || plantilla ? `/facturas/${(original || plantilla).id}` : '/facturas'} />
      <h1 className="titulo">{original ? 'Factura rectificativa' : plantilla ? 'Duplicar factura' : 'Nueva factura'}</h1>
      <FormFactura clientes={clientes} hoy={h} rectifica={original} plantilla={plantilla || null} numeros={numeros} actividades={actividades} productos={(productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre))} stock={stock} />
    </main>
  );
}

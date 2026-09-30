import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { numeroFactura, siguienteNumero } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormFactura from '@/components/FormFactura';
import Volver from '@/components/Volver';

export const dynamic = 'force-dynamic';

export default async function Nueva({ searchParams }) {
  const u = await requerir();
  const [facturas, todos] = await Promise.all([leer(u, 'facturas'), leer(u, 'clientes')]);
  if (!facturas) return <SinBD />;
  const clientes = todos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const h = hoy();
  const anio = Number(h.slice(0, 4));
  const { rectifica, duplica } = await searchParams;
  const original = facturas.find((f) => f.id === rectifica);
  const plantilla = !original && facturas.find((f) => f.id === duplica);
  const num = (serie) => numeroFactura({ numero: siguienteNumero(facturas, anio, serie), anio, serie });
  const numeros = original ? { dj: num('R'), vertice: num('R') } : { dj: num(''), vertice: num('V') };
  return (
    <main className="pagina">
      <Volver href={original || plantilla ? `/facturas/${(original || plantilla).id}` : '/facturas'} />
      <h1 className="titulo">{original ? 'Factura rectificativa' : plantilla ? 'Duplicar factura' : 'Nueva factura'}</h1>
      <FormFactura clientes={clientes} hoy={h} rectifica={original} plantilla={plantilla || null} numeros={numeros} />
    </main>
  );
}

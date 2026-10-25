import { requerir } from '@/lib/auth';
import { leer, leerUno, redis } from '@/lib/redis';
import { todasFichas } from '@/lib/indices';
import { numeroPrevisto } from '@/lib/facturas';
import { numeroFactura } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormFactura from '@/components/FormFactura';
import { AvisoTicketBai } from '@/components/AvisoTerritorio';
import Volver from '@/components/Volver';
import { usaIgic, actividadesDe, fiscalDe, limiteSimplificada, serieSimplificada, usa303, trimestresPresentados } from '@/lib/empresa';
import { inventario } from '@/lib/inventario';
import { datosStock } from '@/lib/stockServidor';
import { nombresProyectos } from '@/lib/proyectos';
import { riesgosPendientes } from '@/lib/tercerosServidor';
import { tieneLimite } from '@/lib/riesgo';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Nueva({ searchParams }) {
  const u = await requerir('facturar');
  if (!redis) return <SinBD />;
  // Informe de capacidad E01: la factura de origen por id, los números por el contador y los proyectos por las fichas.
  const { rectifica, duplica, cliente } = await searchParams;
  const [todos, productos, fFichas, gFichas, original0, plantilla0] = await Promise.all([leer(u, 'clientes'), leer(u, 'productos'), todasFichas(u, 'facturas'), todasFichas(u, 'gastos'), rectifica ? leerUno(u, 'facturas', String(rectifica)) : null, duplica ? leerUno(u, 'facturas', String(duplica)) : null]);
  const clientes = todos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  // Solo se calcula el riesgo si algún cliente tiene límite.
  const conLimite = clientes.filter(tieneLimite);
  const debe = conLimite.length ? await riesgosPendientes(u) : new Map();
  const riesgos = Object.fromEntries(conLimite.map((c) => [c.id, debe.get(c.id) || 0]));
  const h = hoy();
  const anio = Number(h.slice(0, 4));
  const original = original0 || undefined;
  const plantilla = !original && plantilla0;
  // Desde la ficha de un cliente («Nueva factura»), ya elegido.
  const clienteInicial = !original && !plantilla && typeof cliente === 'string' ? clientes.find((c) => c.id === cliente) || null : null;
  const num = async (serie) => numeroFactura({ numero: await numeroPrevisto(u, serie, anio), anio, serie });
  const actividades = actividadesDe(u);
  // Con inventario, cuánto queda de cada producto (para avisar al facturar más de lo que hay).
  const stock = fiscalDe(u).inventario ? Object.fromEntries(inventario(await datosStock(u), { hoy: h }).productos.map((p) => [p.id, p.stock])) : null;
  const numeros = Object.fromEntries(await Promise.all(actividades.map(async (a) => [a.id, await num(original ? 'R' : a.serie)])));
  // Sin NIF del cliente, la factura es simplificada y va en su serie (lib/empresa.js serieSimplificada).
  if (!original) numeros.simplificada = await num(serieSimplificada(actividades));
  return (
    <main className="pagina mk-look">
      <Volver href={original || plantilla ? `/facturas/${(original || plantilla).id}` : '/facturas'} />
      <h1 className="titulo">{original ? 'Factura rectificativa' : plantilla ? 'Duplicar factura' : 'Nueva factura'}</h1>
      <AvisoTicketBai fiscal={fiscalDe(u)} />
      <FormFactura presentados={trimestresPresentados(u)} clienteInicial={clienteInicial} igic={usaIgic(fiscalDe(u))} recargo={usa303(fiscalDe(u))} oss={usa303(fiscalDe(u)) && Boolean(fiscalDe(u).oss)} margenes={['rebu', 'reav'].filter((k) => fiscalDe(u)[k])} reagp={fiscalDe(u).iva === 'reagp'} limiteSimplificada={limiteSimplificada(fiscalDe(u))} clientes={clientes} hoy={h} rectifica={original} plantilla={plantilla || null} notaDefecto={u.emisor?.notaDefecto || ''} numeros={numeros} actividades={actividades} productos={(productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre))} stock={stock} riesgos={riesgos} bienes={gFichas.filter((g) => g.in && g.b > 0).sort((a, b) => b.f.localeCompare(a.f)).map((g) => ({ id: g.id, proveedor: g.c, fecha: g.f, base: g.b }))} proyectos={nombresProyectos([...fFichas, ...gFichas].map((f) => ({ proyecto: f.pr })))} />
    </main>
  );
}

export const metadata = { title: 'Nueva factura' };

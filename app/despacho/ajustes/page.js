import { headers } from 'next/headers';
import { requerirDespacho } from '@/lib/despachoPagina';
import { licenciasDe, DIAS_GRATIS, TARIFA, NOMBRES_LICENCIA } from '@/lib/licencias';
import { stripeListo } from '@/lib/stripe';
import { hoy } from '@/lib/formato';
import { WEB } from '@/lib/web';
import AjustesDespacho from '@/components/AjustesDespacho';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Despacho · Mi despacho' };

// Datos del despacho, cómo llegan los clientes, licencias y lo que hace (y no hace) Fisquo.
export default async function AjustesDelDespacho({ searchParams }) {
  const { d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  const origen = (await headers()).get('host') ? `https://${(await headers()).get('host')}` : WEB;
  const licencias = rol === 'titular' ? await licenciasDe(d, hoy()) : null;
  const tarifa = Object.fromEntries(Object.entries(TARIFA).map(([k, v]) => [k, v.map((x) => ({ hasta: x.hasta === Infinity ? null : x.hasta, cent: x.cent }))]));
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">{d.nombre}</h1>
    <AjustesDespacho
      despacho={{ nombre: d.nombre, nif: d.nif || '', email: d.email || '', codigo: d.codigo, soloAsignados: Boolean(d.soloAsignados), cobro: d.cobro || null }}
      titular={rol === 'titular'} licencias={licencias} tarifa={tarifa} nombres={NOMBRES_LICENCIA} diasGratis={DIAS_GRATIS} stripe={stripeListo()} sesion={typeof q.sesion === 'string' ? q.sesion : ''}
      enlaces={{ registro: `${origen}/registro?codigo=${encodeURIComponent(d.codigo)}`, existente: `${origen}/ajustes/gestoria?codigo=${encodeURIComponent(d.codigo)}` }} />
  </main>;
}

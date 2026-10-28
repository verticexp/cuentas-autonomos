import { headers } from 'next/headers';
import { requerirDespacho } from '@/lib/despachoPagina';
import { licenciasDe, tarifaDe, plazasLibres, enOferta, DIAS_GRATIS, NOMBRES_LICENCIA, OFERTA, AVISO_OFERTA_DIAS } from '@/lib/licencias';
import { stripeListo } from '@/lib/stripe';
import { hoy } from '@/lib/formato';
import { WEB } from '@/lib/web';
import AjustesDespacho from '@/components/AjustesDespacho';
import { usaEmpresaPropia } from '@/lib/despachos';
import { esApp } from '@/lib/app';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Ajustes · Mi despacho') }; }

// Datos del despacho, cómo llegan los clientes, licencias y lo que hace (y no hace) Fisquo.
export default async function AjustesDelDespacho({ searchParams }) {
  const tr = await textos();
  const { d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  const origen = (await headers()).get('host') ? `https://${(await headers()).get('host')}` : WEB;
  // En la app de iOS no se enseñan precios ni el cobro con tarjeta (norma 3.1.1, lib/app.js): eso, en la web.
  const app = esApp((await headers()).get('user-agent'));
  const licencias = rol === 'titular' && !app ? await licenciasDe(d, hoy()) : null;
  // Oferta de lanzamiento: la que tiene (con su fin) o, si aún no cobra, las plazas que quedan.
  const oferta = rol !== 'titular' || d.demo || app ? null : d.oferta
    ? { hasta: d.oferta.hasta, activa: enOferta(d, hoy()), acaba: enOferta(d, hoy()) && new Date(`${d.oferta.hasta}T12:00:00Z`) - Date.now() < AVISO_OFERTA_DIAS * 86400000 }
    : !d.cobro?.activo && (await plazasLibres()) > 0 ? { plazas: await plazasLibres(), anios: OFERTA.anios } : null;
  const tarifa = Object.fromEntries(Object.entries(await tarifaDe(d, hoy())).map(([k, v]) => [k, v.map((x) => ({ hasta: x.hasta === Infinity ? null : x.hasta, cent: x.cent }))]));
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">{tr('Ajustes')}</h1>
    <AjustesDespacho
      despacho={{ nombre: d.nombre, nif: d.nif || '', email: d.email || '', codigo: d.codigo, soloAsignados: Boolean(d.soloAsignados), empresaPropia: usaEmpresaPropia(d), cobro: rol === 'titular' ? d.cobro || null : null, demo: Boolean(d.demo) }}
      titular={rol === 'titular'} licencias={licencias} tarifa={tarifa} oferta={oferta} nombres={NOMBRES_LICENCIA} diasGratis={DIAS_GRATIS} stripe={stripeListo()} sesion={typeof q.sesion === 'string' ? q.sesion : ''}
      enlace={`${origen}/invitacion/gestoria/${encodeURIComponent(d.codigo)}`} />
  </main>;
}

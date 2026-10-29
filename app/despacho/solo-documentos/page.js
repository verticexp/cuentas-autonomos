import { headers } from 'next/headers';
import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, despachoDe } from '@/lib/despachos';
import { stripe } from '@/lib/stripe';
import { esApp } from '@/lib/app';
import { aplicarSuscripcionPanel, panelActivo, soloDocumentosDe } from '@/lib/panelDocumentos';
import { tramoDe } from '@/lib/tarifasDocumentos';
import { clientesDocumentos } from '@/lib/documentosServidor';
import Volver from '@/components/Volver';
import SoloDocumentosDespacho from '@/components/SoloDocumentosDespacho';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Solo documentos · Mi despacho') }; }

// Clientes «solo documentos» (lib/documentos.js): la suscripción del panel, el alta y la lista. ?panel=cs_…: vuelta del
// Checkout de Stripe (se aplica sin esperar al aviso).
export default async function SoloDocumentos({ searchParams }) {
  const tr = await textos();
  let { u, d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  if (rol === 'titular' && /^cs_[A-Za-z0-9_]{1,197}$/.test(String(q.panel || ''))) {
    const s = await stripe(`checkout/sessions/${encodeURIComponent(q.panel)}?expand[]=subscription`).catch(() => null);
    if (s && !s.error && s.metadata?.despacho === d.id && s.metadata?.tipo === 'panel' && s.subscription?.id) {
      await aplicarSuscripcionPanel(s.subscription);
      d = (await despachoDe(d.id)) || d;
    }
  }
  const [clientes, cuenta] = await Promise.all([clientesVisibles(d, u.id).then((v) => clientesDocumentos(d, v)), soloDocumentosDe(d)]);
  const panel = { activo: panelActivo(d), ...(d.panel ? { estado: d.panel.estado, finPrueba: d.panel.finPrueba || null, pruebaUsada: Boolean(d.panel.pruebaUsada) } : {}) };
  return <main className="pagina mk-look despacho">
    <Volver href="/despacho">{tr('Clientes')}</Volver>
    <h1 className="titulo">{tr('Solo documentos')}</h1>
    <p className="resumen-linea desp-linea"><span>{tr('Clientes que no llevan sus cuentas en Fisquo: te envían tickets y facturas desde el móvil, la IA los lee y tú los revisas y exportas.')}</span></p>
    <SoloDocumentosDespacho clientes={clientes} cuenta={cuenta} tramo={tramoDe(cuenta)} panel={panel} titular={rol === 'titular'} demo={Boolean(d.demo)} app={esApp((await headers()).get('user-agent'))} />
  </main>;
}

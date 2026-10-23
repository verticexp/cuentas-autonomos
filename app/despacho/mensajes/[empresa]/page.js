import { requerirCliente } from '@/lib/despachoPagina';
import { comentariosDe, leidoDe, mensajesDe } from '@/lib/comentariosDespacho';
import { leerRango } from '@/lib/indices';
import { importes, numeroFactura } from '@/lib/calculos';
import { rangoTrimestre } from '@/lib/cierres';
import { periodoDe } from '@/lib/despachoApi';
import { hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import Chat from '@/components/Chat';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mensajes · Mi despacho' };

// La conversación con un cliente. Al abrirla, lo suyo queda leído (lo marca el chat al verse, no esta página). ?doc=gasto:id abre la pregunta sobre ese documento.
export default async function Conversacion({ params, searchParams }) {
  const { empresa } = await params;
  const { e, d, ctx } = await requerirCliente(empresa);
  const q = (await searchParams) || {};
  // Para preguntar por un documento: los del último trimestre terminado y los del que está en curso.
  const dia = hoy();
  const { anio, t } = periodoDe(undefined, undefined, dia);
  const [desde] = rangoTrimestre(anio, t);
  const [hilos, leido, facturas, gastos] = await Promise.all([comentariosDe(e.id, { despacho: d.id }), leidoDe(e.id), leerRango(ctx, 'facturas', desde, dia), leerRango(ctx, 'gastos', desde, dia)]);
  const recientes = (l) => [...l].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 150);
  const docs = {
    facturas: recientes(facturas.filter((f) => !f.caja)).map((f) => ({ id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, fecha: f.fecha, total: importes(f).total })),
    gastos: recientes(gastos).map((g) => ({ id: g.id, texto: g.proveedor || g.concepto || 'Gasto', fecha: g.fecha, total: importes(g).total })),
  };
  const nombre = e.nombre || e.emisor?.nombre || 'el cliente';
  const docInicial = typeof q.doc === 'string' && /^(factura|gasto):.{1,80}$/.test(q.doc) ? q.doc : '';
  return <main className="pagina mk-look despacho desp-chat-pagina">
    <Volver href="/despacho/mensajes">Mensajes</Volver>
    <div className="desp-cabecera">
      <div className="desp-titulo"><h1 className="titulo">{nombre}</h1></div>
      <Ir className="boton sec desp-mini" href={`/despacho/${encodeURIComponent(e.id)}`}>Ver su ficha</Ir>
    </div>
    <Chat key={docInicial} mensajes={mensajesDe(hilos)} lado="despacho" leidoAntes={leido.despacho || ''} nombreOtro={nombre} docs={docs} docInicial={docInicial}
      enviar={{ url: '/api/despacho/comentarios', metodo: 'POST', extra: { empresa: e.id } }} leer={{ url: '/api/despacho/comentarios', metodo: 'PATCH', cuerpo: { empresa: e.id, leer: true } }} comprobar={`/api/despacho/comentarios?empresa=${encodeURIComponent(e.id)}`}
      vacio={`Escribe a ${nombre}: le llega a su Fisquo y te contesta aquí. Para preguntar por una factura o un gasto, elígelo antes de escribir.`} />
  </main>;
}

import { requerirCliente } from '@/lib/despachoPagina';
import { periodoDe } from '@/lib/despachoApi';
import { equipoDe, leerAccesos } from '@/lib/despachos';
import { filaCliente, resumenCliente } from '@/lib/panelDespacho';
import { cierresDe, estadoCierre, rangoTrimestre } from '@/lib/cierres';
import { comentariosDe, leidoDe, mensajesDe, noLeidos } from '@/lib/comentariosDespacho';
import { leerRango } from '@/lib/indices';
import { importes, numeroFactura } from '@/lib/calculos';
import { pagaSuPlan, NOMBRES_LICENCIA, tipoLicencia } from '@/lib/licencias';
import { hoy } from '@/lib/formato';
import { redis } from '@/lib/redis';
import { peticionesDe } from '@/lib/peticionesDespacho';
import { esCuota } from '@/lib/cuotas';
import Volver from '@/components/Volver';
import ClienteDespacho from '@/components/ClienteDespacho';
import DocumentosDespacho from '@/components/DocumentosDespacho';
import Ir from '@/components/Ir';
import { esSoloDocumentos } from '@/lib/perfilDocumentos';
import { delTrimestre, ordenar, paraGestoria, resumen as resumenDocs } from '@/lib/documentos';
import { abiertoPara, documentosDe } from '@/lib/documentosServidor';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Cliente · Mi despacho') }; }

// Ficha de un cliente en Mi despacho: su trimestre, la revisión y el cierre, las descargas, las preguntas y quién lo lleva.
export default async function ClienteDelDespacho({ params, searchParams }) {
  const tr = await textos();
  const { empresa } = await params;
  const { e, ctx, d, rol, u } = await requerirCliente(empresa);
  const q = (await searchParams) || {};
  const dia = hoy();
  const { anio, t } = periodoDe(q.anio, q.t, dia);
  // Cliente «solo documentos» (lib/documentos.js), o los documentos que envió antes de pasar a Fisquo completo.
  if (esSoloDocumentos(e) || (e.documentosAntes && q.vista === 'documentos')) {
    const todos = await documentosDe(ctx);
    const del = delTrimestre(todos, anio, t);
    const enCurso = todos.filter((x) => ['leyendo', 'cuarentena'].includes(x.estado) && !del.includes(x));
    const usuario = e.documentos?.usuario && (await redis.hget('usuarios', e.documentos.usuario));
    const [peticiones, abierto] = await Promise.all([peticionesDe(e.id, { despacho: d.id, ctx }), abiertoPara(e)]);
    return <main className="pagina mk-look despacho">
      <Volver href={esSoloDocumentos(e) ? '/despacho/solo-documentos' : `/despacho/${encodeURIComponent(e.id)}`}>{esSoloDocumentos(e) ? 'Solo documentos' : 'Atrás'}</Volver>
      <DocumentosDespacho cliente={{ id: e.id, nombre: e.nombre || e.emisor?.nombre || '', nif: e.emisor?.nif || '', soloDocumentos: esSoloDocumentos(e), contacto: usuario ? { email: usuario.email, pendiente: !usuario.pass && !usuario.social } : null }}
        anio={anio} t={t} hoy={dia} titular={rol === 'titular'} peticiones={peticiones.filter((p) => p.tipo === 'documento')}
        inicial={{ anio, t, documentos: ordenar([...del, ...enCurso]).map(paraGestoria), resumen: resumenDocs(del), abierto }} />
    </main>;
  }
  const [desde, hasta] = rangoTrimestre(anio, t);
  const [resumen, cierres, comentarios, leido, accesos, equipo, facturas, gastos, peticiones, informe] = await Promise.all([
    resumenCliente(ctx, anio, t, dia).catch(() => null), cierresDe(ctx), comentariosDe(e.id, { despacho: d.id }), leidoDe(e.id), leerAccesos(e.id, 40, { despacho: d.id }), equipoDe(d),
    leerRango(ctx, 'facturas', desde, hasta), leerRango(ctx, 'gastos', desde, hasta),
    peticionesDe(e.id, { despacho: d.id, ctx }), redis.hget(`despacho-informes:${e.id}`, `${anio}-${t}`),
  ]);
  const fila = filaCliente(e, cierres, anio, t, dia);
  const cierre = await estadoCierre(ctx, anio, t, cierres);
  const docs = {
    facturas: facturas.slice(0, 300).map((f) => ({ id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, fecha: f.fecha, base: Number(f.base) || 0, total: importes(f).total })),
    gastos: gastos.slice(0, 300).map((g) => ({ id: g.id, texto: g.proveedor || g.concepto || tr('Gasto'), fecha: g.fecha, base: Number(g.base) || 0, total: importes(g).total, sinJustificante: !g.archivo && !g.nomina && !esCuota(g) && Number(g.base) > 0 })),
    mas: Math.max(0, facturas.length - 300) + Math.max(0, gastos.length - 300),
  };
  const v = e.despachoCliente || {};
  return <main className="pagina mk-look despacho">
    <Volver href="/despacho">Mi despacho</Volver>
    {e.documentosAntes && <p className="desp-linea desp-docs-acceso"><Ir prefetch={false} href={`/despacho/${encodeURIComponent(e.id)}?vista=documentos&anio=${anio}&t=${t}`}>{tr('Documentos que envió cuando era «solo documentos» ›')}</Ir></p>}
    <ClienteDespacho
      cliente={{ id: e.id, nombre: fila.nombre, nif: fila.nif, tipo: fila.tipo, territorio: fila.territorio, plan: fila.plan, desde: v.desde || null, gestor: v.gestor || null, licencia: v.licencia || null, pagaSuPlan: pagaSuPlan(e.plan), licenciaNombre: NOMBRES_LICENCIA[tipoLicencia(e)] }}
      anio={anio} t={t} hoy={dia} rol={rol} yo={u.id} estado={cierre?.cambios ? 'cambios' : fila.estado} limite={fila.limite} presentados={fila.presentados}
      cierre={cierre ? { fecha: cierre.fecha, por: cierre.por?.nombre || '', despacho: cierre.despacho, cambios: cierre.cambios } : null}
      resumen={resumen} docs={docs} mensajes={{ ultimo: mensajesDe(comentarios).at(-1) || null, noLeidos: noLeidos(comentarios, leido, 'despacho'), preguntas: comentarios.filter((c) => c.doc && !c.resuelto).length }} accesos={accesos} equipo={equipo.map((x) => ({ id: x.id, nombre: x.nombre || x.email }))}
      peticiones={peticiones} informe={informe?.despacho === d.id ? informe : null} />
  </main>;
}

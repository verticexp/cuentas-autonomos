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
import Volver from '@/components/Volver';
import ClienteDespacho from '@/components/ClienteDespacho';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cliente · Mi despacho' };

// Ficha de un cliente en Mi despacho: su trimestre, la revisión y el cierre, las descargas, las preguntas y quién lo lleva.
export default async function ClienteDelDespacho({ params, searchParams }) {
  const { empresa } = await params;
  const { e, ctx, d, rol, u } = await requerirCliente(empresa);
  const q = (await searchParams) || {};
  const dia = hoy();
  const { anio, t } = periodoDe(q.anio, q.t, dia);
  const [desde, hasta] = rangoTrimestre(anio, t);
  const [resumen, cierres, comentarios, leido, accesos, equipo, facturas, gastos] = await Promise.all([
    resumenCliente(ctx, anio, t, dia).catch(() => null), cierresDe(ctx), comentariosDe(e.id, { despacho: d.id }), leidoDe(e.id), leerAccesos(e.id, 40, { despacho: d.id }), equipoDe(d),
    leerRango(ctx, 'facturas', desde, hasta), leerRango(ctx, 'gastos', desde, hasta),
  ]);
  const fila = filaCliente(e, cierres, anio, t, dia);
  const cierre = await estadoCierre(ctx, anio, t, cierres);
  const docs = {
    facturas: facturas.slice(0, 300).map((f) => ({ id: f.id, texto: `${numeroFactura(f)} · ${f.cliente?.nombre || ''}`, fecha: f.fecha, base: Number(f.base) || 0, total: importes(f).total })),
    gastos: gastos.slice(0, 300).map((g) => ({ id: g.id, texto: g.proveedor || g.concepto || 'Gasto', fecha: g.fecha, base: Number(g.base) || 0, total: importes(g).total, sinJustificante: !g.archivo })),
    mas: Math.max(0, facturas.length - 300) + Math.max(0, gastos.length - 300),
  };
  const v = e.despachoCliente || {};
  return <main className="pagina mk-look despacho">
    <Volver href="/despacho">Mi despacho</Volver>
    <ClienteDespacho
      cliente={{ id: e.id, nombre: fila.nombre, nif: fila.nif, tipo: fila.tipo, territorio: fila.territorio, plan: fila.plan, desde: v.desde || null, gestor: v.gestor || null, licencia: v.licencia || null, pagaSuPlan: pagaSuPlan(e.plan), licenciaNombre: NOMBRES_LICENCIA[tipoLicencia(e)] }}
      anio={anio} t={t} hoy={dia} rol={rol} yo={u.id} estado={cierre?.cambios ? 'cambios' : fila.estado} limite={fila.limite} presentados={fila.presentados}
      cierre={cierre ? { fecha: cierre.fecha, por: cierre.por?.nombre || '', despacho: cierre.despacho, cambios: cierre.cambios } : null}
      resumen={resumen} docs={docs} mensajes={{ ultimo: mensajesDe(comentarios).at(-1) || null, noLeidos: noLeidos(comentarios, leido, 'despacho'), preguntas: comentarios.filter((c) => c.doc && !c.resuelto).length }} accesos={accesos} equipo={equipo.map((x) => ({ id: x.id, nombre: x.nombre || x.email }))} />
  </main>;
}

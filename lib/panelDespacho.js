// Datos del panel «Mi despacho» (app/despacho): la fila de cada cliente (barata: solo su ficha y sus cierres) y su
// resumen del trimestre (con el mismo cálculo que su Resumen, lib/panelCache.js, que guarda el resultado por versión).
import { leer, redis } from './redis.js';
import { DE_EMPRESA } from './auth.js';
import { PERMISOS_DESPACHO } from './despachos.js';
import { VERSION_PERMISOS } from './permisos.js';
import { panelDe } from './panelCache.js';
import { cierresDe, claveTrimestre, estadoCierre, rangoTrimestre } from './cierres.js';
import { asegurar, fichasRango, leerRango } from './indices.js';
import { claves } from './fichas.js';
import { createHash } from 'node:crypto';
import { fiscalDe, hecho130, hecho303, usa130, usa303, usaIgic } from './empresa.js';
import { situacionTrimestre } from './calculos.js';
import { datosTerritorio, esForal, situacionForal } from './territorios.js';
import { resumen as resumenBandeja } from './bandeja.js';
import { comentariosDe, leidoDe, noLeidos } from './comentariosDespacho.js';
import { TIPOS } from './prueba.js';
import { esCuota } from './cuotas.js';

// La persona del despacho «dentro» de un cliente, como la vería lib/auth.js conEmpresa (perfil Gestoría), sin tocar la
// cookie de empresa: para leer sus datos desde el panel.
export function contextoCliente(u, d, e) {
  const campos = Object.fromEntries(DE_EMPRESA.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  return {
    id: u.id, nombre: u.nombre, email: u.email, despacho: u.despacho, ...campos, empresa: e.id, rol: 'miembro', permisos: PERMISOS_DESPACHO, pv: VERSION_PERMISOS,
    emisor: e.emisor || {}, empresaNombre: e.nombre, viaDespacho: { id: d.id, nombre: d.nombre }, despachoNombre: d.nombre,
  };
}

export { ESTADOS_TEXTO as ESTADOS } from '../components/despachoTextos.js';

// Modelos trimestrales que presenta y si están marcados como presentados (los que Fisquo sabe: IVA e IRPF).
export function presentados(e, anio, t) {
  const f = fiscalDe(e);
  const iva = usa303(f) && !usaIgic(f);
  const irpf = usa130(f);
  return { iva: iva ? hecho303(e.pres303, e.pagos130, anio, t) : null, irpf: irpf ? hecho130(e.pagos130, anio, t) : null };
}

// Fila del cliente sin leer sus facturas: lo que ya está en su ficha y sus cierres.
export function filaCliente(e, cierres, anio, t, hoy) {
  const f = fiscalDe(e);
  const v = e.despachoCliente || {};
  const cierre = cierres[claveTrimestre(anio, t)] || null;
  const p = presentados(e, anio, t);
  const marcados = [p.iva, p.irpf].filter((x) => x !== null);
  const sit = esForal(f) ? situacionForal(f.territorio, 'iva', t, anio, hoy) : situacionTrimestre(t, anio, hoy, usaIgic(f) ? 31 : 30);
  const estado = marcados.length && marcados.every(Boolean) ? 'presentado' : cierre ? 'revisado' : sit.estado === 'curso' ? 'curso' : 'listo';
  return {
    id: e.id, nombre: e.nombre || e.emisor?.nombre, nif: e.emisor?.nif || '', tipo: f.tipo, territorio: datosTerritorio(f).nombre,
    plan: e.plan?.tipo ? `${TIPOS[e.plan.tipo] || ''} ${e.plan.nombre || ''}`.trim() : null,
    gestor: v.gestor || null, licencia: Boolean(v.licencia), desde: v.desde || null,
    estado, cierre: cierre ? { fecha: cierre.fecha, por: cierre.por?.nombre || '' } : null, presentados: p, limite: sit.limite,
  };
}

export async function filasClientes(clientes, anio, t, hoy) {
  const cierres = await Promise.all(clientes.map((c) => redis.hgetall(`cierres:${c.id}`).then((x) => x || {})));
  return clientes.map((c, i) => filaCliente(c.empresa, cierres[i], anio, t, hoy));
}

// Resumen del trimestre de un cliente: lo que sale a pagar, lo que falta y si algo cambió tras el cierre.
// Las cifras (ventas, gastos, IVA, IRPF, justificantes, cambios tras el cierre) se guardan por versión de sus datos: el
// contador «rev» de facturas y gastos (sube con cada escritura), sus ajustes (marcas de presentado, prorrata…) y el cierre
// del trimestre. Mientras nada de eso cambie, no se recalculan, tampoco al día siguiente (antes, el panel del despacho
// recalculaba cada cliente cada día). El trimestre en curso lleva además el día: lo que se fecha hoy entra mañana.
// Lo que cambia sin tocar los datos (mensajes, bandeja) se lee siempre.
const AJUSTES_CIFRAS = ['pagos130', 'pres303', 'pres111', 'pres115', 'pres123', 'pres369', 'pagos131', 'modulos', 'prorrata', 'saldoIva', 'rend130', 'cuotaIS', 'pagos202', 'fiscal', 'actividades', 'emisor'];
const VIGENCIA_CIFRAS = 7 * 86400;
const huella = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
export async function resumenCliente(ctx, anio, t, hoy) {
  await Promise.all([asegurar(ctx, 'facturas'), asegurar(ctx, 'gastos')]);
  const [rf, rg, bandeja, comentarios, leido, cierres] = await Promise.all([
    redis.hget(claves('facturas', ctx.empresa).ixa, 'rev'), redis.hget(claves('gastos', ctx.empresa).ixa, 'rev'),
    leer(ctx, 'bandeja').catch(() => []),
    comentariosDe(ctx.empresa, { despacho: ctx.viaDespacho?.id }),
    leidoDe(ctx.empresa),
    cierresDe(ctx),
  ]);
  const [desde, hasta] = rangoTrimestre(anio, t);
  const enCurso = hoy >= desde && hoy <= hasta;
  const ajustes = Object.fromEntries(AJUSTES_CIFRAS.map((x) => [x, ctx[x] ?? null]));
  const k = `despacho-cifras:v1:${ctx.empresa}:${anio}:${t}:${rf || 0}:${rg || 0}:${huella([ajustes, cierres[claveTrimestre(anio, t)] || null, enCurso ? hoy : ''])}`;
  let cifras = await redis.get(k);
  if (!cifras) {
    const [{ P }, gastos, facturas] = await Promise.all([panelDe(ctx, { anio, hoy }), leerRango(ctx, 'gastos', desde, hasta), fichasRango(ctx, 'facturas', desde, hasta)]);
    const q = P.r?.trimestres?.[t - 1] || {};
    const cierre = await estadoCierre(ctx, anio, t, cierres);
    cifras = {
      facturas: facturas.length, gastos: gastos.length,
      ventas: facturas.reduce((s, f) => s + (Number(f.b) || 0), 0), compras: gastos.reduce((s, g) => s + (Number(g.base) || 0), 0),
      iva: P.c303 || P.igic ? { importe: Number(q.ivaIngresar) || 0, compensar: Number(q.m303) < 0 ? -Number(q.m303) : 0, devolver: Number(q.ivaDevolucion) || 0 } : null,
      irpf: P.c130 ? { importe: Number(q.m130) || 0 } : null,
      sinJustificante: gastos.filter((g) => !g.archivo && !g.nomina && !esCuota(g) && Number(g.base) > 0).length,
      cambiosTrasCierre: Boolean(cierre?.cambios),
    };
    await redis.set(k, cifras, { ex: VIGENCIA_CIFRAS });
  }
  return {
    ...cifras,
    porRevisar: resumenBandeja(bandeja || []).pendientes,
    // noLeidos: mensajes del cliente que el despacho aún no ha visto; abiertos: preguntas sobre documentos sin resolver.
    comentarios: { abiertos: comentarios.filter((c) => !c.resuelto && c.doc).length, noLeidos: noLeidos(comentarios, leido, 'despacho') },
  };
}

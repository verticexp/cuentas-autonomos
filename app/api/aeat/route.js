import { usuarioApi } from '@/lib/api';
import { actividadesDe, fiscalDe, usa130, usa303, ajustesIva, modelosDe, usaIgic } from '@/lib/empresa';
import { casillas303, liquidaciones303, opciones130, resumenAnual } from '@/lib/calculos';
import { declarante, fichero111, fichero115, fichero130, fichero303, fichero390, nombreFichero } from '@/lib/ficheroAeat';
import { fichero180, fichero190, fichero347, fichero349 } from '@/lib/ficherosInformativas';
import { modelo115, modelo180, modelo190, modelo347, modelo349, modelo390, periodos349, retencionesProfesionales } from '@/lib/modelos';
import { modelo111 } from '@/lib/nominas';
import { leer } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import { datosImpuestos } from '@/lib/datosImpuestos';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Importación de autoliquidaciones y presentación BOE de informativas. Mismos cálculos que app/modelos/page.js.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const modelo = q.get('modelo');
  const anio = q.has('anio') ? Number(q.get('anio')) : Number(hoy().slice(0, 4));
  const mes = q.has('mes') ? Number(q.get('mes')) : null;
  const t = q.has('t') ? Number(q.get('t')) : modelo === '349' && mes ? Math.ceil(mes / 3) : null;
  const anual = ['180', '190', '347', '390'].includes(modelo);
  if (!['303', '130', '111', '115', '349', '180', '190', '347', '390'].includes(modelo)
    || !Number.isInteger(anio) || anio < 2000 || anio > 9999
    || (!anual && ![1, 2, 3, 4].includes(t))
    || (mes !== null && (modelo !== '349' || !Number.isInteger(mes) || mes < 1 || mes > 12 || Math.ceil(mes / 3) !== t))) {
    return Response.json({ error: 'Modelo, ejercicio, trimestre o mes no válido' }, { status: 400 });
  }
  const f = fiscalDe(u);
  if ((modelo === '303' && (!usa303(f) || usaIgic(f))) || (modelo === '130' && !usa130(f))) return Response.json({ error: `Según tus ajustes no presentas el ${modelo}` }, { status: 400 });
  const yo = declarante(u.emisor);
  if (yo.error) return Response.json({ error: yo.error }, { status: 400 });

  const [{ facturas, gastos }, nominas, empleados] = await Promise.all([
    datosImpuestos(u, anio),
    ['111', '190'].includes(modelo) ? leer(u, 'nominas') : [],
    modelo === '190' ? leer(u, 'empleados') : [],
  ]);
  // Se muestra el modelo si los ajustes o los datos lo piden, como en Modelos. Los diseños AEAT no son los forales.
  if (!['303', '130'].includes(modelo)) {
    const hay349 = modelo === '349' ? modelo349(facturas, anio, undefined, gastos) : null;
    const ajustes = { ...f, trabajadores: f.trabajadores || nominas?.length > 0 || gastos.some((g) => Number(g.irpfPct) > 0),
      alquiler: f.alquiler || gastos.some((g) => g.alquiler),
      intracom: f.intracom || (hay349 && (hay349.total > 0 || hay349.rectificaciones.length > 0)) };
    if (!modelosDe(ajustes).some((m) => m.id === modelo)) return Response.json({ error: `Según tus ajustes y datos no presentas el ${modelo} en la AEAT` }, { status: 400 });
  }
  const h = hoy();
  const hasta = h < `${anio}-12-31` ? h : `${anio}-12-31`;
  const iva = ajustesIva(u);
  let r, periodo = anual ? undefined : t;
  try {
    if (modelo === '303') r = fichero303(yo, anio, t, casillas303(facturas, gastos, anio, t, iva), liquidaciones303(facturas, gastos, anio, undefined, iva)[t - 1]);
    else if (modelo === '130') {
      const ids = actividadesDe(u).map((a) => a.id);
      r = fichero130(yo, anio, resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !usa303(f), hasta, ...opciones130(f, u.rend130, anio), iva }).trimestres[t - 1]);
    } else if (modelo === '111') r = fichero111(yo, anio, t, modelo111(nominas || [], anio, t), retencionesProfesionales(gastos, anio, t));
    else if (modelo === '115') r = fichero115(yo, anio, t, modelo115(gastos, anio, t));
    else if (modelo === '390') {
      // Las marcas de caja no se deducen de los importes: puede haber actividad sin cobros ni pagos.
      const trimestres = [1, 2, 3, 4].map((t) => casillas303(facturas, gastos, anio, t, iva));
      const terceros = modelo347(facturas, gastos, anio, { recc: iva.recc });
      r = fichero390(yo, anio, modelo390(facturas, gastos, anio, iva), { actividades: actividadesDe(u),
        criterioCaja: trimestres.some((c) => c.criterioCaja), destinatarioCaja: trimestres.some((c) => c.destinatarioCaja),
        declara347: terceros.ventas.length + terceros.compras.length > 0 });
    }
    else {
      const contacto = { ...yo, telefono: u.emisor?.telefono, contacto: u.nombre, email: u.email };
      if (modelo === '180') r = fichero180(contacto, anio, modelo180(gastos, anio));
      else if (modelo === '190') {
        const m = modelo190(nominas || [], empleados || [], anio, gastos);
        // La página oculta las identidades y sueldos sin este permiso; un fichero BOE no permite agruparlos.
        if (!puede(u, 'nominas') && m.perceptores.some((p) => ['A', 'E'].includes(p.clave))) return Response.json({ error: 'Necesitas el permiso Empleados y nóminas para descargar el 190 con trabajadores o administradores' }, { status: 403 });
        r = fichero190(contacto, anio, m);
      } else if (modelo === '347') r = fichero347(contacto, anio, modelo347(facturas, gastos, anio, { recc: iva.recc }));
      else {
        const periodos = periodos349(facturas, anio, t, gastos);
        if (periodos[0].mensual && mes === null) return Response.json({ error: 'El 349 de este trimestre es mensual: indica mes=1..12 para elegir la declaración' }, { status: 400 });
        const m = periodos.find((p) => p.periodo === (mes === null ? `${t}T` : String(mes).padStart(2, '0')));
        if (!m) return Response.json({ error: 'Ese mes no es un periodo del 349 según tus operaciones; revisa su periodicidad en Modelos' }, { status: 400 });
        periodo = m.periodo;
        r = fichero349(contacto, anio, periodo, m);
      }
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 422 });
  }
  // La Sede espera ISO-8859-1 (la Ñ en un byte).
  const bytes = Uint8Array.from(r.contenido, (ch) => { const c = ch.charCodeAt(0); return c < 256 ? c : 32; });
  return new Response(bytes, { headers: { 'Content-Type': 'text/plain; charset=iso-8859-1', 'Content-Disposition': `attachment; filename="${nombreFichero(modelo, anio, periodo)}"` } });
}

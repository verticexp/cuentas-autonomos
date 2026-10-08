// Asistente: herramientas que dan a la IA las cifras que ya calcula la app, solo de la empresa del usuario y según sus
// permisos, y la comprobación de que la respuesta no trae cifras inventadas. Sin dependencias de servidor, para probarlo.
import { importes, numeroFactura, r2, resumenAnual, trimestre, vencida, vencimiento } from './calculos.js';
import { actividadesDe, fiscalDe, nombresActividad, usa130, usa303 } from './empresa.js';
import { modelo115, retencionesProfesionales } from './modelos.js';
import { calculoNomina, modelo111, nombreMes } from './nominas.js';
import { totalDe } from './proveedores.js';
import { prevision } from './tesoreria.js';
import { puede } from './permisos.js';

// Importes como los escribe la app (con espacio normal, para que la IA los copie tal cual).
export const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(n)} €`;
const PLAZO = { 1: '20 de abril', 2: '20 de julio', 3: '20 de octubre', 4: '30 de enero' };
const anioValido = (a, hoy) => (Number.isInteger(Number(a)) && Number(a) > 2000 && Number(a) <= Number(hoy.slice(0, 4)) ? Number(a) : Number(hoy.slice(0, 4)));
const fechaValida = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(f || '') ? f : null);
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const HERRAMIENTAS = [
  {
    name: 'impuestos', permiso: 'resumen', titulo: 'Impuestos',
    description: 'IVA (modelo 303), pago a cuenta del IRPF (130) y retenciones (111 y 115) de un trimestre: lo cobrado, lo pagado y lo que sale a pagar o a compensar, con su plazo. Por defecto, el trimestre en curso.',
    input_schema: { type: 'object', properties: { anio: { type: 'integer' }, trimestre: { type: 'integer', minimum: 1, maximum: 4 } } },
  },
  {
    name: 'resumen_anio', permiso: 'resumen', titulo: 'Resumen del año',
    description: 'Lo facturado (sin IVA), los gastos (sin IVA) y el beneficio de un año, en total y por actividad, y lo que queda por cobrar.',
    input_schema: { type: 'object', properties: { anio: { type: 'integer' } } },
  },
  {
    name: 'facturas', permiso: 'facturas', titulo: 'Facturas',
    description: 'Facturas emitidas con filtros: estado (todas, pendientes de cobro, vencidas o cobradas), cliente y fechas. Devuelve cuántas son, sus totales y las más recientes.',
    input_schema: { type: 'object', properties: { estado: { type: 'string', enum: ['todas', 'pendientes', 'vencidas', 'cobradas'] }, cliente: { type: 'string' }, desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' } } },
  },
  {
    name: 'clientes', permiso: 'facturas', titulo: 'Clientes',
    description: 'Los clientes que más han facturado en un año y lo que debe cada uno.',
    input_schema: { type: 'object', properties: { anio: { type: 'integer' } } },
  },
  {
    name: 'gastos', permiso: 'gastos', titulo: 'Gastos',
    description: 'Gastos apuntados con filtros: fechas, texto (concepto o proveedor) y solo los pendientes de pagar. Devuelve cuántos son, sus totales, los proveedores con más gasto y los más recientes.',
    input_schema: { type: 'object', properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' }, texto: { type: 'string' }, pendientes: { type: 'boolean' } } },
  },
  {
    name: 'tesoreria', permiso: 'resumen', titulo: 'Tesorería',
    description: 'Previsión de tesorería: saldo de hoy, lo que se va a cobrar, pagar y liquidar a Hacienda en los próximos meses, y el saldo final y mínimo.',
    input_schema: { type: 'object', properties: { meses: { type: 'integer', enum: [3, 6, 12] } } },
  },
  {
    name: 'nominas', permiso: 'nominas', titulo: 'Nóminas',
    description: 'Nóminas de los empleados de un año (o de un mes): bruto, neto, retenciones de IRPF, Seguridad Social y coste para la empresa, en total y por persona.',
    input_schema: { type: 'object', properties: { anio: { type: 'integer' }, mes: { type: 'integer', minimum: 1, maximum: 12 } } },
  },
];

// Solo las herramientas de lo que puede ver.
export const herramientasPara = (u) => HERRAMIENTAS.filter((h) => puede(u, h.permiso));
export const definiciones = (u) => herramientasPara(u).map(({ name, description, input_schema: s }) => ({ name, description, input_schema: s }));
// Qué datos de la empresa necesita cada herramienta (para leer solo esos).
export const DATOS_DE = {
  impuestos: ['facturas', 'gastos', 'nominas'], resumen_anio: ['facturas', 'gastos'], facturas: ['facturas'], clientes: ['facturas'],
  gastos: ['gastos'], tesoreria: ['facturas', 'gastos', 'recurrentes', 'nominas', 'saldo'], nominas: ['nominas'],
};

// Ejecuta una herramienta con los datos de la empresa (d) y devuelve las cifras ya calculadas y escritas.
export function ejecutar(u, nombre, args, d, hoy) {
  const h = HERRAMIENTAS.find((x) => x.name === nombre);
  if (!h) return { error: 'Esa herramienta no existe' };
  if (!puede(u, h.permiso)) return { error: 'No tienes permiso para ver estos datos' };
  const a = args || {};
  const fiscal = fiscalDe(u);
  const ids = actividadesDe(u).map((x) => x.id);
  const facturas = d.facturas || [], gastos = d.gastos || [];

  if (nombre === 'impuestos') {
    const anio = anioValido(a.anio, hoy);
    const t = [1, 2, 3, 4].includes(Number(a.trimestre)) ? Number(a.trimestre) : (anio === Number(hoy.slice(0, 4)) ? trimestre(hoy) : 4);
    const q = resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !usa303(fiscal) }).trimestres[t - 1];
    const out = { trimestre: `${t}T ${anio}`, plazo: `hasta el ${PLAZO[t]} de ${t === 4 ? anio + 1 : anio}`, presentado: q.presentado ? 'sí' : 'no', en_curso: anio === Number(hoy.slice(0, 4)) && t === trimestre(hoy) ? 'sí, faltan facturas y gastos por apuntar' : 'no' };
    if (usa303(fiscal)) {
      Object.assign(out, { iva_cobrado_en_facturas: euros(q.ivaRep), iva_pagado_en_gastos: euros(q.ivaDed) });
      if (q.m303 >= 0) out.iva_a_pagar_303 = euros(q.m303); else out.iva_a_compensar_303 = euros(-q.m303);
    } else out.iva = 'Esta empresa no presenta el 303';
    if (usa130(fiscal)) Object.assign(out, { irpf_a_pagar_130: euros(q.m130), rendimiento_acumulado_del_anio: euros(q.rendAcum), retenciones_que_te_han_hecho_en_el_anio: euros(q.retAcum) });
    const m111 = modelo111(d.nominas || [], anio, t).retenciones;
    if (m111) out.retenciones_de_nominas_111 = euros(m111);
    const prof = retencionesProfesionales(gastos, anio, t).retenciones;
    if (prof) out.retenciones_a_profesionales_111 = euros(prof);
    const m115 = modelo115(gastos, anio, t).retenciones;
    if (m115) out.retenciones_del_alquiler_115 = euros(m115);
    if ((m111 || m115 || prof) && t === 4) out.plazo_111_y_115 = `hasta el 20 de enero de ${anio + 1}`;
    return out;
  }

  if (nombre === 'resumen_anio') {
    const anio = anioValido(a.anio, hoy);
    const r = resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !usa303(fiscal) });
    const ing = r2(r.porActividad.reduce((s, x) => s + x.ingresos, 0)), gas = r2(r.porActividad.reduce((s, x) => s + x.gastos, 0));
    const nombres = nombresActividad(actividadesDe(u));
    return {
      anio, facturado_sin_iva: euros(ing), gastos_sin_iva: euros(gas), beneficio_antes_de_impuestos: euros(r2(ing - gas)),
      por_actividad: r.porActividad.filter((x) => x.ingresos || x.gastos).map((x) => ({ actividad: nombres[x.actividad] || x.actividad, facturado: euros(x.ingresos), gastos: euros(x.gastos), beneficio: euros(x.rendimiento) })),
      por_cobrar_de_todas_las_facturas: euros(r.pendiente),
    };
  }

  if (nombre === 'facturas') {
    const estado = ['pendientes', 'vencidas', 'cobradas'].includes(a.estado) ? a.estado : 'todas';
    const desde = fechaValida(a.desde), hasta = fechaValida(a.hasta), cliente = norm(a.cliente).trim();
    const plazo = u.emisor?.plazo;
    const l = facturas.filter((f) => (estado === 'todas' || (estado === 'cobradas' ? f.cobrada : estado === 'vencidas' ? vencida(f, plazo, hoy) : !f.cobrada && importes(f).total > 0))
      && (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta) && (!cliente || norm(f.cliente?.nombre).includes(cliente)))
      .sort((x, y) => y.fecha.localeCompare(x.fecha));
    const I = l.map(importes);
    return {
      filtro: { estado, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}), ...(a.cliente ? { cliente: a.cliente } : {}) },
      numero_de_facturas: l.length, base_sin_iva: euros(r2(I.reduce((s, x) => s + x.base, 0))), iva: euros(r2(I.reduce((s, x) => s + x.iva, 0))),
      retenciones_irpf: euros(r2(I.reduce((s, x) => s + x.irpf, 0))), total_a_cobrar: euros(r2(I.reduce((s, x) => s + x.total, 0))),
      recientes: l.slice(0, 15).map((f) => ({ numero: numeroFactura(f), fecha: f.fecha, cliente: f.cliente?.nombre, total: euros(importes(f).total), estado: f.cobrada ? 'cobrada' : vencida(f, plazo, hoy) ? `vencida desde el ${vencimiento(f, plazo)}` : 'pendiente' })),
    };
  }

  if (nombre === 'clientes') {
    const anio = anioValido(a.anio, hoy);
    const m = new Map();
    for (const f of facturas) {
      const k = f.cliente?.nombre || 'Sin nombre';
      const c = m.get(k) || { cliente: k, facturado: 0, debe: 0 };
      if (f.fecha.startsWith(`${anio}-`)) c.facturado = r2(c.facturado + f.base);
      if (!f.cobrada && importes(f).total > 0) c.debe = r2(c.debe + importes(f).total);
      m.set(k, c);
    }
    const l = [...m.values()];
    return {
      anio,
      mas_facturado_sin_iva: l.filter((c) => c.facturado).sort((x, y) => y.facturado - x.facturado).slice(0, 10).map((c) => ({ cliente: c.cliente, facturado: euros(c.facturado) })),
      te_deben_con_iva: l.filter((c) => c.debe > 0).sort((x, y) => y.debe - x.debe).slice(0, 10).map((c) => ({ cliente: c.cliente, debe: euros(c.debe) })),
    };
  }

  if (nombre === 'gastos') {
    const desde = fechaValida(a.desde), hasta = fechaValida(a.hasta), texto = norm(a.texto).trim();
    const l = gastos.filter((g) => (!desde || g.fecha >= desde) && (!hasta || g.fecha <= hasta) && (!a.pendientes || g.pendiente)
      && (!texto || norm(`${g.concepto} ${g.proveedor || ''}`).includes(texto))).sort((x, y) => y.fecha.localeCompare(x.fecha));
    const I = l.map(importes);
    const prov = new Map();
    for (const g of l) { const k = g.proveedor || g.concepto; prov.set(k, r2((prov.get(k) || 0) + totalDe(g))); }
    return {
      filtro: { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}), ...(a.texto ? { texto: a.texto } : {}), ...(a.pendientes ? { solo: 'pendientes de pagar' } : {}) },
      numero_de_gastos: l.length, base_sin_iva: euros(r2(I.reduce((s, x) => s + x.base, 0))), iva_soportado: euros(r2(I.reduce((s, x) => s + x.iva, 0))),
      total_con_iva: euros(r2(l.reduce((s, g) => s + totalDe(g), 0))),
      ...(l.some((g) => g.pendiente) ? { pendiente_de_pagar: euros(r2(l.filter((g) => g.pendiente).reduce((s, g) => s + totalDe(g), 0))) } : {}),
      mas_gasto: [...prov].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ proveedor_o_concepto: k, total_con_iva: euros(v) })),
      recientes: l.slice(0, 15).map((g) => ({ fecha: g.fecha, concepto: g.concepto, ...(g.proveedor ? { proveedor: g.proveedor } : {}), total_con_iva: euros(totalDe(g)), ...(g.pendiente ? { estado: 'sin pagar' } : {}) })),
    };
  }

  if (nombre === 'tesoreria') {
    const meses = [3, 6, 12].includes(Number(a.meses)) ? Number(a.meses) : 3;
    const p = prevision({ facturas, gastos, recurrentes: d.recurrentes || [], nominas: d.nominas || [], fiscal, pagos130: u.pagos130 || {}, plazo: u.emisor?.plazo, saldo: d.saldo, actividades: ids, hoy, meses });
    return {
      meses, saldo_de_hoy: p.conSaldo ? euros(p.inicial) : 'sin apuntar (la previsión parte de 0)', vas_a_cobrar: euros(p.entra), vas_a_pagar: euros(p.sale), hacienda: euros(p.hacienda),
      [`saldo_previsto_el_${p.hasta}`]: euros(p.final), saldo_minimo: `${euros(p.minimo.saldo)} el ${p.minimo.fecha}`,
      por_mes: p.meses.map((m) => ({ mes: m.nombre, entra: euros(m.entra), sale: euros(m.sale), hacienda: euros(m.hacienda), saldo_al_final: euros(m.saldo) })),
    };
  }

  if (nombre === 'nominas') {
    const anio = anioValido(a.anio, hoy);
    const mes = [...Array(12).keys()].map((i) => i + 1).includes(Number(a.mes)) ? `${anio}-${String(a.mes).padStart(2, '0')}` : null;
    const l = (d.nominas || []).filter((n) => (mes ? n.mes === mes : n.mes.startsWith(`${anio}-`)));
    const c = l.map((n) => ({ n, x: calculoNomina(n) }));
    const tot = (k, lista = c) => euros(r2(lista.reduce((s, y) => s + y.x[k], 0)));
    const personas = [...new Set(l.map((n) => n.empleadoNombre))];
    return {
      periodo: mes ? nombreMes(mes) : String(anio), numero_de_nominas: l.length,
      bruto: tot('bruto'), neto: tot('neto'), retenciones_irpf: tot('irpf'), seguridad_social_trabajador: tot('ssTrabajador'), seguridad_social_empresa: tot('ssEmpresa'), coste_total_empresa: tot('coste'),
      por_persona: personas.map((p) => { const s = c.filter((y) => y.n.empleadoNombre === p); return { empleado: p, nominas: s.length, bruto: tot('bruto', s), neto: tot('neto', s), coste_empresa: tot('coste', s) }; }),
    };
  }
  return { error: 'Sin datos' };
}

// ---------- Comprobar que no hay cifras inventadas ----------
// Cifras de dinero o con decimales: «1.234,56 €», «1.234 €», «350 euros», «12,5».
const CIFRA = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+,\d+|-?\d+(?=\s?(?:€|euros?\b))/g;
const valor = (s) => Math.abs(Number(s.replace(/\./g, '').replace(',', '.')));
export const cifrasDe = (texto) => (String(texto).match(CIFRA) || []).map(valor).filter((n) => Number.isFinite(n));

// Las cifras de la respuesta que no aparecen en lo que devolvieron las herramientas (los años y días no cuentan).
export function cifrasInventadas(respuesta, resultados) {
  const validas = new Set(cifrasDe(JSON.stringify(resultados)).map((n) => n.toFixed(2)));
  for (const r of resultados) for (const v of JSON.stringify(r).match(/\d+(?:\.\d+)?/g) || []) validas.add(Number(v).toFixed(2));
  return [...new Set(cifrasDe(respuesta).filter((n) => !validas.has(n.toFixed(2))).map((n) => n.toFixed(2)))];
}

// Conversación que manda el navegador: solo texto, turnos alternos y cortos.
export function limpiarHistorial(h) {
  const out = [];
  for (const m of Array.isArray(h) ? h.slice(-12) : []) {
    const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
    const content = String(m?.content ?? '').trim().slice(0, 2000);
    if (!role || !content) continue;
    if (out.length && out.at(-1).role === role) out.at(-1).content += `\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (out.length && out.at(-1).role === 'user') out.pop();
  return out;
}

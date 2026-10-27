import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { calculoNomina, GRUPOS, nombreMes, prorrateoDe } from './nominas.js';
import { COTIZACION_2026 } from './cotizacion.js';
import { r2 } from './calculos.js';
import { eur, pctCorto, fechaCorta } from './formato.js';
import { limpio } from './pdf.js';

// Los importes son siempre los guardados, nunca se recalcula una nómina histórica.
export function filasRecibo(nomina, empleado = {}, empresa = {}) {
  if (nomina.agrupada) throw new Error('El recibo debe ser individual');
  empleado ||= {};
  empresa ||= {};
  const c = calculoNomina(nomina), d = nomina.detalle;
  const fin = new Date(Date.UTC(Number(nomina.mes.slice(0, 4)), Number(nomina.mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const grupo = d?.grupo ?? empleado.cotizacion?.grupo ?? '';
  const fila = (concepto, importe, porcentaje = null) => ({ concepto, importe: importe ?? 0, porcentaje });
  const tipos = COTIZACION_2026.tipos;
  const conceptos = [
    ['contingenciasComunes', 'Contingencias comunes', tipos.contingenciasComunes],
    ['desempleo', 'Desempleo', (d?.temporal ?? nomina.temporal ?? empleado.cotizacion?.temporal) ? tipos.desempleoTemporal : tipos.desempleoIndefinido],
    ['formacion', 'Formación profesional', tipos.formacion],
    ['mei', 'Mecanismo de equidad intergeneracional (MEI)', tipos.mei],
    ['horasExtra', 'Horas extraordinarias', tipos.horasExtra],
  ];
  // La de solidaridad solo aparece cuando el sueldo pasa de la base máxima.
  const solidaridad = (parte) => (d.cuotas[parte].solidaridad ? [fila('Cotización adicional de solidaridad', d.cuotas[parte].solidaridad,
    COTIZACION_2026.tramosSolidaridad.map((t) => pctCorto(t[parte])).join(' / '))] : []);
  // Un administrador asimilado no cotiza por desempleo, FOGASA ni formación: esas filas no salen.
  const sinParo = d?.administrador === 'asimilado' ? ['desempleo', 'formacion'] : [];
  const cuotasFilas = (parte) => conceptos.filter(([k]) => !sinParo.includes(k)).flatMap(([k, texto, tipo]) => {
    if (k === 'horasExtra' && d.horasExtraFuerzaMayor) return [
      fila('Horas extraordinarias (resto)', r2((d.horasExtraResto || 0) * tipos.horasExtra[parte] / 100), tipos.horasExtra[parte]),
      fila('Horas extra de fuerza mayor', r2(d.horasExtraFuerzaMayor * tipos.horasExtraFuerzaMayor[parte] / 100), tipos.horasExtraFuerzaMayor[parte]),
    ];
    return [fila(texto, d.cuotas[parte][k], tipo[parte])];
  });
  const aportacionTrabajador = d
    ? [...cuotasFilas('trabajador'), ...solidaridad('trabajador')]
    : conceptos.slice(0, 4).map(([, texto, tipo]) => fila(texto, r2(c.bruto * tipo.trabajador / 100), tipo.trabajador));
  // Los porcentajes históricos o personalizados pueden diferir de los generales; el neto guardado no cambia.
  if (!d) {
    const ajuste = r2(c.ssTrabajador - aportacionTrabajador.reduce((s, f) => s + f.importe, 0));
    if (ajuste) aportacionTrabajador.push(fila('Ajuste a la cuota guardada', ajuste));
  }
  const aportacionEmpresa = d ? [
    ...cuotasFilas('empresa'),
    ...(sinParo.length ? [] : [fila('FOGASA', d.cuotas.empresa.fogasa, tipos.fogasa.empresa)]),
    // La tarifa de AT guardada en la nómina; en las anteriores a guardarla, la que sale de su cuota y su base.
    fila('Accidentes de trabajo y enfermedades profesionales', d.cuotas.empresa.at,
      d.atPct ?? (d.baseAT ? r2(d.cuotas.empresa.at / d.baseAT * 100) : empleado.cotizacion?.atPct ?? null)),
    ...solidaridad('empresa'),
    ...(d.cuotas.empresa.contratoCorto ? [fila('Cotización adicional por contrato de menos de 30 días', d.cuotas.empresa.contratoCorto)] : []),
  ] : [fila('Seguridad Social de la empresa', c.ssEmpresa, nomina.ssEmpresaPct)];
  const horasExtra = d?.horasExtra ?? nomina.extras?.importe ?? 0, pagaExtra = d?.pagaExtra ?? 0;
  // Con las pagas prorrateadas, su prorrata va en «Gratificaciones extraordinarias» y no en el salario base.
  const prorrateo = nomina.tipo === 'finiquito' ? 0 : prorrateoDe(nomina, empleado);
  const atraso = d?.atrasos?.importe || 0, prestacion = d?.it?.prestacion || 0, complemento = d?.it?.complemento || 0;
  const ordinario = r2(c.bruto - horasExtra - pagaExtra - atraso - prestacion - complemento);
  const salariales = nomina.finiquito ? nomina.finiquito.lineas.filter((l) => !l.concepto.startsWith('Indemnización')) : [
    fila('Salario base', r2(ordinario - prorrateo)), fila('Horas extraordinarias', horasExtra), fila('Gratificaciones extraordinarias', r2(pagaExtra + prorrateo)),
    ...(d?.it ? [fila('IT a cargo de la empresa', d.it.empresa), fila('IT en pago delegado', d.it.pagoDelegado), fila('Complemento de convenio de IT', complemento)] : []),
    ...(atraso ? [fila(`Atrasos (${d.atrasos.meses.join(', ')})`, atraso)] : []),
  ];
  return {
    cabecera: {
      empresa: { nombre: empresa.nombre || '', domicilio: [empresa.direccion, empresa.ciudad].filter(Boolean).join(', '), nif: empresa.nif || '', ccc: empresa.ccc || '' },
      trabajador: { nombre: nomina.empleadoNombre || empleado.nombre || '', nif: nomina.empleadoNif || empleado.nif || '', naf: empleado.naf || nomina.naf || '', grupo, grupoNombre: GRUPOS[grupo] || '', puesto: empleado.puesto || nomina.puesto || '', antiguedad: empleado.alta || nomina.alta || '' },
      periodo: { desde: `${nomina.mes}-01`, hasta: nomina.finiquito?.baja || fin, dias: d?.dias ?? 30, nombre: nombreMes(nomina.mes) },
    },
    devengos: salariales,
    percepcionesNoSalariales: nomina.finiquito ? nomina.finiquito.lineas.filter((l) => l.concepto.startsWith('Indemnización')) : [], totalDevengado: r2(c.bruto + (c.indemnizacionExenta || 0)),
    aportacionTrabajador,
    deducciones: [...aportacionTrabajador, fila('Retención del IRPF', c.irpf, nomina.irpfPct ?? d?.irpf?.tipo)],
    totalDeducir: r2(c.irpf + c.ssTrabajador), liquido: c.neto,
    bases: {
      remuneracionMensual: nomina.finiquito ? r2(nomina.finiquito.lineas.slice(0, 3).reduce((s, l) => s + l.importe, 0)) : d ? r2(ordinario - prorrateo) : c.bruto,
      prorrata: d ? r2((d.prorrata || 0) + prorrateo) : 0, contingenciasComunes: d?.base ?? c.bruto,
      contingenciasProfesionales: d?.baseAT ?? c.bruto, horasExtra, irpf: c.bruto,
    },
    aportacionEmpresa, totalEmpresa: c.ssEmpresa, fecha: nomina.pagado || fin,
    avisos: d?.avisos || [],
    nota: d ? '' : 'Nómina simplificada: cálculo aproximado, no sustituye al recibo oficial',
  };
}

export async function reciboNominaPdf({ nomina, empleado, empresa }) {
  const r = filasRecibo(nomina, empleado, empresa);
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${nomina.tipo === 'finiquito' ? 'Finiquito' : 'Recibo de salarios'} - ${r.cabecera.periodo.nombre}`);
  let page = doc.addPage([595.28, 841.89]), y = 800;
  const tinta = rgb(.06, .12, .11), suave = rgb(.94, .95, .94);
  const texto = (s, x, yy, font = normal, size = 8.5) => page.drawText(limpio(s), { x, y: yy, font, size, color: tinta });
  const derecha = (s, x, yy, font = normal) => texto(s, x - font.widthOfTextAtSize(limpio(s), 8.5), yy, font);
  const espacio = (h) => { if (y - h < 50) { page = doc.addPage([595.28, 841.89]); y = 800; } };
  // Ajusta las líneas de identidad y conceptos al ancho reservado, también sin espacios.
  const lineas = (s, ancho, font = normal) => {
    const out = []; let actual = '';
    for (const ch of limpio(s)) {
      if (font.widthOfTextAtSize(actual + ch, 8.5) > ancho && actual) { out.push(actual); actual = ''; }
      actual += ch;
    }
    out.push(actual); return out;
  };
  const linea = (s) => { for (const l of lineas(s, 515)) { espacio(13); texto(l, 40, y); y -= 11; } };
  const seccion = (s) => { espacio(32); y -= 5; page.drawRectangle({ x: 40, y: y - 5, width: 515, height: 18, color: suave }); texto(s, 46, y, bold); y -= 19; };
  const fila = ({ concepto, importe, porcentaje }, total = false) => {
    const ls = lineas(concepto, 320, total ? bold : normal);
    espacio(ls.length * 11 + 1);
    ls.forEach((l, i) => texto(l, 46, y - i * 11, total ? bold : normal));
    if (porcentaje !== null && porcentaje !== undefined) {
      const valor = typeof porcentaje === 'string' ? porcentaje : pctCorto(porcentaje);
      const size = typeof porcentaje === 'string' ? 6 : 8.5;
      texto(valor, 465 - normal.widthOfTextAtSize(limpio(valor), size), y, normal, size);
    }
    derecha(eur(importe), 550, y, total ? bold : normal); y -= ls.length * 11 + 1;
  };
  texto(nomina.tipo === 'finiquito' ? 'RECIBO DE FINIQUITO' : 'RECIBO INDIVIDUAL DE SALARIOS', 40, y, bold, 14); y -= 24;
  const { trabajador: t, empresa: e, periodo: p } = r.cabecera;
  linea(`Empresa: ${e.nombre} · NIF: ${e.nif || '-'} · CCC: ${e.ccc || '-'}`);
  linea(`Domicilio: ${e.domicilio || '-'}`);
  linea(`Trabajador: ${t.nombre} · NIF: ${t.nif || '-'} · Afiliación SS: ${t.naf || '-'}`);
  linea(`Grupo: ${t.grupo || '-'} ${t.grupoNombre} · Puesto: ${t.puesto || '-'}`);
  linea(`Antigüedad: ${t.antiguedad ? fechaCorta(t.antiguedad) : '-'}`);
  linea(`Periodo: ${fechaCorta(p.desde)} a ${fechaCorta(p.hasta)} · Total días: ${p.dias}`);
  if (r.nota) linea(r.nota);
  seccion('I. DEVENGOS · Percepciones salariales');
  r.devengos.forEach((f) => fila(f));
  if (r.percepcionesNoSalariales.length) { linea('Percepciones no salariales:'); r.percepcionesNoSalariales.forEach((f) => fila(f)); }
  else linea('Percepciones no salariales: ninguna');
  fila({ concepto: 'A. TOTAL DEVENGADO', importe: r.totalDevengado }, true);
  seccion('II. DEDUCCIONES · Concepto / tipo / importe');
  r.deducciones.forEach((f) => fila(f));
  fila({ concepto: 'B. TOTAL A DEDUCIR', importe: r.totalDeducir }, true);
  seccion('LÍQUIDO TOTAL A PERCIBIR (A - B)');
  fila({ concepto: 'Líquido', importe: r.liquido }, true);
  seccion('DETERMINACIÓN DE LAS BASES DE COTIZACIÓN Y DEL IRPF');
  [ ['Contingencias comunes: remuneración mensual', r.bases.remuneracionMensual], ['Prorrata de pagas extraordinarias', r.bases.prorrata], ['Total base de contingencias comunes', r.bases.contingenciasComunes], ['Base AT y EP, desempleo, formación y FOGASA', r.bases.contingenciasProfesionales], ['Base de horas extraordinarias', r.bases.horasExtra], ['Base sujeta a retención del IRPF', r.bases.irpf] ].forEach(([concepto, importe]) => fila({ concepto, importe }));
  seccion('APORTACIÓN DE LA EMPRESA · Concepto / tipo / importe');
  r.aportacionEmpresa.forEach((f) => fila(f));
  fila({ concepto: 'Total aportación de la empresa', importe: r.totalEmpresa }, true);
  if (r.avisos.length) { seccion('OBSERVACIONES PARA LA GESTORÍA'); r.avisos.forEach(linea); }
  espacio(65); y -= 12;
  texto(`Fecha: ${fechaCorta(r.fecha)}`, 40, y); y -= 33;
  texto('Firma y sello de la empresa', 40, y); texto('Recibí', 410, y);
  return doc.save();
}

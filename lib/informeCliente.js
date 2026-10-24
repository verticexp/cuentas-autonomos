// Informe del trimestre para el cliente (lo envía su gestoría desde Mi despacho y lo abre en su chat): lo facturado y
// gastado, lo que paga de IVA e IRPF y cómo va el año. Los cálculos del servidor se cargan solo al pedir datos.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { limpio, COLOR_FACTURA } from './pdf.js';
import { eur, fechaCorta, hoy as hoyActual } from './formato.js';

export async function datosInforme(ctx, anio, t, hoy) {
  const [{ resumenCliente }, { panelDe }] = await Promise.all([import('./panelDespacho.js'), import('./panelCache.js')]);
  const [resumen, { P }] = await Promise.all([resumenCliente(ctx, anio, t, hoy), panelDe(ctx, { anio, hoy })]);
  // Ventas y gastos de cada trimestre, del panel del año (lib/calculos.js resumenAnual: «ingresos» y «gastos», con la
  // amortización); sin él, los del resumen del trimestre pedido.
  const trimestres = Array.from({ length: t }, (_, i) => {
    const q = P.r?.trimestres?.[i];
    if (Number.isFinite(q?.ingresos) && Number.isFinite(q?.gastos)) return { t: i + 1, ventas: q.ingresos, gastos: q.gastos };
    return { t: i + 1, ventas: i + 1 === t ? resumen.ventas : 0, gastos: i + 1 === t ? resumen.compras : 0 };
  });
  const actual = trimestres[t - 1];
  const ventas = trimestres.reduce((s, q) => s + q.ventas, 0);
  const gastos = trimestres.reduce((s, q) => s + q.gastos, 0);
  // «anio» identifica el ejercicio; «acumulado» evita repetir esa clave en el objeto.
  return {
    empresa: ctx.emisor?.nombre || ctx.empresaNombre || ctx.nombre || '', nif: ctx.emisor?.nif || '', anio, t, fecha: hoy,
    trimestre: { ventas: actual.ventas, gastos: actual.gastos, beneficio: actual.ventas - actual.gastos, facturas: resumen.facturas, nGastos: resumen.gastos, iva: resumen.iva, irpf: resumen.irpf },
    acumulado: { ventas, gastos, beneficio: ventas - gastos }, trimestres, sinJustificante: resumen.sinJustificante,
  };
}

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export async function informePdf(datos, { despacho = '', color = COLOR_FACTURA } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(limpio(`Informe del ${datos.t}T ${datos.anio} · ${datos.empresa}`));
  doc.setCreator(''); doc.setProducer('');
  const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40, ancho = W - 2 * M;
  const p = doc.addPage([W, H]);
  const ACENTO = hex(/^#[0-9a-f]{6}$/i.test(color) ? color : COLOR_FACTURA);
  const TINTA = hex('#17201D'), GRIS = hex('#6B736F'), FONDO = hex('#EEF3F1'), GASTOS = hex('#A7B5AF');
  const txt = (s, x, y, { font = R, size = 10, color = TINTA, max = ancho } = {}) => {
    let texto = limpio(s);
    while (texto && font.widthOfTextAtSize(texto, size) > max) texto = texto.slice(0, -1);
    p.drawText(texto, { x, y, font, size, color });
  };
  const parrafo = (s, y, size = 10, color = TINTA) => {
    let linea = '';
    for (const palabra of limpio(s).split(/\s+/)) {
      if (R.widthOfTextAtSize(`${linea} ${palabra}`.trim(), size) > ancho && linea) { txt(linea, M, y, { size, color }); y -= size + 5; linea = ''; }
      linea = `${linea} ${palabra}`.trim();
    }
    if (linea) txt(linea, M, y, { size, color });
    return y - size - 5;
  };
  p.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: ACENTO });
  txt(`Informe del ${datos.t}T ${datos.anio}`, M, H - 43, { font: B, size: 23, color: rgb(1, 1, 1) });
  txt(datos.empresa, M, H - 68, { size: 13, color: rgb(1, 1, 1) });
  txt(`NIF ${datos.nif || '-'} · ${fechaCorta(datos.fecha || hoyActual())}`, M, H - 89, { size: 9, color: rgb(1, 1, 1) });
  txt(`Preparado por ${despacho || 'tu gestoría'}`, M, 707, { size: 10, color: GRIS });
  const q = datos.trimestre;
  const impuestos = Math.max(0, q.iva?.importe || 0) + Math.max(0, q.irpf?.importe || 0);
  const cifras = [['Facturado', q.ventas], ['Gastos', q.gastos], ['Beneficio', q.beneficio], ['Impuestos del trimestre', impuestos]];
  cifras.forEach(([titulo, importe], i) => {
    const x = M + (i % 2) * (ancho / 2 + 6), y = 613 - Math.floor(i / 2) * 76, w = ancho / 2 - 6;
    p.drawRectangle({ x, y, width: w, height: 65, color: FONDO });
    txt(titulo, x + 12, y + 44, { size: 9, color: GRIS, max: w - 24 });
    const valor = limpio(eur(importe));
    const size = Math.min(23, (w - 24) / B.widthOfTextAtSize(valor, 1));
    txt(valor, x + 12, y + 16, { font: B, size, max: w - 24 });
  });
  txt('Importes sin IVA. Impuestos: IVA e IRPF a ingresar.', M, 520, { size: 8, color: GRIS });
  txt('Impuestos del trimestre', M, 489, { font: B, size: 14, color: ACENTO });
  const iva = !q.iva ? 'No presentas IVA trimestral.' : q.iva.devolver > 0 ? `Te devuelven ${eur(q.iva.devolver)} de IVA.` : q.iva.compensar > 0 ? `Compensas ${eur(q.iva.compensar)} de IVA en el siguiente trimestre.` : q.iva.importe > 0 ? `Pagas ${eur(q.iva.importe)} de IVA.` : 'No tienes IVA a ingresar este trimestre.';
  let y = parrafo(iva, 465);
  parrafo(!q.irpf ? 'No presentas IRPF trimestral.' : q.irpf.importe > 0 ? `Pagas ${eur(q.irpf.importe)} de IRPF.` : 'No tienes IRPF a ingresar este trimestre.', y - 3);
  txt('Cómo va el año', M, 395, { font: B, size: 14, color: ACENTO });
  const a = datos.acumulado;
  [['Facturado', a.ventas], ['Gastos', a.gastos], ['Beneficio', a.beneficio]].forEach(([titulo, importe], i) => {
    const x = M + i * ancho / 3;
    txt(titulo, x, 371, { size: 9, color: GRIS });
    txt(eur(importe), x, 349, { font: B, size: 15, max: ancho / 3 - 8 });
  });
  const series = datos.trimestres.slice(0, datos.t);
  const maximo = Math.max(1, ...series.flatMap((q) => [Math.abs(q.ventas), Math.abs(q.gastos)]));
  const base = 238, escala = 72 / maximo, paso = ancho / Math.max(1, series.length);
  p.drawLine({ start: { x: M, y: base }, end: { x: W - M, y: base }, color: GASTOS, thickness: 0.5 });
  series.forEach((q, i) => {
    const x = M + paso * (i + 0.5);
    [[q.ventas, ACENTO, -23], [q.gastos, GASTOS, 3]].forEach(([v, color, dx]) => p.drawRectangle({ x: x + dx, y: v < 0 ? base + v * escala : base, width: 20, height: Math.abs(v) * escala, color }));
    txt(`${q.t}T`, x - 6, 149, { size: 9, color: GRIS });
  });
  [[ACENTO, 'Facturado', M], [GASTOS, 'Gastos', M + 110]].forEach(([color, titulo, x]) => {
    p.drawRectangle({ x, y: 127, width: 9, height: 9, color }); txt(titulo, x + 15, 127, { size: 9, color: GRIS });
  });
  if (datos.sinJustificante > 0) parrafo(`Faltan ${datos.sinJustificante} justificantes de gastos: súbelos en Fisquo`, 100, 10, ACENTO);
  parrafo('Generado con Fisquo. Cifras orientativas calculadas con lo apuntado en Fisquo; la gestoría las ha revisado al cerrar el trimestre.', 48, 8, GRIS);
  return doc.save();
}

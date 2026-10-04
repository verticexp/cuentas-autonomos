// PDF del paquete trimestral para la gestoría: resumen, modelos y listados de facturas y gastos.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { limpio, COLOR_FACTURA } from './pdf.js';
import { eur, fechaCorta } from './formato.js';

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = hex('#17201D'), GRIS = hex('#6B736F'), RAYA = hex('#DDE2DF');

export async function paquetePdf(d) {
  const doc = await PDFDocument.create();
  doc.setTitle(limpio(`Paquete ${d.t}T ${d.anio} ${d.empresa}`));
  doc.setCreator(''); doc.setProducer('');
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ACENTO = hex(COLOR_FACTURA);
  let p, y;
  const nueva = () => { p = doc.addPage([W, H]); y = H - M; };
  const ancho = (s, f = R, z = 8.5) => f.widthOfTextAtSize(limpio(s), z);
  const corta = (s, max, f = R, z = 8.5) => { const l = limpio(s); let t = l; while (t && ancho(`${t}...`, f, z) > max && ancho(t, f, z) > max) t = t.slice(0, -1); return t === l ? t : `${t.trimEnd()}...`; };
  const txt = (s, x, yy, { font = R, size = 8.5, color = TINTA } = {}) => p.drawText(limpio(s), { x, y: yy, font, size, color });
  const sitio = (h) => { if (y - h < M) nueva(); };

  // Tabla: columnas [{ t, w, der }]; filas de textos; última fila en negrita si total.
  const tabla = (cols, filas, { total } = {}) => {
    const fila = (vals, font, fondo) => {
      sitio(16);
      if (fondo) p.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: hex('#EEF3F1') });
      let x = M + 4;
      cols.forEach((c, i) => {
        const v = corta(vals[i] ?? '', c.w - 6, font);
        txt(v, c.der ? x + c.w - 6 - ancho(v, font) : x, y, { font });
        x += c.w;
      });
      y -= 15;
    };
    fila(cols.map((c) => c.t), B, true);
    filas.forEach((f, i) => { fila(f, total && i === filas.length - 1 ? B : R); p.drawLine({ start: { x: M, y: y + 11 }, end: { x: W - M, y: y + 11 }, thickness: 0.4, color: RAYA }); });
    y -= 8;
  };
  const titulo = (s) => { sitio(40); y -= 6; txt(s, M, y, { font: B, size: 12, color: ACENTO }); y -= 18; };

  nueva();
  p.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: ACENTO });
  txt(`Paquete para la gestoría · ${d.t}T ${d.anio}`, M, H - 46, { font: B, size: 18, color: rgb(1, 1, 1) });
  txt(`${d.empresa}${d.nif ? ` · NIF ${d.nif}` : ''} · ${d.fiscal.tipo === 'sociedad' ? 'Sociedad' : 'Autónomo'}`, M, H - 68, { size: 10, color: rgb(1, 1, 1) });
  y = H - 122;

  const T = d.totales;
  titulo('Resumen');
  tabla([{ t: '', w: 200 }, { t: 'Base', w: 100, der: true }, { t: 'IVA', w: 100, der: true }, { t: 'Total', w: 115, der: true }], [
    [`Facturas emitidas (${T.facturas.n})`, eur(T.facturas.base), eur(T.facturas.iva), eur(T.facturas.total)],
    [`Gastos (${T.gastos.n})`, eur(T.gastos.base), eur(T.gastos.iva), eur(T.gastos.total)],
    ['Rendimiento del trimestre', eur(T.rendimiento), '', ''],
  ]);
  if (T.facturas.irpf) { txt(`Retenciones de IRPF que te han practicado: ${eur(T.facturas.irpf)}`, M, y, { color: GRIS }); y -= 16; }

  for (const m of d.modelos) {
    titulo(`Modelo ${m.id} · ${m.nombre}`);
    tabla([{ t: 'Casilla', w: 60 }, { t: 'Concepto', w: 330 }, { t: 'Importe', w: 125, der: true }],
      m.casillas.map(([c, t, v]) => [c, t, ['111', '115'].includes(m.id) && c === '01' ? String(v) : eur(v)]), { total: true });
  }

  titulo('Facturas emitidas');
  if (d.facturas.length) tabla([{ t: 'Número', w: 58 }, { t: 'Fecha', w: 56 }, { t: 'Cliente', w: 125 }, { t: 'NIF', w: 62 }, { t: 'Base', w: 62, der: true }, { t: 'IVA', w: 52, der: true }, { t: 'IRPF', w: 48, der: true }, { t: 'Total', w: 52, der: true }],
    [...d.facturas.map((f) => [f.numero, fechaCorta(f.fecha), f.cliente, f.nif, eur(f.base), eur(f.iva), eur(f.irpf), eur(f.total)]),
      ['Total', '', '', '', eur(T.facturas.base), eur(T.facturas.iva), eur(T.facturas.irpf), eur(T.facturas.total)]], { total: true });
  else { txt('Sin facturas este trimestre.', M, y, { color: GRIS }); y -= 16; }

  titulo('Gastos');
  if (d.gastos.length) tabla([{ t: 'Fecha', w: 56 }, { t: 'Proveedor', w: 110 }, { t: 'Concepto', w: 140 }, { t: 'Base', w: 70, der: true }, { t: 'IVA', w: 64, der: true }, { t: 'Total', w: 75, der: true }],
    [...d.gastos.map((g) => [fechaCorta(g.fecha), g.proveedor, g.concepto, eur(g.base), eur(g.iva), eur(g.total)]),
      ['Total', '', '', eur(T.gastos.base), eur(T.gastos.iva), eur(T.gastos.total)]], { total: true });
  else { txt('Sin gastos este trimestre.', M, y, { color: GRIS }); y -= 16; }

  const paginas = doc.getPages();
  paginas.forEach((pg, i) => pg.drawText(limpio(`Orientativo, calculado con Netto · ${i + 1}/${paginas.length}`), { x: M, y: 22, font: R, size: 7.5, color: GRIS }));
  return Buffer.from(await doc.save());
}

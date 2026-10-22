// Factura que llega en el cuerpo de un correo, sin adjunto (Uber, Cabify, tiendas online): su texto en un PDF sencillo,
// que es el justificante del gasto y lo que lee la IA. Como mucho 10 páginas (el tope de la lectura IA).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { limpio } from './pdf.js';

export async function correoPdf({ de, deNombre, asunto, fecha, texto }) {
  const doc = await PDFDocument.create();
  doc.setTitle(limpio(asunto || 'Correo recibido'));
  doc.setProducer(limpio('Fisquo'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, margen = 48, ancho = W - margen * 2;
  const gris = rgb(.4, .4, .4);
  const pagina = () => doc.addPage([W, H]);
  let p = pagina(), y = H - margen;
  const escribir = (s, size, f = font, color = rgb(0, 0, 0)) => p.drawText(limpio(s), { x: margen, y, size, font: f, color });
  // Las cabeceras largas se ajustan para conservar una línea por dato.
  const cabecera = (s) => {
    s = limpio(s);
    escribir(s, Math.min(9, ancho / Math.max(1, font.widthOfTextAtSize(s, 1))), font, gris);
    y -= 14;
  };
  escribir('Correo recibido en Fisquo', 14, negrita);
  y -= 23;
  cabecera(`De: ${deNombre ? `${deNombre} ` : ''}${de || ''}`);
  cabecera(`Asunto: ${asunto || ''}`);
  if (fecha) cabecera(`Recibido: ${fecha}`);
  y -= 2;
  p.drawLine({ start: { x: margen, y }, end: { x: W - margen, y }, thickness: .5, color: gris });
  y -= 22;

  // Se divide antes de limpiar para conservar los saltos que WinAnsi no admite.
  function* lineas() {
    for (const parrafo of String(texto || '(El correo no tiene texto)').split(/\r\n|\r|\n/)) {
      let actual = '';
      for (const palabra of limpio(parrafo).split(/\s+/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (font.widthOfTextAtSize(prueba, 10) <= ancho) { actual = prueba; continue; }
        if (actual) { yield actual; actual = ''; }
        for (const ch of palabra) {
          if (actual && font.widthOfTextAtSize(actual + ch, 10) > ancho) { yield actual; actual = ''; }
          actual += ch;
        }
      }
      yield actual;
    }
  }
  const iterador = lineas();
  let linea = iterador.next();
  while (!linea.done) {
    const siguiente = iterador.next();
    // Reserva la última línea para avisar si queda texto fuera del justificante.
    if (doc.getPageCount() === 10 && y - 13 < margen && !siguiente.done) {
      escribir('… (sigue en el correo original)', 10);
      break;
    }
    escribir(linea.value, 10);
    y -= 13;
    if (y < margen && !siguiente.done) { p = pagina(); y = H - margen; }
    linea = siguiente;
  }
  const paginas = doc.getPages();
  paginas.forEach((hoja, i) => {
    const pie = limpio(`Página ${i + 1} de ${paginas.length}`);
    hoja.drawText(pie, { x: (W - font.widthOfTextAtSize(pie, 8)) / 2, y: 28, size: 8, font, color: gris });
  });
  return doc.save();
}

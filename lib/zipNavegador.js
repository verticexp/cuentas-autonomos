// ZIP sin comprimir en el navegador (lib/zip.js es la versión del servidor, con Buffer). Lo usa la ficha de un cliente
// «solo documentos» para los originales del trimestre: así no pasan todos por una sola respuesta del servidor, que en
// Vercel no puede superar 4,5 MB. archivos: [{ nombre, datos: Uint8Array }] → Blob.
import { crc32 } from './zip.js';

export function zipNavegador(archivos) {
  const partes = [], centrales = [];
  const txt = new TextEncoder();
  let pos = 0;
  for (const a of archivos) {
    const nombre = txt.encode(a.nombre);
    const datos = a.datos;
    const crc = crc32(datos);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true);
    cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true); cab.setUint32(22, datos.length, true); cab.setUint16(26, nombre.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, pos, true);
    partes.push(cab, nombre, datos);
    centrales.push(cen, nombre);
    pos += 30 + nombre.length + datos.length;
  }
  const tam = centrales.reduce((s, x) => s + x.byteLength, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, pos, true);
  return new Blob([...partes, ...centrales, fin], { type: 'application/zip' });
}

// Nombres sin repetir dentro del ZIP: «ticket.jpg», «ticket-2.jpg»…
export function nombresUnicos(nombres) {
  const vistos = new Map();
  return nombres.map((n) => {
    const k = n.toLowerCase();
    const i = (vistos.get(k) || 0) + 1;
    vistos.set(k, i);
    return i === 1 ? n : n.replace(/(\.[^.]+)?$/, (ext) => `-${i}${ext || ''}`);
  });
}

// ZIP sin comprimir (método «store»): lo justo para el paquete de la gestoría y los .xlsx. Sin dependencias.
const TABLA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// archivos: [{ nombre, datos (string o Uint8Array) }] → Buffer del .zip
export function zip(archivos) {
  const locales = [];
  const centrales = [];
  let pos = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, 'utf8');
    const datos = Buffer.from(a.datos);
    const crc = crc32(datos);
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0800, 6);
    cab.writeUInt32LE(crc, 14); cab.writeUInt32LE(datos.length, 18); cab.writeUInt32LE(datos.length, 22); cab.writeUInt16LE(nombre.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(datos.length, 20); cen.writeUInt32LE(datos.length, 24); cen.writeUInt16LE(nombre.length, 28);
    cen.writeUInt32LE(pos, 42);
    locales.push(cab, nombre, datos);
    centrales.push(cen, nombre);
    pos += 30 + nombre.length + datos.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...locales, dir, fin]);
}

// Lee un .zip «store» (para las pruebas): { nombre: Buffer }
export function leerZip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const tam = buf.readUInt32LE(p + 18), n = buf.readUInt16LE(p + 26), extra = buf.readUInt16LE(p + 28);
    const nombre = buf.subarray(p + 30, p + 30 + n).toString('utf8');
    const datos = buf.subarray(p + 30 + n + extra, p + 30 + n + extra + tam);
    if (crc32(datos) !== buf.readUInt32LE(p + 14)) throw new Error(`CRC de ${nombre}`);
    out[nombre] = datos;
    p += 30 + n + extra + tam;
  }
  return out;
}

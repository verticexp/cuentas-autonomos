// Lee la primera hoja de un Excel (.xlsx, comprimido o no) o de un CSV: filas de celdas (texto o número).
import { inflateRawSync } from 'node:zlib';

const MAX_COLUMNAS = 200, MAX_FILAS = 20000, MAX_CELDAS = 1000000;
const MAX_BYTES = 64 * 1024 * 1024;
const demasiado = () => { throw new Error('La hoja supera 200 columnas, 20.000 filas o 1.000.000 de celdas. Divide el archivo.'); };
const comprobar = (filas, columnas, celdas) => {
  if (filas > MAX_FILAS || columnas > MAX_COLUMNAS || celdas > MAX_CELDAS) demasiado();
};

// Zip por su directorio central (los .xlsx de Excel, Holded o LibreOffice suelen ir comprimidos).
export function abrirZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin -= 1;
  if (fin < 0) throw new Error('El archivo no es un Excel válido');
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out = {};
  let bytes = 0;
  for (let i = 0; i < total && buf.readUInt32LE(p) === 0x02014b50; i += 1) {
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), coment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + n).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + tam);
    // Tope al descomprimir: un .xlsx de 5 MB no puede convertirse en gigas (bomba zip) y tumbar el servidor.
    let abierto;
    out[nombre] = () => {
      if (abierto) return abierto;
      const restantes = MAX_BYTES - bytes;
      if (restantes <= 0 || (metodo !== 8 && datos.length > restantes)) throw new Error('El Excel es demasiado grande. Divide el archivo.');
      abierto = metodo === 8 ? inflateRawSync(datos, { maxOutputLength: restantes }) : datos;
      bytes += abierto.length;
      return abierto;
    };
    p += 46 + n + extra + coment;
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
const tTexto = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => texto(m[1])).join('');
const columna = (ref) => {
  let n = 0;
  for (const c of ref.replace(/\d+/g, '')) {
    n = n * 26 + c.charCodeAt(0) - 64;
    if (n > MAX_COLUMNAS) demasiado();
  }
  return n - 1;
};

function leerXlsx(buf) {
  const z = abrirZip(buf);
  const leer = (k) => z[k]?.().toString('utf8');
  const libro = leer('xl/workbook.xml') || '';
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
  const destino = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(leer('xl/_rels/workbook.xml.rels') || '')?.[1]
    || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(leer('xl/_rels/workbook.xml.rels') || '')?.[1];
  const ruta = destino ? (destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`) : 'xl/worksheets/sheet1.xml';
  const hojaXml = leer(ruta) || leer('xl/worksheets/sheet1.xml');
  if (!hojaXml) throw new Error('El Excel no tiene hojas');
  const compartidas = [...(leer('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => tTexto(m[1]));
  const filas = [];
  let celdas = 0, leidas = 0;
  for (const f of hojaXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    // Las filas vacías no vienen en el XML: se recuperan con el número de fila (r="7").
    const r = Number(/\br="(\d+)"/.exec(f[1])?.[1]);
    // Las filas sin celdas (con formato, al final de la hoja) no cuentan para el tope ni se guardan.
    if (!/<c\b/.test(f[2] || '') && (r || filas.length + 1) > MAX_FILAS) continue;
    comprobar(r || filas.length + 1, 0, celdas);
    // Como mucho 50 de golpe: basta para marcar el hueco y un r="9999999" no puede llenar la memoria.
    for (let k = 0; r && filas.length < r - 1 && k < 50; k += 1) filas.push([]);
    const fila = [];
    for (const c of (f[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const t = /\bt="(\w+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1];
      let x = '';
      if (t === 's') x = compartidas[Number(v)] ?? '';
      else if (t === 'inlineStr') x = tTexto(c[2] || '');
      else if (t === 'str' || t === 'e') x = texto(v ?? '');
      else if (t === 'b') x = v === '1';
      else if (v !== undefined) x = Number(v);
      const col = ref ? columna(ref) : fila.length;
      const refFila = ref && Number(ref.replace(/^[A-Z]+/, ''));
      comprobar(refFila || filas.length + 1, col + 1, ++leidas);
      // Se cuentan también los huecos que materializará Array.from, antes de asignar la celda.
      comprobar(filas.length + 1, col + 1, celdas + Math.max(fila.length, col + 1));
      fila[col] = x;
    }
    comprobar(filas.length + 1, fila.length, celdas + fila.length);
    celdas += fila.length;
    filas.push(Array.from(fila, (x) => x ?? ''));
  }
  return filas;
}

// CSV con «;», «,» o tabulador, comillas y saltos de línea dentro de comillas. UTF-8 o Latin-1 (Excel en Windows).
function leerCsv(buf) {
  let s = buf.toString('utf8');
  if (s.includes('\uFFFD')) s = buf.toString('latin1');
  s = s.replace(/^\uFEFF/, '');
  const linea1 = s.split(/\r?\n/)[0];
  const sep = [';', '\t', ','].map((c) => [c, linea1.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [], celda = '', comillas = false, celdas = 0;
  const ponerCelda = () => {
    comprobar(filas.length + 1, fila.length + 1, celdas + 1);
    fila.push(celda); celdas++; celda = '';
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { celda += '"'; i += 1; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { ponerCelda(); }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      ponerCelda(); filas.push(fila); fila = [];
    } else celda += c;
  }
  if (celda || fila.length) { ponerCelda(); filas.push(fila); }
  return filas;
}

// vacias: conserva las filas vacías (sirven para ver dónde acaba una tabla y para numerar las filas como en Excel).
export function leerHoja(buf, { vacias = false } = {}) {
  const filas = buf.subarray(0, 2).toString('latin1') === 'PK' ? leerXlsx(buf) : leerCsv(buf);
  const llena = (f) => f.some((x) => String(x).trim() !== '');
  if (!vacias) return filas.filter(llena);
  let fin = filas.length;
  while (fin && !llena(filas[fin - 1])) fin -= 1;
  return filas.slice(0, fin);
}

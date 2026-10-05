// Lee la primera hoja de un Excel (.xlsx, comprimido o no) o de un CSV: filas de celdas (texto o número).
import { inflateRawSync } from 'node:zlib';

// Zip por su directorio central (los .xlsx de Excel, Holded o LibreOffice suelen ir comprimidos).
export function abrirZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin -= 1;
  if (fin < 0) throw new Error('El archivo no es un Excel válido');
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out = {};
  for (let i = 0; i < total && buf.readUInt32LE(p) === 0x02014b50; i += 1) {
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), coment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + n).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + tam);
    out[nombre] = () => (metodo === 8 ? inflateRawSync(datos) : datos);
    p += 46 + n + extra + coment;
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
const tTexto = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => texto(m[1])).join('');
const columna = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

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
  for (const f of hojaXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const fila = [];
    for (const c of (f[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const t = /\bt="(\w+)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1];
      let x = '';
      if (t === 's') x = compartidas[Number(v)] ?? '';
      else if (t === 'inlineStr') x = tTexto(c[2] || '');
      else if (t === 'str' || t === 'e') x = texto(v ?? '');
      else if (t === 'b') x = v === '1';
      else if (v !== undefined) x = Number(v);
      fila[ref ? columna(ref) : fila.length] = x;
    }
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
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { celda += '"'; i += 1; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

export function leerHoja(buf) {
  const filas = buf.subarray(0, 2).toString('latin1') === 'PK' ? leerXlsx(buf) : leerCsv(buf);
  return filas.filter((f) => f.some((x) => String(x).trim() !== ''));
}

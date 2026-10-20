import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';

// Justificantes de gasto (la foto del ticket o el PDF de la factura). Fuera de Redis: en Vercel Blob con acceso privado
// (sin URL pública: solo se leen con el token del servidor, a través de /api/gastos/justificante, con sesión y permiso).
// En el gasto queda solo la referencia: archivo = { clave, tipo, tamano, huella, subido }.
// Sin BLOB_READ_WRITE_TOKEN ni BLOB_STORE_ID: en desarrollo, una carpeta temporal del equipo; en producción no hay dónde guardarlos.
export const MAX_BYTES = 5 * 1024 * 1024;
export const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Huella del contenido (para avisar de duplicados: lib/duplicados.js): SHA-256 en hexadecimal.
export const huellaDe = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const huellaValida = (h) => /^[a-f0-9]{64}$/.test(String(h || ''));

// Lo que dicen los primeros bytes; el Content-Type del navegador no basta (nosniff, pero mejor no guardar otra cosa).
export function tipoReal(bytes) {
  const b = Buffer.from(bytes.subarray(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

// bytes → { tipo } o { error }.
export function validarArchivo(bytes) {
  if (!bytes?.length) return { error: 'El archivo está vacío' };
  if (bytes.length > MAX_BYTES) return { error: 'El archivo es demasiado grande (máx. 5 MB)' };
  const tipo = tipoReal(bytes);
  if (!tipo) return { error: 'Sube una foto (JPG, PNG o WebP) o un PDF' };
  return { tipo };
}

const seguro = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
export const claveDe = (empresa, gastoId, huella, tipo) => `justificantes/${seguro(empresa)}/${seguro(gastoId)}-${huella.slice(0, 16)}.${TIPOS[tipo]}`;
const deEmpresa = (empresa, clave) => String(clave || '').startsWith(`justificantes/${seguro(empresa)}/`);

// Almacenes: { poner(clave, bytes, tipo), leer(clave) → Buffer | null, borrar(claves[]), listar(prefijo) → claves[] }.
const blob = {
  async poner(clave, bytes, tipo) {
    const { put } = await import('@vercel/blob');
    await put(clave, Buffer.from(bytes), { access: 'private', contentType: tipo, addRandomSuffix: false, allowOverwrite: true });
  },
  async leer(clave) {
    const { get } = await import('@vercel/blob');
    const r = await get(clave, { access: 'private', useCache: false });
    if (!r?.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  },
  async borrar(claves) {
    if (!claves.length) return;
    const { del } = await import('@vercel/blob');
    await del(claves);
  },
  async listar(prefijo) {
    const { list } = await import('@vercel/blob');
    const claves = [];
    let cursor;
    do {
      const r = await list({ prefix: prefijo, cursor, limit: 1000 });
      claves.push(...r.blobs.map((b) => b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return claves;
  },
};

// Desarrollo y demo local: archivos en una carpeta temporal (nunca en el repositorio).
export function almacenDisco(dir = path.join(tmpdir(), 'fisquo-justificantes')) {
  const ruta = (clave) => path.join(dir, ...clave.split('/'));
  return {
    async poner(clave, bytes) { await mkdir(path.dirname(ruta(clave)), { recursive: true }); await writeFile(ruta(clave), bytes); },
    async leer(clave) { try { return await readFile(ruta(clave)); } catch { return null; } },
    async borrar(claves) { await Promise.all(claves.map((c) => rm(ruta(c), { force: true }))); },
    async listar(prefijo) {
      const carpeta = ruta(prefijo.replace(/\/$/, ''));
      try { return (await readdir(carpeta)).map((n) => `${prefijo.replace(/\/$/, '')}/${n}`); } catch { return []; }
    },
  };
}

// Para las pruebas: en memoria.
export function almacenMemoria() {
  const m = new Map();
  return {
    datos: m,
    async poner(clave, bytes) { m.set(clave, Buffer.from(bytes)); },
    async leer(clave) { return m.get(clave) || null; },
    async borrar(claves) { for (const c of claves) m.delete(c); },
    async listar(prefijo) { return [...m.keys()].filter((c) => c.startsWith(prefijo)); },
  };
}

let fijado;
export const ponerAlmacen = (a) => { fijado = a; };
export function almacen() {
  if (fijado !== undefined) return fijado;
  // Con el almacén conectado en Vercel: o su token, o su id (la librería se identifica con el OIDC del despliegue).
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return blob;
  if (process.env.NODE_ENV !== 'production' || process.env.JUSTIFICANTES_DISCO === '1') return almacenDisco();
  return null;
}
export const hayAlmacen = () => Boolean(almacen());

// Sube el archivo del gasto → la referencia que va en gasto.archivo, o { error }.
export async function subirJustificante(u, gastoId, bytes) {
  const a = almacen();
  if (!a) return { error: 'Guardar justificantes aún no está configurado (falta el almacén de archivos en Vercel)', status: 503 };
  const v = validarArchivo(bytes);
  if (v.error) return { error: v.error, status: 400 };
  const huella = huellaDe(bytes);
  const clave = claveDe(u.empresa, gastoId, huella, v.tipo);
  await a.poner(clave, bytes, v.tipo);
  return { archivo: { clave, tipo: v.tipo, tamano: bytes.length, huella, subido: new Date().toISOString() } };
}

// Solo claves de la propia empresa: un gasto manipulado no puede leer ni borrar los de otra.
export async function leerJustificante(u, archivo) {
  const a = almacen();
  if (!a || !archivo?.clave || !deEmpresa(u.empresa, archivo.clave)) return null;
  return a.leer(archivo.clave);
}

// Borra sin fallar: si el almacén no responde, el gasto ya está borrado y queda un archivo huérfano (se avisa en el log).
export async function borrarJustificantes(u, archivos) {
  const a = almacen();
  const claves = archivos.map((x) => x?.clave).filter((c) => c && deEmpresa(u.empresa, c));
  if (!a || !claves.length) return;
  try { await a.borrar(claves); } catch (e) { console.warn(`[justificantes] no se han podido borrar ${claves.join(', ')}: ${e.message}`); }
}

// Purga de una empresa dada de baja (lib/baja.js purgarBajas).
export async function borrarDeEmpresa(empresa) {
  const a = almacen();
  if (!a) return 0;
  const claves = await a.listar(`justificantes/${seguro(empresa)}/`);
  if (claves.length) await a.borrar(claves);
  return claves.length;
}

// Nombre del archivo al descargarlo o dentro de un .zip: fecha, proveedor o concepto e id corto.
export function nombreJustificante(g) {
  const quien = String(g.proveedor || g.concepto || 'gasto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gasto';
  return `${g.fecha}-${quien}-${String(g.id).slice(0, 8)}.${TIPOS[g.archivo?.tipo] || 'bin'}`;
}

// Justificantes de unos gastos para un .zip: [{ nombre, datos }], de uno en uno y con un tope de tamaño total.
// Los que no caben o no se pueden leer van en «faltan» (la exportación avisa con un .txt).
export async function justificantesParaZip(u, gastos, { carpeta = 'justificantes', tope = 300 * 1024 * 1024 } = {}) {
  const archivos = [];
  const faltan = [];
  let total = 0;
  for (const g of gastos.filter((x) => x.archivo?.clave)) {
    if (total + (g.archivo.tamano || 0) > tope) { faltan.push(`${nombreJustificante(g)}: no cabe en esta descarga`); continue; }
    let datos = null;
    try { datos = await leerJustificante(u, g.archivo); } catch { /* se apunta abajo */ }
    if (!datos) { faltan.push(`${nombreJustificante(g)}: no se ha podido leer`); continue; }
    total += datos.length;
    archivos.push({ nombre: `${carpeta}/${nombreJustificante(g)}`, datos });
  }
  if (faltan.length) archivos.push({ nombre: `${carpeta}/FALTAN.txt`, datos: `Justificantes que no van en esta descarga:\n${faltan.join('\n')}\n` });
  return archivos;
}

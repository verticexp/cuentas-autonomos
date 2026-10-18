// Justificante del gasto en el navegador: se prepara al leer el ticket y se sube al guardar (PUT /api/gastos/justificante).
// Las fotos van reducidas (lib/reducirImagen.js); los PDF, tal cual. Máximo 5 MB, como en el servidor (lib/justificantes.js).
import { reducir } from './reducirImagen.js';

export const MAX_BYTES = 5 * 1024 * 1024;

// «data:…;base64,…» → Blob (sin fetch: la CSP no deja pedir data: con connect-src).
export function deDataUrl(url) {
  const [cab, b64] = String(url).split(',');
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /^data:([^;]+)/.exec(cab)?.[1] || 'application/octet-stream' });
}

// SHA-256 en hexadecimal: la misma huella que calcula el servidor, para avisar de duplicados ya al guardar.
export async function huella(blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Archivo elegido (o la foto ya reducida, en data URL) → { blob, huella } o { error }.
export async function preparar(archivo, reducida) {
  const pdf = archivo?.type === 'application/pdf';
  const blob = pdf ? archivo : deDataUrl(reducida || await reducir(archivo));
  if (blob.size > MAX_BYTES) return { error: 'El archivo es demasiado grande (máx. 5 MB)' };
  return { blob, huella: await huella(blob) };
}

// Sube el justificante del gasto. Devuelve '' o el error (el gasto ya está guardado: solo se avisa).
// Todos los fallos se muestran: nunca dar por guardado un archivo que el servidor ha rechazado.
export async function subir(id, blob) {
  try {
    const r = await fetch(`/api/gastos/justificante?id=${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.archivo?.tipo && d.archivo.tamano === blob.size) return '';
    if (r.ok) return 'El servidor no ha confirmado el justificante. Reintenta guardarlo';
    if (r.status === 413) return 'El archivo es demasiado grande para subirlo';
    return d.error || 'No se ha podido guardar el justificante';
  } catch { return 'No se ha podido guardar el justificante (sin conexión)'; }
}

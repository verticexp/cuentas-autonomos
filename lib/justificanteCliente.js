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
// alGuardar: al dar de alta el gasto, si el almacén no está configurado (503) no se avisa: el gasto se guarda como siempre.
export async function subir(id, blob, { alGuardar = false } = {}) {
  try {
    const r = await fetch(`/api/gastos/justificante?id=${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    if (r.ok) return '';
    if (r.status === 503 && alGuardar) return '';
    if (r.status === 413) return 'El archivo es demasiado grande para subirlo';
    const d = await r.json().catch(() => ({}));
    return d.error || 'No se ha podido guardar el justificante';
  } catch { return 'No se ha podido guardar el justificante (sin conexión)'; }
}

// Subir facturas a «Por revisar» (lib/bandeja.js) desde el navegador: lo usan la tarjeta de añadir de Gastos
// (components/FormGasto.js) y la pantalla de Por revisar (components/Bandeja.js). Solo en el navegador.
import { reducir } from './reducirImagen.js';
import { deDataUrl, MAX_BYTES } from './justificanteCliente.js';

export const ACEPTA = 'image/*,application/pdf,.pdf,.xml,.xsig,text/xml,application/xml';
const esXml = (f) => /xml/.test(f.type) || /\.(xml|xsig)$/i.test(f.name);
const esPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
// Aviso para quien tenga «Por revisar» a la vista: hay facturas nuevas.
export const EVENTO = 'fisquo:por-revisar';

// Archivo elegido → lo que se sube: las fotos, reducidas como en el escáner; PDF y XML, tal cual.
async function preparar(f) {
  if (esXml(f) || esPdf(f)) return f.size > MAX_BYTES ? { error: 'pasa de 5 MB' } : { blob: f, tipo: esXml(f) ? 'application/xml' : 'application/pdf' };
  if (!/^image\//.test(f.type)) return { error: 'no es una foto, un PDF ni una factura electrónica' };
  try {
    const blob = deDataUrl(await reducir(f));
    return blob.size > MAX_BYTES ? { error: 'pasa de 5 MB' } : { blob, tipo: blob.type };
  } catch { return { error: 'no se ha podido abrir la foto' }; }
}

// Un archivo → { id } (el documento en Por revisar) o { error } con el nombre del archivo delante.
export async function subirUna(f, origen) {
  const p = await preparar(f);
  if (p.error) return { error: `${f.name}: ${p.error}` };
  try {
    const r = await fetch(`/api/bandeja?nombre=${encodeURIComponent(f.name)}${origen ? `&origen=${origen}` : ''}`, { method: 'PUT', headers: { 'Content-Type': p.tipo }, body: p.blob });
    const d = await r.json().catch(() => ({}));
    if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname)}`);
    return r.ok ? { id: d.documento?.id } : { error: `${f.name}: ${d.error || 'no se ha podido subir'}` };
  } catch { return { error: `${f.name}: sin conexión` }; }
}

// Varios, de dos en dos (la lectura va después, en el servidor). progreso(hechos, total). → { ids, errores }.
export async function subirVarias(lista, { origen, progreso } = {}) {
  const archivos = [...lista].slice(0, 100);
  const ids = [], errores = [];
  let i = 0, hechos = 0;
  const hilo = async () => {
    while (i < archivos.length) {
      const r = await subirUna(archivos[i++], origen);
      if (r.error) errores.push(r.error); else if (r.id) ids.push(r.id);
      progreso?.(++hechos, archivos.length);
    }
  };
  progreso?.(0, archivos.length);
  await Promise.all([hilo(), hilo()]);
  if (ids.length) window.dispatchEvent(new Event(EVENTO));
  return { ids, errores };
}

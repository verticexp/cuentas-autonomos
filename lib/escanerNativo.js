'use client';

// Escáner de documentos de iOS dentro de la app (mobile/ios/App/App/EscanerPlugin.swift, VisionKit): recorta, endereza y
// limpia el ticket antes de leerlo. En el navegador no existe y se sigue usando la cámara del <input> de siempre.
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Escaner || null);

let disponibleCache;
export async function escanerDisponible() {
  if (disponibleCache !== undefined) return disponibleCache;
  const p = plugin();
  disponibleCache = Boolean(p && (await p.disponible().then((r) => r?.disponible).catch(() => false)));
  return disponibleCache;
}

const aArchivo = (base64, i) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], `ticket-${Date.now()}-${i + 1}.jpg`, { type: 'image/jpeg' });
};

// undefined: no hay escáner nativo (usar el <input>). []: el usuario canceló. [File, …]: una por página escaneada.
export async function escanearNativo() {
  if (!(await escanerDisponible())) return undefined;
  try {
    const { paginas = [] } = await plugin().escanear();
    return paginas.map(aArchivo);
  } catch (e) {
    if (e?.code === 'cancelado' || e?.message === 'cancelado') return [];
    return undefined;
  }
}

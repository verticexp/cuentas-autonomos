'use client';

import { useState } from 'react';

// En el móvil (pantalla táctil) abre el menú de compartir con el PDF (Guardar en Archivos, Imprimir, WhatsApp, Mail…);
// en el ordenador lo descarga directamente. Safari y Chrome de escritorio también tienen navigator.share con archivos,
// y en el Mac abría el menú de compartir en vez de descargar: por eso se mira que el dispositivo sea táctil.
export default function DescargarPdf({ id, nombre, url = `/api/facturas/pdf?id=${encodeURIComponent(id)}` }) {
  const [estado, setEstado] = useState('');
  const bajar = async () => {
    setEstado('Generando…');
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se ha podido generar el PDF. Inténtalo de nuevo en unos minutos.');
      const blob = await r.blob();
      const archivo = new File([blob], nombre, { type: 'application/pdf' });
      setEstado('');
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) {
      setEstado(e.name === 'AbortError' ? '' : e.message);
    }
  };
  const generando = estado === 'Generando…';
  return (
    <div style={{ textAlign: 'right' }}>
      <button className="boton pequeno" onClick={bajar} disabled={generando}>{generando ? estado : 'Descargar PDF'}</button>
      {estado && !generando && <p className="error" role="alert">{estado}</p>}
    </div>
  );
}

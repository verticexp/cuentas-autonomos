'use client';

import { useState } from 'react';

// En el móvil abre el menú de compartir con el PDF (Guardar en Archivos, Imprimir, WhatsApp, Mail…);
// en el ordenador lo descarga.
export default function DescargarPdf({ id, nombre }) {
  const [estado, setEstado] = useState('');
  const bajar = async () => {
    setEstado('Generando…');
    try {
      const r = await fetch(`/api/facturas/pdf?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo generar el PDF');
      const blob = await r.blob();
      const archivo = new File([blob], nombre, { type: 'application/pdf' });
      setEstado('');
      if (navigator.canShare?.({ files: [archivo] })) {
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
      {estado && !generando && <p className="error">{estado}</p>}
    </div>
  );
}

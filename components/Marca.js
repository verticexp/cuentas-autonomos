'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { COLORES, COLOR_BASE } from '@/lib/marca';

// Reduce el logo a 600 px como mucho para que la factura cargue rápido.
function prepararLogo(file) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let url = c.toDataURL('image/png');
      if (url.length > 380000) url = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      ok(url);
    };
    img.onerror = () => mal(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Marca({ marca, nombre }) {
  const router = useRouter();
  const [color, setColor] = useState(marca?.color || COLOR_BASE);
  const [logo, setLogo] = useState(marca?.logo || null);
  const [msg, setMsg] = useState('');

  async function guardar(cambios) {
    const nueva = { color, logo, ...cambios };
    setMsg('Guardando…');
    try {
      await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ marca: nueva }) });
      setMsg('Guardado');
      router.refresh();
    } catch (e) { setMsg(e.message); }
  }

  const elegir = (c) => { setColor(c); guardar({ color: c }); };

  return (
    <section className="tarjeta formulario marca">
      <h3>Tu marca</h3>
      <p className="nota">El color sale en tus facturas, presupuestos y páginas de cobro; el logo, arriba en cada PDF.</p>

      <div className="muestra-factura" style={{ '--c': color }}>
        {logo ? <img src={logo} alt="Tu logo" /> : <span className="sin-logo">Tu logo</span>}
        <div><strong>{nombre || 'Tu empresa'}</strong><small>Factura 01-2026</small></div>
      </div>

      <div className="colores" role="radiogroup" aria-label="Color de tu marca">
        {COLORES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={color === c ? 'activo' : ''} style={{ background: c }} onClick={() => elegir(c)} />
        ))}
        <label className={`color-libre${COLORES.includes(color) ? '' : ' activo'}`} title="Otro color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} onBlur={(e) => elegir(e.target.value.toUpperCase())} aria-label="Otro color" />
        </label>
      </div>

      <div className="logo-botones">
        <label className="boton sec">
          {logo ? 'Cambiar logo' : 'Subir logo'}
          <input type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { const l = await prepararLogo(f); setLogo(l); guardar({ logo: l }); } catch (err) { setMsg(err.message); }
          }} />
        </label>
        {logo && <button type="button" className="borrar" onClick={() => { setLogo(null); guardar({ logo: null }); }}>Quitar logo</button>}
      </div>
      {msg && <p className={msg === 'Guardado' || msg === 'Guardando…' ? 'nota' : 'error'}>{msg}</p>}
    </section>
  );
}

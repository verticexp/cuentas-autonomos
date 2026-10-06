'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import Deslizable from './Deslizable';
import '@/app/ticket.css';

// Reduce la foto (máx. 1600 px, JPEG) para que suba rápido y quepa en la petición.
async function reducir(archivo) {
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export default function FormGasto({ hoy, gasto, actividades, alquiler = false }) {
  const router = useRouter();
  const vacio = { fecha: hoy, actividad: actividades[0].id, concepto: '', proveedor: '', base: '', ivaPct: 21 };
  const [g, setG] = useState(gasto ? { ...gasto, base: String(gasto.base).replace('.', ',') } : vacio);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setG((x) => ({ ...x, [k]: v }));
  const [leyendo, setLeyendo] = useState('');
  const foto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const pdf = archivo.type === 'application/pdf';
    if (pdf && archivo.size > 5e6) { setError('El PDF es demasiado grande (máx. 5 MB)'); return; }
    setLeyendo(pdf ? 'Leyendo la factura…' : 'Leyendo el ticket…'); setError('');
    try {
      const imagen = pdf ? await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); }) : await reducir(archivo);
      const d = await llamar('/api/gastos/ticket', { method: 'POST', body: JSON.stringify({ imagen }) });
      const t = d.gasto;
      setG((x) => ({ ...x, proveedor: t.proveedor || x.proveedor, proveedorNif: t.nif || x.proveedorNif, concepto: t.concepto || t.proveedor || x.concepto, base: t.base !== '' ? String(t.base).replace('.', ',') : x.base, ivaPct: t.ivaPct, fecha: t.fecha }));
      setLeyendo('Revisa los datos antes de guardar.');
    } catch (err) { setLeyendo(''); setError(err.message); }
  };

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/gastos', { method: gasto ? 'PATCH' : 'POST', body: JSON.stringify(g) });
      if (gasto) { navegar(router, '/gastos', 'atras'); router.refresh(); return; }
      setG(vacio);
      router.refresh();
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      <h3>{gasto ? 'Editar gasto' : 'Añadir gasto deducible'}</h3>
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={g.actividad === id ? 'activo' : ''} onClick={() => poner('actividad', id)}>{nombre}</button>
        ))}
      </Deslizable>}
      {!gasto && <div className="ticket-ia">
        <p className="ticket-ia-t">Rellénalo con IA</p>
        <p className="ticket-ia-txt">Haz una foto del ticket o sube la factura que te han enviado (imagen o PDF). Netto lee el proveedor, el NIF, la base, el IVA y la fecha; tú solo revisas y guardas.</p>
        <div className="ticket-ia-botones">
          <label className="boton sec ticket-foto">Hacer foto<input type="file" accept="image/*" capture="environment" onChange={foto} hidden /></label>
          <label className="boton sec ticket-foto">Subir factura<input type="file" accept="image/*,application/pdf" onChange={foto} hidden /></label>
        </div>
      </div>}
      {leyendo && <p className="nota ticket-nota" role="status">{leyendo}</p>}
      <input className="campo" placeholder="Proveedor (opcional)" value={g.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} />
      {g.proveedor && <input className="campo" placeholder="NIF del proveedor (opcional)" value={g.proveedorNif || ''} onChange={(e) => poner('proveedorNif', e.target.value)} />}
      <input className="campo" placeholder="Concepto" value={g.concepto} onChange={(e) => poner('concepto', e.target.value)} required />
      <div className="dos-col">
        <input className="campo" inputMode="decimal" placeholder="Base sin IVA" value={g.base} onChange={(e) => poner('base', e.target.value)} required />
        <select className="campo" value={g.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
          {[21, 10, 4, 0].map((n) => <option key={n} value={n}>IVA {n}%</option>)}
        </select>
      </div>
      <input className="campo" type="date" value={g.fecha} onChange={(e) => poner('fecha', e.target.value)} required />
      <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.pendiente)} onChange={(e) => poner('pendiente', e.target.checked)} />Aún no lo he pagado</label>
      {(alquiler || g.alquiler) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.alquiler)} onChange={(e) => poner('alquiler', e.target.checked)} />Es el alquiler del local (retención del 19 %)</label>}
      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Añadir'}</button>
    </form>
  );
}

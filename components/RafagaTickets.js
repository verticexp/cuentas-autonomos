'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { nifUE } from '@/lib/calculos';
import { fotograma, reducir } from '@/lib/reducirImagen';
import { preparar, subir } from '@/lib/justificanteCliente';
import CupoEscaneo from './CupoEscaneo';
import { escanearNativo, escanerDisponible } from '@/lib/escanerNativo';
import { NO_IA, permisoIA } from '@/lib/permisoIA';
import '@/app/rafaga.css';

// Modo ráfaga de Gastos: varios tickets seguidos con la cámara en vivo. Se hacen las fotos una tras otra, se leen de una
// en una (la lectura es una llamada de pago a la IA y el servidor limita a 10 por minuto) y cada una se revisa antes de
// guardarse. No guarda nada sin que se pida. Los tickets con varios tipos de IVA se apuntan a mano (como en un gasto suelto).
const MAX = 8;
const aTexto = (n) => String(n ?? '').replace('.', ',');

export default function RafagaTickets({ hoy, actividades }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [fase, setFase] = useState('camara'); // camara | revision
  const [fotos, setFotos] = useState([]);
  const [items, setItems] = useState([]);
  const [camara, setCamara] = useState('esperando'); // esperando | lista | denegada | no
  const [actividad, setActividad] = useState(actividades[0].id);
  const video = useRef(null);
  const flujo = useRef(null);
  const panel = useRef(null);
  const boton = useRef(null);
  const corrida = useRef(0); // cada vez que se abre o se cierra, las lecturas que quedaban en marcha dejan de pedir fotos
  const cerrarRef = useRef(null);

  const poner = (id, cambios) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...(typeof cambios === 'function' ? cambios(x) : cambios) } : x)));
  const ponerG = (id, k, v) => poner(id, (x) => ({ g: { ...x.g, [k]: v }, estado: x.estado === 'duplicado' ? 'leido' : x.estado, duplicados: undefined }));

  const cupo = MAX - items.length; // fotos que aún caben (con las ya leídas)
  const cerrar = () => {
    const sinGuardar = items.filter((x) => ['leyendo', 'leido', 'duplicado', 'error'].includes(x.estado)).length;
    if (sinGuardar > 0 && !confirm(sinGuardar === 1 ? 'Hay 1 ticket sin guardar. ¿Salir y descartarlo?' : `Hay ${sinGuardar} tickets sin guardar. ¿Salir y descartarlos?`)) return;
    if (fase === 'camara' && fotos.length > 0 && !confirm('Tienes fotos sin leer. ¿Salir y descartarlas?')) return;
    corrida.current += 1;
    setAbierta(false);
    if (items.some((x) => x.estado === 'guardado')) router.refresh();
  };
  cerrarRef.current = cerrar;
  const abrir = () => { corrida.current += 1; setFase('camara'); setFotos([]); setItems([]); setCamara('esperando'); setAbierta(true); };

  // Cámara en vivo, solo en la fase de hacer fotos (y siempre se apaga al salir de ella).
  useEffect(() => {
    if (!abierta || fase !== 'camara') return undefined;
    let parar = false;
    (async () => {
      try {
        // App de iOS: el escáner de documentos nativo, que ya hace varias páginas seguidas (lib/escanerNativo.js).
        if (await escanerDisponible()) { if (!parar) setCamara('nativo'); return; }
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sin cámara'), { name: 'NoCamara' });
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (parar) { s.getTracks().forEach((t) => t.stop()); return; }
        flujo.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setCamara('lista');
      } catch (e) { if (!parar) setCamara(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denegada' : 'no'); }
    })();
    return () => { parar = true; flujo.current?.getTracks().forEach((t) => t.stop()); flujo.current = null; };
  }, [abierta, fase]);

  // Abierta: el fondo no se mueve, Escape cierra y el foco entra y vuelve al botón.
  useEffect(() => {
    if (!abierta) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const origen = boton.current;
    const teclas = (e) => { if (e.key === 'Escape') cerrarRef.current(); };
    document.addEventListener('keydown', teclas);
    panel.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('keydown', teclas); document.body.style.overflow = anterior; origen?.focus?.({ preventScroll: true }); };
  }, [abierta]);
  const disparar = () => {
    const v = video.current;
    if (!v?.videoWidth || fotos.length >= cupo) return;
    navigator.vibrate?.(8);
    setFotos((f) => [...f, fotograma(v)]);
  };
  const escanear = async () => {
    const escaneo = await escanearNativo();
    if (escaneo === undefined) { setCamara('no'); return; }
    const nuevas = await Promise.all(escaneo.slice(0, Math.max(0, cupo - fotos.length)).map((a) => reducir(a).catch(() => null)));
    setFotos((f) => [...f, ...nuevas.filter(Boolean)].slice(0, cupo));
  };

  const delArchivo = async (e) => {
    const archivos = [...(e.target.files || [])].filter((a) => a.type.startsWith('image/')).slice(0, Math.max(0, cupo - fotos.length));
    e.target.value = '';
    const nuevas = await Promise.all(archivos.map((a) => reducir(a).catch(() => null)));
    setFotos((f) => [...f, ...nuevas.filter(Boolean)].slice(0, cupo));
  };

  // De la foto al borrador: igual que un ticket suelto (components/FormGasto.js), una foto cada vez.
  const leerTodas = async (lista) => {
    const mi = corrida.current;
    if (!permisoIA()) { for (const it of lista) poner(it.id, { estado: 'error', error: NO_IA }); return; }
    for (const it of lista) {
      if (corrida.current !== mi) return;
      try {
        let d;
        try { d = await llamar('/api/gastos/ticket', { method: 'POST', body: JSON.stringify({ imagen: it.foto }) }); }
        finally { window.dispatchEvent(new Event('netto:escaneos')); }
        const t = d.gasto;
        const g = { fecha: t.fecha, actividad, proveedor: t.proveedor || '', proveedorNif: t.nif || '', concepto: t.concepto || t.proveedor || '', base: t.base !== '' ? aTexto(t.base) : '', ivaPct: t.ivaPct, irpfPct: t.irpfPct || 0,
          ...(!Number(t.ivaPct) && nifUE(t.nif) ? { origen: 'ue' } : {}) };
        poner(it.id, { estado: 'leido', g, avisos: Array.isArray(t.avisos) ? t.avisos : [], varios: Boolean(t.varios) });
      } catch (err) { poner(it.id, { estado: 'error', error: err.message }); }
    }
  };
  const empezar = () => {
    const lista = fotos.map((foto, i) => ({ id: `${Date.now()}-${i}`, foto, estado: 'leyendo' }));
    setItems((antes) => [...antes, ...lista]);
    setFase('revision');
    leerTodas(lista);
  };
  const reintentar = (it) => { poner(it.id, { estado: 'leyendo', error: '' }); leerTodas([it]); };

  // Cada ticket se guarda con su foto como justificante (la huella va con el gasto para avisar de duplicados).
  const guardar = async (it, confirmado = false) => {
    poner(it.id, { estado: 'guardando', error: '' });
    try {
      const j = await preparar(null, it.foto);
      if (j.error) throw new Error(j.error);
      const r = await fetch('/api/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...it.g, ...(j?.huella ? { huella: j.huella } : {}), ...(confirmado ? { duplicadoConfirmado: true } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      if (r.status === 409 && Array.isArray(d.duplicados) && d.duplicados.length) { poner(it.id, { estado: 'duplicado', duplicados: d.duplicados }); return false; }
      if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
      const fallo = j?.blob && d.gasto?.id ? await subir(d.gasto.id, j.blob, { alGuardar: true }) : '';
      poner(it.id, { estado: 'guardado', aviso: fallo ? `Sin la foto: ${fallo}. Adjúntala desde la ficha del gasto.` : '' });
      return true;
    } catch (err) { poner(it.id, { estado: 'leido', error: err.message }); return false; }
  };
  // Los que no piden revisión aparte (sin avisos de la lectura ni varios tipos de IVA).
  const limpios = items.filter((x) => x.estado === 'leido' && !x.varios && !x.avisos?.length);
  const guardarLimpios = async () => { for (const it of limpios) await guardar(it); };

  const terminados = items.length > 0 && items.every((x) => ['guardado', 'descartado'].includes(x.estado));
  const pendientes = items.filter((x) => !['guardado', 'descartado'].includes(x.estado));

  return (
    <>
      <button ref={boton} type="button" className="boton sec rafaga-abrir" onClick={abrir} aria-haspopup="dialog">Varios tickets</button>
      {abierta && createPortal(
        <div className="rafaga" role="dialog" aria-modal="true" aria-label="Varios tickets seguidos" ref={panel}>
          {fase === 'camara' ? (
            <>
              <div className="rafaga-visor">
                <video ref={video} playsInline muted autoPlay aria-label="Cámara" />
                {camara === 'esperando' && <p className="rafaga-aviso">Abriendo la cámara…</p>}
                {camara === 'nativo' && (
                  <div className="rafaga-aviso">
                    <p>Escanea los tickets uno detrás de otro: cada página será un gasto.</p>
                    <button type="button" className="boton" onClick={escanear}>{fotos.length ? 'Escanear más tickets' : 'Escanear tickets'}</button>
                  </div>
                )}
                {(camara === 'denegada' || camara === 'no') && (
                  <div className="rafaga-aviso">
                    <p>{camara === 'denegada' ? 'Kontix no tiene permiso para usar la cámara. Puedes darlo en los ajustes del navegador o elegir las fotos de tu galería.' : 'No se ha podido abrir la cámara. Elige las fotos de tu galería.'}</p>
                    <label className="boton">Elegir fotos<input type="file" accept="image/*" multiple hidden onChange={delArchivo} /></label>
                  </div>
                )}
                <button type="button" className="rafaga-x" onClick={cerrar} aria-label="Cerrar">×</button>
                <p className="rafaga-cuenta" role="status">{fotos.length === 0 ? 'Haz una foto a cada ticket' : fotos.length === 1 ? '1 ticket' : `${fotos.length} tickets`}{fotos.length >= cupo ? ' (máximo)' : ''}</p>
              </div>
              <div className="rafaga-barra">
                <CupoEscaneo />
                <ul className="rafaga-tiras" aria-label="Fotos hechas">
                  {fotos.map((f, i) => (
                    <li key={i}><img src={f} alt={`Ticket ${i + 1}`} /><button type="button" aria-label={`Quitar el ticket ${i + 1}`} onClick={() => setFotos((l) => l.filter((_, j) => j !== i))}>×</button></li>
                  ))}
                </ul>
                <div className="rafaga-mandos">
                  {camara === 'lista'
                    ? <button type="button" className="rafaga-disparo" onClick={disparar} disabled={fotos.length >= cupo} aria-label="Hacer foto"><span /></button>
                    : null}
                  <button type="button" className="boton" onClick={empezar} disabled={fotos.length === 0}>{fotos.length > 1 ? `Leer ${fotos.length} tickets` : 'Leer el ticket'}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="rafaga-rev">
              <header className="rafaga-cab">
                <h2>{terminados ? 'Todo guardado' : `Revisa ${items.length === 1 ? 'el ticket' : 'los tickets'}`}</h2>
                <button type="button" className="rafaga-x oscuro" onClick={cerrar} aria-label={terminados ? 'Hecho' : 'Cerrar'}>×</button>
              </header>
              {actividades.length > 1 && !terminados && (
                <label className="rafaga-act">Actividad
                  <select className="campo" value={actividad} onChange={(e) => { setActividad(e.target.value); setItems((l) => l.map((x) => (x.g ? { ...x, g: { ...x.g, actividad: e.target.value } } : x))); }}>
                    {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </label>
              )}
              <CupoEscaneo />
              <ul className="rafaga-lista">
                {items.map((it, i) => (
                  <li key={it.id} className={`rafaga-it e-${it.estado}`}>
                    <img src={it.foto} alt={`Ticket ${i + 1}`} />
                    <div className="rafaga-datos">
                      {it.estado === 'leyendo' && <p className="rafaga-estado" role="status">Leyendo el ticket {i + 1}…</p>}
                      {it.estado === 'error' && <><p className="error">{it.error}</p><div className="rafaga-acc"><button type="button" className="boton sec pequeno" onClick={() => reintentar(it)}>Reintentar</button><button type="button" className="boton sec pequeno" onClick={() => poner(it.id, { estado: 'descartado' })}>Descartar</button></div></>}
                      {it.estado === 'guardado' && <p className="rafaga-estado ok">✓ Guardado: {it.g.concepto} · {it.g.base} €</p>}
                      {it.estado === 'guardado' && it.aviso && <p className="nota">{it.aviso}</p>}
                      {it.estado === 'descartado' && <p className="rafaga-estado">Descartado</p>}
                      {['leido', 'guardando', 'duplicado'].includes(it.estado) && (
                        <>
                          <input className="campo" placeholder="Concepto" value={it.g.concepto} onChange={(e) => ponerG(it.id, 'concepto', e.target.value)} aria-label={`Concepto del ticket ${i + 1}`} />
                          <input className="campo" placeholder="Proveedor (opcional)" value={it.g.proveedor} onChange={(e) => ponerG(it.id, 'proveedor', e.target.value)} aria-label={`Proveedor del ticket ${i + 1}`} />
                          <div className="rafaga-fila">
                            <input className="campo" inputMode="decimal" placeholder="Base sin IVA" value={it.g.base} onChange={(e) => ponerG(it.id, 'base', e.target.value)} aria-label={`Base del ticket ${i + 1}`} />
                            <select className="campo" value={it.g.ivaPct} onChange={(e) => ponerG(it.id, 'ivaPct', Number(e.target.value))} aria-label={`IVA del ticket ${i + 1}`}>
                              {[21, 10, 4, 0].map((n) => <option key={n} value={n}>IVA {n}%</option>)}
                            </select>
                            <input className="campo" type="date" max={hoy} value={it.g.fecha} onChange={(e) => ponerG(it.id, 'fecha', e.target.value)} aria-label={`Fecha del ticket ${i + 1}`} />
                          </div>
                          <select className="campo" value={it.g.irpfPct || 0} onChange={(e) => ponerG(it.id, 'irpfPct', Number(e.target.value))} aria-label={`IRPF del ticket ${i + 1}`}>
                            <option value={0}>Sin retención de IRPF</option><option value={15}>IRPF 15 %</option><option value={7}>IRPF 7 %</option>
                          </select>
                          {it.varios && <p className="nota">Tiene varios tipos de IVA: apúntalo a mano en «A mano» para repartir bien la base.</p>}
                          {it.avisos?.map((a) => <p key={a} className="nota">{a}.</p>)}
                          {it.error && <p className="error">{it.error}</p>}
                          {it.estado === 'duplicado' && (
                            <div className="nota" role="alert">
                              <strong>Puede que ya esté apuntado</strong>
                              <ul>{it.duplicados.map((d) => <li key={d.id}>{d.motivo}</li>)}</ul>
                            </div>
                          )}
                          <div className="rafaga-acc">
                            {it.estado === 'duplicado'
                              ? <button type="button" className="boton pequeno" onClick={() => guardar(it, true)}>Es otro gasto: guardarlo</button>
                              : <button type="button" className="boton pequeno" disabled={it.estado === 'guardando' || it.varios} onClick={() => guardar(it)}>{it.estado === 'guardando' ? 'Guardando…' : 'Guardar'}</button>}
                            <button type="button" className="boton sec pequeno" disabled={it.estado === 'guardando'} onClick={() => poner(it.id, { estado: 'descartado' })}>Descartar</button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="rafaga-pie">
                {terminados
                  ? <button type="button" className="boton" onClick={cerrar}>Hecho</button>
                  : <>
                    <button type="button" className="boton" disabled={limpios.length === 0} onClick={guardarLimpios}>{limpios.length === 0 ? 'Revisa cada ticket' : limpios.length === pendientes.length ? `Guardar los ${limpios.length}` : `Guardar los ${limpios.length} sin avisos`}</button>
                    {cupo > 0 && <button type="button" className="boton sec" onClick={() => { setFotos([]); setFase('camara'); setCamara('esperando'); }}>Más fotos</button>}
                  </>}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

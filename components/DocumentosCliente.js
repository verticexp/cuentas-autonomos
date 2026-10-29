'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subirVarias } from '@/lib/bandejaCliente';
import { eur, fechaCorta } from '@/lib/formato';
import { useT } from '@/components/Idioma';
import Vacio from '@/components/Vacio';

// La pantalla del cliente «solo documentos» (app/documentos, lib/documentos.js), pensada para el móvil: subir fotos o PDF
// (uno o varios), su dirección para reenviar facturas, lo que le pide su gestoría y lo que ya ha enviado.
const ACEPTA = 'image/*,application/pdf,.pdf';
const ESTADO = { leyendo: 'Leyendo…', recibido: 'Recibido', revisado: 'Revisado', error: 'Tu gestoría lo completará', cuarentena: 'De un remitente desconocido' };

export default function DocumentosCliente({ inicial, nombre }) {
  const tr = useT();
  const [datos, setDatos] = useState(inicial);
  const [subiendo, setSubiendo] = useState(null);
  const [aviso, setAviso] = useState('');
  const [quitar, setQuitar] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const peticion = useRef(null);
  const archivos = useRef(null);
  const camara = useRef(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/documentos', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setDatos(await r.json());
  }, []);
  // Mientras se lee algo, se pregunta cada pocos segundos (la lectura va en la cola del servidor).
  const leyendo = datos.documentos.some((d) => d.estado === 'leyendo');
  useEffect(() => {
    if (!leyendo) return undefined;
    const t = setInterval(cargar, 4000);
    return () => clearInterval(t);
  }, [leyendo, cargar]);

  const subir = async (lista) => {
    if (!lista?.length) return;
    setAviso('');
    const p = peticion.current;
    peticion.current = null;
    const r = await subirVarias(lista, { ruta: p ? `/api/documentos?peticion=${encodeURIComponent(p)}` : '/api/documentos', progreso: (h, t) => setSubiendo({ h, t }) });
    setSubiendo(null);
    if (r.errores.length) setAviso(r.errores.join(' · '));
    else setAviso(r.ids.length === 1 ? tr('Enviado a tu gestoría.') : tr('{n} documentos enviados a tu gestoría.', { n: r.ids.length }));
    await cargar();
  };
  const elegir = (p, cam = false) => { peticion.current = p; (cam ? camara : archivos).current?.click(); };
  const borrar = async (id) => {
    setQuitar(null);
    const r = await fetch('/api/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'descartar', id }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) setAviso(d?.error || tr('No se ha podido quitar'));
    await cargar();
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(datos.correo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso: se ve la dirección */ }
  };

  return <main className="pagina docs-cliente">
    <header className="docs-cab">
      <p className="docs-quien">{nombre}</p>
      <h1 className="titulo">{tr('Tus documentos')}</h1>
      {datos.gestoria && <p className="docs-sub">{tr('Lo que subas aquí le llega a {gestoria}.', { gestoria: datos.gestoria })}</p>}
    </header>

    {datos.abierto ? <section className="docs-subir" aria-label={tr('Enviar documentos')}>
      <button type="button" className="boton docs-foto" onClick={() => elegir(null, true)} disabled={Boolean(subiendo)}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        {subiendo ? tr('Subiendo {h} de {t}…', subiendo) : tr('Hacer una foto')}
      </button>
      <button type="button" className="boton sec docs-elegir" onClick={() => elegir(null)} disabled={Boolean(subiendo)}>{tr('Subir fotos o PDF')}</button>
      <p className="docs-nota">{tr('Tickets y facturas, de gasto o de venta. Puedes elegir varios a la vez.')}</p>
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { subir(e.target.files); e.target.value = ''; }} />
      <input ref={archivos} type="file" accept={ACEPTA} multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = ''; }} />
    </section> : <p className="aviso-lectura docs-pausa" role="status"><span>{tr(datos.aviso || '')}</span></p>}
    {aviso && <p className="docs-aviso" role="status">{aviso}</p>}

    {datos.peticiones?.length > 0 && <section className="docs-bloque" aria-labelledby="docs-pide">
      <h2 id="docs-pide" className="docs-h">{tr('Tu gestoría te pide')}</h2>
      <ul className="grupo-lista">{datos.peticiones.map((p) => <li key={p.id} className="fila docs-peticion">
        <span className="txt"><strong>{p.texto}</strong><small>{[p.por, fechaCorta(String(p.creada).slice(0, 10))].filter(Boolean).join(' · ')}</small></span>
        {datos.abierto && <button type="button" className="boton sec" onClick={() => elegir(p.id)} disabled={Boolean(subiendo)}>{tr('Subir')}</button>}
      </li>)}</ul>
    </section>}

    {datos.correo && <section className="docs-bloque docs-correo" aria-labelledby="docs-correo-t">
      <h2 id="docs-correo-t" className="docs-h">{tr('Reenvía tus facturas por correo')}</h2>
      <p>{tr('Las facturas que te lleguen por email, reenvíalas a esta dirección desde tu correo:')}</p>
      <p className="docs-dir"><code>{datos.correo}</code><button type="button" className="boton sec" onClick={copiar}>{copiado ? tr('Copiada') : tr('Copiar')}</button></p>
    </section>}

    <section className="docs-bloque" aria-labelledby="docs-enviados">
      <h2 id="docs-enviados" className="docs-h">{tr('Lo que has enviado')}</h2>
      {datos.documentos.length ? <ul className="grupo-lista docs-lista">{datos.documentos.map((d) => <li key={d.id} className="fila">
        <a className="txt" href={`/api/documentos/archivo?id=${encodeURIComponent(d.id)}`} target="_blank" rel="noopener">
          <strong>{d.tercero || d.nombre}</strong>
          <small>{[d.fecha ? fechaCorta(d.fecha) : fechaCorta(String(d.recibido).slice(0, 10)), d.tipo === 'ingreso' ? tr('Venta') : d.tipo === 'gasto' ? tr('Gasto') : null, d.total ? eur(d.total) : null, d.origen === 'correo' ? tr('Por correo') : null].filter(Boolean).join(' · ')}</small>
        </a>
        <span className={`docs-estado e-${d.estado}`}>{tr(ESTADO[d.estado] || '')}</span>
        {datos.abierto && d.estado !== 'revisado' && (quitar === d.id
          ? <button type="button" className="boton peligro docs-quitar" onClick={() => borrar(d.id)}>{tr('¿Quitar?')}</button>
          : <button type="button" className="docs-x" aria-label={tr('Quitar {nombre}', { nombre: d.nombre })} onClick={() => setQuitar(d.id)}>×</button>)}
      </li>)}</ul> : <Vacio compacto icono="gasto" titulo={tr('Aún no has enviado nada')}><p>{tr('Haz una foto de un ticket o sube el PDF de una factura y le llegará a tu gestoría.')}</p></Vacio>}
    </section>

    {datos.cupo && datos.cupo.restantes < 10 && <p className="docs-nota">{tr('Quedan {n} lecturas automáticas este mes: lo que subas después lo completará tu gestoría.', { n: datos.cupo.restantes })}</p>}
    <form method="post" action="/api/logout" className="docs-salir"><button type="submit" className="boton sec">{tr('Cerrar sesión')}</button></form>
  </main>;
}

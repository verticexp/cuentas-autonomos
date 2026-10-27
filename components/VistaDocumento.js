'use client';

import { useT } from '@/components/Idioma';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHojaDeslizable } from '@/components/useHojaDeslizable';
import { eur, fechaCorta } from '@/lib/formato';
import '@/app/hoja.css';
import '@/app/documento-vista.css';

// Vista previa de una factura o un gasto sin salir de donde se está (el chat, la ficha del cliente): sus datos y su
// archivo (el PDF de la factura o la foto o PDF del ticket). En el móvil, una hoja desde abajo; en el ordenador, una
// ventana en el centro.
// base: la URL de la API con lo que ya lleve (api/despacho/documento?empresa=… o api/tu-despacho/documento?);
// doc: { tipo: 'factura' | 'gasto', id } o null (cerrada); acciones(d): botones de más («Pedir el ticket»…).
export default function VistaDocumento({ base, doc, alCerrar, acciones }) {
  const tr = useT();
  const panel = useRef(null);
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const abierta = Boolean(doc);
  const cerrar = useHojaDeslizable(panel, abierta, alCerrar);
  const url = (extra = '') => doc && `${base}${base.includes('?') ? '&' : '?'}tipo=${doc.tipo}&id=${encodeURIComponent(doc.id)}${extra}`;

  useEffect(() => {
    if (!doc) return undefined;
    let vivo = true;
    setD(null); setError('');
    fetch(url(), { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!vivo) return;
      if (r.ok) setD(j); else setError(j.error || 'No se ha podido abrir el documento');
    }).catch(() => vivo && setError('No se ha podido abrir el documento. Revisa la conexión.'));
    return () => { vivo = false; };
  }, [doc?.tipo, doc?.id, base]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abierta: el fondo no se mueve y Escape la cierra.
  useEffect(() => {
    if (!abierta) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    panel.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = anterior; };
  }, [abierta, cerrar]);

  if (!abierta) return null;
  const archivo = url('&archivo=1');
  const titulo = d?.titulo || (doc.tipo === 'factura' ? 'Factura' : 'Gasto');
  return createPortal(
    <div className="hoja doc-hoja">
      <button type="button" className="hoja-fondo" aria-label={tr('Cerrar')} tabIndex={-1} onClick={cerrar} />
      <div className="hoja-panel" role="dialog" aria-modal="true" aria-label={tr(titulo)} ref={panel} tabIndex={-1}>
        <span className="hoja-asa" aria-hidden />
        <div className="doc-cabecera">
          <div>
            <p className="hoja-t">{tr(titulo)}</p>
            {d && <p className="doc-sub">{[d.tipo === 'gasto' && d.numero ? tr('Nº {numero}', { numero: d.numero }) : '', d.tipo === 'factura' ? d.contraparte : '', fechaCorta(d.fecha)].filter(Boolean).join(' · ')}</p>}
          </div>
          <button type="button" className="doc-x" aria-label={tr('Cerrar')} onClick={cerrar}>×</button>
        </div>
        {error && <p className="error" role="alert">{tr(error)}</p>}
        {!d && !error && <div className="doc-cargando" role="status" aria-label={tr('Cargando')} />}
        {d && <>
          <div className="doc-archivo">
            {!d.archivo ? <p className="doc-sin">{(d.tipo === 'gasto' ? tr('Este gasto no tiene ticket ni factura adjuntos.') : tr('Este documento no tiene PDF.'))}</p>
              : d.archivo.tipo.startsWith('image/') ? <img src={archivo} alt={tr('Justificante de {documento}', { documento: tr(titulo) })} />
                : d.archivo.tipo === 'application/pdf' ? <iframe src={`${archivo}#toolbar=0&view=FitH`} title={tr('PDF de {documento}', { documento: tr(titulo) })} />
                  : <p className="doc-sin">{tr('Factura electrónica (XML): descárgala para abrirla.')}</p>}
          </div>
          {d.concepto && <p className="doc-concepto">{d.concepto}</p>}
          {d.lineas?.length > 1 && <ul className="doc-lineas">{d.lineas.slice(0, 6).map((l, i) => <li key={i}><span>{l.concepto}</span><span>{l.cantidad} × {eur(l.precio)}</span></li>)}{d.lineas.length > 6 && <li><span>{tr('y {cantidad} conceptos más', { cantidad: d.lineas.length - 6 })}</span></li>}</ul>}
          <dl className="doc-cifras">
            <div><dt>{tr('Base')}</dt><dd>{eur(d.base)}</dd></div>
            <div><dt>IVA</dt><dd>{eur(d.iva)}</dd></div>
            {d.irpf > 0 && <div><dt>{tr('Retención')}</dt><dd>−{eur(d.irpf)}</dd></div>}
            <div className="total"><dt>{tr('Total')}</dt><dd>{eur(d.total)}</dd></div>
            <div><dt>{tr('Estado')}</dt><dd>{(d.vence ? tr('{estado} · vence el {fecha}', { estado: tr(d.estado), fecha: tr(fechaCorta(d.vence)) }) : tr(d.estado))}</dd></div>
            {d.tipo === 'gasto' && d.contraparte && <div><dt>{tr('Proveedor')}</dt><dd>{d.contraparte}{(d.nif ? ` · ${d.nif}` : "")}</dd></div>}
            {d.tipo === 'factura' && d.nif && <div><dt>{tr('Cliente')}</dt><dd>{d.contraparte} · {d.nif}</dd></div>}
          </dl>
          <div className="doc-botones">
            {d.archivo && <a className="boton sec" href={archivo} target="_blank" rel="noopener">{(d.archivo.tipo === 'application/xml' ? tr('Descargar') : tr('Abrir en grande'))}</a>}
            {acciones?.(d, cerrar)}
          </div>
        </>}
      </div>
    </div>,
    document.body
  );
}

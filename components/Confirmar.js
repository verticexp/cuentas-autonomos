'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import '@/app/hoja.css';

// Serializar las peticiones evita superponer diálogos y perder la respuesta o el foco.
let cola = Promise.resolve();
function abrir(opciones) {
  const resultado = cola.then(() => new Promise((resolver) => {
    const origen = document.activeElement;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let resuelto = false;
    const cerrar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      root.unmount();
      host.remove();
      if (origen?.isConnected) origen.focus?.({ preventScroll: true });
      resolver(valor);
    };
    root.render(<Hoja {...opciones} cerrar={cerrar} />);
  }));
  cola = resultado.then(() => undefined, () => undefined);
  return resultado;
}

export function confirmar({ titulo = 'Confirmar acción', texto, aceptar = 'Continuar', cancelar = 'Cancelar', peligro = false }) {
  return abrir({ titulo, texto, aceptar, cancelar, peligro });
}

export function pedirTexto({ titulo, texto, etiqueta = 'Texto', aceptar = 'Aceptar', valor = '', soloLectura = false, peligro = false }) {
  return abrir({ titulo, texto, etiqueta, aceptar, valor, soloLectura, peligro, entrada: true, cancelar: 'Cancelar' });
}

export function avisar(texto) {
  return abrir({ titulo: 'No se ha podido completar la acción', texto, aceptar: 'Entendido', aviso: true });
}

function Hoja({ titulo, texto, aceptar, cancelar, peligro, entrada, etiqueta, valor, soloLectura, aviso, cerrar }) {
  const id = useId();
  const panel = useRef(null);
  const capa = useRef(null);
  const [contenido, setContenido] = useState(valor || '');
  const cancelarHoja = () => cerrar(entrada ? null : false);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const hermanos = [...document.body.children].filter((el) => el !== capa.current);
    const previos = hermanos.map((el) => [el, el.inert]);
    hermanos.forEach((el) => { el.inert = true; });
    const controles = () => [...panel.current.querySelectorAll('input, textarea, button, [tabindex="0"]')].filter((el) => !el.disabled);
    const inicial = entrada ? panel.current.querySelector('input') : peligro ? panel.current.querySelector('[data-cancelar]') : controles()[0];
    inicial?.focus();
    if (soloLectura) inicial?.select();
    const teclas = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cerrar(entrada ? null : false); }
      if (e.key !== 'Tab') return;
      const lista = controles(), primero = lista[0], ultimo = lista.at(-1);
      if (e.shiftKey && (document.activeElement === primero || !panel.current.contains(document.activeElement))) { e.preventDefault(); ultimo?.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !panel.current.contains(document.activeElement))) { e.preventDefault(); primero?.focus(); }
    };
    const enfocar = (e) => { if (!panel.current.contains(e.target)) controles()[0]?.focus(); };
    document.addEventListener('keydown', teclas, true);
    document.addEventListener('focusin', enfocar);
    return () => {
      document.removeEventListener('keydown', teclas, true);
      document.removeEventListener('focusin', enfocar);
      previos.forEach(([el, inert]) => { el.inert = inert; });
      document.body.style.overflow = overflow;
    };
  }, [cerrar, entrada, peligro, soloLectura]);
  return createPortal(
    <div className="hoja confirmar-hoja" ref={capa}>
      <button type="button" className="hoja-fondo" aria-label="Cerrar diálogo" tabIndex={-1} onClick={cancelarHoja} />
      <form ref={panel} className="hoja-panel formulario" role={aviso || peligro ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={`${id}-titulo`} aria-describedby={texto ? `${id}-texto` : undefined}
        onSubmit={(e) => { e.preventDefault(); cerrar(entrada ? contenido : true); }}>
        <span className="hoja-asa" aria-hidden="true" />
        <h2 className="hoja-t" id={`${id}-titulo`}>{titulo}</h2>
        {texto && <p id={`${id}-texto`} className="confirmar-texto">{texto}</p>}
        {entrada && <label htmlFor={`${id}-entrada`}>{etiqueta}<input id={`${id}-entrada`} className="campo" value={contenido} readOnly={soloLectura} onChange={(e) => setContenido(e.target.value)} /></label>}
        <div className="confirmar-botones">
          {!aviso && <button type="button" className="boton sec" data-cancelar onClick={cancelarHoja}>{cancelar}</button>}
          <button type="submit" className={peligro ? 'boton confirmar-peligro' : 'boton'}>{aceptar}</button>
        </div>
      </form>
    </div>, document.body
  );
}

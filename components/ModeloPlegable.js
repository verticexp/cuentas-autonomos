'use client';

import { useEffect, useRef } from 'react';

// Cada modelo de Impuestos. En el móvil es una fila (número, nombre, cómo va y el importe) que se abre al tocarla
// y enseña el desglose por trimestres; igual en el ordenador.
// Se abre solo al llegar con su ancla, como el #m303 de «Toca presentar».
// `estado`: 'listo' | 'fuera' | 'hecho' para colorear la línea de estado; `dato`: importe ya en texto; `favor`, en verde (a compensar o a devolver);
// `informativo`: los modelos que solo resumen (349, 347, 390, 180, 190, 193) dicen «No se paga» en vez de un importe que parezca un pago.
export default function ModeloPlegable({ id, num, nombre, estado, detalle, dato, favor, informativo, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const abrir = () => { if (window.location.hash === `#${id}` && ref.current) ref.current.open = true; };
    // Un enlace a la misma ancla que ya está en la dirección no lanza «hashchange»: se abre también al tocarlo.
    const tocar = (e) => { if (e.target.closest?.(`a[href="#${id}"]`) && ref.current) ref.current.open = true; };
    // En el ordenador, al abrir un modelo se ven ya sus casillas (en el móvil siguen plegadas).
    if (window.matchMedia('(min-width: 900px)').matches && ref.current) ref.current.querySelectorAll('details.casillas-plegable').forEach((d) => { d.open = true; });
    abrir();
    window.addEventListener('hashchange', abrir);
    document.addEventListener('click', tocar);
    return () => { window.removeEventListener('hashchange', abrir); document.removeEventListener('click', tocar); };
  }, [id]);
  return (
    <section className="bloque modelo" id={id}>
      <details ref={ref} className="modelo-plegable">
        <summary>
          <span className="modelo-num">{num}</span>
          <span className="txt">{nombre}{detalle && <small className={estado ? `est-${estado}` : undefined}>{detalle}</small>}</span>
          {informativo ? <span className="modelo-dato info">No se paga</span> : dato && <strong className={`modelo-dato${favor ? ' favor' : ''}`}>{dato}</strong>}
        </summary>
        {children}
      </details>
    </section>
  );
}

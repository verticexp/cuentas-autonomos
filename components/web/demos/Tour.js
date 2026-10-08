'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';
import Pantalla from '@/components/web/demos/Pantallas';

const PASOS = [
  { p: 'factura', icono: 'factura', t: 'Factura en segundos', d: 'Cliente, conceptos y listo. IVA, IRPF y Verifactu, calculados.', href: '/funciones/facturacion' },
  { p: 'gasto', icono: 'gasto', t: 'Gastos con una foto', d: 'La IA lee el ticket y rellena proveedor, base e IVA.', href: '/funciones/gastos' },
  { p: 'impuestos', icono: 'impuestos', t: 'Impuestos sin sustos', d: 'Tus modelos calculados y lo que debes apartar.', href: '/funciones/impuestos' },
  { p: 'conciliacion', icono: 'banco', t: 'Extractos que se cuadran solos', d: 'Sube el extracto y Netto empareja cobros y pagos.', href: '/funciones/banco' },
  { p: 'prevision', icono: 'tesoreria', t: 'Caja a 12 meses vista', d: 'Cobros, pagos, impuestos y nóminas, mes a mes.', href: '/funciones/tesoreria' },
  { p: 'equipo', icono: 'equipo', t: 'Tu equipo, con permisos', d: 'Nóminas, jornada y cada uno viendo lo suyo.', href: '/funciones/equipo' },
];
const DURA = 6000;

// Recorrido por el producto: avanza solo, se pausa al pasar el ratón y se puede elegir cada paso.
export default function Tour() {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [visible, setVisible] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(caja.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (pausa || !visible || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % PASOS.length), DURA);
    return () => clearTimeout(t);
  }, [i, pausa, visible]);

  const corre = !pausa && visible;
  return (
    <div className="web-tour" ref={caja} onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <div className="web-tour-lista" role="tablist" aria-label="Recorrido por Netto">
        {PASOS.map((p, k) => (
          <button key={p.p} role="tab" aria-selected={k === i} className={k === i ? 'on' : undefined} onClick={() => setI(k)}>
            <span className="web-tour-ico"><Icono n={p.icono} /></span>
            <span className="web-tour-txt"><b>{p.t}</b><small>{p.d}</small></span>
            {k === i && <span className={`web-tour-progreso${corre ? ' corre' : ''}`} style={{ '--dura': `${DURA}ms` }} key={`${i}${corre}`} />}
          </button>
        ))}
      </div>
      <div className="web-tour-escena">
        <div className="web-tour-fondo" aria-hidden />
        <div className="web-tour-pantalla" key={PASOS[i].p}><Pantalla tipo={PASOS[i].p} /></div>
        <Link href={PASOS[i].href} className="web-tour-mas">Saber más<Icono n="flecha" className="ico web-flecha" /></Link>
      </div>
    </div>
  );
}

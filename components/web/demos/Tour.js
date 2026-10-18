'use client';

import Link from '@/components/web/EnlacePublico';
import { useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';
import Pantalla from '@/components/web/demos/Pantallas';

const PASOS = [
  { p: 'factura', icono: 'factura', t: 'Factura en segundos', d: 'Cliente, conceptos y listo. IVA, IRPF y Verifactu, calculados.', href: '/funciones/facturacion' },
  { p: 'gasto', icono: 'gasto', t: 'Gastos con una foto', d: 'La IA lee el ticket y rellena proveedor, base e IVA.', href: '/funciones/gastos' },
  { p: 'impuestos', icono: 'impuestos', t: 'Impuestos sin sustos', d: 'Tus modelos calculados y lo que debes apartar.', href: '/funciones/impuestos' },
  { p: 'contabilidad', icono: 'contabilidad', t: 'Contabilidad que se hace sola', d: 'Libros registro, balance y cuentas anuales.', href: '/funciones/contabilidad' },
  { p: 'conciliacion', icono: 'banco', t: 'Extractos que se cuadran solos', d: 'Netto empareja cobros y pagos; lo que falta, a revisar.', href: '/funciones/banco' },
  { p: 'prevision', icono: 'tesoreria', t: 'Caja a 12 meses vista', d: 'Cobros, pagos, impuestos y nóminas, mes a mes.', href: '/funciones/tesoreria' },
  { p: 'equipo', icono: 'equipo', t: 'Tu equipo, con permisos', d: 'Nóminas, jornada y cada uno viendo lo suyo.', href: '/funciones/equipo' },
];
const DURA = 6000;

// Recorrido por el producto: avanza solo, se pausa al pasar el ratón y se puede elegir cada paso.
export default function Tour() {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const [quieto, setQuieto] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [foco, setFoco] = useState(false);
  const botones = useRef([]);
  const caja = useRef(null);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const preferencias = () => setQuieto(media.matches);
    const visibilidad = () => setOculto(document.hidden);
    preferencias(); visibilidad();
    media.addEventListener('change', preferencias);
    document.addEventListener('visibilitychange', visibilidad);
    return () => { media.removeEventListener('change', preferencias); document.removeEventListener('visibilitychange', visibilidad); };
  }, []);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(caja.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (pausa || hover || foco || oculto || quieto || !visible) return;
    const t = setTimeout(() => setI((x) => (x + 1) % PASOS.length), DURA);
    return () => clearTimeout(t);
  }, [i, pausa, hover, foco, oculto, quieto, visible]);

  const corre = !pausa && !hover && !foco && !oculto && !quieto && visible;
  function elegir(k) { setI(k); setPausa(true); }
  function teclas(e, k) {
    let n;
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) n = (k + 1) % PASOS.length;
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) n = (k + PASOS.length - 1) % PASOS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = PASOS.length - 1;
    else return;
    e.preventDefault(); elegir(n); botones.current[n]?.focus();
  }
  return (
    <div className="web-tour" ref={caja} onFocusCapture={() => setFoco(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFoco(false); }} onMouseEnter={() => { if (matchMedia('(hover: hover) and (pointer: fine)').matches) setHover(true); }} onMouseLeave={() => setHover(false)}>
      <div className="web-tour-lista" role="tablist" aria-label="Recorrido por Netto">
        {PASOS.map((p, k) => (
          <button key={p.p} id={`tour-${p.p}`} aria-controls="tour-pantalla" tabIndex={k === i ? 0 : -1} ref={(el) => { botones.current[k] = el; }} onKeyDown={(e) => teclas(e, k)} role="tab" aria-selected={k === i} className={k === i ? 'on' : undefined} onClick={() => elegir(k)}>
            <span className="web-tour-ico"><Icono n={p.icono} /></span>
            <span className="web-tour-txt"><b>{p.t}</b><small>{p.d}</small></span>
            {k === i && <span className={`web-tour-progreso${corre ? ' corre' : ''}`} style={{ '--dura': `${DURA}ms` }} key={`${i}${corre}`} />}
          </button>
        ))}
      </div>
      <div className="web-tour-escena">
        <div className="web-tour-fondo" aria-hidden />
        <div id="tour-pantalla" role="tabpanel" aria-labelledby={`tour-${PASOS[i].p}`} className="web-tour-pantalla" key={PASOS[i].p}><Pantalla tipo={PASOS[i].p} /></div>
        {!quieto && <button type="button" className="web-tour-pausa" onClick={() => { setPausa(!pausa); if (pausa) setFoco(false); }}>{pausa ? 'Reproducir recorrido' : 'Pausar recorrido'}</button>}
        <Link href={PASOS[i].href} className="web-tour-mas">Saber más<Icono n="flecha" className="ico web-flecha" /></Link>
      </div>
    </div>
  );
}

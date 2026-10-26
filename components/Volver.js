'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { anterior, instalarHistorial, volverA } from '@/lib/transicion';
import { salirSinGuardar } from './useCambiosSinGuardar';
import { esSeccion } from './secciones';

// Cómo se llama cada pantalla a la que se puede volver (para el botón: «‹ Más», «‹ Facturas»…).
const NOMBRES = {
  '/': 'Resumen', '/mas': 'Más', '/facturas': 'Facturas', '/gastos': 'Gastos', '/ajustes': 'Ajustes', '/presupuestos': 'Presupuestos',
  '/tesoreria': 'Tesorería', '/banco': 'Banco', '/inventario': 'Inventario', '/albaranes': 'Pedidos y albaranes', '/nominas': 'Equipo y nóminas',
  '/proyectos': 'Proyectos', '/cartera': 'Cartera de cobros', '/analisis': 'Análisis', '/contabilidad': 'Contabilidad', '/modelos': 'Impuestos', '/asistente': 'Pregunta a Fisquo', '/usuarios': 'Usuarios',
  '/jornada': 'Registro de jornada', '/facturas/recurrentes': 'Facturas recurrentes', '/facturas/caja': 'Caja', '/facturas/catalogo': 'Catálogo',
  '/gastos/proveedores': 'Proveedores', '/gastos/bandeja': 'Por revisar', '/clientes': 'Clientes', '/ajustes/gestoria': 'Tu gestoría', '/tu-gestoria': 'Mensajes', '/despacho': 'Mi despacho', '/despacho/mensajes': 'Mensajes', '/despacho/plazos': 'Plazos',
};

// «Atrás»: vuelve a la pantalla de la que se viene (el botón dice su nombre); si se abrió esta directamente, va al destino de siempre.
// Sin JavaScript sigue siendo un enlace a ese destino. Desde un formulario con cambios sin guardar, pregunta antes.
export default function Volver({ href, children = 'Atrás' }) {
  const router = useRouter();
  // Las pantallas de la barra lateral no llevan «atrás» en el ordenador (volver-movil, app/mk.css), como Facturas o Gastos.
  const seccion = esSeccion(usePathname());
  const [etiqueta, setEtiqueta] = useState(children);
  // La gestoría acaba de entrar en las cuentas de un cliente desde Mi despacho (PanelDespacho.js entrarEn): en esa primera
  // pantalla, «atrás» vuelve a la ficha del cliente, no al Resumen del cliente.
  const [entrada, setEntrada] = useState('');
  useEffect(() => {
    instalarHistorial();
    const antes = anterior();
    let desde = '';
    try { const e = JSON.parse(sessionStorage.getItem('fisquo-entrada') || 'null'); if (!antes && e?.a && e.a.split(/[?#]/)[0] === location.pathname) desde = e.desde; } catch {}
    setEntrada(desde);
    if (desde) setEtiqueta('Ficha del cliente');
    else if (antes) setEtiqueta(NOMBRES[antes.split(/[?#]/)[0]] || 'Atrás');
    else setEtiqueta(children);
    // Con «‹ Ficha del cliente» aquí, la barra de arriba no repite «‹ Mi despacho» (app/despacho.css): dos atrás seguidos.
    const raiz = document.documentElement;
    if (desde) raiz.dataset.entradaCliente = '1';
    return () => { delete raiz.dataset.entradaCliente; };
  }, [children]);
  const alPulsar = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    // A Mi despacho, con la página entera: la barra y el aviso de arriba son los del despacho.
    if (entrada) { window.location.assign(entrada); return; }
    salirSinGuardar(() => volverA(router, href));
  };
  return <Link href={entrada || href} className={`volver${seccion && !entrada ? ' volver-movil' : ''}`} onClick={alPulsar}>‹ <span className="volver-texto">{etiqueta}</span></Link>;
}

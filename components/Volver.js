'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { anterior, instalarHistorial, volverA } from '@/lib/transicion';

// Cómo se llama cada pantalla a la que se puede volver (para el botón: «‹ Más», «‹ Facturas»…).
const NOMBRES = {
  '/': 'Resumen', '/mas': 'Más', '/facturas': 'Facturas', '/gastos': 'Gastos', '/ajustes': 'Ajustes', '/presupuestos': 'Presupuestos',
  '/tesoreria': 'Tesorería', '/banco': 'Banco', '/inventario': 'Inventario', '/albaranes': 'Pedidos y albaranes', '/nominas': 'Nóminas',
  '/proyectos': 'Proyectos', '/cartera': 'Cartera', '/analisis': 'Análisis', '/contabilidad': 'Contabilidad', '/modelos': 'Impuestos', '/asistente': 'Netto', '/usuarios': 'Usuarios',
  '/jornada': 'Jornada', '/facturas/recurrentes': 'Recurrentes', '/facturas/caja': 'Caja', '/facturas/catalogo': 'Catálogo',
  '/gastos/proveedores': 'Proveedores', '/clientes': 'Clientes', '/ajustes/gestoria': 'Tu gestoría',
};

// «Atrás»: vuelve a la pantalla de la que se viene (el botón dice su nombre); si se abrió esta directamente, va al destino de siempre.
// Sin JavaScript sigue siendo un enlace a ese destino.
export default function Volver({ href, children = 'Atrás' }) {
  const router = useRouter();
  const [etiqueta, setEtiqueta] = useState(children);
  useEffect(() => {
    instalarHistorial();
    const antes = anterior();
    if (antes) setEtiqueta(NOMBRES[antes.split(/[?#]/)[0]] || 'Atrás');
    else setEtiqueta(children);
  }, [children]);
  const alPulsar = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    volverA(router, href);
  };
  return <Link href={href} className="volver" onClick={alPulsar}>‹ {etiqueta}</Link>;
}

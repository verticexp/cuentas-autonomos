'use client';

import { usePathname } from 'next/navigation';
import TabBar from '@/components/TabBar';
import NavDespacho from '@/components/NavDespacho';

// La barra de la app según dónde se está, mirado en el navegador: el layout raíz no se vuelve a pintar al navegar, así
// que al pasar de la empresa a Mi despacho (o al revés) sin recargar se quedaba la barra de antes.
// despacho: props de NavDespacho (o null si no es de un despacho); tabbar: props de TabBar (o null sin sesión).
export default function Barra({ despacho, tabbar }) {
  const enDespacho = Boolean(despacho) && /^\/despacho(\/|$)/.test(usePathname() || '');
  if (enDespacho) return <NavDespacho {...despacho} />;
  return tabbar ? <TabBar {...tabbar} /> : null;
}

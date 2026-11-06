'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { escucharCompras, hayCompras, sincronizarApple } from '@/lib/comprasNativas';

// App de iOS con sesión (app/layout.js): al abrir la app, las suscripciones del App Store vigentes en este ID de Apple
// van al servidor una vez por sesión (por si se perdió un aviso de Apple o la compra no llegó a guardarse), y las
// renovaciones o compras que se completan con la app abierta, según llegan (lib/comprasNativas.js). Si cambia el plan,
// la pantalla se refresca para quitar o poner el modo de solo lectura.
const MARCA = 'fisquo-compras';

export default function SincronizarCompras() {
  const router = useRouter();
  useEffect(() => {
    if (!hayCompras()) return undefined;
    const cambio = (r) => { if (r?.ok && r.cambiado) router.refresh(); };
    const dejar = escucharCompras(cambio);
    let hecha = false;
    try { hecha = Boolean(sessionStorage.getItem(MARCA)); sessionStorage.setItem(MARCA, '1'); } catch { /* sin almacenamiento */ }
    if (!hecha) sincronizarApple().then(cambio).catch(() => {});
    return dejar;
  }, [router]);
  return null;
}

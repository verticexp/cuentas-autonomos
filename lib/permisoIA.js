'use client';

import { esApp } from '@/lib/app';

// Apple (norma 5.1.2(i)) exige decir con claridad que los datos se envían a una IA de terceros y pedir permiso antes.
// En la app de iOS se pregunta una vez, antes de la primera lectura de un ticket o pregunta al asistente; en el
// navegador no cambia nada (lo explica la política de privacidad). Si dice que no, no se envía nada.
const CLAVE = 'netto-permiso-ia';
export const TEXTO_PERMISO_IA = 'Para leer tus tickets y responder a tus preguntas, Kontix envía la imagen o la pregunta, con los datos de tus cuentas que hagan falta, a Anthropic, el proveedor de inteligencia artificial de Kontix. Anthropic no los usa para entrenar sus modelos. ¿Permites que Kontix use la IA?';
export const NO_IA = 'Sin tu permiso, Kontix no usa la IA. Puedes rellenar los datos a mano.';

export function permisoIA() {
  if (typeof window === 'undefined' || !esApp(navigator.userAgent)) return true;
  try { if (localStorage.getItem(CLAVE)) return true; } catch { /* sin almacenamiento: se pregunta cada vez */ }
  const si = window.confirm(TEXTO_PERMISO_IA);
  if (si) { try { localStorage.setItem(CLAVE, new Date().toISOString()); } catch { /* nada */ } }
  return si;
}

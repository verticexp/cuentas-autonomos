// Navegar con transición de vista: «adelante» (entra por la derecha), «atras», «subir» (como una hoja),
// «fundido» (pestañas) y «abrir» (la fila se convierte en la cabecera). Sin soporte o con movimiento reducido, navega sin más.
export function navegar(router, href, tipo = 'adelante', antes) {
  if (typeof document === 'undefined' || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    router.push(href);
    return;
  }
  antes?.();
  const html = document.documentElement;
  html.dataset.vt = tipo;
  const t = document.startViewTransition(() => new Promise((listo) => {
    window.__vtLista = listo;
    setTimeout(listo, 700); // si la pantalla nueva tarda, no se congela esperando
    router.push(href);
  }));
  t.finished.finally(() => { window.__vtLista = null; delete html.dataset.vt; });
}

// Para onClick de enlaces: deja pasar cmd/ctrl-clic (abrir en otra pestaña).
export const alPulsar = (router, href, tipo, antes) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
  e.preventDefault();
  navegar(router, href, tipo, antes);
};

// Entrada de la app (tras la pantalla de inicio o al desbloquear): el contenido sube en cascada una sola vez.
export function entrada() {
  if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const html = document.documentElement;
  html.dataset.entrada = '1';
  setTimeout(() => delete html.dataset.entrada, 1100);
}

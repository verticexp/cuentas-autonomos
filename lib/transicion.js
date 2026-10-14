// Navegar con transición de vista: «adelante» (entra por la derecha), «atras», «subir» (como una hoja),
// «fundido» (pestañas) y «abrir» (la fila se convierte en la cabecera). Sin soporte o con movimiento reducido, navega sin más.
// reemplazar: sustituye la pantalla actual en el historial (tras crear algo: «atrás» no vuelve al formulario ya enviado).
export function navegar(router, href, tipo = 'adelante', antes, reemplazar = false) {
  const ir = () => { if (reemplazar) historia.reemplazando = true; router[reemplazar ? 'replace' : 'push'](href); };
  hacerConTransicion(tipo, antes, ir);
}

function hacerConTransicion(tipo, antes, accion) {
  if (typeof document === 'undefined' || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    accion();
    return;
  }
  antes?.();
  const html = document.documentElement;
  html.dataset.vt = tipo;
  const t = document.startViewTransition(() => new Promise((listo) => {
    window.__vtLista = listo;
    setTimeout(listo, 700); // si la pantalla nueva tarda, no se congela esperando
    accion();
  }));
  t.finished.finally(() => { window.__vtLista = null; delete html.dataset.vt; });
}

// Qué pantalla había antes de la actual (la barra de la app avisa en cada cambio, components/TabBar.js), para que «Atrás»
// vuelva de verdad a ella (router.back) en vez de apilar otra vez la misma: si no, el botón «atrás» del móvil o del
// navegador quedaba dando vueltas entre dos pantallas.
const historia = { actual: null, anterior: null, reemplazando: false };
const sinParametros = (h) => String(h).split(/[?#]/)[0];
export function seguirRuta(path) {
  if (historia.actual === path) return;
  if (historia.reemplazando) historia.reemplazando = false; // la pantalla anterior sigue siendo la de antes de la sustituida
  else historia.anterior = historia.actual;
  historia.actual = path;
}

// «Atrás» a una pantalla: si es de la que se viene, se retrocede en el historial (conserva filtros y posición); si no, se navega a ella.
export function volverA(router, href, tipo = 'atras') {
  if (historia.anterior && historia.anterior === sinParametros(href)) hacerConTransicion(tipo, undefined, () => router.back());
  else navegar(router, href, tipo);
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

// Navegar con transición de vista: «adelante» (entra por la derecha), «atras», «subir» (como una hoja),
// «fundido» (pestañas) y «abrir» (la fila se convierte en la cabecera). Sin soporte o con movimiento reducido, navega sin más.
// reemplazar: sustituye la pantalla actual en el historial (tras crear algo: «atrás» no vuelve al formulario ya enviado).
export function navegar(router, href, tipo = 'adelante', antes, reemplazar = false) {
  const ir = () => router[reemplazar ? 'replace' : 'push'](href);
  hacerConTransicion(tipo, antes, ir);
}

function hacerConTransicion(tipo, antes, accion) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    accion();
    return;
  }
  // Movimiento reducido: como en iOS, nada se desliza, pero la pantalla cambia con un fundido corto en vez de un corte seco.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) tipo = 'fundido';
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

// Espejo de la pila del historial del navegador: cada entrada lleva su posición (__idx dentro de history.state) y se guarda su
// dirección. Así se sabe con exactitud qué hay detrás de la pantalla actual, la haya puesto quien la haya puesto (enlaces, router.push,
// router.replace, el botón atrás del móvil o del navegador): «‹ Atrás» retrocede de verdad cuando lo de atrás es su destino, y si no,
// sustituye la pantalla actual por el destino en vez de apilar otra más (que dejaba el atrás dando vueltas entre dos pantallas).
const CLAVE_PILA = 'netto-pila';
const historia = { pila: [], idx: 0, instalado: false };
const aqui = () => `${location.pathname}${location.search}`;
function guardarPila() { try { sessionStorage.setItem(CLAVE_PILA, JSON.stringify(historia.pila)); } catch { /* sin sessionStorage: se sigue sin guardar */ } }

export function instalarHistorial() {
  if (typeof window === 'undefined' || historia.instalado) return;
  historia.instalado = true;
  historia.idx = Number.isInteger(history.state?.__idx) ? history.state.__idx : 0;
  try { historia.pila = JSON.parse(sessionStorage.getItem(CLAVE_PILA) || '[]'); } catch { historia.pila = []; }
  if (!Array.isArray(historia.pila)) historia.pila = [];
  // Si lo guardado no corresponde a esta pantalla (otra pestaña, otra sesión), se empieza de cero: lo de atrás se desconoce.
  if (historia.pila[historia.idx] !== aqui()) historia.pila = [];
  historia.pila[historia.idx] = aqui();
  const empujar = history.pushState.bind(history), sustituir = history.replaceState.bind(history);
  const con = (estado, idx) => (estado && typeof estado === 'object' ? { ...estado, __idx: idx } : { __idx: idx });
  // La entrada en la que se está (puesta antes de instalar esto, sin posición) se marca con la suya.
  sustituir(con(history.state, historia.idx), '', location.href);
  // La posición de la entrada en la que se está la dice su propio estado (es lo único fiable: Next sustituye el estado tras un
  // popstate antes de que este módulo se entere); si no la tiene (entrada de antes), la que se llevaba.
  const actual = () => (Number.isInteger(history.state?.__idx) ? history.state.__idx : historia.idx);
  history.pushState = (estado, titulo, url) => {
    // Cambiar de periodo, año, filtro o pestaña dentro de la misma pantalla no apila otra entrada: «atrás» sale de la pantalla
    // (a «Más», a la lista…) en vez de deshacer uno a uno los cambios de 1T, 2T, Año…
    if (url != null && new URL(url, location.href).pathname === location.pathname) {
      history.replaceState(estado, titulo, url);
      return;
    }
    historia.idx = actual() + 1;
    historia.pila.length = historia.idx; // lo de «adelante» se pierde
    empujar(con(estado, historia.idx), titulo, url);
    historia.pila[historia.idx] = aqui();
    guardarPila();
  };
  history.replaceState = (estado, titulo, url) => {
    historia.idx = actual();
    sustituir(con(estado, historia.idx), titulo, url);
    historia.pila[historia.idx] = aqui();
    guardarPila();
  };
  window.addEventListener('popstate', () => {
    let i = history.state?.__idx;
    if (!Number.isInteger(i)) {
      // Una entrada de antes de instalar esto (o de otra página sin ella): se deduce por su dirección, la de atrás o la de delante.
      i = [historia.idx - 1, historia.idx + 1].find((k) => historia.pila[k] === aqui()) ?? historia.idx;
    }
    historia.idx = i;
    historia.pila[historia.idx] = aqui();
    // Next sustituye el estado tras un popstate: con la posición ya puesta, no vuelve a apuntar a la de antes.
    sustituir(con(history.state, historia.idx), '', location.href);
    guardarPila();
  });
}

// Posición de la pantalla actual en el historial (0 la primera de esta pestaña del navegador).
export const posicion = () => historia.idx;

// La dirección de la pantalla anterior (o null si no se sabe).
export const anterior = () => historia.pila[historia.idx - 1] || null;

// «Atrás» es atrás: si hay una pantalla de la app detrás (venga de donde venga: de «Más», de una lista, de un banco…), se retrocede a
// ella, aunque el botón diga otra cosa por defecto; si no (se abrió la pantalla directamente), la actual se sustituye por el destino.
export function volverA(router, href, tipo = 'atras') {
  if (anterior()) hacerConTransicion(tipo, undefined, () => router.back());
  else navegar(router, href, tipo, undefined, true);
}

// Igual que volverA (se conserva el nombre para quien cancela un formulario).
export const atras = volverA;

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

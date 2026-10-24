import { tomarCambios } from './cambiosDatos.js';

// Navegar con transición de vista, como en iOS: «adelante» (entra por la derecha), «atras», «gesto» (atrás deslizando desde el
// borde, components/GestoAtras.js), «subir» (formulario de crear a pantalla completa, sube desde abajo) y «cerrar» (baja),
// «hoja» (Ajustes, una hoja con la pantalla de detrás encogida) y «bajar» (la hoja se cierra), «fundido», «abrir» (la fila
// se convierte en la cabecera) y «tab-der» / «tab-izq» (la barra de abajo: cambia en el acto, con un fundido corto).
// «atras» deshace como se entró: de un formulario que subió, baja; de la hoja, se cierra (historia.vias).
// Sin soporte o con movimiento reducido, navega sin más.
// «pestana-der» / «pestana-izq»: las pestañas de Gastos y Facturas (components/Pestanas.js); solo cambia lo de debajo.
// reemplazar: sustituye la pantalla actual en el historial (tras crear algo: «atrás» no vuelve al formulario ya enviado).
// opciones: las de router.push, como { scroll: false } (cambiar de pestaña no sube la pantalla).
export function navegar(router, href, tipo = 'adelante', antes, reemplazar = false, opciones) {
  const espera = antesDeIr();
  if (espera) { espera.then(() => navegar(router, href, tipo, antes, reemplazar, opciones)); return; }
  const ir = () => {
    if (tomarCambios()) router.refresh(); // se guardó algo: sin pantallas recordadas de antes (lib/cambiosDatos.js)
    viaSiguiente = { tipo, ruta: new URL(href, location.href).pathname };
    router[reemplazar ? 'replace' : 'push'](href, opciones);
  };
  hacerConTransicion(tipo, antes, ir, cambiaBarra(href), href);
}

// Pantallas sin barra de pestañas en el móvil: las conversaciones, como en WhatsApp (components/NavDespacho.js y TabBar.js), y
// Ajustes, que es una hoja encima de la app (app/ajustes/layout.js).
export const SIN_BARRA = /^\/(?:despacho\/mensajes\/[^/?#]+|tu-gestoria|ajustes(?:\/[^?#]*)?)(?:[?#]|$)/;
// Entrar en una de ellas o salir: la barra no lleva su propia capa en la transición (diseno.css, data-vt-barra). Con ella,
// se quedaba encima de la conversación que entraba y se desvanecía después: un destello abajo.
const cambiaBarra = (destino) => typeof location !== 'undefined' && Boolean(destino) && SIN_BARRA.test(direccion(destino)) !== SIN_BARRA.test(aqui());

// destino: adónde se va. Si a los 600 ms la pantalla nueva aún no ha llegado (la dirección sigue siendo la de antes), no se
// anima: deslizar la pantalla de antes sobre sí misma parecía un salto atrás y luego llegaba la nueva de golpe. Se suelta la
// pantalla tal cual y, al llegar, la nueva entra con un fundido corto (components/Llegada.js, data-llega-tarde).
function hacerConTransicion(tipo, antes, accion, barra = false, destino = null) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    accion();
    return;
  }
  // Movimiento reducido: como en iOS, nada se desliza, pero la pantalla cambia con un fundido corto en vez de un corte seco.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) tipo = 'fundido';
  antes?.();
  const html = document.documentElement;
  html.dataset.vt = tipo;
  if (barra) html.dataset.vtBarra = '1';
  const desde = aqui();
  const otraPantalla = Boolean(destino) && direccion(destino) !== desde;
  const t = document.startViewTransition(() => new Promise((listo) => {
    let suelta = false;
    const soltar = () => { if (!suelta) { suelta = true; soltar.suelta = true; listo(); } };
    window.__vtLista = soltar;
    // Como en una app, la pantalla nueva entra en seguida, aunque el servidor tarde: si a los 100 ms no está, entra su
    // esqueleto (app/loading.js) o, si aún no ha llegado ni eso, una pantalla de espera; el contenido aparece al llegar
    // (components/Llegada.js). Antes se esperaba hasta 600 ms con todo quieto y luego aparecía sin deslizar.
    if (otraPantalla && CAMBIA_PANTALLA.has(tipo) && movil()) {
      setTimeout(() => {
        if (suelta) return;
        if (aqui() === desde) ponerEspera(tipo);
        soltar();
      }, 100);
    }
    setTimeout(() => { // si la pantalla nueva tarda, no se congela esperando
      if (!suelta && otraPantalla && aqui() === desde) { window.__vtTarde = true; t.skipTransition(); }
      soltar();
    }, 600);
    accion();
  }));
  t.ready.catch(() => {}); // saltada por otra transición (dos navegaciones seguidas): la pantalla cambia igual
  t.finished.finally(() => { window.__vtLista = null; delete html.dataset.vt; delete html.dataset.vtBarra; html.style.removeProperty('--vt-x'); });
}

// Tipos que cambian de pantalla: en el móvil no esperan a que llegue la nueva (pantalla de espera, abajo).
const CAMBIA_PANTALLA = new Set(['adelante', 'atras', 'gesto', 'subir', 'cerrar', 'hoja', 'bajar', 'abrir', 'tab-der', 'tab-izq']);
const movil = () => matchMedia('(max-width: 1023.98px)').matches;
// Atrás deshace la entrada: lo que entró subiendo baja, la hoja se cierra.
const SALIDA = { subir: 'cerrar', hoja: 'bajar' };

// Pantalla de espera: un esqueleto que ocupa el sitio de la nueva mientras llega del servidor (encima de la de antes, que
// sigue debajo hasta que Next la cambia). Se va con un fundido en cuanto llega la nueva (Llegada.js, quitarEspera) y, si la
// navegación no llega nunca, a los 8 s.
function ponerEspera(tipo) {
  if (document.querySelector('.espera-pantalla')) return;
  const capa = document.createElement('div');
  capa.className = 'espera-pantalla';
  capa.setAttribute('aria-hidden', 'true');
  const raiz = tipo === 'tab-der' || tipo === 'tab-izq';
  capa.innerHTML = `<div class="pagina">${raiz ? '' : '<div class="esqueleto volver-e"></div>'}<div class="esqueleto titulo-e"></div>`
    + '<div class="esqueleto bloque-e"></div><div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div></div>';
  document.body.appendChild(capa);
  document.documentElement.dataset.espera = '1';
  clearTimeout(ponerEspera.t);
  ponerEspera.t = setTimeout(quitarEspera, 8000);
}

export function quitarEspera() {
  clearTimeout(ponerEspera.t);
  const capa = document.querySelector('.espera-pantalla:not(.saliendo)');
  delete document.documentElement.dataset.espera;
  if (!capa) return;
  capa.classList.add('saliendo');
  setTimeout(() => capa.remove(), 250);
}

// Espejo de la pila del historial del navegador: cada entrada lleva su posición (__idx dentro de history.state) y se guarda su
// dirección. Así se sabe con exactitud qué hay detrás de la pantalla actual, la haya puesto quien la haya puesto (enlaces, router.push,
// router.replace, el botón atrás del móvil o del navegador): «‹ Atrás» retrocede de verdad cuando lo de atrás es su destino, y si no,
// sustituye la pantalla actual por el destino en vez de apilar otra más (que dejaba el atrás dando vueltas entre dos pantallas).
const CLAVE_PILA = 'fisquo-pila';
const CLAVE_VIAS = 'fisquo-vias';
// vias: cómo se entró en cada entrada (el tipo de transición), para que «atrás» la deshaga igual.
const historia = { pila: [], vias: [], idx: 0, apilados: 0, instalado: false };
// La transición con la que se va a la siguiente pantalla (navegar): Next apila la entrada después, al pintarla.
let viaSiguiente = null;
const tomarVia = (url) => {
  const v = viaSiguiente;
  if (!v || url == null || new URL(url, location.href).pathname !== v.ruta) return null;
  viaSiguiente = null;
  return v.tipo;
};
const aqui = () => `${location.pathname}${location.search}`;
const direccion = (url) => { const x = new URL(url, location.href); return `${x.pathname}${x.search}`; };
function guardarPila() {
  try {
    sessionStorage.setItem(CLAVE_PILA, JSON.stringify(historia.pila));
    sessionStorage.setItem(CLAVE_VIAS, JSON.stringify(historia.vias));
  } catch { /* sin sessionStorage: se sigue sin guardar */ }
}

// Lo que hay que esperar antes de navegar o volver: components/useCambiosSinGuardar.js quita la entrada de «¿Salir sin
// guardar?» si está encima (si no, quedaría detrás de la pantalla nueva). null si no hay nada que esperar.
let antesDeIr = () => null;
export const alNavegar = (fn) => { antesDeIr = fn; };

export function instalarHistorial() {
  if (typeof window === 'undefined' || historia.instalado) return;
  historia.instalado = true;
  historia.idx = Number.isInteger(history.state?.__idx) ? history.state.__idx : 0;
  try { historia.pila = JSON.parse(sessionStorage.getItem(CLAVE_PILA) || '[]'); } catch { historia.pila = []; }
  if (!Array.isArray(historia.pila)) historia.pila = [];
  // Si lo guardado no corresponde a esta pantalla (otra pestaña, otra sesión), se empieza de cero: lo de atrás se desconoce.
  try { historia.vias = JSON.parse(sessionStorage.getItem(CLAVE_VIAS) || '[]'); } catch { historia.vias = []; }
  if (!Array.isArray(historia.vias)) historia.vias = [];
  if (historia.pila[historia.idx] !== aqui()) { historia.pila = []; historia.vias = []; }
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
    // Desde la entrada de «¿Salir sin guardar?» (lib/sinGuardar.js), la pantalla nueva ocupa su sitio: detrás queda el
    // formulario, como si no la hubiera habido.
    if (url != null && (new URL(url, location.href).pathname === location.pathname || history.state?.__sinGuardar)) {
      history.replaceState(estado, titulo, url);
      return;
    }
    historia.idx = actual() + 1;
    historia.apilados++;
    historia.pila.length = historia.idx; // lo de «adelante» se pierde
    historia.vias.length = historia.idx;
    // Sin dirección (la entrada de «¿Salir sin guardar?»): sigue siendo la misma pantalla, con su misma entrada.
    historia.vias[historia.idx] = url == null ? historia.vias[historia.idx - 1] : tomarVia(url) || 'adelante';
    empujar(con(estado, historia.idx), titulo, url);
    historia.pila[historia.idx] = aqui();
    guardarPila();
  };
  history.replaceState = (estado, titulo, url) => {
    historia.idx = actual();
    // La entrada de «¿Salir sin guardar?» lo sigue siendo aunque Next le cambie el estado (al refrescar); deja de serlo si se
    // va a otra dirección.
    const marca = history.state?.__sinGuardar;
    if (marca && (url == null || direccion(url) === aqui())) estado = { ...(estado && typeof estado === 'object' ? estado : {}), __sinGuardar: marca };
    // Otra pantalla en el sitio de esta (tras crear algo): entra como se le diga; si no, como una pantalla más.
    if (url != null && new URL(url, location.href).pathname !== location.pathname) historia.vias[historia.idx] = tomarVia(url) || 'adelante';
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

// La dirección de la entrada i (o null si no se sabe) y cuántas entradas se han apilado desde que se cargó la página.
export const direccionEn = (i) => historia.pila[i] ?? null;
export const apilados = () => historia.apilados;

// «Atrás» es atrás: si hay una pantalla de la app detrás (venga de donde venga: de «Más», de una lista, de un banco…), se retrocede a
// ella, aunque el botón diga otra cosa por defecto; si no (se abrió la pantalla directamente), la actual se sustituye por el destino.
// refrescar: tras guardar, borrar o aprobar algo, la pantalla a la que se vuelve se pide de nuevo al llegar (el historial la
// enseña tal como estaba, y un router.refresh() lanzado antes de volver se adelanta a la vuelta y no la alcanza).
export function volverA(router, href, tipo = 'atras', refrescar = false) {
  const espera = antesDeIr();
  if (espera) { espera.then(() => volverA(router, href, tipo, refrescar)); return; }
  if (tipo === 'atras') tipo = SALIDA[historia.vias[historia.idx]] || tipo;
  if (!anterior()) { navegar(router, href, tipo, undefined, true); return; }
  // Atrás dentro de la misma pantalla (el paso anterior de un formulario): la dirección no cambia y Llegada no avisaría.
  const mismaPantalla = anterior() === aqui();
  hacerConTransicion(tipo, undefined, () => {
    if (mismaPantalla || refrescar) {
      addEventListener('popstate', () => {
        if (refrescar) router.refresh();
        if (mismaPantalla) setTimeout(() => window.__vtLista?.(), 30);
      }, { once: true });
    }
    router.back();
  }, cambiaBarra(anterior()), anterior());
}

// Tocar la pestaña de abajo en la que ya se está, desde una pantalla de dentro (una factura, un proveedor): como en iOS, se
// vuelve a la pestaña, retrocediendo en el historial hasta la última vez que se estuvo en ella. Si no está detrás (se abrió
// la de dentro directamente), la pantalla actual se sustituye por la pestaña.
export function volverHasta(router, href, tipo = 'atras') {
  const espera = antesDeIr();
  if (espera) { espera.then(() => volverHasta(router, href, tipo)); return; }
  const ruta = new URL(href, location.href).pathname;
  let i = historia.idx - 1;
  while (i >= 0 && historia.pila[i]?.split('?')[0] !== ruta) i--;
  if (i < 0) { navegar(router, href, tipo, undefined, true); return; }
  const destino = historia.pila[i];
  hacerConTransicion(tipo, undefined, () => history.go(i - historia.idx), cambiaBarra(destino), destino);
}

// Cerrar una hoja que lleva pantallas dentro (Ajustes, cuyas direcciones empiezan por prefijo): como en iOS, se cierra entera y
// se vuelve a la pantalla de antes de abrirla, aunque dentro se hayan abierto varias. Si se abrió directamente (no hay nada
// detrás), la actual se sustituye por href.
export function salirDe(router, prefijo, href, tipo = 'bajar') {
  const espera = antesDeIr();
  if (espera) { espera.then(() => salirDe(router, prefijo, href, tipo)); return; }
  let i = historia.idx - 1;
  while (i >= 0 && historia.pila[i]?.startsWith(prefijo)) i--;
  if (i < 0 || !historia.pila[i]) { navegar(router, href, tipo, undefined, true); return; }
  const destino = historia.pila[i];
  hacerConTransicion(tipo, undefined, () => history.go(i - historia.idx), cambiaBarra(destino), destino);
}

// Tocar la pestaña de la pantalla en la que se está: sube arriba del todo, como en iOS.
export function subirArriba() {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducido ? 'auto' : 'smooth' });
}

// Igual que volverA (se conserva el nombre para quien cancela un formulario).
export const atras = volverA;

// Para onClick de enlaces: deja pasar cmd/ctrl-clic (abrir en otra pestaña).
export const alPulsar = (router, href, tipo, antes, opciones) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
  e.preventDefault();
  navegar(router, href, tipo, antes, false, opciones);
};

// Entrada de la app (tras la pantalla de inicio o al desbloquear): el contenido sube en cascada una sola vez.
export function entrada() {
  if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const html = document.documentElement;
  html.dataset.entrada = '1';
  setTimeout(() => delete html.dataset.entrada, 1100);
}

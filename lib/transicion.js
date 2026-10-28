import { tomarCambios } from './cambiosDatos.js';
import { capturarFondo, fondoDe, fondoGenerico } from './hojaAjustes.js';

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
  // Entrar en Ajustes desde fuera, en el móvil: siempre como hoja, con una copia de esta pantalla para dejarla detrás
  // (lib/hojaAjustes.js). Así se ve igual se entre desde «Más» o desde un aviso que lleva a uno de sus ajustes.
  if (typeof location !== 'undefined' && movil() && enHoja(direccion(href)) && !enHoja(aqui())) {
    tipo = 'hoja';
    capturarFondo();
  }
  const ir = () => {
    if (tomarCambios()) router.refresh(); // se guardó algo: sin pantallas recordadas de antes (lib/cambiosDatos.js)
    viaSiguiente = { tipo, ruta: new URL(href, location.href).pathname };
    router[reemplazar ? 'replace' : 'push'](href, opciones);
  };
  hacerConTransicion(tipo, antes, ir, cambiaBarra(href), href);
}

// Pantallas sin barra de pestañas en el móvil: las conversaciones, como en WhatsApp (components/NavDespacho.js y TabBar.js), y
// Ajustes, que es una hoja encima de la app (app/ajustes/layout.js). En el ordenador, Ajustes es una pantalla más, con su
// barra lateral y la del despacho: allí solo cuentan las conversaciones (CONVERSACION).
export const SIN_BARRA = /^\/(?:despacho\/mensajes\/[^/?#]+|tu-gestoria|ajustes(?:\/[^?#]*)?)(?:[?#]|$)/;
export const CONVERSACION = /^\/(?:despacho\/mensajes\/[^/?#]+|tu-gestoria)(?:[?#]|$)/;
// Las pantallas de la hoja de Ajustes (en el móvil, una hoja encima de la app).
const enHoja = (ruta) => /^\/ajustes(?:[/?#]|$)/.test(ruta);
// Entrar en una de ellas o salir: la barra no lleva su propia capa en la transición (diseno.css, data-vt-barra). Con ella,
// se quedaba encima de la conversación que entraba y se desvanecía después: un destello abajo.
const sinBarra = (ruta) => CONVERSACION.test(ruta) || (SIN_BARRA.test(ruta) && movil());
const cambiaBarra = (destino) => typeof location !== 'undefined' && Boolean(destino) && sinBarra(direccion(destino)) !== sinBarra(aqui());

// destino: adónde se va. Si a los 600 ms la pantalla nueva aún no ha llegado (la dirección sigue siendo la de antes), no se
// anima: deslizar la pantalla de antes sobre sí misma parecía un salto atrás y luego llegaba la nueva de golpe. Se suelta la
// pantalla tal cual y, al llegar, la nueva entra con un fundido corto (components/Llegada.js, data-llega-tarde).
function hacerConTransicion(tipo, antes, accion, barra = false, destino = null) {
  if (!tipo || typeof document === 'undefined' || !document.startViewTransition) { // sin tipo: lo anima quien llama (cerrarHoja)
    antes?.();
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
  // De una pantalla de Ajustes a otra, en el móvil: solo se mueve lo de dentro de la hoja; la pantalla de detrás y el
  // marco de la hoja se quedan quietos (app/diseno.css, data-vt-hoja).
  if (movil() && enHoja(desde) && Boolean(destino) && enHoja(direccion(destino))) html.dataset.vtHoja = '1';
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
        // Sin llegar: la dirección es la de antes o, si Next ya cambió la dirección, lo que hay es su esqueleto de carga
        // (app/loading.js), que no tiene la forma de lo que llega. En los dos casos, la espera con su forma.
        if (aqui() === desde || document.querySelector('.cargando')) ponerEspera(tipo, destino, desde);
        soltar();
      }, 100);
    }
    setTimeout(() => { // si la pantalla nueva tarda, no se congela esperando
      if (!suelta && otraPantalla && aqui() === desde) { window.__vtTarde = true; t.skipTransition(); }
      soltar();
    }, 600);
    accion();
  }));
  // Para lo que no debe animarse a la vez que el cambio de pantalla (la confirmación de components/Hecho.js): mientras dura,
  // el navegador congela lo que se pinta y una animación encima se vería a saltos.
  window.__vtActiva = true;
  window.dispatchEvent(new Event('fisquo-vt-inicio'));
  t.ready.catch(() => {}); // saltada por otra transición (dos navegaciones seguidas): la pantalla cambia igual
  t.finished.finally(() => { window.__vtActiva = false; window.dispatchEvent(new Event('fisquo-vt-fin')); window.__vtLista = null; filaAbierta = null; delete html.dataset.vt; delete html.dataset.vtBarra; delete html.dataset.vtHoja; html.style.removeProperty('--vt-x'); });
}

// Tipos que cambian de pantalla: en el móvil no esperan a que llegue la nueva (pantalla de espera, abajo).
const CAMBIA_PANTALLA = new Set(['adelante', 'atras', 'gesto', 'subir', 'cerrar', 'hoja', 'bajar', 'abrir', 'tab-der', 'tab-izq']);
const movil = () => typeof matchMedia === 'function' && matchMedia('(max-width: 1023.98px)').matches;
// Atrás deshace la entrada: lo que entró subiendo baja, la hoja se cierra.
const SALIDA = { subir: 'cerrar', hoja: 'bajar' };

// Pantalla de espera: un esqueleto que ocupa el sitio de la nueva mientras llega del servidor (encima de la de antes, que
// sigue debajo hasta que Next la cambia). Se va con un fundido en cuanto llega la nueva (Llegada.js, quitarEspera) y, si la
// navegación no llega nunca, a los 8 s. Tiene la forma de lo que llega: la hoja de Ajustes al abrirla (con la pantalla de
// detrás), solo el interior de la hoja al ir de un ajuste a otro y, al abrir una factura desde la lista, su cabecera con el
// cliente y el total de la fila (la fila se convierte en ella: transición «abrir»).
const FILAS_E = '<div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div>';
// desde: la pantalla de la que se sale (la dirección puede haber cambiado ya, con el esqueleto de carga de Next).
function ponerEspera(tipo, destino, desde = aqui()) {
  if (document.querySelector('.espera-pantalla')) return;
  const capa = document.createElement('div');
  capa.className = 'espera-pantalla';
  capa.setAttribute('aria-hidden', 'true');
  const raiz = tipo === 'tab-der' || tipo === 'tab-izq';
  const marco = movil() && enHoja(desde) && destino && enHoja(direccion(destino)) && document.querySelector('.aj-marco');
  let dentro = null;
  if (tipo === 'hoja') {
    capa.classList.add('espera-hoja');
    const fondo = document.createElement('div');
    fondo.className = 'aj-fondo';
    fondo.append(...(fondoDe(desde)?.nodo || fondoGenerico()).childNodes);
    const lista = destino && direccion(destino).split('?')[0] === '/ajustes';
    capa.innerHTML = `<div class="hoja-espera"><div class="pagina">${lista
      ? '<div class="aj-hoja-cab"><div class="aj-hoja-barra"><span></span><h1>Ajustes</h1><span class="aj-ok">OK</span></div></div><div class="esqueleto hoja-e-cuenta"></div>'
      : '<div class="esqueleto volver-e"></div><div class="esqueleto titulo-e"></div>'}<div class="esqueleto bloque-e"></div>${FILAS_E}</div></div>`;
    capa.prepend(fondo);
  } else if (marco) {
    // Dentro de la hoja: la espera va en la hoja, arriba del todo, y entra con ella (se desliza solo lo de dentro).
    capa.classList.add('espera-en-hoja');
    dentro = marco;
    capa.innerHTML = `<div class="pagina"><div class="esqueleto volver-e"></div><div class="esqueleto titulo-e"></div><div class="esqueleto bloque-e"></div>${FILAS_E}</div>`;
  } else if (tipo === 'abrir' && filaAbierta?.isConnected) {
    // La fila ya no lleva los nombres de la transición: los lleva la cabecera de la espera, que es en lo que se convierte.
    const texto = (k) => filaAbierta.querySelector(`[data-vt="${k}"]`)?.textContent || '';
    const cliente = texto('cliente'), total = texto('total');
    filaAbierta.style.removeProperty('view-transition-name');
    for (const el of filaAbierta.querySelectorAll('[data-vt]')) el.style.removeProperty('view-transition-name');
    const volver = VOLVER_FILA[desde.split('?')[0]] || 'Atrás';
    capa.innerHTML = '<main class="pagina mk-look"><span class="volver"></span><section class="factura-hero">'
      + '<p class="fh-num"><span class="esqueleto fh-e-num"></span></p><h1 class="fh-cliente"></h1><p class="fh-total"></p>'
      + '<div class="esqueleto fh-e-desglose"></div><div class="esqueleto fh-e-pie"></div><div class="esqueleto fh-e-cobro"></div></section>'
      + `<div class="esqueleto fh-e-boton"></div>${FILAS_E}</main>`;
    capa.querySelector('.volver').textContent = `‹ ${volver}`;
    capa.querySelector('.fh-cliente').textContent = cliente;
    capa.querySelector('.fh-total').textContent = total;
    capa.classList.add('espera-abrir');
  } else {
    capa.innerHTML = `<div class="pagina">${raiz ? '' : '<div class="esqueleto volver-e"></div>'}<div class="esqueleto titulo-e"></div>`
      + `<div class="esqueleto bloque-e"></div>${FILAS_E}</div>`;
  }
  (dentro || document.body).appendChild(capa);
  document.documentElement.dataset.espera = '1';
  clearTimeout(ponerEspera.t);
  ponerEspera.t = setTimeout(quitarEspera, 8000);
}

// Al abrir una fila de una lista (components/FilaFactura.js): la fila que se convierte en la cabecera y adónde vuelve.
let filaAbierta = null;
export const abrirFila = (fila) => { filaAbierta = fila; };
const VOLVER_FILA = { '/facturas': 'Facturas', '/presupuestos': 'Presupuestos' };

export function quitarEspera() {
  clearTimeout(ponerEspera.t);
  const capa = document.querySelector('.espera-pantalla:not(.saliendo)');
  delete document.documentElement.dataset.espera;
  if (!capa) return;
  // La copia de la pantalla a la que volvía la hoja de Ajustes (cerrarHoja): la de verdad, a la misma altura que la copia.
  if (capa.dataset.ruta === aqui() && capa.dataset.y) scrollTo(0, Number(capa.dataset.y));
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
  const i = antesDe(prefijo);
  if (i < 0) { navegar(router, href, tipo, undefined, true); return; }
  const destino = historia.pila[i];
  hacerConTransicion(tipo, undefined, () => history.go(i - historia.idx), cambiaBarra(destino), destino);
}

// La entrada del historial de antes de las que empiezan por prefijo (-1 si no hay).
function antesDe(prefijo) {
  let i = historia.idx - 1;
  while (i >= 0 && historia.pila[i]?.startsWith(prefijo)) i--;
  return i >= 0 && historia.pila[i] ? i : -1;
}

// Adónde vuelve la hoja de Ajustes al cerrarse: la pantalla de antes de abrirla o, si se abrió directamente, «Más».
export const destinoHoja = () => { const i = antesDe('/ajustes'); return i < 0 ? '/mas' : historia.pila[i]; };

// Cerrar la hoja de Ajustes en el móvil («OK» o arrastrarla hacia abajo): como en iOS, la hoja baja desde donde esté y la
// pantalla de detrás (su copia, lib/hojaAjustes.js) recupera su tamaño a la vez; después se vuelve a ella sin otra transición. La
// copia se queda delante hasta que la de verdad está pintada (quitarEspera la funde y deja la pantalla a la misma altura).
// vel: px/ms con que se soltó al arrastrar (sigue al mismo ritmo).
export function cerrarHoja(router, vel = 0) {
  const marco = document.querySelector('.aj-marco');
  const fondo = document.querySelector('.aj-fondo');
  if (!marco || !fondo || !movil() || matchMedia('(prefers-reduced-motion: reduce)').matches) { salirDe(router, '/ajustes', '/mas', 'bajar'); return; }
  const espera = antesDeIr();
  if (espera) { espera.then(() => cerrarHoja(router, vel)); return; }
  const y = new DOMMatrixReadOnly(getComputedStyle(marco).transform).m42;
  const falta = innerHeight - marco.getBoundingClientRect().top + y;
  const ms = Math.round(Math.min(380, Math.max(220, vel > 0.3 ? (falta - y) / vel : 380)));
  const curva = `${ms}ms cubic-bezier(0.32, 0.72, 0, 1)`;
  marco.style.transition = `transform ${curva}`;
  marco.style.transform = `translate3d(0, ${falta}px, 0)`;
  fondo.style.transition = `transform ${curva}, filter ${curva}, border-radius ${curva}`;
  fondo.style.transform = 'none';
  fondo.style.filter = 'none';
  fondo.style.borderRadius = '0';
  document.documentElement.dataset.hojaSaliendo = '1';
  setTimeout(() => {
    // La copia pasa a ser la pantalla de espera: sigue ahí aunque Ajustes desaparezca, hasta que llega la de verdad.
    const capa = document.createElement('div');
    capa.className = 'espera-pantalla espera-fondo';
    capa.setAttribute('aria-hidden', 'true');
    capa.dataset.ruta = destinoHoja();
    if (fondo.dataset.y) capa.dataset.y = fondo.dataset.y;
    capa.append(...fondo.childNodes);
    document.body.appendChild(capa);
    document.documentElement.dataset.espera = '1';
    clearTimeout(ponerEspera.t);
    ponerEspera.t = setTimeout(quitarEspera, 8000);
    delete document.documentElement.dataset.hojaSaliendo;
    salirDe(router, '/ajustes', '/mas', null);
  }, ms);
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
  // Un ancla de esta misma pantalla (solo cambia el #, como «Añadir empleado» en Nóminas): no hay pantalla nueva que
  // animar; el enlace se desplaza hasta ella como siempre.
  const destino = new URL(href, location.href);
  if (destino.hash && destino.pathname === location.pathname && destino.search === location.search) return;
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

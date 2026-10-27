// La hoja de Ajustes en el móvil (app/ajustes/layout.js), como en iOS: sube encima de la pantalla de antes, que se queda
// detrás encogida y oscurecida (asoma por arriba, bajo la barra de estado) y recupera su tamaño a medida que la hoja se
// arrastra hacia abajo. Esa pantalla ya no está (Next la cambia por Ajustes): lo de detrás es una copia quieta de lo que se
// veía al abrir la hoja (capturarFondo), que components/HojaAjustes.js pone detrás y que, al cerrar, se queda delante hasta
// que la pantalla de verdad vuelve a estar pintada (lib/transicion.js cerrarHoja).

// Cómo queda la pantalla de detrás con la hoja abierta. Los mismos valores que .aj-fondo y la transición «hoja»
// (app/ajustes.css, app/diseno.css vt-al-fondo): si cambian aquí, cambian allí.
export const FONDO = { escala: 0.92, brillo: 0.72 };

// Lo que no se copia: lo que no se ve y las capas que no son la pantalla (esperas, bloqueo, diálogos, avisos sueltos).
const SIN_COPIA = 'script, style, link, noscript, template, .espera-pantalla, .pantalla-bloqueo, #arranque, [aria-modal="true"], dialog, [role="alert"], [role="status"]:not(.aviso-lectura)';

let guardado = null; // { nodo, ruta, y }

// Copia de la pantalla tal como se ve ahora: lo que va con la página (desplazado lo que se haya bajado) y, aparte, lo fijo
// (barra de pestañas, barra de título compacta), que se queda donde estaba.
export function capturarFondo() {
  if (typeof document === 'undefined') return;
  const nodo = document.createElement('div');
  const lienzo = document.createElement('div');
  const b = document.body;
  lienzo.className = `aj-fondo-lienzo ${b.className}`;
  if (b.getAttribute('style')) lienzo.setAttribute('style', b.getAttribute('style'));
  for (const [k, v] of Object.entries(b.dataset)) lienzo.dataset[k] = v;
  lienzo.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
  nodo.appendChild(lienzo);
  for (const el of b.children) {
    if (el.matches(SIN_COPIA) || el.classList.contains('aj-fondo')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    (cs.position === 'fixed' ? nodo : lienzo).appendChild(limpiar(el.cloneNode(true)));
  }
  guardado = { nodo, ruta: `${location.pathname}${location.search}`, y: scrollY };
}

// Una copia que no estorba: sin ids (se repetirían), sin nombres de transición, sin esqueletos que Llegada espere.
function limpiar(copia) {
  for (const el of [copia, ...copia.querySelectorAll('*')]) {
    if (el.id && !el.closest('svg')) el.removeAttribute('id'); // los de un SVG los usan sus degradados
    if (el.style?.viewTransitionName) el.style.removeProperty('view-transition-name');
    el.classList?.remove('cargando');
    if (el.hasAttribute?.('autofocus')) el.removeAttribute('autofocus');
  }
  return copia;
}

// La copia de la pantalla a la que vuelve la hoja (ruta), o null si la que se guardó es de otra (se abrió Ajustes
// directamente, se recargó, se llegó desde otra parte).
export function fondoDe(ruta) {
  if (!guardado || guardado.ruta !== ruta) return null;
  return { nodo: guardado.nodo.cloneNode(true), y: guardado.y };
}

// Sin copia: el esqueleto de una pantalla cualquiera, como la pantalla de espera (lib/transicion.js ponerEspera).
export function fondoGenerico() {
  const nodo = document.createElement('div');
  nodo.innerHTML = '<div class="aj-fondo-lienzo"><div class="pagina"><div class="esqueleto titulo-e"></div><div class="esqueleto bloque-e"></div>'
    + '<div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div><div class="esqueleto fila-e"></div></div></div>';
  return nodo;
}

// La pantalla de detrás en el punto p del cierre: 0 con la hoja arriba (encogida, oscurecida, con las esquinas redondeadas),
// 1 con la hoja fuera (tal cual). Sin p, vuelve a lo de app/ajustes.css (p = 0).
export function ponerFondo(el, p) {
  if (!el) return;
  if (p == null) {
    for (const k of ['transform', 'filter', 'border-radius']) el.style.removeProperty(k);
    return;
  }
  const k = 1 - p;
  el.style.transform = `translate3d(0, calc(var(--fondo-y) * ${k}), 0) scale(${FONDO.escala + (1 - FONDO.escala) * p})`;
  el.style.filter = `brightness(${FONDO.brillo + (1 - FONDO.brillo) * p})`;
  el.style.borderRadius = `calc(var(--fondo-radio) * ${k})`;
}

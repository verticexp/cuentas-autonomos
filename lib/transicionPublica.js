// Una captura del viewport por navegación. No animamos la geometría de páginas de distinta altura.
let actual, instalado = false;
export const paginaPublica = () => [...document.querySelectorAll('.web-main, main.login:not(.pantalla-bloqueo)')].find((el) => el.getClientRects().length);
export function instalarTransicionesPublicas() {
  if (instalado) return;
  instalado = true;
  // Dura lo mismo que el documento: cambiar de layout no deja un hueco sin listener al retroceder.
  addEventListener('popstate', () => {
    const pagina = paginaPublica();
    if (pagina?.getClientRects().length) transicionPublica(location.href, () => {}, true);
  });
}
const publicas = /^\/(?:$|funciones(?:\/|$)|precios$|autonomos$|pymes$|business$|grandes-empresas$|seguridad$|verificado$|contacto$|gestorias$|login$|registro$|recuperar$)/;
export function transicionPublica(href, navegar, historial = false) {
  const destino = new URL(href, location.href);
  // Desde la primera navegación interna, la entrada de la portada no se repite (components/web/web.css, «Movimiento»).
  document.documentElement.dataset.webNav = '1';
  actual?.cancelar();
  const movimiento = matchMedia('(prefers-reduced-motion: reduce)');
  if ((!historial && destino.href === location.href) || destino.origin !== location.origin || !publicas.test(destino.pathname) || !document.startViewTransition || movimiento.matches || document.documentElement.dataset.publicoTeclado === '1') {
    navegar(); return;
  }
  const html = document.documentElement;
  let terminar, observador, limite, comprobarT, transicion;
  const limpiar = () => { observador?.disconnect(); clearTimeout(limite); clearTimeout(comprobarT); movimiento.removeEventListener('change', reducir); terminar?.(); };
  const sesion = { cancelar: () => { limpiar(); transicion?.skipTransition(); if (actual === sesion) { actual = null; delete html.dataset.publicoTransicion; } } };
  const reducir = () => { if (movimiento.matches) sesion.cancelar(); };
  movimiento.addEventListener('change', reducir);
  actual = sesion;
  html.dataset.publicoTransicion = '1';
  try {
    transicion = document.startViewTransition(() => new Promise((resolve) => {
      terminar = resolve;
      if (actual !== sesion) { resolve(); return; }
      const comprobar = () => {
        clearTimeout(comprobarT);
        // Un turno después del commit: Next ya ha colocado el scroll, sin esperar a un rAF (suspendido durante la captura).
        comprobarT = setTimeout(() => {
          const pagina = paginaPublica();
          if (location.pathname === destino.pathname && location.search === destino.search && pagina?.dataset.publicoRuta === destino.pathname && pagina.querySelector('h1') && !pagina.querySelector('.web-espera, .cargando, form[aria-busy="true"]')) limpiar();
        }, 0);
      };
      observador = new MutationObserver(comprobar);
      observador.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-publico-ruta', 'aria-busy'] });
      // Si la red tarda, liberamos la captura; la carga sigue siendo navegable y cancelable.
      limite = setTimeout(() => sesion.cancelar(), 500);
      navegar(); comprobar();
    }));
    transicion.ready.catch(() => {});
    transicion.finished.catch(() => {}).finally(() => { limpiar(); if (actual === sesion) { actual = null; delete html.dataset.publicoTransicion; } });
  } catch { sesion.cancelar(); navegar(); }
}

// «¿Salir sin guardar?» (components/useCambiosSinGuardar.js). Mientras un formulario tiene cambios sin guardar, una entrada más
// en el historial, sin URL como los pasos de lib/pasosHistorial.js, recoge el «atrás» del sistema (gesto del iPhone, botón o
// gesto de Android, botón del navegador): al sacarla se pregunta. Seguir editando vuelve a ella con forward(), sin apilar otra;
// salir sigue hacia atrás. Se apila una vez y se queda hasta guardar, descartar o salir; si queda encima sin nada que guardar
// (se borró lo escrito, se recargó la página), «atrás» la cruza sin preguntar.
// Solo se apila tras un toque o una tecla de verdad (tocar): Chrome se salta al volver todo lo de la página si se apila sin uno
// desde lo último apilado, y Safari (y la app de iOS), lo apilado sin uno en los 10 s anteriores (WebKit,
// hasRecentUserInteractionForNavigationFromJS). Si no, se espera al siguiente.
// history y lo demás van por parámetro para probarlo en Node: posicion() y direccionEn(i), las del espejo del historial de
// lib/transicion.js; apilados(), las entradas apiladas hasta ahora; preguntar(textos) resuelve true si se sale; salir() sigue
// hacia atrás desde el formulario, ya sin la entrada de aviso.
const RECIENTE = 8000;
export function crearSinGuardar({ history, posicion, direccionEn, aqui, apilados, preguntar, salir, bloqueada = () => false, alCambiar = () => {}, ahora = Date.now, plazo = setTimeout, cancelar = clearTimeout }) {
  const fuentes = new Set(); // { sucia, suspendida }: una por formulario
  let guarda = null; // { idx, url, marca }: la entrada de aviso (la apilada aquí o una que ya estaba al cargar)
  let espera = null; // el back()/forward() propio en curso: su popstate no es un «atrás» de la persona
  let soltando = null;
  let preguntando = false;
  let tocado = -1, tocadoEn = -Infinity; // apilados() y la hora en el último toque o tecla
  let avisado = false;
  let n = 0;

  const sucio = () => [...fuentes].some((f) => f.sucia && !f.suspendida);
  const viva = () => Boolean(guarda) && direccionEn(guarda.idx) === guarda.url; // una navegación pudo sustituirla
  const encima = () => viva() && posicion() === guarda.idx;
  const enBase = () => viva() && posicion() === guarda.idx - 1;
  const tomar = (marca) => { guarda = { idx: posicion(), url: aqui(), marca }; };
  // Al sacar la entrada de aviso, el navegador llevaba la pantalla a la altura de cuando se apiló (en un formulario largo, arriba
  // del todo) antes de preguntar. Con la recolocación en manual en el formulario (va por entrada) se queda donde estaba; al
  // quitar la entrada o salir, vuelve a automática.
  const recolocar = (si) => { try { history.scrollRestoration = si ? 'auto' : 'manual'; } catch { /* sin soporte: da igual */ } };
  if (history.state?.__sinGuardar) tomar(history.state.__sinGuardar);

  function revisar() {
    const s = sucio();
    if (s !== avisado) { avisado = s; alCambiar(s); }
    if (!s || espera || preguntando || encima()) return;
    if (tocado !== apilados() || ahora() - tocadoEn > RECIENTE) return; // se apila con el siguiente toque o tecla
    const marca = `${Date.now().toString(36)}-${++n}`;
    recolocar(false);
    history.pushState({ ...(history.state || {}), __sinGuardar: marca }, '');
    tomar(marca);
  }

  // Un back()/forward() propio: lo resuelve su popstate o, si no llega (no había adónde ir), el plazo. Lo de después va en la
  // tarea siguiente: este popstate lo atiende Next tras este módulo, y un router.replace lanzado antes lo desharía.
  function recorrer(paso) {
    return new Promise((listo) => {
      const hecho = () => { cancelar(reloj); espera = null; plazo(listo, 0); };
      const reloj = plazo(() => { if (espera === hecho) hecho(); }, 1500);
      espera = hecho;
      if (paso > 0) history.forward(); else history.back();
    });
  }

  // Al guardar, descartar o salir con «‹ Atrás»: se quita la entrada de aviso si está encima.
  function soltar() {
    if (soltando) return soltando;
    if (!encima()) { if (!viva()) guarda = null; return Promise.resolve(); }
    soltando = recorrer(-1).then(() => { guarda = null; soltando = null; recolocar(true); });
    return soltando;
  }

  // Seguir editando: de vuelta a la entrada de aviso, que sigue delante. Si no se llega, se apila otra con el siguiente toque.
  function volverAGuarda() {
    if (!enBase()) { if (!encima()) guarda = null; return; }
    recorrer(1).then(() => { if (!encima()) { guarda = null; recolocar(true); revisar(); } });
  }

  function abrir(textos) {
    preguntando = true;
    return Promise.resolve().then(() => preguntar(textos)).catch(() => false).then((fuera) => { preguntando = false; return Boolean(fuera); });
  }

  // Lo escrito ya no cuenta (se sale o se descarta): sin aviso hasta que el formulario vuelva a estar como al principio.
  function suspender() {
    for (const f of fuentes) if (f.sucia) f.suspendida = true;
    revisar();
  }

  // popstate. Se atiende en la tarea siguiente, cuando Next ya ha restaurado la pantalla: lo que se haga (seguir atrás,
  // navegar) no se le adelanta.
  function alVolver() {
    if (espera) espera();
    else plazo(atender, 0);
  }

  function atender() {
    if (espera) return; // un back()/forward() propio en curso (seguir editando tras cerrar la pregunta)
    const marca = history.state?.__sinGuardar;
    // Una entrada de aviso que no es la de ahora (tras recargar, o yendo adelante hasta una de antes): se toma como propia.
    if (marca && marca !== guarda?.marca) { tomar(marca); return; }
    if (!viva()) { if (guarda) recolocar(true); guarda = null; revisar(); return; }
    if (preguntando || encima()) return;
    if (!enBase()) { guarda = null; return; } // un salto más atrás (o adelante): ya se ha salido del formulario
    // «Atrás» acaba de sacar la entrada de aviso: se está en el formulario, sin ella encima.
    if (!sucio()) { guarda = null; recolocar(true); salir(); return; }
    if (bloqueada()) { volverAGuarda(); return; } // con la pantalla de bloqueo delante no se pregunta: se queda
    abrir().then((fuera) => {
      if (!fuera) { volverAGuarda(); return; }
      suspender();
      if (enBase()) { guarda = null; recolocar(true); salir(); }
    });
  }

  // «‹ Atrás», «Cancelar» o el gesto de la web guardada en el iPhone: con cambios, se pregunta antes; si se sale (o no había
  // nada que guardar), se quita la entrada de aviso y se hace accion. Sin entrada ni cambios, accion va en el momento.
  function salirSinGuardar(accion, textos) {
    if (preguntando || espera) return Promise.resolve(false);
    if (!sucio()) {
      if (!encima()) { accion(); return Promise.resolve(true); }
      return soltar().then(() => { accion(); return true; });
    }
    return abrir(textos).then(async (fuera) => {
      if (!fuera) { volverAGuarda(); return false; } // si «atrás» la sacó mientras se preguntaba, vuelve a ella
      suspender();
      await soltar();
      accion();
      return true;
    });
  }

  // Ya confirmado (borrar, descartar): sin preguntar.
  function soltarCambios() {
    suspender();
    return soltar();
  }

  return {
    alVolver, salirSinGuardar, soltar, soltarCambios,
    sucio, encima,
    // Un toque o una tecla de verdad: ya se puede apilar la entrada de aviso.
    tocar() { tocado = apilados(); tocadoEn = ahora(); revisar(); },
    // Antes de navegar o volver (lib/transicion.js): con la entrada de aviso encima, quitarla; si no, nada que esperar.
    antesDeNavegar: () => (encima() || soltando ? soltarCambios() : null),
    registrar() {
      const f = { sucia: false, suspendida: false };
      fuentes.add(f);
      return {
        poner(sucia) { f.sucia = sucia; if (!sucia) f.suspendida = false; revisar(); },
        suspender() { f.suspendida = true; revisar(); },
        quitar() { fuentes.delete(f); revisar(); },
      };
    },
  };
}

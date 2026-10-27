// Pasos de un formulario (alta, registro) en el historial del navegador: cada paso es una entrada con la misma dirección
// (__paso en el estado), y «atrás» del sistema (botón o gesto de Android, gesto del iPhone, botón del navegador) vuelve al
// paso anterior en vez de salir. El paso lo cambia siempre el popstate. history va por parámetro para probarlo en Node.
export function crearPasosHistorial(history, { base, total, leerPaso, cambiarPaso, estaBloqueado = () => false }) {
  const valido = (n) => Number.isInteger(n) && n >= base && n < total;
  // Sin URL: transicion.js deja apilar los pasos y Next conserva su árbol.
  const apilar = (n) => history.pushState({ ...(history.state || {}), __paso: n }, '');

  return {
    iniciar() {
      if (!Object.hasOwn(history.state || {}, '__paso')) return;
      const estado = { ...history.state };
      delete estado.__paso;
      history.replaceState(estado, '');
    },
    avanzar(n) {
      if (!valido(n)) return;
      apilar(n);
      cambiarPaso(n);
    },
    atras() { history.back(); },
    saltar(n) {
      if (!valido(n)) return;
      const actual = history.state?.__paso;
      if (valido(actual)) {
        // go(0) recargaría el formulario si el error ya está en este paso.
        if (n === actual) return;
        history.go(n - actual);
      } else {
        cambiarPaso(n);
        history.replaceState({ ...(history.state || {}), __paso: n }, '');
      }
    },
    alVolver() {
      const actual = leerPaso();
      if (estaBloqueado()) { apilar(actual); return; }
      const marcado = history.state?.__paso;
      const destino = valido(marcado) ? marcado : base;
      if (destino !== actual || valido(marcado)) cambiarPaso(destino);
    },
  };
}

// Vibración corta, como en las apps del móvil. tipo: 'toque' (cambiar de pestaña, abrir algo), 'golpe' (disparar la cámara),
// 'exito' (cobrada, pagada), 'aviso' o 'error'.
// - App de iOS: la del sistema, con su tipo (mobile/ios/App/App/FisquoViewController.swift, Haptica).
// - Android: navigator.vibrate.
// - iPhone en Safari o con la web guardada en la pantalla de inicio (iOS 18+): un interruptor nativo escondido que vibra al
//   cambiar. Siempre es el mismo toque.
const ANDROID = { toque: 6, golpe: 8, exito: [8, 50, 12], aviso: [12, 60, 12], error: [12, 50, 12, 50, 12] };
let interruptor;

export function vibrar(tipo = 'toque') {
  if (typeof window === 'undefined') return;
  const nativo = window.webkit?.messageHandlers?.haptica;
  if (nativo) { nativo.postMessage(tipo); return; }
  if (navigator.vibrate) { navigator.vibrate(ANDROID[tipo] ?? ANDROID.toque); return; }
  if (!interruptor) {
    interruptor = document.createElement('label');
    interruptor.style.display = 'none';
    interruptor.setAttribute('aria-hidden', 'true');
    const i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    interruptor.appendChild(i);
    document.body.appendChild(interruptor);
  }
  interruptor.click();
}

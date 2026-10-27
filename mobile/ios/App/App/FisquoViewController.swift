import UIKit
import WebKit
import Capacitor

// Controlador principal: el WebView de Capacitor que carga www.fisquo.com, con lo que una app de iOS necesita además:
// - ventanas nuevas y descargas resueltas dentro de la app (DelegadoWeb.swift), no en Safari, que no tiene la sesión;
// - el escáner de documentos nativo para los tickets (EscanerPlugin.swift);
// - deslizar desde el borde izquierdo para volver atrás, solo donde la pantalla tiene «‹ Atrás» y sin hojas encima, y nunca
//   hacia delante (GestoAtras, abajo);
// - la vibración del sistema al tocar las pestañas, cobrar o marcar como pagado (Haptica, abajo; lib/haptica.js);
// - tirar hacia abajo para recargar y los accesos rápidos del icono (SceneDelegate.swift);
// - el teclado sin la barra de formulario de iOS («^ ˅ ✓»), como en las apps de mensajería (quitarBarraDelTeclado, abajo);
// - sin arrastrar enlaces ni imágenes al mantenerlos pulsados (sinArrastrar, abajo).
class FisquoViewController: CAPBridgeViewController {
    private var delegado: DelegadoWeb?
    private var gestoAtras: GestoAtras?
    private var rutaPendiente: String?
    private var cargada = false

    // Verde de marca: el de la pantalla de lanzamiento, la ventana y el fondo de la web mientras carga (capacitor.config.json),
    // igual que el de la animación de inicio de la web: del icono a la app no hay ningún cambio de color.
    static let verde = UIColor(red: 0x0F / 255, green: 0x1F / 255, blue: 0x1B / 255, alpha: 1)
    // Ya con la app abierta, el fondo pasa al de la app (--paper de app/diseno.css), para que recargar no destelle en verde.
    // Se cambia unos segundos después de la primera carga: el fin de carga llega antes de que la página se vea en pantalla,
    // y cambiarlo en ese momento dejaba ver el fondo claro un instante antes de la animación.
    private static let fondoApp = UIColor { rasgos in
        rasgos.userInterfaceStyle == .dark
            ? UIColor(red: 0x11 / 255, green: 0x12 / 255, blue: 0x14 / 255, alpha: 1)
            : UIColor(red: 0xF3 / 255, green: 0xF4 / 255, blue: 0xF1 / 255, alpha: 1)
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = super.webView(with: frame, configuration: configuration)
        // Sin vista previa al mantener pulsado un enlace: en una app no tiene sentido abrir la página «en Safari».
        webView.allowsLinkPreview = false
        // Atrás deslizando desde el borde: recorre el historial de la web (pantallas y pasos de los formularios). Dónde se puede
        // lo decide la web (GestoAtras, abajo).
        webView.allowsBackForwardNavigationGestures = true
        return webView
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(EscanerPlugin())
        guard let webView = webView, let capacitor = webView.navigationDelegate as? WebViewDelegationHandler else { return }
        let delegado = DelegadoWeb(capacitor: capacitor, servidor: bridge?.config.serverURL, presentador: self)
        delegado.alTerminarCarga = { [weak self] in self?.terminoCarga() }
        webView.navigationDelegate = delegado
        webView.uiDelegate = delegado
        self.delegado = delegado
        let gestoAtras = GestoAtras(webView: webView)
        webView.configuration.userContentController.add(gestoAtras, name: "gestoAtras")
        self.gestoAtras = gestoAtras
        delegado.alEmpezarPagina = { [weak gestoAtras] in gestoAtras?.bloquear(false) } // la anterior pudo dejarlo bloqueado
        webView.configuration.userContentController.add(Haptica(), name: "haptica")

        quitarBarraDelTeclado(webView)
        sinArrastrar(webView)

        let recargar = UIRefreshControl()
        recargar.addTarget(self, action: #selector(recargar(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = recargar
    }

    @objc private func recargar(_ control: UIRefreshControl) {
        webView?.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { control.endRefreshing() }
    }

    private func terminoCarga() {
        webView?.scrollView.refreshControl?.endRefreshing()
        guard !cargada else { return }
        cargada = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.webView?.backgroundColor = Self.fondoApp
            self?.webView?.scrollView.backgroundColor = Self.fondoApp
        }
        if let ruta = rutaPendiente {
            rutaPendiente = nil
            abrir(ruta: ruta)
        }
    }

    // Abre una ruta de Fisquo (accesos rápidos del icono). Si la web aún no ha cargado, espera a que lo haga.
    @objc func abrir(ruta: String) {
        guard cargada, let base = bridge?.config.serverURL, let url = URL(string: ruta, relativeTo: base) else {
            rutaPendiente = ruta
            return
        }
        presentedViewController?.dismiss(animated: false)
        webView?.load(URLRequest(url: url))
    }
}

// Mensajes de la web (components/GestoAtras.js): el gesto de volver solo vale donde la pantalla tiene «‹ Atrás» y sin una
// hoja o un diálogo encima, como en las apps nativas; entre las pestañas de abajo no hay gesto. El de WebKit espera siempre a
// que falle un gesto propio del borde izquierdo (el tapón), que se queda con el deslizamiento cuando no vale y falla en
// seguida cuando sí. No se enciende ni se apaga nada: apagar y encender allowsBackForwardNavigationGestures, o el propio
// tapón, dejaba sin efecto el primer deslizamiento después. El tapón solo bloquea: no retrasa ni cancela los toques de la
// página ni le quita sus gestos (desplazar, deslizar una fila).
// WebKit pone también deslizar desde el borde derecho para ir «adelante» en el historial: en una app no existe, se apaga.
// Solo el WebView principal: el visor de ventanas nuevas (VisorWeb.swift) comparte esta configuración.
private final class GestoAtras: NSObject, WKScriptMessageHandler, UIGestureRecognizerDelegate {
    private weak var webView: WKWebView?
    private let tapon = UIScreenEdgePanGestureRecognizer()
    private var bloqueado = false

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        tapon.edges = .left
        tapon.cancelsTouchesInView = false
        tapon.delaysTouchesBegan = false
        tapon.delegate = self
        webView.addGestureRecognizer(tapon)
        for gesto in webView.gestureRecognizers ?? [] where gesto !== tapon {
            gesto.require(toFail: tapon)
            if let borde = gesto as? UIScreenEdgePanGestureRecognizer, borde.edges.contains(.right) { borde.isEnabled = false }
        }
    }

    func bloquear(_ si: Bool) {
        bloqueado = si
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        bloqueado
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otro: UIGestureRecognizer) -> Bool {
        true
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let activo = message.body as? Bool, let webView, message.webView === webView else { return }
        bloquear(!activo)
    }
}

// Vibración del sistema (lib/haptica.js): «toque» al cambiar de pestaña o abrir algo, «exito» al cobrar o pagar, «aviso» y
// «error». navigator.vibrate no existe en iOS, y el truco del interruptor de la web (iOS 18) solo da un tipo de toque.
private final class Haptica: NSObject, WKScriptMessageHandler {
    private let seleccion = UISelectionFeedbackGenerator()
    private let impacto = UIImpactFeedbackGenerator(style: .light)
    private let resultado = UINotificationFeedbackGenerator()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "exito": resultado.notificationOccurred(.success)
        case "aviso": resultado.notificationOccurred(.warning)
        case "error": resultado.notificationOccurred(.error)
        case "golpe": impacto.impactOccurred()
        default: seleccion.selectionChanged()
        }
    }
}

// Mantener pulsada una fila o una imagen la «levantaba» para arrastrarla a otra app, como un enlace de Safari: en una app,
// mantener pulsado no hace eso. Es la interacción de arrastrar de la vista de contenido de WebKit.
private func sinArrastrar(_ webView: WKWebView) {
    for vista in webView.scrollView.subviews {
        for arrastre in vista.interactions.compactMap({ $0 as? UIDragInteraction }) { arrastre.isEnabled = false }
    }
}

// La barra que iOS pone encima del teclado en las páginas web (anterior, siguiente y ✓) no la puede quitar la web. En una app,
// sobra: la conversación ya tiene su botón de enviar y los formularios, el suyo de guardar. Además dejaba un hueco entre el
// teclado y el cuadro de escribir. La da inputAccessoryView de la vista de contenido de WebKit: se sustituye su clase por una
// subclase (creada una sola vez) que no da ninguna, lo mismo que hace el plugin Keyboard de Capacitor.
private func quitarBarraDelTeclado(_ webView: WKWebView) {
    guard let contenido = webView.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return }
    let base: AnyClass = type(of: contenido)
    let nombre = "\(NSStringFromClass(base))_SinBarra"
    var clase: AnyClass? = NSClassFromString(nombre)
    if clase == nil, let nueva = objc_allocateClassPair(base, nombre, 0) {
        let selector = #selector(getter: UIResponder.inputAccessoryView)
        let ninguna: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        if let original = class_getInstanceMethod(base, selector) {
            class_addMethod(nueva, selector, imp_implementationWithBlock(ninguna), method_getTypeEncoding(original))
        }
        objc_registerClassPair(nueva)
        clase = nueva
    }
    if let clase { object_setClass(contenido, clase) }
}

import UIKit
import WebKit
import Capacitor

// Controlador principal: el WebView de Capacitor que carga www.fisquo.com, con lo que una app de iOS necesita además:
// - ventanas nuevas y descargas resueltas dentro de la app (DelegadoWeb.swift), no en Safari, que no tiene la sesión;
// - el escáner de documentos nativo para los tickets (EscanerPlugin.swift);
// - deslizar desde el borde izquierdo para volver atrás, como en Safari (no con una hoja abierta: GestoAtras, abajo);
// - tirar hacia abajo para recargar y los accesos rápidos del icono (SceneDelegate.swift).
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
        // Atrás deslizando desde el borde: recorre el historial de la web (pantallas y pasos de los formularios).
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
        gestoAtras?.bloquear(false) // página nueva: la anterior pudo dejarlo bloqueado con una hoja abierta
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

// Mensajes de la web (components/GestoAtras.js): con una hoja o un diálogo abiertos, deslizar desde el borde no debe sacar
// de la pantalla que tapan, como en las apps nativas. Mientras tanto, un gesto propio del borde izquierdo se queda con el
// deslizamiento y el de volver de WebKit, que espera a que este falle, no llega a empezar. (Apagar y encender
// allowsBackForwardNavigationGestures dejaba sin efecto el primer deslizamiento después.) Solo el WebView principal: el
// visor de ventanas nuevas (VisorWeb.swift) comparte esta configuración.
private final class GestoAtras: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let tapon = UIScreenEdgePanGestureRecognizer()

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        tapon.edges = .left
        tapon.isEnabled = false
        webView.addGestureRecognizer(tapon)
    }

    func bloquear(_ si: Bool) {
        if si, let webView {
            for gesto in webView.gestureRecognizers ?? [] where gesto !== tapon { gesto.require(toFail: tapon) }
        }
        tapon.isEnabled = si
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let activo = message.body as? Bool, let webView, message.webView === webView else { return }
        bloquear(!activo)
    }
}

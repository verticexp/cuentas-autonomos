import UIKit
import WebKit
import Capacitor

// Controlador principal: el WebView de Capacitor que carga www.nettohq.com, con lo que una app de iOS necesita además:
// - ventanas nuevas y descargas resueltas dentro de la app (DelegadoWeb.swift), no en Safari, que no tiene la sesión;
// - el escáner de documentos nativo para los tickets (EscanerPlugin.swift);
// - tirar hacia abajo para recargar y los accesos rápidos del icono (SceneDelegate.swift).
class NettoViewController: CAPBridgeViewController {
    private var delegado: DelegadoWeb?
    private var rutaPendiente: String?
    private var cargada = false

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = super.webView(with: frame, configuration: configuration)
        // Sin vista previa al mantener pulsado un enlace: en una app no tiene sentido abrir la página «en Safari».
        webView.allowsLinkPreview = false
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
        if let ruta = rutaPendiente {
            rutaPendiente = nil
            abrir(ruta: ruta)
        }
    }

    // Abre una ruta de Netto (accesos rápidos del icono). Si la web aún no ha cargado, espera a que lo haga.
    func abrir(ruta: String) {
        guard cargada, let base = bridge?.config.serverURL, let url = URL(string: ruta, relativeTo: base) else {
            rutaPendiente = ruta
            return
        }
        presentedViewController?.dismiss(animated: false)
        webView?.load(URLRequest(url: url))
    }
}

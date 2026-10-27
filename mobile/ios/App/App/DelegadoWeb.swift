import UIKit
import WebKit
import SafariServices
import Capacitor

// Se pone delante del delegado de Capacitor (WebViewDelegationHandler) y le pasa todo lo que no resuelve aquí:
// - target="_blank" de Fisquo (un justificante, un PDF): se abre en un visor dentro de la app con la misma sesión.
//   Capacitor lo mandaba a Safari, donde no hay sesión y sale el login.
// - Enlaces a otras webs (la sede de la AEAT, la de la AEPD): en un Safari dentro de la app.
// - Descargas (<a download>, ficheros adjuntos, exportaciones): se bajan y se ofrecen con la hoja de compartir
//   («Guardar en Archivos», AirDrop, Mail). Capacitor no las gestionaba y el botón no hacía nada.
final class DelegadoWeb: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let capacitor: WebViewDelegationHandler
    private let servidor: URL?
    private weak var presentador: UIViewController?
    private var destinos: [ObjectIdentifier: URL] = [:]
    var alTerminarCarga: (() -> Void)?
    var alEmpezarPagina: (() -> Void)?

    init(capacitor: WebViewDelegationHandler, servidor: URL?, presentador: UIViewController) {
        self.capacitor = capacitor
        self.servidor = servidor
        self.presentador = presentador
    }

    // Lo que este objeto no implementa lo atiende Capacitor (alertas, confirmaciones, errores de carga…).
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || capacitor.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        capacitor.responds(to: aSelector) ? capacitor : nil
    }

    private func esFisquo(_ url: URL?) -> Bool {
        guard let host = url?.host?.lowercased() else { return false }
        return host == servidor?.host?.lowercased() || host == "fisquo.com" || host.hasSuffix(".fisquo.com")
    }

    private var arriba: UIViewController? {
        var vc = presentador
        while let siguiente = vc?.presentedViewController { vc = siguiente }
        return vc
    }

    // MARK: - Navegación

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        let url = navigationAction.request.url
        let principal = navigationAction.targetFrame?.isMainFrame ?? true
        if principal, let url = url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !esFisquo(url) {
            abrirFuera(url)
            decisionHandler(.cancel)
            return
        }
        capacitor.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposicion = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        let adjunto = disposicion.lowercased().hasPrefix("attachment")
        decisionHandler(adjunto || !navigationResponse.canShowMIMEType ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // Llega la página nueva, antes de que corra su JavaScript: lo que dejó dicho la anterior (GestoAtras) ya no vale.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        (capacitor as WKNavigationDelegate).webView?(webView, didCommit: navigation)
        if webView === presentador?.view { alEmpezarPagina?() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        capacitor.webView(webView, didFinish: navigation)
        if webView === presentador?.view { alTerminarCarga?() }
    }

    // MARK: - Ventanas nuevas

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if navigationAction.shouldPerformDownload {
            webView.startDownload(using: navigationAction.request) { $0.delegate = self }
            return nil
        }
        guard esFisquo(url) || url.scheme == "blob" else {
            abrirFuera(url)
            return nil
        }
        // Con la configuración que da WebKit, el visor comparte las cookies (la sesión) del WebView principal.
        let visor = VisorWeb(configuration: configuration, delegado: self)
        arriba?.present(UINavigationController(rootViewController: visor), animated: true)
        return visor.webView
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView !== presentador?.view { arriba?.dismiss(animated: true) }
    }

    private func abrirFuera(_ url: URL) {
        if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            let safari = SFSafariViewController(url: url)
            safari.dismissButtonStyle = .close
            arriba?.present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }

    // MARK: - Diálogos de la web (alert, confirm, prompt), en español: los de Capacitor dicen «Ok» y «Cancel».

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let vista = arriba else { return completionHandler() }
        let aviso = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        aviso.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler() })
        vista.present(aviso, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let vista = arriba else { return completionHandler(false) }
        let aviso = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        aviso.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(false) })
        aviso.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(true) })
        vista.present(aviso, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        // El puente de Capacitor usa prompt() con un JSON {"type": …} para sus llamadas síncronas (cookies, http).
        if let datos = prompt.data(using: .utf8),
           (try? JSONSerialization.jsonObject(with: datos, options: .fragmentsAllowed) as? [String: Any])?["type"] != nil {
            capacitor.webView(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }
        guard let vista = arriba else { return completionHandler(nil) }
        let aviso = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        aviso.addTextField { $0.text = defaultText }
        aviso.addAction(UIAlertAction(title: "Cancelar", style: .cancel) { _ in completionHandler(nil) })
        aviso.addAction(UIAlertAction(title: "Aceptar", style: .default) { _ in completionHandler(aviso.textFields?.first?.text) })
        vista.present(aviso, animated: true)
    }

    // MARK: - Descargas

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("descargas/\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            let nombre = suggestedFilename.isEmpty ? "fisquo" : suggestedFilename
            let destino = carpeta.appendingPathComponent(nombre)
            destinos[ObjectIdentifier(download)] = destino
            completionHandler(destino)
        } catch {
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let archivo = destinos.removeValue(forKey: ObjectIdentifier(download)), let vista = arriba else { return }
        let compartir = UIActivityViewController(activityItems: [archivo], applicationActivities: nil)
        compartir.popoverPresentationController?.sourceView = vista.view
        compartir.popoverPresentationController?.sourceRect = CGRect(x: vista.view.bounds.midX, y: vista.view.bounds.maxY - 80, width: 1, height: 1)
        vista.present(compartir, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinos.removeValue(forKey: ObjectIdentifier(download))
        let aviso = UIAlertController(title: "No se ha podido descargar", message: "Revisa la conexión y vuelve a intentarlo.", preferredStyle: .alert)
        aviso.addAction(UIAlertAction(title: "Aceptar", style: .default))
        arriba?.present(aviso, animated: true)
    }
}

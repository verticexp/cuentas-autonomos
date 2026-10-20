import UIKit
import WebKit

// Hoja para lo que Fisquo abre en una ventana nueva (un justificante, un PDF, una factura): mismo WebKit y misma sesión,
// con «Cerrar» y el botón de compartir del sistema.
final class VisorWeb: UIViewController {
    let webView: WKWebView
    private var titulo: NSKeyValueObservation?

    init(configuration: WKWebViewConfiguration, delegado: DelegadoWeb) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
        webView.navigationDelegate = delegado
        webView.uiDelegate = delegado
        webView.allowsLinkPreview = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) no se usa") }

    override func loadView() {
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })
        navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .action, primaryAction: UIAction { [weak self] _ in
            self?.compartir()
        })
        titulo = webView.observe(\.title, options: [.new]) { [weak self] web, _ in
            self?.navigationItem.title = web.title
        }
    }

    // Comparte lo que se está viendo como PDF (también una imagen o una página): así se puede guardar en Archivos o mandar.
    private func compartir() {
        let nombre = (webView.title?.isEmpty == false ? webView.title! : "Fisquo").replacingOccurrences(of: "/", with: "-")
        webView.createPDF { [weak self] resultado in
            guard let self, case .success(let datos) = resultado else { return }
            let archivo = FileManager.default.temporaryDirectory.appendingPathComponent("\(nombre).pdf")
            guard (try? datos.write(to: archivo)) != nil else { return }
            let hoja = UIActivityViewController(activityItems: [archivo], applicationActivities: nil)
            hoja.popoverPresentationController?.barButtonItem = self.navigationItem.rightBarButtonItem
            self.present(hoja, animated: true)
        }
    }
}

import UIKit
import VisionKit
import Capacitor

// Escáner de documentos de iOS (VisionKit) para tickets y facturas: detecta los bordes, endereza y limpia la imagen,
// mejor que una foto suelta para que la IA lea los importes. Desde la web: window.Capacitor.Plugins.Escaner
// (lib/escanerNativo.js). escanear() devuelve { paginas: [JPEG en base64] } o falla con «cancelado».
@objc(EscanerPlugin)
public class EscanerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "EscanerPlugin"
    public let jsName = "Escaner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "disponible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "escanear", returnType: CAPPluginReturnPromise),
    ]
    private var llamada: CAPPluginCall?

    @objc func disponible(_ call: CAPPluginCall) {
        call.resolve(["disponible": VNDocumentCameraViewController.isSupported])
    }

    @objc func escanear(_ call: CAPPluginCall) {
        guard VNDocumentCameraViewController.isSupported else {
            call.reject("El escáner no está disponible en este dispositivo", "no-disponible")
            return
        }
        DispatchQueue.main.async {
            self.llamada = call
            let escaner = VNDocumentCameraViewController()
            escaner.delegate = self
            self.bridge?.viewController?.present(escaner, animated: true)
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        let paginas = (0..<scan.pageCount).compactMap { Self.jpeg(scan.imageOfPage(at: $0))?.base64EncodedString() }
        controller.dismiss(animated: true)
        llamada?.resolve(["paginas": paginas])
        llamada = nil
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        llamada?.reject("cancelado", "cancelado")
        llamada = nil
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true)
        llamada?.reject(error.localizedDescription, "error")
        llamada = nil
    }

    // Como mucho 2.000 px de lado y calidad 0,8: se lee bien y no pasa de unos cientos de KB.
    private static func jpeg(_ imagen: UIImage) -> Data? {
        let lado = max(imagen.size.width, imagen.size.height)
        guard lado > 2000 else { return imagen.jpegData(compressionQuality: 0.8) }
        let escala = 2000 / lado
        let tamano = CGSize(width: imagen.size.width * escala, height: imagen.size.height * escala)
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        return UIGraphicsImageRenderer(size: tamano, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: tamano))
        }.jpegData(compressionQuality: 0.8)
    }
}

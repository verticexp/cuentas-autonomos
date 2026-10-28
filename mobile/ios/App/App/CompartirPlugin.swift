import UIKit
import UniformTypeIdentifiers
import Capacitor

// «Compartir» → Fisquo desde otras apps (Archivos, Mail, Safari…): Info.plist declara los PDF, fotos y XML
// (CFBundleDocumentTypes), iOS abre la app con el archivo y SceneDelegate lo deja aquí. La app va a Por revisar con
// ?compartido=1 y la web lo recoge con pendientes() (lib/compartidoCliente.js), que lo sube con la sesión normal.
// pendientes() → { archivos: [{ nombre, tipo, datos (base64) }] }; subidos() vacía la lista cuando la web los ha subido
// (si estaba bloqueada, siguen aquí y se suben tras desbloquear).
@objc(CompartirPlugin)
public class CompartirPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CompartirPlugin"
    public let jsName = "Compartir"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pendientes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subidos", returnType: CAPPluginReturnPromise),
    ]

    private static let maxBytes = 5 * 1024 * 1024
    private static var cola: [[String: String]] = []
    static var hayPendientes: Bool { !cola.isEmpty }

    // Archivos recibidos → true si alguno se puede subir. Los que pasan de 5 MB o no se leen se quedan fuera
    // (la bandeja avisa de que no ha llegado nada que se pueda leer).
    @discardableResult
    static func recibir(_ urls: [URL]) -> Bool {
        var alguno = false
        for url in urls where url.isFileURL {
            let acceso = url.startAccessingSecurityScopedResource()
            defer {
                if acceso { url.stopAccessingSecurityScopedResource() }
                // La copia que iOS deja en Documents/Inbox ya no hace falta.
                if url.path.contains("/Inbox/") { try? FileManager.default.removeItem(at: url) }
            }
            guard let datos = try? Data(contentsOf: url), !datos.isEmpty, datos.count <= maxBytes else { continue }
            let tipo = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            cola.append(["nombre": url.lastPathComponent, "tipo": tipo, "datos": datos.base64EncodedString()])
            alguno = true
        }
        return alguno
    }

    @objc func pendientes(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["archivos": CompartirPlugin.cola]) }
    }

    @objc func subidos(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            CompartirPlugin.cola = []
            call.resolve()
        }
    }
}

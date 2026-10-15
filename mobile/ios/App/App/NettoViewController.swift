import UIKit
import WebKit
import Capacitor

// WKWebView no garantiza escribir las cookies en disco antes de que iOS cierre la app, y la sesión se perdía.
// Al pasar a segundo plano guardamos la cookie de sesión «t» de Netto en el Llavero y la restauramos antes de
// cargar la web. La cookie de desbloqueo «d» no se guarda: es de sesión y, como en la web, pide desbloquear al volver.
class NettoViewController: CAPBridgeViewController {
    private static let dominios = ["nettohq.com", "www.nettohq.com", ".nettohq.com", ".www.nettohq.com"]
    private static let persistentes: Set<String> = ["t"]

    override func viewDidLoad() {
        NotificationCenter.default.addObserver(self, selector: #selector(guardarCookies),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(guardarCookies),
                                               name: UIApplication.willTerminateNotification, object: nil)
        // La web se carga en super.viewDidLoad(): primero devolvemos las cookies al almacén del WebView.
        restaurarCookies { super.viewDidLoad() }
    }

    private var almacen: WKHTTPCookieStore? { webView?.configuration.websiteDataStore.httpCookieStore }

    @objc private func guardarCookies() {
        let tarea = UIApplication.shared.beginBackgroundTask(withName: "guardar-cookies")
        almacen?.getAllCookies { cookies in
            let nuestras = cookies.filter { Self.dominios.contains($0.domain) && Self.persistentes.contains($0.name) }
            if nuestras.isEmpty {
                Llavero.borrar()
            } else if let datos = try? NSKeyedArchiver.archivedData(
                withRootObject: nuestras.compactMap { $0.properties }, requiringSecureCoding: false) {
                Llavero.guardar(datos)
            }
            UIApplication.shared.endBackgroundTask(tarea)
        }
    }

    private func restaurarCookies(_ hecho: @escaping () -> Void) {
        guard let almacen = almacen, let datos = Llavero.leer(),
              let props = (try? NSKeyedUnarchiver.unarchiveTopLevelObjectWithData(datos)) as? [[HTTPCookiePropertyKey: Any]] else {
            return hecho()
        }
        let cookies = props.compactMap(HTTPCookie.init).filter { ($0.expiresDate ?? .distantPast) > Date() }
        let grupo = DispatchGroup()
        for c in cookies {
            grupo.enter()
            almacen.setCookie(c) { grupo.leave() }
        }
        grupo.notify(queue: .main, execute: hecho)
    }
}

// Un único elemento en el Llavero, solo accesible en este dispositivo y tras el primer desbloqueo.
private enum Llavero {
    private static let consulta: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.nettohq.app",
        kSecAttrAccount as String: "sesion",
    ]

    static func guardar(_ datos: Data) {
        borrar()
        var item = consulta
        item[kSecValueData as String] = datos
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func leer() -> Data? {
        var q = consulta
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var res: AnyObject?
        return SecItemCopyMatching(q as CFDictionary, &res) == errSecSuccess ? res as? Data : nil
    }

    static func borrar() { SecItemDelete(consulta as CFDictionary) }
}

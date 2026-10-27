import UIKit
import UserNotifications
import Capacitor

// Notificaciones nativas (APNs) para los avisos de Fisquo: plazos de Hacienda, facturas vencidas, mensajes de la
// gestoría… (lib/push.js y lib/apns.js en el servidor). Desde la web: window.Capacitor.Plugins.Avisos (lib/avisosNativos.js).
// estado() → { permiso: concedido | denegado | sin-preguntar } · activar() pide permiso y devuelve { token } ·
// token() lo renueva sin preguntar (si ya hay permiso). Al tocar un aviso se abre su página (url relativa) en la app.
extension Notification.Name {
    static let fisquoTokenAPNs = Notification.Name("FisquoTokenAPNs")
    static let fisquoErrorAPNs = Notification.Name("FisquoErrorAPNs")
}

@objc(AvisosPlugin)
public class AvisosPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "AvisosPlugin"
    public let jsName = "Avisos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "estado", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "token", returnType: CAPPluginReturnPromise),
    ]
    private var esperando: [CAPPluginCall] = []
    private var observadores: [NSObjectProtocol] = []

    override public func load() {
        UNUserNotificationCenter.current().delegate = self
        observadores.append(NotificationCenter.default.addObserver(forName: .fisquoTokenAPNs, object: nil, queue: .main) { [weak self] n in
            let token = n.object as? String ?? ""
            self?.esperando.forEach { $0.resolve(["token": token]) }
            self?.esperando = []
        })
        observadores.append(NotificationCenter.default.addObserver(forName: .fisquoErrorAPNs, object: nil, queue: .main) { [weak self] n in
            let texto = (n.object as? Error)?.localizedDescription ?? "No se ha podido registrar el iPhone para los avisos"
            self?.esperando.forEach { $0.reject(texto, "error") }
            self?.esperando = []
        })
    }

    @objc func estado(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { ajustes in
            let permiso: String
            switch ajustes.authorizationStatus {
            case .authorized, .provisional, .ephemeral: permiso = "concedido"
            case .denied: permiso = "denegado"
            default: permiso = "sin-preguntar"
            }
            call.resolve(["permiso": permiso])
        }
    }

    @objc func activar(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { concedido, _ in
            guard concedido else { call.reject("denegado", "denegado"); return }
            self.registrar(call)
        }
    }

    @objc func token(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { ajustes in
            guard [.authorized, .provisional, .ephemeral].contains(ajustes.authorizationStatus) else { call.reject("sin permiso", "denegado"); return }
            self.registrar(call)
        }
    }

    // El token llega a AppDelegate (didRegisterForRemoteNotifications…), que lo reenvía aquí.
    private func registrar(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.esperando.append(call)
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // Con la app abierta, el aviso se enseña igualmente arriba.
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    // Al tocarlo: su página, solo si es una ruta de Fisquo (empieza por «/»).
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
        defer { completionHandler() }
        guard let ruta = response.notification.request.content.userInfo["url"] as? String, ruta.hasPrefix("/"), !ruta.hasPrefix("//"),
              let base = bridge?.config.serverURL, let destino = URL(string: ruta, relativeTo: base) else { return }
        DispatchQueue.main.async { self.bridge?.webView?.load(URLRequest(url: destino)) }
    }
}

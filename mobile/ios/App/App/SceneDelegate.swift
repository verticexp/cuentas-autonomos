import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var netto: NettoViewController? { window?.rootViewController as? NettoViewController }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NettoViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // Acceso rápido con la app cerrada: se abre en cuanto carga Netto.
        if let atajo = connectionOptions.shortcutItem { abrir(atajo) }
    }

    // Accesos rápidos al mantener pulsado el icono (UIApplicationShortcutItems en Info.plist).
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(abrir(shortcutItem))
    }

    @discardableResult
    private func abrir(_ atajo: UIApplicationShortcutItem) -> Bool {
        guard let ruta = atajo.userInfo?["ruta"] as? String, ruta.hasPrefix("/") else { return false }
        netto?.abrir(ruta: ruta)
        return true
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

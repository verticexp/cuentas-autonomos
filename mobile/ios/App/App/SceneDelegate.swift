import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var fisquo: FisquoViewController? { window?.rootViewController as? FisquoViewController }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = FisquoViewController.verde // sin negro mientras arranca, igual que la pantalla de lanzamiento
        window?.rootViewController = FisquoViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // Acceso rápido con la app cerrada: se abre en cuanto carga Fisquo.
        if let atajo = connectionOptions.shortcutItem { abrir(atajo) }
        // Factura compartida con la app cerrada.
        recibir(connectionOptions.urlContexts)
    }

    // Accesos rápidos al mantener pulsado el icono (UIApplicationShortcutItems en Info.plist).
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(abrir(shortcutItem))
    }

    @discardableResult
    private func abrir(_ atajo: UIApplicationShortcutItem) -> Bool {
        guard let ruta = atajo.userInfo?["ruta"] as? String, ruta.hasPrefix("/") else { return false }
        fisquo?.abrir(ruta: ruta)
        return true
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if !recibir(URLContexts) { SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts) }
    }

    // Archivos compartidos con Fisquo (CompartirPlugin.swift): a Por revisar, que los sube. → true si eran archivos.
    @discardableResult
    private func recibir(_ contextos: Set<UIOpenURLContext>) -> Bool {
        let archivos = contextos.map(\.url).filter(\.isFileURL)
        guard !archivos.isEmpty else { return false }
        fisquo?.abrir(ruta: CompartirPlugin.recibir(archivos) ? "/gastos?ver=revisar&compartido=1" : "/gastos?ver=revisar&compartido=0")
        return true
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

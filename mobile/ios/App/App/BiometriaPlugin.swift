import UIKit
import LocalAuthentication
import Security
import Capacitor

// Face ID nativo, como en la app de un banco: al activarlo, el servidor da una credencial de este iPhone
// (app/api/dispositivo) que se guarda en el llavero protegida con Face ID (biometryCurrentSet: si cambian las caras
// registradas, deja de valer). Para entrar, leerla pide Face ID con la animación del sistema, sin la hoja de las llaves
// de acceso. Desde la web: window.Capacitor.Plugins.Biometria (lib/faceidNativo.js).
// disponible() → { disponible, tipo } · tiene() → { tiene } (sin pedir la cara) · guardar({ valor }) · leer({ motivo })
// → { valor } o falla con «cancelado» · borrar().
@objc(BiometriaPlugin)
public class BiometriaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometriaPlugin"
    public let jsName = "Biometria"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "disponible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tiene", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "guardar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "borrar", returnType: CAPPluginReturnPromise),
    ]
    private let servicio = "com.fisquo.app.faceid"
    private let cuenta = "credencial"

    private func consulta() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: servicio, kSecAttrAccount as String: cuenta]
    }

    @objc func disponible(_ call: CAPPluginCall) {
        let contexto = LAContext()
        var error: NSError?
        let ok = contexto.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let tipo = contexto.biometryType == .faceID ? "faceID" : contexto.biometryType == .touchID ? "touchID" : "ninguno"
        call.resolve(["disponible": ok, "tipo": tipo])
    }

    // Sin pedir la cara: si el elemento existe, el llavero responde «necesita interacción».
    @objc func tiene(_ call: CAPPluginCall) {
        var q = consulta()
        let contexto = LAContext()
        contexto.interactionNotAllowed = true
        q[kSecUseAuthenticationContext as String] = contexto
        q[kSecReturnData as String] = false
        let estado = SecItemCopyMatching(q as CFDictionary, nil)
        call.resolve(["tiene": estado == errSecSuccess || estado == errSecInteractionNotAllowed])
    }

    @objc func guardar(_ call: CAPPluginCall) {
        guard let valor = call.getString("valor"), let datos = valor.data(using: .utf8) else {
            call.reject("Falta la credencial", "error")
            return
        }
        var errorAcl: Unmanaged<CFError>?
        guard let acl = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, &errorAcl) else {
            call.reject("Este iPhone no permite guardar con Face ID", "error")
            return
        }
        SecItemDelete(consulta() as CFDictionary)
        var q = consulta()
        q[kSecValueData as String] = datos
        q[kSecAttrAccessControl as String] = acl
        let estado = SecItemAdd(q as CFDictionary, nil)
        if estado == errSecSuccess { call.resolve() } else { call.reject("No se ha podido guardar en el llavero (\(estado))", "error") }
    }

    @objc func leer(_ call: CAPPluginCall) {
        let motivo = call.getString("motivo") ?? "Entrar en Fisquo"
        DispatchQueue.global(qos: .userInitiated).async {
            let contexto = LAContext()
            contexto.localizedReason = motivo
            contexto.localizedCancelTitle = "Cancelar"
            var q = self.consulta()
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            q[kSecUseAuthenticationContext as String] = contexto
            var resultado: AnyObject?
            let estado = SecItemCopyMatching(q as CFDictionary, &resultado)
            switch estado {
            case errSecSuccess:
                if let datos = resultado as? Data, let valor = String(data: datos, encoding: .utf8) { call.resolve(["valor": valor]) }
                else { call.reject("Credencial no válida", "error") }
            case errSecUserCanceled, errSecAuthFailed:
                call.reject("cancelado", "cancelado")
            case errSecItemNotFound:
                call.reject("No hay Face ID activado en este iPhone", "sin-credencial")
            default:
                call.reject("No se ha podido usar Face ID (\(estado))", "error")
            }
        }
    }

    @objc func borrar(_ call: CAPPluginCall) {
        SecItemDelete(consulta() as CFDictionary)
        call.resolve()
    }
}

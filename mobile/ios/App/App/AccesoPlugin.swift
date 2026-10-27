import UIKit
import AuthenticationServices
import CryptoKit
import Capacitor

// Acceso nativo de iOS con Apple y sesión web para Google, desde window.Capacitor.Plugins.Acceso
// (lib/accesoNativo.js). Conserva el controlador o la sesión hasta terminar y devuelve «cancelado» si el usuario cierra.
@objc(AccesoPlugin)
public class AccesoPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AccesoPlugin"
    public let jsName = "Acceso"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "conApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sesionWeb", returnType: CAPPluginReturnPromise),
    ]
    private var llamadaApple: CAPPluginCall?
    private var controladorApple: ASAuthorizationController?
    private var sesion: ASWebAuthenticationSession?
    private var ventana: UIWindow?

    @objc func conApple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce") else {
            call.reject("Falta el nonce", "error")
            return
        }
        DispatchQueue.main.async {
            guard self.preparar(call) else { return }
            let solicitud = ASAuthorizationAppleIDProvider().createRequest()
            solicitud.requestedScopes = [.fullName, .email]
            solicitud.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
            let controlador = ASAuthorizationController(authorizationRequests: [solicitud])
            controlador.delegate = self
            controlador.presentationContextProvider = self
            self.llamadaApple = call
            self.controladorApple = controlador
            controlador.performRequests()
        }
    }

    @objc func sesionWeb(_ call: CAPPluginCall) {
        guard let texto = call.getString("url"), let url = URL(string: texto),
              url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty,
              let esquema = call.getString("esquema"), !esquema.isEmpty else {
            call.reject("Se necesita una URL https y un esquema de retorno", "error")
            return
        }
        DispatchQueue.main.async {
            guard self.preparar(call) else { return }
            let sesion = ASWebAuthenticationSession(url: url, callbackURLScheme: esquema) { [weak self] retorno, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.sesion = nil
                    self.ventana = nil
                    if let error {
                        let cancelado = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                        call.reject(cancelado ? "cancelado" : error.localizedDescription, cancelado ? "cancelado" : "error")
                    } else if let retorno {
                        call.resolve(["url": retorno.absoluteString])
                    } else {
                        call.reject("La sesión no devolvió una URL", "error")
                    }
                }
            }
            sesion.prefersEphemeralWebBrowserSession = false
            sesion.presentationContextProvider = self
            self.sesion = sesion
            if !sesion.start() {
                self.sesion = nil
                self.ventana = nil
                call.reject("No se pudo iniciar la sesión web", "error")
            }
        }
    }

    // Solo una presentación a la vez; la ventana pertenece al WebView que ha solicitado el acceso.
    private func preparar(_ call: CAPPluginCall) -> Bool {
        guard controladorApple == nil, sesion == nil else {
            call.reject("Ya hay un acceso en curso", "error")
            return false
        }
        guard let ventana = bridge?.viewController?.view.window else {
            call.reject("No hay una ventana disponible para iniciar sesión", "error")
            return false
        }
        self.ventana = ventana
        return true
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        ventana!
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ventana!
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        DispatchQueue.main.async {
            guard controller === self.controladorApple, let call = self.llamadaApple else { return }
            defer { self.liberarApple() }
            guard let credencial = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let token = credencial.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
                  let codigo = credencial.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) else {
                call.reject("Apple no devolvió las credenciales necesarias", "error")
                return
            }
            let nombre = [credencial.fullName?.givenName, credencial.fullName?.familyName]
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            call.resolve(["identityToken": token, "authorizationCode": codigo, "nombre": nombre, "email": credencial.email ?? ""])
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        DispatchQueue.main.async {
            guard controller === self.controladorApple else { return }
            let cancelado = (error as? ASAuthorizationError)?.code == .canceled
            self.llamadaApple?.reject(cancelado ? "cancelado" : error.localizedDescription, cancelado ? "cancelado" : "error")
            self.liberarApple()
        }
    }

    private func liberarApple() {
        llamadaApple = nil
        controladorApple = nil
        ventana = nil
    }
}

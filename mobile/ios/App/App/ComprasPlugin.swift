import UIKit
import StoreKit
import Capacitor

// Compras dentro de la app (StoreKit 2) para la suscripción a Fisquo: en la app de iOS los planes se contratan con el
// App Store (normas 3.1.1 y 3.1.3 de Apple). La web enseña los planes y manda cada transacción firmada (JWS) al servidor,
// que la comprueba con la cadena de certificados de Apple y deja el plan de la empresa al día (lib/compraApple.js).
// Desde la web: window.Capacitor.Plugins.Compras (lib/comprasNativas.js).
// puedeComprar() → { puede } · productos({ ids }) → { productos: [{ id, nombre, descripcion, precio, importe, moneda,
// periodo: mes | anio }] } · comprar({ id, token }) → { estado: comprado, jws } | { estado: pendiente } (Compra Aplazada,
// confirmación del banco) | { estado: cancelado } · sincronizar() → { transacciones } (las suscripciones vigentes de este
// ID de Apple, sin preguntar nada) · restaurar() → lo mismo tras AppStore.sync() (puede pedir el ID de Apple) ·
// gestionar() → la hoja de Apple para cambiar o cancelar la suscripción.
// Cada transacción va como { jws, producto, token (appAccountToken), original, expira (ms) }.
// Evento «transaccion» con la misma forma: renovaciones y compras que se completan fuera de la pantalla de planes (una
// Compra Aplazada aprobada, otro dispositivo, un reembolso). Se guarda hasta que la web lo escucha.
@objc(ComprasPlugin)
public class ComprasPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ComprasPlugin"
    public let jsName = "Compras"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "puedeComprar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "productos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "comprar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sincronizar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restaurar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gestionar", returnType: CAPPluginReturnPromise),
    ]
    private var escucha: Task<Void, Never>?
    @MainActor private var cargados: [String: Product] = [:]

    // Apple pide escuchar Transaction.updates desde que arranca la app: si no, una compra que se completa más tarde se
    // perdería. Se termina (finish) aquí: lo que manda es el servidor, que además recibe los avisos de Apple, y las
    // vigentes se vuelven a mandar al abrir la app (sincronizar).
    override public func load() {
        escucha = Task.detached { [weak self] in
            for await resultado in Transaction.updates {
                guard case .verified(let transaccion) = resultado else { continue }
                await transaccion.finish()
                let datos = ComprasPlugin.datos(resultado, transaccion)
                await MainActor.run { self?.notifyListeners("transaccion", data: datos, retainUntilConsumed: true) }
            }
        }
    }

    deinit { escucha?.cancel() }

    private static func datos(_ resultado: VerificationResult<Transaction>, _ t: Transaction) -> [String: Any] {
        var d: [String: Any] = ["jws": resultado.jwsRepresentation, "producto": t.productID, "original": String(t.originalID)]
        if let token = t.appAccountToken { d["token"] = token.uuidString.lowercased() }
        if let expira = t.expirationDate { d["expira"] = Int64(expira.timeIntervalSince1970 * 1000) }
        return d
    }

    private static func periodo(_ p: Product) -> String {
        guard let s = p.subscription?.subscriptionPeriod else { return "" }
        switch s.unit {
        case .month: return s.value == 1 ? "mes" : "\(s.value)-meses"
        case .year: return s.value == 1 ? "anio" : "\(s.value)-anios"
        case .week: return "semana"
        case .day: return "dia"
        @unknown default: return ""
        }
    }

    // La escena de la app, para que la hoja de compra de Apple salga encima (iOS 17 o posterior).
    @MainActor private var escena: UIWindowScene? {
        bridge?.viewController?.view.window?.windowScene
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
    }

    @objc func puedeComprar(_ call: CAPPluginCall) {
        call.resolve(["puede": AppStore.canMakePayments])
    }

    @objc func productos(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task { @MainActor in
            do {
                let lista = try await Product.products(for: ids)
                for p in lista { self.cargados[p.id] = p }
                call.resolve(["productos": lista.map { p -> [String: Any] in
                    ["id": p.id, "nombre": p.displayName, "descripcion": p.description, "precio": p.displayPrice,
                     "importe": NSDecimalNumber(decimal: p.price).doubleValue, "moneda": p.priceFormatStyle.currencyCode,
                     "periodo": ComprasPlugin.periodo(p)]
                }])
            } catch {
                call.reject(NSLocalizedString("No se han podido cargar los planes del App Store.", comment: ""), "error", error)
            }
        }
    }

    @objc func comprar(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("Falta el plan", "error"); return }
        let token = call.getString("token").flatMap { UUID(uuidString: $0) }
        Task { @MainActor in
            do {
                var producto = self.cargados[id]
                if producto == nil { producto = try await Product.products(for: [id]).first }
                guard let producto else {
                    call.reject(NSLocalizedString("Ese plan no está disponible en el App Store.", comment: ""), "no-disponible")
                    return
                }
                var opciones: Set<Product.PurchaseOption> = []
                if let token { opciones.insert(.appAccountToken(token)) }
                let resultado: Product.PurchaseResult
                if #available(iOS 17.0, *), let escena = self.escena {
                    resultado = try await producto.purchase(confirmIn: escena, options: opciones)
                } else {
                    resultado = try await producto.purchase(options: opciones)
                }
                switch resultado {
                case .success(let verificacion):
                    guard case .verified(let transaccion) = verificacion else {
                        call.reject(NSLocalizedString("Apple no ha podido verificar la compra.", comment: ""), "no-verificada")
                        return
                    }
                    await transaccion.finish()
                    var datos = ComprasPlugin.datos(verificacion, transaccion)
                    datos["estado"] = "comprado"
                    call.resolve(datos)
                case .pending:
                    call.resolve(["estado": "pendiente"])
                case .userCancelled:
                    call.resolve(["estado": "cancelado"])
                @unknown default:
                    call.resolve(["estado": "cancelado"])
                }
            } catch StoreKitError.userCancelled {
                call.resolve(["estado": "cancelado"])
            } catch {
                call.reject(error.localizedDescription, "error", error)
            }
        }
    }

    // Las suscripciones vigentes de este ID de Apple (Transaction.currentEntitlements), sin pedir nada.
    private static func vigentes() async -> [[String: Any]] {
        var lista: [[String: Any]] = []
        for await resultado in Transaction.currentEntitlements {
            guard case .verified(let t) = resultado, t.productType == .autoRenewable else { continue }
            lista.append(datos(resultado, t))
        }
        return lista
    }

    @objc func sincronizar(_ call: CAPPluginCall) {
        Task { call.resolve(["transacciones": await ComprasPlugin.vigentes()]) }
    }

    // «Restaurar compras»: pide al App Store lo último de este ID de Apple (puede pedir iniciar sesión) y devuelve las vigentes.
    @objc func restaurar(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch StoreKitError.userCancelled {
                call.resolve(["transacciones": [] as [[String: Any]], "cancelado": true])
                return
            } catch {
                call.reject(error.localizedDescription, "error", error)
                return
            }
            call.resolve(["transacciones": await ComprasPlugin.vigentes()])
        }
    }

    // La hoja de Apple para cambiar de plan o cancelar, sin salir de la app.
    @objc func gestionar(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let escena = self.escena else {
                call.reject(NSLocalizedString("No se ha podido abrir la gestión de la suscripción.", comment: ""), "error")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: escena)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, "error", error)
            }
        }
    }
}

# Suscripción con compras dentro de la app (StoreKit 2)

Apple rechazó la app (6-11-2026) por las normas **3.1.1 y 3.1.3**: los mismos planes que se venden a autónomos y pymes en
la web tenían que poder comprarse también dentro de la app. Desde esta versión, en la app de iOS los planes se contratan
con el App Store; en la web, con Stripe, como siempre. Son los mismos planes y los mismos límites: solo cambia quién cobra.

## Cómo funciona

- **App** (`mobile/ios/App/App/ComprasPlugin.swift`): StoreKit 2. Carga los productos con su precio en la moneda de cada
  persona, compra con el `appAccountToken` de la empresa, escucha `Transaction.updates` desde que arranca, «Restaurar
  compras» (`AppStore.sync`) y «Gestionar suscripción» (la hoja de Apple, sin salir de la app).
- **Pantalla** (`components/PlanesApple.js`, en Ajustes › Tu plan): los planes de Autónomos o de Pymes según la forma
  jurídica, mensual o anual, el precio que da el App Store, el texto de renovación automática, «Restaurar compras» y los
  enlaces a las condiciones de uso y a la política de privacidad (lo que pide la norma 3.1.2). Solo sale en la app de iOS
  con el plugin; en una versión anterior de la app, en Android y en la web no.
- **Servidor** (`lib/compraApple.js`): cada transacción firmada (JWS) se comprueba con la cadena de certificados de
  Apple (`lib/appleFirma.js`, raíz Apple Root CA - G3) y deja `empresa.plan` al día: `pagado`, `estado` y `apple`
  (`original`, `producto`, `expira`, `estado`: active · grace · expired · revoked · moved).
  - `POST /api/suscripcion/apple`: la app manda las compras al comprar, al restaurar y al abrirse.
  - `POST /api/appstore`: avisos de Apple (renovaciones, cambios de plan, cobros fallidos, bajas, reembolsos).
  - Cron del día (`dia-apple`): una suscripción que ha pasado su fecha sin aviso se pregunta a la App Store Server API
    (si está su clave) o, sin ella, se da por terminada a los 7 días. Si seguía pagada, vuelve sola al abrir la app.
- **Sin cobrar dos veces**: si alguien que paga con Stripe compra en la app, manda Apple y la suscripción de Stripe deja de
  renovarse (sin devolver el periodo pagado). Una suscripción de Apple que termina nunca quita un plan pagado con Stripe o
  con la licencia de la gestoría. Con una suscripción del App Store vigente, la web no deja contratar con Stripe, el panel
  /admin no deja regalar Fundador ni cambiar el plan, una gestoría no puede incluir a ese cliente en su cuota y que
  termine una suscripción vieja de Stripe no quita el plan. Al revés, quien paga con Stripe ve en la app su plan, sin
  botones de compra.
- **Pruebas de Apple** (sandbox: TestFlight y la revisión): funcionan contra producción, no cuentan como ingresos en
  /admin y, al terminar, la empresa vuelve a la prueba que le quedaba.
- **Facturas**: en las compras del App Store cobra Apple y es Apple quien manda el recibo; Fisquo no emite factura.

## Productos (App Store Connect)

Un solo **grupo de suscripción**: «Fisquo». Los 12 productos van en él (así una persona con su ID de Apple solo puede
tener uno, y cambiar de plan es subir, bajar o pasar de mensual a anual dentro del grupo). Nivel 1 = el más alto.

Precio: el de la web con el 21 % de IVA (Apple cobra con los impuestos incluidos), subido al ,99. Es una propuesta: lo
decides tú en App Store Connect (los precios de la app se leen del App Store, no hay que tocar código). Si un importe no
existe como punto de precio, elige el más cercano. Ten en cuenta la comisión de Apple: 15 % con el *App Store Small
Business Program* (o a partir del segundo año de cada suscripción); 30 % sin él.

| ID del producto | Nombre de referencia | Duración | Nivel | Precio (España, IVA incl.) | Web (sin IVA) |
|---|---|---|---|---|---|
| `com.fisquo.app.aut.esencial.mes` | Autónomo Esencial mensual | 1 mes | 6 | 10,99 € | 9,00 € |
| `com.fisquo.app.aut.esencial.anio` | Autónomo Esencial anual | 1 año | 6 | 91,99 € | 75,60 € |
| `com.fisquo.app.aut.pro.mes` | Autónomo Pro mensual | 1 mes | 5 | 14,99 € | 12,00 € |
| `com.fisquo.app.aut.pro.anio` | Autónomo Pro anual | 1 año | 5 | 121,99 € | 100,80 € |
| `com.fisquo.app.aut.plus.mes` | Autónomo Plus mensual | 1 mes | 4 | 24,99 € | 20,00 € |
| `com.fisquo.app.aut.plus.anio` | Autónomo Plus anual | 1 año | 4 | 203,99 € | 168,00 € |
| `com.fisquo.app.pym.esencial.mes` | Pyme Esencial mensual | 1 mes | 3 | 30,99 € | 25,00 € |
| `com.fisquo.app.pym.esencial.anio` | Pyme Esencial anual | 1 año | 3 | 254,99 € | 210,00 € |
| `com.fisquo.app.pym.pro.mes` | Pyme Pro mensual | 1 mes | 2 | 38,99 € | 32,00 € |
| `com.fisquo.app.pym.pro.anio` | Pyme Pro anual | 1 año | 2 | 325,99 € | 268,80 € |
| `com.fisquo.app.pym.plus.mes` | Pyme Plus mensual | 1 mes | 1 | 66,99 € | 55,00 € |
| `com.fisquo.app.pym.plus.anio` | Pyme Plus anual | 1 año | 1 | 559,99 € | 462,00 € |

La tabla y `mobile/ios/App/App/Fisquo.storekit` (para probar en el simulador con Xcode) salen de `node scripts/storekit.mjs`:
si cambian los precios de la web, vuelve a ejecutarlo.

Localización de cada producto (español; en inglés igual cambiando «Autónomo» por «Freelancer» y «Pyme» por «SME»):
- Nombre visible: «Autónomo Pro» (máx. 35 caracteres).
- Descripción: la frase corta del plan, p. ej. «WhatsApp, banco, inventario y asistente IA» (máx. 55).

## Lo que tienes que hacer tú en App Store Connect

1. **Acuerdo de apps de pago** (Acuerdos, impuestos y banca): firmar el *Paid Applications Agreement* y rellenar banco e
   impuestos. Sin él, las compras no funcionan ni en sandbox. Recomendado: apuntarse al *App Store Small Business
   Program* (15 % en vez de 30 %).
2. **Suscripciones** (la app › Monetización › Suscripciones): crear el grupo «Fisquo» y los 12 productos de la tabla con
   su duración, nivel, precio (España como referencia y que Apple calcule el resto), localización en español e inglés,
   una **captura para la revisión** (la de Ajustes › Tu plan en la app) y en *Notas de revisión*: «Subscribe from
   Settings (Ajustes) > Tu plan in the app. One subscription covers one company.».
3. **Periodo de gracia de facturación**: activarlo (16 días). Fisquo lo respeta (estado «grace»: se sigue usando todo).
4. **Notificaciones del servidor del App Store** (la app › Información de la app): versión 2, URL de producción y de
   sandbox `https://www.fisquo.com/api/appstore`.
5. Opcional, recomendado: **clave de In-App Purchase** (Usuarios y acceso › Integraciones › Compra dentro de la app):
   en Vercel (Production) `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID` y `APPLE_IAP_PRIVATE_KEY` (el contenido de la .p8).
   Con ella el cron confirma con Apple las renovaciones si un aviso no llega.
6. **Build nuevo y versión**: subir un build que lleve `ComprasPlugin.swift` (`cd mobile && npm ci && npx cap sync ios`,
   abrir `ios/App/App.xcodeproj` en un Mac con tu Apple ID en *Xcode › Settings › Accounts*, *Product › Archive* y
   *Distribute App › App Store Connect*). El Mac mini no tiene tu cuenta ni certificados en Xcode, y este portátil ya no
   tiene Xcode. Después, en la versión, «Compras dentro de la app y suscripciones»: añadir los 12 productos (las
   primeras compras se revisan junto con una versión).
7. **Descripción de la app**: añadir al final «Condiciones de uso: https://www.fisquo.com/condiciones · Privacidad:
   https://www.fisquo.com/privacidad» (o poner las condiciones como EULA propio). La norma 3.1.2 pide el enlace a las
   condiciones de uso en la ficha cuando hay suscripciones.
8. **Cuenta de revisión**: sin el plan Fundador (con él no se ven los planes). En /admin: «Quitar Fundador» y «Alargar»
   90 días la prueba. Ver `revision.md`.
9. **Privacidad de la app**: añadir «Compras › Historial de compras» (ver `privacidad.md`).
10. Responder a Apple en el Centro de resolución con el texto de `revision.md` y volver a enviar.

## Probar

- Pruebas automáticas: `tests/compra-apple.test.mjs` (compras, avisos, cron, rutas, Stripe y panel) y
  `tests/apple-firma.test.mjs` (firmas de Apple con una cadena de pruebas, `tests/apoyo/apple-pruebas`).
- Simulador con Xcode: el esquema compartido `App` usa `App/Fisquo.storekit` (StoreKit Testing, sin App Store Connect).
  En el Mac mini, Xcode 27.2 avisa de que CoreSimulator está desactualizado y no deja lanzar en el simulador desde Xcode
  hasta instalar sus componentes: `sudo xcodebuild -runFirstLaunch` (pide tu contraseña). Sin eso se puede compilar e
  instalar con `xcrun simctl`, pero sin StoreKit Testing: la pantalla sale con «No se han podido cargar los planes».
  Contra una copia local, arrancar la web con `APPLE_XCODE=1` (acepta sin firma las compras del entorno Xcode; solo fuera
  de Vercel y con la base de datos en la propia máquina, upstash-mem: nunca contra la de producción).
- TestFlight: las compras son de sandbox y gratis; las suscripciones se renuevan cada pocos minutos y terminan solas.

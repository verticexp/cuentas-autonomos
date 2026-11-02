# Fisquo para iOS y Android

App nativa con Capacitor 8 que carga `https://www.fisquo.com` desde el servidor (sin `output: 'export'`: la web,
el proxy, las cookies y la CSP siguen igual). Esta carpeta no se despliega en Vercel (`.vercelignore`).
Para enviarla a la App Store: `app-store/README.md`.

```bash
cd mobile
npm install
npx cap sync ios
npx cap open ios   # compilar, firmar y archivar desde Xcode
```

## Cómo está hecha

- `capacitor.config.json`: `server.url` es la raíz del dominio con `www` (con una ruta, la primera carga se cancela;
  `fisquo.com` redirige a `www`). Navegación limitada a los dominios de Fisquo y a los anteriores durante la transición (`WKAppBoundDomains`). La app añade
  `FisquoApp/1` al user agent: la web lo usa (`lib/app.js`) para no enseñar precios, planes, registro ni lo que aún
  no funciona dentro de la app.
- `ios/App/App/`:
  - `FisquoViewController.swift`: el WebView de Capacitor con tirar para recargar, accesos rápidos y el escáner.
  - `DelegadoWeb.swift`: delante del delegado de Capacitor. `target="_blank"` de Fisquo en un visor con la misma
    sesión (`VisorWeb.swift`), enlaces externos en Safari dentro de la app, descargas con la hoja de compartir y
    diálogos `alert/confirm/prompt` en español (los `prompt` internos de Capacitor siguen yendo a Capacitor).
  - `EscanerPlugin.swift`: escáner de documentos (VisionKit), desde la web con `lib/escanerNativo.js`.
  - `SceneDelegate.swift`: crea el controlador (no el storyboard) y atiende los accesos rápidos de `Info.plist`.
  - `PrivacyInfo.xcprivacy`, `App.entitlements` (llaves de acceso, solo en Release; necesita `APPLE_TEAM_ID` en la web).
- Solo iPhone, iOS 16 o posterior, vertical, en español.

## Probar en local contra una copia con datos de demostración

1. `node tests/apoyo/upstash-mem.mjs 8079`, `scripts/demo.mjs` y `next start -p 3011` con `KV_REST_API_URL`.
2. Tras `npx cap sync ios`, en la copia generada `ios/App/App/capacitor.config.json` (no se versiona) poner
   `server.url` a `http://localhost:3011` y `allowNavigation` a `localhost`; en `Info.plist`, temporalmente,
   `WKAppBoundDomains` = `localhost` y `NSAppTransportSecurity.NSAllowsLocalNetworking`. Deshacerlo después.
3. Al reabrir la app con sesión puede salir el bloqueo de pantalla (`components/Bloqueo.js`), no el login.

## Android

El mismo planteamiento: `android/` es el proyecto de Capacitor (Java, paquete `com.fisquo.app`, Android 7 o posterior)
que carga `https://www.fisquo.com` con `FisquoApp/1` en el user agent. La web sabe cuál es con `plataformaApp` y
`<html data-app="android">` (`lib/app.js`) y adapta los textos («este móvil», «huella»).

```bash
cd mobile
npm install
npx cap sync android
cd android && ./gradlew assembleDebug    # o bundleRelease para Google Play (firmado con la clave de subida)
```

Hace falta JDK 21 (`brew install openjdk@21`, y `JAVA_HOME` apuntando a él) y el SDK de Android en
`~/Library/Android/sdk` (`ANDROID_HOME`).

- `android/app/src/main/java/com/fisquo/app/`:
  - `MainActivity.java`: registra los complementos, el botón de atrás (primero cierra la hoja abierta con
    `window.fisquoAtras` de `components/GestoAtras.js`), los accesos directos del icono (`res/xml/accesos.xml`) y abrir la
    página de un aviso o de lo compartido.
  - `NavegadorPlugin.java`, `Descargas.java`, `Cromo.java`, `VisorWeb.java`: enlaces de fuera en una pestaña de Chrome,
    descargas (también de `blob:`) a Descargas, ventanas nuevas en un visor con la misma sesión, diálogos en el idioma del
    móvil y el color de las barras del sistema (`components/BarraEstado.js`).
  - `BiometriaPlugin.java`: la huella, con el mismo contrato que `BiometriaPlugin.swift` (clave del Keystore).
  - `EscanerPlugin.java`: el escáner de documentos de ML Kit (necesita Google Play Services).
  - `AccesoPlugin.java`: Google y Apple en una pestaña de Chrome que vuelve a `fisquo://acceso`.
  - `AvisosPlugin.java` y `MensajesFirebase.java`: avisos con Firebase (`lib/fcm.js` en el servidor). Sin
    `android/app/google-services.json` la app compila igual y Ajustes › Avisos dice que aún no están disponibles.
  - `CompartirPlugin.java`: «Compartir» y «Abrir con» de PDF, fotos y XML.
- Pendiente para publicar: cuenta de Google Play Console, proyecto de Firebase (`google-services.json` en la app y
  `FCM_CUENTA_SERVICIO` con la cuenta de servicio en Vercel), clave de subida, ficha y capturas.

### Probar en el emulador contra una copia local

1. Copia local con datos de demostración como en iOS (`next start -p 3017`), y `adb reverse tcp:3017 tcp:3017`.
2. Tras `npx cap sync android`, en la copia generada `android/app/src/main/assets/capacitor.config.json` (no se versiona)
   poner `server.url` a `http://localhost:3017` y `allowNavigation` a `localhost`. Las compilaciones de depuración dejan
   http a `localhost` (`app/src/debug/res/xml/red_local.xml`); la de la tienda, no.
3. Para ver la página: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` y `chrome://inspect`.
4. Si `adb exec-out screencap` sale en negro o congelado, arrancar el emulador con `-gpu swiftshader_indirect`.

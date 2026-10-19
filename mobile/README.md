# Netto para iOS

App nativa con Capacitor 8 que carga `https://www.nettohq.com` desde el servidor (sin `output: 'export'`: la web,
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
  `nettohq.com` redirige a `www`). Navegación limitada a los dominios de Netto (`WKAppBoundDomains`). La app añade
  `NettoApp/1` al user agent: la web lo usa (`lib/app.js`) para no enseñar precios, planes, registro ni lo que aún
  no funciona dentro de la app.
- `ios/App/App/`:
  - `NettoViewController.swift`: el WebView de Capacitor con tirar para recargar, accesos rápidos y el escáner.
  - `DelegadoWeb.swift`: delante del delegado de Capacitor. `target="_blank"` de Netto en un visor con la misma
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

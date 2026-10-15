# Netto para iOS (prueba de concepto)

Contenedor nativo con Capacitor 8 que carga la app de `https://www.nettohq.com` desde el servidor.
No usa `output: 'export'`: la web, el proxy, las cookies y la CSP siguen igual. Esta carpeta no
afecta al despliegue en Vercel (`.vercelignore`).

## Uso

```bash
cd mobile
npm install
npx cap sync ios
npx cap open ios   # compilar y ejecutar desde Xcode
```

## Configuración

- `capacitor.config.json`: `server.url` apunta a la raíz del dominio. Con una ruta (`/login`) la
  primera carga se cancela (NSURLError -999) y aparece la pantalla sin conexión.
- `nettohq.com` redirige a `www.nettohq.com`: los dos están en `allowNavigation` y en
  `WKAppBoundDomains` (Info.plist), con `limitsNavigationsToAppBoundDomains` activado.
- `www/sin-conexion.html`: pantalla propia cuando no hay red.
- Info.plist: textos de permiso para Face ID, cámara y fotos.
- Plugins instalados: share, filesystem, splash-screen y biometría (`@capgo/capacitor-native-biometric`).
  Todavía no se llaman desde la web.

## Resultados (simulador iPhone 18 Pro, iOS 27)

| Prueba | Estado |
|---|---|
| Compila y arranca | OK |
| Carga Netto (login) dentro de la app | OK |
| Restricción a dominios de Netto | OK |
| Pantalla sin conexión | OK |
| Iniciar sesión dentro de la app | OK |
| Sesión conservada al cerrar y reabrir la app | OK: al reabrir aparece el bloqueo obligatorio (`components/Bloqueo.js`), no el login |
| Foto de ticket (`capture`) | Pendiente: tras iniciar sesión, en iPhone real |
| Descarga de PDF | Pendiente: previsiblemente necesita Filesystem + Share |
| Face ID | Pendiente: requiere integrar el plugin en la web |
| Passkeys y push nativas | Bloqueado: requieren cuenta de Apple Developer (empresa) |

## Notas

- La pantalla de bloqueo pide la contraseña cada vez que se abre la app. En móvil debería desbloquearse con
  Face ID: es la primera función nativa que conviene integrar.
- `simctl terminate` cierra la app a la fuerza; es la forma de reproducir que iOS la cierre en segundo plano.

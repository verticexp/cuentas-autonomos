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
  Todavía no se llaman desde la web. Share y filesystem podrían sobrar: el PDF ya funciona sin ellos.

## Resultados (simulador iPhone 18 Pro, iOS 27)

| Prueba | Estado |
|---|---|
| Compila y arranca | OK |
| Carga Netto (login) dentro de la app | OK |
| Restricción a dominios de Netto | OK |
| Pantalla sin conexión | OK |
| Iniciar sesión dentro de la app | OK |
| Sesión conservada al cerrar y reabrir la app | OK: al reabrir aparece el bloqueo obligatorio (`components/Bloqueo.js`), no el login |
| Foto de ticket (`capture`) | OK: «Escanear ticket» abre la cámara nativa sin cambios en la web (falta probar en iPhone real) |
| Descarga de PDF | OK: abre la hoja nativa de compartir (Guardar en Archivos, imprimir, enviar) sin plugins |
| Face ID | Pendiente: requiere integrar el plugin en la web |
| Passkeys y push nativas | Bloqueado: requieren cuenta de Apple Developer (empresa) |

## Notas

- La pantalla de bloqueo pide la contraseña cada vez que se abre la app. En móvil debería desbloquearse con
  Face ID: es la primera función nativa que conviene integrar.
- `simctl terminate` cierra la app a la fuerza; es la forma de reproducir que iOS la cierre en segundo plano.

## Modo app

- La app añade `NettoApp/1` al user agent (`ios.appendUserAgent`). `lib/app.js` y `proxy.js` redirigen la web
  pública (portada sin sesión, precios, funciones, planes, contacto) a `/login`, o a `/` si hay sesión.
  En el navegador no cambia nada (tests en `tests/app-movil.test.mjs`).
- Lo legal (`/privacidad`, `/condiciones`) sigue accesible: Apple exige la política de privacidad.
- Icono y pantalla de arranque con la N de Netto sobre #0F1F1B, sin canal alfa.

## Borrado de cuenta (Apple 5.1.1(v)) — diseño, sin implementar

Obligatorio cuando la app permita crear cuentas (versión 1.1).
- Administrador: la baja de empresa ya existe (`lib/baja.js`, Ajustes). Borra las cuentas al momento y conserva
  6 años solo lo que exige la ley, bloqueado. Apple lo admite si se explica al usuario.
- Falta: que un usuario que no es administrador pueda borrar su propia cuenta desde Ajustes, con su contraseña
  (`borrarUsuario` si solo pertenece a esa empresa, quitar la membresía si tiene varias). Si es el único
  administrador, se le manda a la baja de empresa.

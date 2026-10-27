# Fisquo en la App Store: paquete de envío

Todo lo que hace falta para mandar la versión 1.0 de Fisquo para iPhone a revisión. La app ya está preparada
(`mobile/`); lo que queda son pasos de cuenta que solo puede dar el titular.

- `ficha.md`: textos de la ficha (nombre, subtítulo, descripción, palabras clave, URLs, categoría, edad).
- `revision.md`: notas para el revisor de Apple (en inglés), cuenta de demostración y respuestas de cumplimiento.
- `privacidad.md`: qué marcar en «Privacidad de la app» de App Store Connect.
- `capturas/`: 6 capturas de iPhone de 6,9" (1320 × 2868), las que pide Apple.

## Qué está hecho en la app (y por qué)

| Norma de Apple | Qué hace Fisquo |
|---|---|
| 4.2 Funcionalidad mínima (no ser una web envuelta) | Escáner de documentos nativo (VisionKit) para tickets, descargas y exportaciones con la hoja de compartir, visor nativo para PDF y justificantes con su botón de compartir, Safari dentro de la app para enlaces externos, accesos rápidos en el icono, tirar para recargar, pantalla propia sin conexión, diálogos nativos en español. |
| 3.1.1 / 3.1.3 Pagos | Dentro de la app no hay precios, planes para elegir, «Recomienda», registro ni ningún enlace o texto que lleve a pagar fuera. Los mensajes de fin de prueba y de límites son neutros. La suscripción solo se contrata en la web. | «Tu plan» solo enseña el plan y su estado.
| 2.1 / 2.2 Completa, sin «próximamente» | Los botones de Google y Apple solo salen cuando sus claves están puestas (`lib/social.js`); los avisos push web siguen ocultos en la app. |
| 4.8 Iniciar sesión con Apple | Con Google sale también «Continuar con Apple», con la hoja nativa (`AccesoPlugin.swift`). Google se abre en ASWebAuthenticationSession (Google no deja entrar desde una vista web). Al borrar la cuenta se revoca el acceso de Apple. |
| 5.1.1(v) Borrar la cuenta | Ajustes › Eliminar mi cuenta (cualquier usuario) y Dar de baja la empresa (administrador). Cancela la suscripción y conserva solo lo que la ley obliga, bloqueado. |
| 5.1.2(i) Datos a una IA de terceros | Antes de la primera lectura de un ticket o pregunta al asistente, la app explica que los datos van a Anthropic y pide permiso. Si se niega, no se envía nada. |
| 5.1.1 Permisos | Solo cámara y fotos, con su motivo en español. Sin rastreo (`NSPrivacyTracking` = false) y con `PrivacyInfo.xcprivacy`. |
| Exportación de cifrado | `ITSAppUsesNonExemptEncryption` = NO (solo HTTPS del sistema). |

Probado en el simulador (iPhone 18 Pro, iOS 27) contra una copia local con datos de demostración: login sin
botones falsos, Ajustes sin planes, descarga del .zip con «Guardar en Archivos», AEAT en Safari dentro de la app,
visor con la sesión, permiso de IA (aceptar y rechazar), escáner nativo, acceso rápido y borrado de cuenta completo.
Falta probarlo en un iPhone real (la cámara del simulador no existe).

## Lo que tienes que hacer tú

1. ~~Cuenta de Apple Developer~~ hecho (27-10-2026): cuenta **Individual** a nombre de Marc Ramirez Delgado,
   Team ID `M8D85NH9U7`. Cuando Xiverno SL tenga D-U-N-S, pedir a Apple el paso a organización (se conservan la app
   y el Team ID).
2. ~~`APPLE_TEAM_ID` en Vercel~~ hecho (Production y Preview).
3. **Xcode** (`cd mobile && npm install && npx cap sync ios && npx cap open ios`): el equipo ya está en el proyecto
   (`DEVELOPMENT_TEAM`). Basta con añadir el Apple ID en *Xcode › Settings › Accounts*; *Automatically manage signing*
   crea el App ID `com.fisquo.app` con Associated Domains.
4. **App Store Connect** › Mis apps › «+»: nombre «Fisquo: facturas e impuestos», idioma principal español,
   bundle `com.fisquo.app`, SKU `fisquo-ios`.
5. **Cuenta de demostración en producción** para el revisor (ver `revision.md`): con datos, plan Fundador (no caduca)
   y sin bloqueo de pantalla. Sin ella, Apple rechaza (2.1).
6. En Xcode: *Product › Archive* → *Distribute App* → *App Store Connect*. Prueba en **TestFlight** en tu iPhone:
   escáner, descargas, borrar una cuenta de prueba.
7. Rellena la ficha con `ficha.md`, la privacidad con `privacidad.md`, sube las capturas y pega las notas de
   `revision.md`. Precio: gratis. Envía a revisión.

## Entrar con Google y Apple: claves que faltan (Vercel › Production)

- Apple (developer.apple.com › Certificates, Identifiers & Profiles): en el App ID `com.fisquo.app`, activar
  *Sign in with Apple*; crear un *Services ID* (p. ej. `com.fisquo.web`) con el dominio `www.fisquo.com` y la vuelta
  `https://www.fisquo.com/api/login/social/vuelta`; crear una *Key* con Sign in with Apple. Variables:
  `APPLE_SERVICES_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (el contenido de la .p8).
- Google (console.cloud.google.com): pantalla de consentimiento externa «Fisquo» y un cliente OAuth *Web* con la vuelta
  `https://www.fisquo.com/api/login/social/vuelta`. Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Sin ellas, los botones no salen (ni en la web ni en la app).

## Para la versión siguiente (1.1)

- Face ID ya va en la 1.0 (llaves de acceso con el dominio asociado): probarlo en TestFlight.
- Notificaciones push nativas (APNs) en lugar de las de la web.
- Alta de cuenta dentro de la app, sin precios (y el «modo consulta» al acabar la prueba, que ya existe).

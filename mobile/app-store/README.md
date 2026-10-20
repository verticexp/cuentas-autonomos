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
| 3.1.1 / 3.1.3 Pagos | Dentro de la app no hay precios, planes, «Tu plan», «Recomienda», registro ni ningún enlace o texto que lleve a pagar fuera. Los mensajes de fin de prueba y de límites son neutros. La suscripción solo se contrata en la web. |
| 2.1 / 2.2 Completa, sin «próximamente» | Ocultos en la app los botones «Continuar con Google / Apple» (no funcionan aún), avisos push web y alta de llaves de acceso (no funcionan en una app hasta tener la cuenta de Apple). |
| 4.8 Iniciar sesión con Apple | No aplica: en la app solo se entra con email y contraseña propios de Fisquo. |
| 5.1.1(v) Borrar la cuenta | Ajustes › Eliminar mi cuenta (cualquier usuario) y Dar de baja la empresa (administrador). Cancela la suscripción y conserva solo lo que la ley obliga, bloqueado. |
| 5.1.2(i) Datos a una IA de terceros | Antes de la primera lectura de un ticket o pregunta al asistente, la app explica que los datos van a Anthropic y pide permiso. Si se niega, no se envía nada. |
| 5.1.1 Permisos | Solo cámara y fotos, con su motivo en español. Sin rastreo (`NSPrivacyTracking` = false) y con `PrivacyInfo.xcprivacy`. |
| Exportación de cifrado | `ITSAppUsesNonExemptEncryption` = NO (solo HTTPS del sistema). |

Probado en el simulador (iPhone 18 Pro, iOS 27) contra una copia local con datos de demostración: login sin
botones falsos, Ajustes sin planes, descarga del .zip con «Guardar en Archivos», AEAT en Safari dentro de la app,
visor con la sesión, permiso de IA (aceptar y rechazar), escáner nativo, acceso rápido y borrado de cuenta completo.
Falta probarlo en un iPhone real (la cámara del simulador no existe).

## Lo que tienes que hacer tú

1. **Cuenta de Apple Developer de la empresa** (99 $/año) con su D-U-N-S. Al tenerla, apunta el **Team ID**
   (10 caracteres, en developer.apple.com › Membership).
2. **Vercel › Production**: variable `APPLE_TEAM_ID` con ese Team ID y vuelve a desplegar. Activa
   `https://www.fisquo.com/.well-known/apple-app-site-association`, necesario para que Face ID (llaves de acceso)
   funcione dentro de la app en una versión posterior.
3. **Xcode** (`cd mobile && npm install && npx cap sync ios && npx cap open ios`): en *Signing & Capabilities*
   elige el equipo de la empresa. Con *Automatically manage signing* crea solo el App ID `com.fisquo.app` con
   Associated Domains.
4. **App Store Connect** › Mis apps › «+»: nombre «Fisquo: facturas e impuestos», idioma principal español,
   bundle `com.fisquo.app`, SKU `fisquo-ios`.
5. **Cuenta de demostración en producción** para el revisor (ver `revision.md`): con datos, plan Fundador (no caduca)
   y sin bloqueo de pantalla. Sin ella, Apple rechaza (2.1).
6. En Xcode: *Product › Archive* → *Distribute App* → *App Store Connect*. Prueba en **TestFlight** en tu iPhone:
   escáner, descargas, borrar una cuenta de prueba.
7. Rellena la ficha con `ficha.md`, la privacidad con `privacidad.md`, sube las capturas y pega las notas de
   `revision.md`. Precio: gratis. Envía a revisión.

## Para la versión siguiente (1.1)

- Face ID con las llaves de acceso (con `APPLE_TEAM_ID` ya puesto y probado en TestFlight): quitar `!app` en
  `components/FaceId.js` y `components/EntrarLlave.js`.
- Notificaciones push nativas (APNs) en lugar de las de la web.
- Alta de cuenta dentro de la app, sin precios (y el «modo consulta» al acabar la prueba, que ya existe).

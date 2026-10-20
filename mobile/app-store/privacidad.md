# Privacidad de la app (App Store Connect)

Coincide con `ios/App/App/PrivacyInfo.xcprivacy` y con https://www.nettohq.com/privacidad.

**¿Recoges datos de esta app?** Sí. **¿Se usan para rastrear (tracking)?** No, ninguno.

Todos están **vinculados a la identidad** del usuario (necesitan su cuenta) y **no** se usan para rastrear.

| Tipo (App Store Connect) | Ejemplo en Kontix | Finalidad |
|---|---|---|
| Información de contacto › Nombre | Nombre del usuario y de sus clientes | Funcionalidad de la app |
| Información de contacto › Email | Email de la cuenta y de clientes | Funcionalidad de la app |
| Información de contacto › Teléfono | Teléfono en los datos de la empresa | Funcionalidad de la app |
| Información de contacto › Dirección | Dirección fiscal en las facturas | Funcionalidad de la app |
| Información financiera › Otra información financiera | Facturas, gastos, impuestos, IBAN | Funcionalidad de la app |
| Contenido del usuario › Fotos o vídeos | Fotos de tickets | Funcionalidad de la app |
| Contenido del usuario › Otro contenido | Facturas PDF, justificantes, preguntas al asistente | Funcionalidad de la app |
| Identificadores › ID de usuario | Identificador interno de la cuenta | Funcionalidad de la app |
| Datos de uso › Interacción con el producto | Actividad para el panel interno (qué funciones se usan) | Analítica |

No se recoge: ubicación, contactos del teléfono, salud, historial de navegación, identificador de publicidad,
datos de diagnóstico de terceros.

Proveedores que reciben datos para dar el servicio (los nombra la política de privacidad): Vercel (servidores),
Upstash (base de datos), Enable Banking (si se conecta el banco), Anthropic (lectura de tickets y asistente, con permiso previo en la app), Resend (emails),
Stripe (cobros de facturas a clientes y suscripción en la web).

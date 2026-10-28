# Información para la revisión

## Cuenta de demostración (obligatoria)

Crear en **producción**, antes de enviar:

1. Registrarse en https://www.fisquo.com/registro con un email propio de pruebas (por ejemplo `revision-apple@<dominio>`)
   como autónomo, con datos fiscales completos (Ajustes › Datos de la empresa).
2. En el panel `/admin`, regalarle el plan **Fundador** (así no caduca la prueba durante la revisión).
3. Meter unas cuantas facturas (algunas cobradas y alguna vencida) y gastos con justificante, para que vea datos.
4. Ajustes › Seguridad: **sin** bloqueo de pantalla.
5. Poner email y contraseña en App Store Connect › Información de la revisión › Inicio de sesión.

## Notas para el revisor (pegar en «Notas», en inglés)

```
Fisquo is a bookkeeping and tax app for freelancers and small businesses in Spain (invoices, expenses, VAT and
income tax returns). The app is for customers who already have a Fisquo account; please sign in with the demo
account provided. The interface follows the device language (Spanish, Catalan or English) and can be changed in
Ajustes > Idioma / Settings > Language.

Sign in: email and password, "Continue with Apple" (native sheet) or "Continue with Google". Accounts are created on
the web, not in the app, so Apple and Google sign in only work for an Apple ID or Google account whose email already
has a Fisquo account; otherwise the app says so and asks for email and password. Please use the demo account.

No digital goods or subscriptions are sold or advertised in the app. There are no in-app purchases and no links
or calls to action to buy elsewhere.

Native features to try:
- Gastos > "Escanear ticket": iOS document scanner (VisionKit). The receipt is cropped and read automatically.
- Gastos > "Varios tickets": scan several receipts in a row.
- Ajustes > "Descargar todos los datos": the export is saved with the share sheet (Save to Files).
- Facturas > any invoice > "Ver / descargar PDF": native share sheet.
- Long-press the app icon: quick actions (scan receipt, new invoice, taxes).
- Pull down to refresh. Impuestos > "Presentar el 303 en la AEAT" opens the tax agency in Safari inside the app.
- Share a PDF, photo or e-invoice (XML) from Mail, Files or Photos with "Fisquo": it goes to Gastos > "Por revisar".
- Face ID: Ajustes > "Seguridad" turns on unlocking the app with Face ID (keychain, on this device).
- Notifications: native push notifications for due dates and messages from the user's accountant (asked once,
  only after sign in).

AI: reading receipts and answering questions ("Pregunta a Fisquo") uses Anthropic. Before the first use the app
explains this and asks for permission; if the user declines, nothing is sent.

Account deletion: Ajustes > "Eliminar mi cuenta". Records that Spanish law requires us to keep (invoices,
tax records) are kept locked for 6 years and then deleted; the user can no longer access them.
```

## Respuestas de cumplimiento en App Store Connect

- **Cifrado**: la app solo usa el cifrado del sistema (HTTPS) → exenta. Ya está `ITSAppUsesNonExemptEncryption = NO`.
- **Derechos de contenido**: la app no muestra contenido de terceros.
- **Publicidad / IDFA**: no.
- **Regulación de servicios financieros**: Fisquo no es un banco ni mueve dinero; es software de facturación y
  contabilidad. Si Apple pregunta (norma 3.2.1), responder eso: no ofrece préstamos, inversión ni pagos propios.
- **Inicio de sesión con Apple** (4.8): sí. Hay «Continuar con Google», así que también está «Continuar con Apple» con la
  hoja nativa. En la app no se crean cuentas: si el email de Apple o Google no tiene cuenta, se le pide email y contraseña.
  Al eliminar la cuenta se revoca el acceso de Apple.

// Lo que se ve sin sesión: la web pública (/ y app/(web)), login, páginas legales, enlaces públicos (presupuesto, portal, pago), avisos de Stripe,
// crons de Vercel (con su secreto), iconos y las pantallas de arranque de la web guardada en el iPhone (inicio-ios).
// Cada nombre acaba en «/» o al final de la ruta (informe de seguridad m7): una ruta nueva con un nombre que empiece igual
// (/loginx, /api/pagarx) no queda abierta por error.
export const PUBLICO = /^\/(?:$|\.well-known\/|(?:p|portal|pagar|correo|inicio-ios|api\/portal|api\/abierta|api\/v1)\/|(?:funciones|precios|autonomos|pymes|business|grandes-empresas|seguridad|verificado|contacto|gestorias|login|registro|recuperar|privacidad|condiciones|declaracion-responsable|invitacion|api\/presupuestos\/aceptar|api\/pagar|api\/stripe|api\/recordatorios|api\/recurrentes\/cron|api\/trabajos|api\/login|api\/recuperar|api\/registro|api\/contacto|api\/csp|api\/invitacion|api\/passkey|api\/confirmar|robots\.txt|sitemap\.xml|opengraph-image|favicon\.ico|icon1\.svg|apple-icon|manifest\.webmanifest|sw)(?:\/|$))/;


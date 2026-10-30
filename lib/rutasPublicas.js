// Lo que se ve sin sesión: la web pública (/ y app/(web)), login, páginas legales, enlaces públicos (presupuesto, portal, pago,
// calendario de plazos con su token), avisos de Stripe
// y del correo entrante de Resend (api/buzon, con su firma),
// crons de Vercel (con su secreto), iconos, las pantallas de arranque de la web guardada en el iPhone (inicio-ios) y las
// imágenes estáticas de la web pública (public/web).
// Cada nombre acaba en «/» o al final de la ruta (informe de seguridad m7): una ruta nueva con un nombre que empiece igual
// (/loginx, /api/pagarx) no queda abierta por error.
export const PUBLICO = /^\/(?:$|\.well-known\/|(?:p|portal|pagar|correo|inicio-ios|web|api\/portal|api\/abierta|api\/v1|api\/calendario)\/|(?:funciones|precios|autonomos|pymes|business|grandes-empresas|seguridad|verificado|contacto|gestorias|demo|guias|comparativa|aviso-legal|login|registro|recuperar|privacidad|condiciones|declaracion-responsable|invitacion|api\/presupuestos\/aceptar|api\/pagar|api\/stripe|api\/buzon|api\/recordatorios|api\/recurrentes\/cron|api\/whatsapp|api\/trabajos|api\/login|api\/recuperar|api\/registro|api\/contacto|api\/csp|api\/invitacion|api\/passkey|api\/dispositivo|api\/confirmar|sin-conexion|robots\.txt|sitemap\.xml|llms\.txt|opengraph-image|favicon\.ico|icon1\.svg|apple-icon|manifest\.webmanifest|sw)(?:\/|$))/;


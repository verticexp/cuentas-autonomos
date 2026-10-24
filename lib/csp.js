// Política de seguridad de contenidos (CSP) con nonce: solo se ejecutan los scripts que lleven el nonce de la petición
// (los de Next.js y los pocos en línea de app/layout.js y components/web/Marco.js).
// CSP: «activo» la aplica, «off» no la manda; por defecto, «registrar»: Report-Only, sin bloquear, y los avisos llegan a /api/csp.
export const modoCsp = () => ({ activo: 'activo', off: 'off' })[process.env.CSP] || 'registrar';
export const cabeceraCsp = () => (modoCsp() === 'activo' ? 'content-security-policy' : 'content-security-policy-report-only');

// Lo que se puede ver dentro de la propia app (components/VistaDocumento.js): el PDF de una factura, el justificante de un
// gasto, un documento pedido o el informe del trimestre. Solo estas rutas se dejan incrustar, y solo desde la propia web.
export const EMBEBIBLE = /^\/api\/(?:despacho|tu-despacho)\/(?:documento|peticiones|informe)(?:\/|$)/;

export function politicaCsp(nonce, { embebible = false } = {}) {
  return [
    "default-src 'self'",
    // 'strict-dynamic': lo que cargan los scripts con nonce (los trozos de Next.js) también vale. En desarrollo, Next.js necesita eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    // Marcos: solo de la propia web (la vista previa de documentos); nadie de fuera puede meter Fisquo en un marco.
    "frame-src 'self'",
    `frame-ancestors ${embebible ? "'self'" : "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp',
  ].join('; ');
}

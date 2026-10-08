// Política de seguridad de contenidos (CSP) con nonce: solo se ejecutan los scripts que lleven el nonce de la petición
// (los de Next.js y los pocos en línea de app/layout.js y components/web/Marco.js).
// CSP: «activo» la aplica, «off» no la manda; por defecto, «registrar»: Report-Only, sin bloquear, y los avisos llegan a /api/csp.
export const modoCsp = () => ({ activo: 'activo', off: 'off' })[process.env.CSP] || 'registrar';
export const cabeceraCsp = () => (modoCsp() === 'activo' ? 'content-security-policy' : 'content-security-policy-report-only');

export function politicaCsp(nonce) {
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
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'report-uri /api/csp',
  ].join('; ');
}

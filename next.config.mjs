const seguridad = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Sin Referer: los enlaces de invitación llevan el código en la URL.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Una web abierta desde Netto (o que abra Netto) no puede manejar esta ventana.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

export default {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: seguridad }];
  },
};

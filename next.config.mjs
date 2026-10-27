const seguridad = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Sin Referer: los enlaces de invitación llevan el código en la URL.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // Cámara solo para la propia web: «Varios tickets» usa la cámara en vivo (components/RafagaTickets.js). Con camera=()
  // Chrome y Android la negaban siempre, como si la persona hubiera dicho que no.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  // Una web abierta desde Fisquo (o que abra Fisquo) no puede manejar esta ventana.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

export default {
  poweredByHeader: false,
  // Las pantallas ya vistas se reutilizan 30 s al volver a ellas (antes, 0: cada cambio de pestaña volvía a pedirla y a
  // consultar la base de datos). Tras guardar algo, la siguiente navegación las olvida (lib/cambiosDatos.js).
  experimental: { staleTimes: { dynamic: 30 } },
  async redirects() {
    return [
      { source: '/grandes-empresas', destination: '/business', permanent: true },
      // Dominio anterior (antes del cambio de nombre): todo a www.fisquo.com, misma ruta.
      ...['nettohq.com', 'www.nettohq.com'].map((value) => ({ source: '/:path*', has: [{ type: 'host', value }], destination: 'https://www.fisquo.com/:path*', permanent: true })),
    ];
  },
  async headers() {
    // Los documentos de la vista previa (lib/csp.js EMBEBIBLE) se pueden ver en un marco de la propia web: la última regla
    // que coincide gana.
    const marcoPropio = seguridad.map((h) => (h.key === 'X-Frame-Options' ? { ...h, value: 'SAMEORIGIN' } : h.key === 'Content-Security-Policy' ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : h));
    return [
      { source: '/:path*', headers: seguridad },
      ...['despacho', 'tu-despacho'].flatMap((a) => ['documento', 'peticiones', 'informe'].map((r) => ({ source: `/api/${a}/${r}`, headers: marcoPropio }))),
    ];
  },
};

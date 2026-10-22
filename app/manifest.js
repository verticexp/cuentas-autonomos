export default function manifest() {
  return {
    name: 'Fisquo', short_name: 'Fisquo', start_url: '/', display: 'standalone', background_color: '#0F1F1B', theme_color: '#0F1F1B',
    share_target: {
      action: '/compartir', method: 'POST', enctype: 'multipart/form-data',
      params: { title: 'titulo', text: 'texto', files: [{ name: 'archivos', accept: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml', '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xml'] }] },
    },
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }, { src: '/icon1.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

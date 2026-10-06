export default function manifest() {
  return {
    name: 'Netto', short_name: 'Netto', start_url: '/', display: 'standalone', background_color: '#0F1F1B', theme_color: '#0F1F1B',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }, { src: '/icon1.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

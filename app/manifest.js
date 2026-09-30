export default function manifest() {
  return {
    name: 'Cuentas', short_name: 'Cuentas', start_url: '/', display: 'standalone', background_color: '#EDF0F5', theme_color: '#EDF0F5',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }, { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

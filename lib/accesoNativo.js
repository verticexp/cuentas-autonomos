'use client';

// «Continuar con Google / Apple» dentro de la app de iOS (mobile/ios/App/App/AccesoPlugin.swift). Google no deja entrar
// desde una vista web incrustada: se abre en ASWebAuthenticationSession y vuelve a fisquo://acceso con un código de un
// solo uso que se canjea aquí (app/api/login/canjear). Apple, con su hoja nativa (app/api/login/apple).
// Cada función devuelve: { ir } (adónde ir), { error } (texto para la persona) o null (canceló).
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Acceso || null);
export const accesoNativo = () => Boolean(plugin());

const SIN_CUENTA = 'No hay ninguna cuenta de Fisquo con ese email. Entra con tu email y contraseña.';
const cancelado = (e) => e?.code === 'cancelado' || e?.message === 'cancelado';

export async function googleNativo() {
  try {
    const { url } = await plugin().sesionWeb({ url: `${location.origin}/api/login/social?p=google&app=1`, esquema: 'fisquo' });
    const q = new URL(url).searchParams;
    if (q.get('c')) return { ir: `/api/login/canjear?c=${encodeURIComponent(q.get('c'))}` };
    if (q.get('error') === 'cancelado') return null;
    return { error: q.get('error') === 'sin-cuenta' ? SIN_CUENTA : 'No se ha podido entrar con Google. Vuelve a intentarlo.' };
  } catch (e) {
    return cancelado(e) ? null : { error: 'No se ha podido abrir Google. Vuelve a intentarlo.' };
  }
}

const enviar = (datos) => fetch('/api/login/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
  .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
  .catch(() => ({ ok: false, error: 'No se ha podido conectar. Revisa la conexión.' }));

export async function appleNativo() {
  const n = await enviar({ accion: 'nonce' });
  if (!n.nonce) return { error: n.error || 'No se ha podido conectar. Revisa la conexión.' };
  let r;
  try { r = await plugin().conApple({ nonce: n.nonce }); }
  catch (e) { return cancelado(e) ? null : { error: 'No se ha podido usar tu cuenta de Apple. Vuelve a intentarlo.' }; }
  const d = await enviar({ identityToken: r.identityToken, authorizationCode: r.authorizationCode, nombre: r.nombre });
  if (d.sinCuenta) return { error: SIN_CUENTA };
  if (d.segundoPaso) return { ir: '/login/dos-pasos' };
  if (d.ok) return { ir: d.destino || '/' };
  return { error: d.error || 'No se ha podido entrar con Apple. Vuelve a intentarlo.' };
}

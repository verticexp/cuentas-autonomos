'use client';

// «Continuar con Google / Apple» dentro de la app de iOS (mobile/ios/App/App/AccesoPlugin.swift). Google no deja entrar
// desde una vista web incrustada: se abre en ASWebAuthenticationSession y vuelve a fisquo://acceso con un código de un
// solo uso que se canjea aquí (app/api/login/canjear). Apple, con su hoja nativa (app/api/login/apple).
// Cada función devuelve: { ir } (adónde ir), { error } (texto para la persona) o null (canceló).
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Acceso || null);
export const accesoNativo = () => Boolean(plugin());

const SIN_CUENTA = 'No hay ninguna cuenta de Fisquo con ese email. Entra con tu email y contraseña.';
const SIN_CONFIRMAR = 'Ese email tiene una cuenta de Fisquo sin confirmar. Entra con tu email y contraseña, o confírmalo desde el correo que te enviamos.';
const NO_GOOGLE = 'No se ha podido entrar con Google. Vuelve a intentarlo.';
const canje = (datos) => fetch('/api/login/canjear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
  .then((r) => r.json()).catch(() => ({}));
const cancelado = (e) => e?.code === 'cancelado' || e?.message === 'cancelado';

export async function googleNativo() {
  try {
    // El código de vuelta solo se canjea en esta vista web: primero se guarda aquí un secreto y su huella va en la URL.
    const { vinculo } = await canje({ accion: 'preparar' });
    if (!vinculo) return { error: 'No se ha podido conectar. Revisa la conexión.' };
    const { url } = await plugin().sesionWeb({ url: `${location.origin}/api/login/social?p=google&app=1&v=${vinculo}`, esquema: 'fisquo' });
    const q = new URL(url).searchParams;
    if (q.get('c')) { const d = await canje({ c: q.get('c') }); return d.ir ? { ir: d.ir } : { error: NO_GOOGLE }; }
    if (q.get('error') === 'cancelado') return null;
    return { error: q.get('error') === 'sin-cuenta' ? SIN_CUENTA : q.get('error') === 'sin-confirmar' ? SIN_CONFIRMAR : NO_GOOGLE };
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

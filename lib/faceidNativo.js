'use client';

// Face ID nativo en la app de iOS (mobile/ios/App/App/BiometriaPlugin.swift, app/api/dispositivo): la animación de
// Face ID del sistema, como en la app de un banco, en lugar de la hoja de las llaves de acceso de la web (lib/faceid.js).
// En el navegador no existe y se siguen usando las llaves de acceso.
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Biometria || null);
// Qué entrada de Ajustes › Seguridad es este iPhone (para marcarla y, al quitarla, borrar también la del llavero).
export const ESTE = 'fisquo-faceid-nativo';

export const hayNativo = () => Boolean(plugin());

// { disponible, tipo: 'faceID' | 'touchID' | 'ninguno', tiene } o null fuera de la app.
export async function estadoNativo() {
  const p = plugin();
  if (!p) return null;
  const [d, t] = await Promise.all([p.disponible().catch(() => ({})), p.tiene().catch(() => ({}))]);
  return { disponible: Boolean(d.disponible), tipo: d.tipo || 'ninguno', tiene: Boolean(t.tiene) };
}
export const nombreTipo = (tipo) => (tipo === 'touchID' ? 'Touch ID' : 'Face ID');

const post = (datos) => fetch('/api/dispositivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
  .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) }))
  .catch(() => ({ ok: false, error: 'No se ha podido conectar. Revisa la conexión.' }));

export async function activarNativo(nombre) {
  const d = await post({ accion: 'alta', nombre });
  if (!d.ok) throw new Error(d.error || 'No se ha podido activar Face ID.');
  try { await plugin().guardar({ valor: d.valor }); }
  catch (e) {
    await fetch(`/api/dispositivo?id=${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(() => {});
    throw new Error(e?.message || 'No se ha podido guardar Face ID en este iPhone.');
  }
  try { localStorage.setItem(ESTE, d.id); } catch {}
  return d.id;
}

// Pide Face ID y entra (o desbloquea). null si canceló; { cambio } si entró; lanza con el texto para la persona.
export async function entrarNativo() {
  let valor;
  try { ({ valor } = await plugin().leer({ motivo: 'Entrar en Fisquo' })); }
  catch (e) {
    if (e?.code === 'cancelado' || e?.message === 'cancelado') return null;
    if (e?.code === 'sin-credencial') throw new Error('Face ID no está activado en este iPhone. Entra con tu contraseña.');
    throw new Error('No se ha podido usar Face ID. Entra con tu contraseña.');
  }
  const d = await post({ accion: 'entrar', valor });
  if (d.retirada) await quitarDeEsteIphone();
  if (!d.ok) throw new Error(d.error || 'No se ha podido entrar con Face ID.');
  try { sessionStorage.setItem('fisquo-abierta', '1'); } catch {}
  return { cambio: Boolean(d.cambio) };
}

export async function quitarDeEsteIphone() {
  await plugin()?.borrar().catch(() => {});
  try { localStorage.removeItem(ESTE); } catch {}
}

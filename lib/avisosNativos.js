'use client';

import { nombreDispositivo } from '@/lib/faceid';

// Avisos nativos de la app de iOS (mobile/ios/App/App/AvisosPlugin.swift): el permiso del sistema y el token de APNs
// que se guarda en app/api/push. En el navegador no existe y se siguen usando las notificaciones web (components/AvisosPush.js).
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Avisos || null);
const MARCA = 'fisquo-apns';
export const hayAvisosNativos = () => Boolean(plugin());

const guardar = (apns) => fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apns, nombre: nombreDispositivo() }) })
  .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se han podido activar los avisos.'); });

// 'on' | 'off' | 'bloqueado'
export async function estadoAvisos() {
  const { permiso } = await plugin().estado().catch(() => ({}));
  if (permiso === 'denegado') return 'bloqueado';
  let marcado = false;
  try { marcado = Boolean(localStorage.getItem(MARCA)); } catch {}
  return permiso === 'concedido' && marcado ? 'on' : 'off';
}

export async function activarAvisos() {
  let token;
  try { ({ token } = await plugin().activar()); }
  catch (e) { if (e?.code === 'denegado') return 'bloqueado'; throw new Error('No se ha podido registrar este iPhone para los avisos.'); }
  await guardar(token);
  try { localStorage.setItem(MARCA, token); } catch {}
  await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prueba: true }) }).catch(() => {});
  return 'on';
}

export async function desactivarAvisos() {
  let token = '';
  try { token = localStorage.getItem(MARCA) || ''; localStorage.removeItem(MARCA); } catch {}
  if (token) await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apns: token }) }).catch(() => {});
  return 'off';
}

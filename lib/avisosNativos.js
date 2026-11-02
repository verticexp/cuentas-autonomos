'use client';

import { nombreDispositivo } from '@/lib/faceid';
import { enAndroid } from '@/lib/app';

// Avisos nativos de la app de iOS (mobile/ios/App/App/AvisosPlugin.swift): el permiso del sistema y el token de APNs
// que se guarda en app/api/push. En la de Android (…/AvisosPlugin.java), el mismo contrato con el token de Firebase (FCM), que
// va como { fcm }; si la app se compiló sin Firebase, estado() da «no-disponible». En el navegador no existe y se siguen usando las notificaciones web (components/AvisosPush.js).
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Avisos || null);
const MARCA = 'fisquo-apns';
export const hayAvisosNativos = () => Boolean(plugin());

const campo = () => (enAndroid() ? 'fcm' : 'apns');
const guardar = (token) => fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [campo()]: token, nombre: nombreDispositivo() }) })
  .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se han podido activar los avisos.'); });

// 'on' | 'off' | 'bloqueado' | 'no'
export async function estadoAvisos() {
  const { permiso } = await plugin().estado().catch(() => ({}));
  if (permiso === 'denegado') return 'bloqueado';
  if (permiso === 'no-disponible') return 'no';
  let marcado = false;
  try { marcado = Boolean(localStorage.getItem(MARCA)); } catch {}
  return permiso === 'concedido' && marcado ? 'on' : 'off';
}

export async function activarAvisos() {
  let token;
  try { ({ token } = await plugin().activar()); }
  catch (e) { if (e?.code === 'denegado') return 'bloqueado'; throw new Error(enAndroid() ? 'No se ha podido registrar este móvil para los avisos.' : 'No se ha podido registrar este iPhone para los avisos.'); }
  await guardar(token);
  try { localStorage.setItem(MARCA, token); } catch {}
  await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prueba: true }) }).catch(() => {});
  return 'on';
}

export async function desactivarAvisos() {
  let token = '';
  try { token = localStorage.getItem(MARCA) || ''; localStorage.removeItem(MARCA); } catch {}
  if (token) await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [campo()]: token }) }).catch(() => {});
  return 'off';
}

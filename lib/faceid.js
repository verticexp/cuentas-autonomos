'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

// Marca en este dispositivo que Face ID está activado (para lanzarlo solo al abrir).
export const MARCA = 'cuentas-faceid';

async function post(cuerpo) {
  const r = await fetch('/api/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
  return d;
}

export async function faceIdDisponible() {
  return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()));
}

export async function activarFaceId(nombre) {
  const opciones = await post({ accion: 'registro-opciones' });
  const respuesta = await startRegistration({ optionsJSON: opciones });
  const r = await post({ accion: 'registro', respuesta, nombre });
  localStorage.setItem(MARCA, '1');
  return r;
}

// Entra (sin sesión) o desbloquea (con sesión) con Face ID.
export async function entrarConFaceId() {
  const opciones = await post({ accion: 'entrar-opciones' });
  const respuesta = await startAuthentication({ optionsJSON: opciones });
  await post({ accion: 'entrar', respuesta });
  localStorage.setItem(MARCA, '1');
  try { sessionStorage.setItem('netto-abierta', '1'); } catch {}
}

// Nombre del dispositivo, para la lista de Ajustes.
export function nombreDispositivo() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Este dispositivo';
}

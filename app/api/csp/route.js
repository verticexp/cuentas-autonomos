import { NextResponse } from 'next/server';
import { ipDe, pasado } from '@/lib/limite';

// Avisos de la CSP (lib/csp.js): se apuntan en el log para revisarlos antes de activarla. Sin datos personales:
// solo la directiva, el origen de lo bloqueado y la ruta de la página (sin parámetros).
const origen = (u) => { try { return new URL(u).origin; } catch { return String(u || '').slice(0, 40); } };
const ruta = (u) => { try { return new URL(u).pathname; } catch { return ''; } };

export async function POST(req) {
  if (await pasado('csp', ipDe(req), 30, 3600)) return new NextResponse(null, { status: 204 });
  const d = await req.json().catch(() => null);
  const r = d?.['csp-report'] || (Array.isArray(d) ? d[0]?.body : null) || {};
  console.warn('[csp]', JSON.stringify({
    directiva: r['violated-directive'] || r['effective-directive'] || r.effectiveDirective || '',
    bloqueado: origen(r['blocked-uri'] || r.blockedURL),
    pagina: ruta(r['document-uri'] || r.documentURL),
  }));
  return new NextResponse(null, { status: 204 });
}

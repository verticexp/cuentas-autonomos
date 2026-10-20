// Asociación con la app de iOS (mobile/): con ella, las llaves de acceso de www.fisquo.com (Face ID) funcionan dentro
// de la app. Necesita APPLE_TEAM_ID (el Team ID de la cuenta de Apple Developer); sin él, 404 como hasta ahora.
export const dynamic = 'force-dynamic';

export function GET() {
  const equipo = process.env.APPLE_TEAM_ID?.trim();
  if (!/^[A-Z0-9]{10}$/.test(equipo || '')) return new Response('Not found', { status: 404 });
  return Response.json({ webcredentials: { apps: [`${equipo}.com.fisquo.app`] } });
}

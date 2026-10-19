import { respuesta429 } from '@/lib/limite';

// Destino de la página del portal cuando ha alcanzado su cuota.
export function GET(req) {
  const espera = req.nextUrl.searchParams.get('espera') === '3600' ? 3600 : 600;
  return respuesta429(espera);
}

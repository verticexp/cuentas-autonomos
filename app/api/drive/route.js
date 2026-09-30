import { usuarioApi } from '@/lib/api';
import { enviar } from '@/lib/drive';

// Prueba la conexión con el Apps Script sin tocar el Drive.
export async function POST() {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  return Response.json(await enviar(u, { tipo: 'ping' }));
}

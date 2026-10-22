import { error, usuarioApi } from '@/lib/api';
import { leerUno } from '@/lib/redis';
import { idValido } from '@/lib/bandeja';
import { esXml, leerJustificante, TIPOS } from '@/lib/justificantes';

export const dynamic = 'force-dynamic';

// El archivo de un documento de la bandeja, para verlo al revisarlo (como /api/gastos/justificante: nunca hay URL
// pública; se lee con sesión y permiso de ver gastos). La factura electrónica (XML), siempre como descarga.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastos' });
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('id') || '');
  const d = idValido(id) && (await leerUno(u, 'bandeja', id));
  if (!d?.archivo?.clave) return error('Esta factura ya no está en la bandeja', 404);
  const datos = await leerJustificante(u, d.archivo);
  if (!datos) return error('No se encuentra el archivo', 404);
  const nombre = `factura-${id.slice(1, 9)}.${TIPOS[d.archivo.tipo] || 'bin'}`;
  return new Response(datos, {
    headers: {
      'Content-Type': d.archivo.tipo,
      'Content-Length': String(datos.length),
      'Content-Disposition': `${esXml(d.archivo) ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

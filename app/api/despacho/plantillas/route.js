import { cuerpo, error } from '@/lib/api';
import { miDespacho } from '@/lib/despachoApi';
import { guardarPlantilla } from '@/lib/plantillasDespacho';

export const dynamic = 'force-dynamic';

// Mensajes guardados del despacho (lib/plantillasDespacho.js): { id?, titulo, texto } guarda (nuevo o cambiado);
// DELETE ?id= lo borra. Los usa y los cambia todo el equipo.
export async function POST(req) {
  const { d, res } = await miDespacho();
  if (res) return res;
  const r = await guardarPlantilla(d.id, await cuerpo(req));
  return r.error ? error(r.error, r.status || 400) : Response.json({ plantillas: r.plantillas });
}

export async function DELETE(req) {
  const { d, res } = await miDespacho();
  if (res) return res;
  const r = await guardarPlantilla(d.id, { id: req.nextUrl.searchParams.get('id') || '', borrar: true });
  return r.error ? error(r.error, r.status || 400) : Response.json({ plantillas: r.plantillas });
}

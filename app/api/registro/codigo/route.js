import { NO_VALIDO, resolverCodigo, textoCodigo } from '@/lib/codigoPromocional';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';

// Comprueba el código promocional mientras se rellena el registro (components/FormRegistro.js).
export async function POST(req) {
  if (await pasado('registro-codigo', ipDe(req), 30, 3600)) return Response.json({ ok: false, error: MUCHOS }, { status: 429 });
  const datos = await req.json().catch(() => null);
  const r = await resolverCodigo(datos?.codigo);
  return Response.json(r ? { ok: true, tipo: r.tipo, dias: r.dias, texto: textoCodigo(r) } : { ok: false, error: NO_VALIDO });
}

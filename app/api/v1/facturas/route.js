import { usuarioClave, respuestaPublica, jsonPublico, errorPublico, cuerpoPublico } from '@/lib/apiPublica';
import { facturaPublica, paginaPublica, parametrosPagina } from '@/lib/apiPublicaDatos';
import { limpiar, crearFactura } from '@/lib/facturas';
import { actividadesDe, fiscalDe, limiteSimplificada, usa303, usaIgic } from '@/lib/empresa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = (req) => respuestaPublica(async () => {
  const { u, res } = await usuarioClave(req, { alcance: 'facturas:leer' });
  if (res) return res;
  return jsonPublico(await paginaPublica(u, 'facturas', parametrosPagina(req), facturaPublica));
});

export const POST = (req) => respuestaPublica(async () => {
  const { u, apiClave, res } = await usuarioClave(req, { alcance: 'facturas:escribir', escritura: true });
  if (res) return res;
  const idem = req.headers.get('idempotency-key');
  if (idem !== null && !/^[\w:.-]{6,80}$/.test(idem)) return errorPublico('Idempotency-Key debe tener de 6 a 80 caracteres: letras, números, _, :, . o -');
  const b = await cuerpoPublico(req);
  if (Object.hasOwn(b, 'rectifica') || Object.hasOwn(b, 'motivoRectificacion')) return errorPublico('La API todavía no admite rectificativas');
  const fiscal = fiscalDe(u);
  const datos = limpiar(b, actividadesDe(u), fiscal.tipo === 'sociedad', { rectificativa: false, igic: usaIgic(fiscal), conRecargo: usa303(fiscal) && !usaIgic(fiscal), reagp: fiscal.iva === 'reagp', limiteSimplificada: limiteSimplificada(fiscal) });
  if (datos.error) return errorPublico(datos.error);
  const r = await crearFactura(u, datos, { idem: idem === null ? undefined : `api:${apiClave.id}:${idem}`, ordenFechas: true });
  if (r.error) return errorPublico(r.error, r.riesgo || r.ordenFechas ? 409 : 400);
  return jsonPublico(facturaPublica(r.factura), 201);
});

import { cuerpo, error, usuarioApi } from '@/lib/api';
import { anularVerifactu, subsanarVerifactu } from '@/lib/facturas';
import { numeroFactura } from '@/lib/calculos';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Verifactu (auditoría F11): { accion: 'subsanar', id, cliente: { nombre, nif } } para reenviar corregido un registro
// rechazado o aceptado con errores; { accion: 'anular', id, motivo } para una factura expedida por error.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.id || '');
  if (b.accion === 'subsanar') {
    const r = await subsanarVerifactu(u, id, { cliente: b.cliente }).catch((e) => ({ error: e.message }));
    if (r.error) return error(r.error);
    await auditar(u, 'Verifactu: subsanación', `${numeroFactura(r.factura)} · ${r.factura.cliente.nombre} (${r.factura.cliente.nif})`);
    return Response.json({ ok: true, factura: r.factura });
  }
  if (b.accion === 'anular') {
    if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede anular un registro de Verifactu', 403);
    const motivo = String(b.motivo || '').trim();
    if (!motivo) return error('Explica por qué se anula (por ejemplo: «duplicada por error»)');
    const r = await anularVerifactu(u, id, { motivo }).catch((e) => ({ error: e.message }));
    if (r.error) return error(r.error);
    await auditar(u, 'Verifactu: anulación', `${numeroFactura(r.factura)} · ${motivo}`);
    return Response.json({ ok: true });
  }
  return error('Acción no válida');
}

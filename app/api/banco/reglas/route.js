import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { borrarRegla, crearRegla, editarRegla } from '@/lib/bancoServidor';
import { resumenRegla } from '@/lib/reglasBanco';

export const dynamic = 'force-dynamic';

// Reglas de conciliación del banco (lib/reglasBanco.js). Hace falta el mismo permiso que para emparejar o ignorar lo que
// cubre la regla (lib/bancoServidor.js crearRegla): gastar para los cargos, facturar para los abonos. Con el plan que
// incluye la conciliación automática, como el resto de Banco.
const acceso = () => usuarioApi({ permiso: 'resumen', funcion: 'conciliacion' });
const respuesta = (r, extra) => (r.error ? error(r.error, r.status || 400) : Response.json({ ok: true, ...(r.regla ? { regla: r.regla } : {}), ...extra }));
const idDe = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');

export async function POST(req) {
  const { u, res } = await acceso();
  if (res) return res;
  const r = await crearRegla(u, await cuerpo(req));
  if (r.ok) await auditar(u, 'Regla del banco creada', `${r.regla.contiene} → ${resumenRegla(r.regla).entonces}`);
  return respuesta(r);
}

export async function PATCH(req) {
  const { u, res } = await acceso();
  if (res) return res;
  const b = await cuerpo(req);
  const id = idDe(b.id);
  if (!id) return error('Falta la regla');
  const r = await editarRegla(u, id, b);
  if (r.ok) await auditar(u, 'Regla del banco editada', `${r.regla.contiene} → ${resumenRegla(r.regla).entonces}`);
  return respuesta(r);
}

export async function DELETE(req) {
  const { u, res } = await acceso();
  if (res) return res;
  const id = idDe(new URL(req.url).searchParams.get('id'));
  if (!id) return error('Falta la regla');
  const r = await borrarRegla(u, id);
  if (r.ok) await auditar(u, 'Regla del banco borrada', id);
  return respuesta(r);
}

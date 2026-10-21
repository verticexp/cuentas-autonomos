import { DETALLE } from '@/lib/permisos';
import { borrar, guardar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { asientoApertura, limpiarAsiento } from '@/lib/asientos';
import { fiscalDe } from '@/lib/empresa';
import { asientosPersonal } from '@/lib/personal';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';
const MAX_LINEAS = 200;

// Asientos apuntados a mano (ajustes, regularizaciones de la gestoría…) y el de apertura (solo uno por empresa).
// { apertura: { fecha, banco, capital, largo, corto } }, { personal: { fecha, sueldos, ssEmpresa, irpf, ssTrabajador, otros, pagoLiquido… } }
// (nóminas de la gestoría: devengo y pagos) o { fecha, concepto, lineas: [{ cuenta, debe, haber }] }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: DETALLE });
  if (res) return res;
  const b = await cuerpo(req);
  if ((Array.isArray(b.lineas) && b.lineas.length > MAX_LINEAS) || (Array.isArray(b.personal?.otros) && b.personal.otros.length > MAX_LINEAS)) return error('Un asiento admite como mucho 200 líneas. Divídelo en varios asientos.');
  let a;
  if (b.personal) {
    const p = asientosPersonal(b.personal);
    if (p.error) return error(p.error);
    const hechos = [];
    for (const x of p.asientos) {
      if (x.lineas.length > MAX_LINEAS) return error('Un asiento admite como mucho 200 líneas. Divídelo en varios asientos.');
      const l = limpiarAsiento(x);
      if (l.error) return error(l.error);
      hechos.push({ id: crypto.randomUUID(), ...l, personal: true });
    }
    for (const h of hechos) await guardar(u, 'asientos', { ...h, por: u.id, creado: new Date().toISOString() });
    await auditar(u, 'Asiento de personal', `${hechos[0].fecha} · ${hechos[0].concepto}${hechos.length > 1 ? ` (+${hechos.length - 1} de pago)` : ''}`);
    return Response.json({ ok: true, asientos: hechos });
  }
  if (b.apertura) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.apertura.fecha || '')) return error('Fecha no válida');
    const previa = (await leer(u, 'asientos')).find((x) => x.apertura);
    a = { id: previa?.id || crypto.randomUUID(), ...asientoApertura(b.apertura, fiscalDe(u).tipo === 'sociedad') };
    if (a.lineas.length < 2) return error('Pon al menos el saldo del banco o el capital');
  } else {
    const l = limpiarAsiento(b);
    if (l.error) return error(l.error);
    a = { id: crypto.randomUUID(), ...l };
  }
  await guardar(u, 'asientos', { ...a, por: u.id, creado: new Date().toISOString() });
  await auditar(u, a.apertura ? 'Asiento de apertura' : 'Asiento manual', `${a.fecha} · ${a.concepto}`);
  return Response.json({ ok: true, asiento: a });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: DETALLE });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'asientos', id);
  if (!antes) return error('Ese asiento ya no existe', 404);
  await borrar(u, 'asientos', id);
  await auditar(u, 'Asiento borrado', `${antes.fecha} · ${antes.concepto}`);
  return Response.json({ ok: true });
}

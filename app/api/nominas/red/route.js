import { leer } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { calculoNomina, conceptosRed, GRUPOS, nombreMes } from '@/lib/nominas';
import { xlsx } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

// Datos del mes para RED (Sistema de Liquidación Directa de la Seguridad Social): por trabajador, sus bases de
// cotización y sus conceptos retributivos con la clave de la Tabla 84 (mensaje CRA). Fisquo no envía nada a la
// Tesorería: el fichero de SILTRA lo genera y lo envía quien tiene la autorización RED (la empresa o su gestoría), con
// estos datos. Solo las nóminas completas (las de porcentajes no tienen bases).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const mes = req.nextUrl.searchParams.get('mes') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return error('Mes no válido');
  const [nominas, empleados] = await Promise.all([leer(u, 'nominas'), leer(u, 'empleados')]);
  const delMes = (nominas || []).filter((n) => n.mes === mes && n.detalle);
  if (!delMes.length) return error('No hay nóminas completas de ese mes (con bases de cotización)', 404);
  const ficha = (n) => (empleados || []).find((e) => e.id === n.empleado) || {};
  const ccc = u.emisor?.ccc || '';
  const buf = xlsx([
    { nombre: 'Empresa', anchos: [34, 50], filas: [
      ['Liquidación de cotizaciones', nombreMes(mes)],
      ['Empresa', u.emisor?.nombre || ''], ['CIF / NIF', u.emisor?.nif || ''], ['Código de cuenta de cotización', ccc || 'Ponlo en Ajustes › Datos de la empresa'],
      ['Uso', 'Datos para la liquidación en RED (SILTRA o RED directo) y el mensaje CRA. Los envía quien tiene la autorización RED.'],
    ] },
    { nombre: 'Bases', anchos: [28, 12, 14, 8, 6, 14, 14, 14, 14, 14, 14], filas: [
      ['Trabajador', 'DNI / NIE', 'Afiliación', 'Grupo', 'Días', 'Base comunes', 'Base AT y desempleo', 'Base horas extra', 'Exceso (solidaridad)', 'Cuota trabajador', 'Cuota empresa'],
      ...delMes.map((n) => {
        const e = ficha(n), d = n.detalle, c = calculoNomina(n);
        return [n.empleadoNombre, e.nif || '', e.naf || '', { n: d.grupo }, { n: 30 }, d.base, d.baseAT, d.horasExtra || 0, d.exceso || 0, c.ssTrabajador, c.ssEmpresa];
      }),
    ] },
    { nombre: 'CRA', anchos: [28, 12, 14, 8, 44, 8, 14], filas: [
      ['Trabajador', 'DNI / NIE', 'Afiliación', 'Clave', 'Concepto (Tabla 84)', 'Base', 'Importe'],
      ...delMes.flatMap((n) => { const e = ficha(n); return conceptosRed(n, e).map(([clave, nombre, importe]) => [n.empleadoNombre, e.nif || '', e.naf || '', clave, nombre, 'I', importe]); }),
    ] },
    { nombre: 'Grupos', anchos: [8, 50], filas: [['Grupo', 'Categoría'], ...Object.entries(GRUPOS).map(([k, v]) => [{ n: Number(k) }, v])] },
  ]);
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="red-${mes}.xlsx"` } });
}

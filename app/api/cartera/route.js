import { leerMarcados } from '@/lib/indices';
import { usuarioApi } from '@/lib/api';
import { carteraCobros, carteraXlsx } from '@/lib/cartera';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { leer } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Excel de la cartera de efectos a cobrar: facturas pendientes por vencimiento, por tramos y por cliente.
export async function GET() {
  const { u, res } = await usuarioApi({ permiso: 'facturas', funcion: 'cartera' });
  if (res) return res;
  const h = hoy();
  const [facturas, clientes] = await Promise.all([leerMarcados(u, 'facturas', 'p'), leer(u, 'clientes')]);
  const d = carteraCobros(facturas, { hoy: h, plazo: u.emisor?.plazo, clientes });
  const nombre = `cartera-cobros-${h}.xlsx`;
  await auditar(u, 'Exportación a Excel', nombre);
  const cuerpo = carteraXlsx({ empresa: u.emisor?.nombre || u.empresaNombre || '', d });
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}

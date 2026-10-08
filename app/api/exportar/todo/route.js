import { clave, leer, redis } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { membresias } from '@/lib/membresias';
import { auditar, leerAuditoria } from '@/lib/auditoria';
import { zip } from '@/lib/zip';

export const dynamic = 'force-dynamic';

const LISTAS = ['facturas', 'registros', 'gastos', 'clientes', 'productos', 'presupuestos', 'recurrentes', 'empleados', 'nominas', 'jornada', 'bancos', 'banco'];
const json = (x) => Buffer.from(JSON.stringify(x, null, 1));

// Todos los datos de la empresa en un .zip con un JSON por tipo (portabilidad, RGPD art. 20). Solo su administrador.
// Sin contraseñas, sesiones ni el token de Google Drive.
export async function GET() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede descargar todos sus datos', 403);
  const [listas, empresa, usuarios, saldo, verifactu, actividad] = await Promise.all([
    Promise.all(LISTAS.map((n) => leer(u, n))),
    redis.hget('empresas', u.empresa),
    redis.hgetall('usuarios'),
    redis.get(clave(u, 'saldo')),
    redis.get(clave(u, 'verifactu')),
    leerAuditoria(u.empresa, 1000),
  ]);
  const { drive, driveError, ...datosEmpresa } = empresa || {};
  const personas = Object.values(usuarios || {})
    .filter((o) => membresias(o)[u.empresa])
    .map((o) => ({ nombre: o.nombre, email: o.email, ...membresias(o)[u.empresa], alta: o.creado }));
  await auditar(u, 'Descarga de todos los datos');
  const archivos = [
    { nombre: 'empresa.json', datos: json({ ...datosEmpresa, drive: drive?.url ? { url: drive.url } : null, saldo, ultimaHuellaVerifactu: verifactu }) },
    { nombre: 'personas.json', datos: json(personas) },
    ...LISTAS.map((n, i) => ({ nombre: `${n}.json`, datos: json(listas[i] || []) })),
    { nombre: 'actividad.json', datos: json(actividad) },
  ];
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(zip(archivos), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="netto-datos-${fecha}.zip"` } });
}

import { mensajePlan } from '@/lib/app';
import { guardar, borrar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { r2 } from '@/lib/calculos';
import { importeEscrito } from '@/lib/validacion';
import { SS_EMPRESA, SS_TRABAJADOR, limpiarCotizacion, limpiarDatos145, fechaNominaValida } from '@/lib/nominas';
import { comprobarCierre } from '@/lib/cierres';
import { sinHueco } from '@/lib/planes';

export const dynamic = 'force-dynamic';
const MAX_SUELDO = 1000000;
const MAX_PRECIO_HORA_EXTRA = 1000000;
const pct = (v, def) => Math.min(100, Math.max(0, v === '' || v === undefined ? def : Number(String(v).replace(',', '.')) || 0));

// Datos de un empleado a partir del formulario (components/FormEmpleado.js).
function limpio(b, antes = {}) {
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  const sueldo = importeEscrito(b.bruto);
  const bruto = r2(sueldo);
  const horaExtra = importeEscrito(b.precioHoraExtra, 0);
  if (!nombre) return { error: 'Falta el nombre' };
  if (!Number.isFinite(sueldo) || sueldo <= 0 || sueldo > MAX_SUELDO || !bruto) return { error: 'Escribe un sueldo bruto mayor que 0 y de hasta 1.000.000 € (por ejemplo, 1.500,50).' };
  if (!Number.isFinite(horaExtra) || horaExtra < 0 || horaExtra > MAX_PRECIO_HORA_EXTRA) return { error: 'Escribe un precio por hora extra entre 0 y 1.000.000 € (por ejemplo, 15,50).' };
  if (!fechaNominaValida(b.alta)) return { error: 'Fecha de alta no válida' };
  if (b.baja && (!fechaNominaValida(b.baja) || b.baja < b.alta)) return { error: 'La baja debe ser una fecha válida e igual o posterior al alta' };
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email).trim())) return { error: 'Email no válido' };
  // Nómina completa (lib/nominas.js): datos de cotización y, para el IRPF automático, los del modelo 145.
  const nif = String(b.nif || '').trim().toUpperCase().slice(0, 15);
  const cotizacion = b.cotizacion ? limpiarCotizacion(b.cotizacion) : null;
  if (cotizacion?.error) return { error: cotizacion.error };
  const datos145 = b.datos145 ? limpiarDatos145(b.datos145, nif) : null;
  if (datos145?.error) return { error: datos145.error };
  return {
    e: {
      ...antes,
      nombre,
      nif,
      puesto: String(b.puesto || '').trim().slice(0, 60),
      alta: b.alta,
      baja: b.baja || '',
      bruto,
      irpfPct: pct(b.irpfPct, 12),
      ssTrabajadorPct: pct(b.ssTrabajadorPct, SS_TRABAJADOR),
      ssEmpresaPct: pct(b.ssEmpresaPct, SS_EMPRESA),
      // Registro de jornada: con su email ficha desde su cuenta de Fisquo; horas de su jornada y precio de la hora extra.
      email: String(b.email || '').trim().toLowerCase().slice(0, 120),
      horasSemana: Math.min(60, Math.max(1, Number(String(b.horasSemana ?? '').replace(',', '.')) || 40)),
      precioHoraExtra: r2(horaExtra),
      cotizacion: cotizacion || undefined,
      datos145: datos145 || undefined,
      // Número de afiliación a la Seguridad Social (para RED).
      naf: String(b.naf || '').replace(/\D/g, '').slice(0, 12),
      // La provincia del 190 (lib/modelos.js modelo190) sale de aquí.
      cp: /^\d{5}$/.test(String(b.cp || '').trim()) ? String(b.cp).trim() : '',
    },
  };
}

const emailRepetido = async (u, e) => e.email && ((await leer(u, 'empleados')) || []).some((x) => x.id !== e.id && x.email === e.email);

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const sinPlan = sinHueco(u.plan, 'empleados', (await leer(u, 'empleados')).filter((e) => !e.baja).length);
  if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
  const r = limpio(await cuerpo(req), { id: crypto.randomUUID() });
  if (r.error) return error(r.error);
  if (await emailRepetido(u, r.e)) return error('Otro empleado ya tiene ese email');
  await guardar(u, 'empleados', r.e);
  return Response.json({ ok: true, empleado: r.e });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'empleados', b.id));
  if (!antes) return error('Ese empleado ya no existe', 404);
  const r = limpio(b, antes);
  if (r.e && (r.e.alta !== antes.alta || r.e.baja !== antes.baja)) {
    const nominas = (await leer(u, 'nominas')) || [];
    if (nominas.some((n) => n.empleado === antes.id && n.tipo === 'finiquito')) return error('La baja tiene un finiquito guardado; corrige primero el finiquito', 409);
    const fechas = nominas.filter((n) => n.empleado === antes.id).map((n) => `${n.mes}-01`);
    const cerrado = await comprobarCierre(u, ...fechas, r.e.alta, ...(r.e.baja ? [r.e.baja] : []));
    if (cerrado) return error(cerrado, 409);
  }
  if (r.error) return error(r.error);
  if (await emailRepetido(u, r.e)) return error('Otro empleado ya tiene ese email');
  await guardar(u, 'empleados', r.e);
  return Response.json({ ok: true });
}

// Borrar solo quita la ficha: sus nóminas ya hechas se quedan (son gastos y retenciones declaradas).
export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  await borrar(u, 'empleados', id);
  return Response.json({ ok: true });
}

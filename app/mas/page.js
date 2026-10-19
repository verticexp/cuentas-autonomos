import Ir from '@/components/Ir';
import Avatar from '@/components/Avatar';
import MasLista from '@/components/MasLista';
import { requerir } from '@/lib/auth';
import { perfilDe, permisosDe } from '@/lib/permisos';
import { sinFuncion } from '@/lib/planes';
import { plazosFiscales } from '@/lib/avisos';
import { fiscalDe } from '@/lib/empresa';
import { ahoraMadrid } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';
import { avisosMas } from '@/lib/avisosMasServidor';
import { gruposVisibles } from '@/components/secciones';
import '@/app/mk.css';
import '@/app/mas.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Más · Netto' };

const DIAS_AVISO = 15;
const dias = (de, a) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);

// El próximo plazo de Hacienda si es en menos de 15 días. Solo con el perfil fiscal: sin lecturas a la base de datos.
function avisoHacienda(u, hoy) {
  const y = Number(hoy.slice(0, 4));
  const p = [...plazosFiscales(fiscalDe(u), y, { cuotaIS: u.cuotaIS }), ...plazosFiscales(fiscalDe(u), y + 1)].find((x) => x.fecha >= hoy);
  const d = p && dias(hoy, p.fecha);
  if (d === undefined || d > DIAS_AVISO) return null;
  return { tono: d <= 3 ? 'rojo' : 'ambar', texto: d === 0 ? 'Plazo hoy' : d === 1 ? 'Plazo mañana' : `Plazo en ${d} días` };
}

// Qué aviso lleva cada pantalla.
const AVISO_DE = { '/modelos': 'hacienda', '/banco': 'banco', '/presupuestos': 'presupuestos', '/inventario': 'inventario' };

// «Más»: el resto de pantallas en listas por grupos, con un buscador que también pregunta a Netto. Ajustes, en el perfil.
// Lo que sale depende de los permisos de cada persona y de si la empresa lleva inventario (components/secciones.js).
export default async function Mas() {
  const u = await requerir();
  const permisos = permisosDe(u);
  const hoy = ahoraMadrid().slice(0, 10);
  const visibles = gruposVisibles(permisos, Boolean(u.fiscal?.inventario));
  // Banco, Presupuestos e Inventario: de lo guardado por versión de los datos (sin leer el histórico en cada visita).
  // Si falla, la página sale igual, sin esos avisos.
  const hrefs = new Set(visibles.flatMap((g) => g.enlaces.map((e) => e.href)));
  const que = Object.entries(AVISO_DE).filter(([href, q]) => hrefs.has(href) && !(q === 'inventario' && u.plan?.version === 2 && sinFuncion(u.plan, 'inventario'))).map(([, q]) => q);
  const [guardados, ficha] = await Promise.all([avisosMas(u, que, hoy).catch(() => ({})), !permisos.includes('nominas') && miEmpleado(u, hoy)]);
  const avisos = { ...guardados, hacienda: permisos.includes('resumen') ? avisoHacienda(u, hoy) : null };
  const grupos = visibles.map((g) => ({ ...g, enlaces: g.enlaces.map((e) => (avisos[AVISO_DE[e.href]] ? { ...e, aviso: avisos[AVISO_DE[e.href]] } : e)) }));
  // Quien ficha pero no lleva las nóminas: su «Fichar» en Equipo (el registro de jornada completo es de quien las lleva).
  if (ficha?.yo) {
    grupos.push({ titulo: 'Equipo', tono: 'violeta', enlaces: [{ href: '/jornada', nombre: 'Fichar', detalle: 'Entrada, salida, pausas y tus horas del mes', icono: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> }] });
  }
  const asistente = !(u.plan?.version === 2 && sinFuncion(u.plan, 'asistente'));
  return (
    <main className="pagina mk-look mas-pagina">
      <h1 className="titulo">Más</h1>
      <Ir href="/ajustes" className="mas-perfil">
        <Avatar nombre={u.nombre} size={44} />
        <span className="txt"><strong>{u.nombre}</strong><small>{perfilDe(u)} en {u.empresaNombre}</small></span>
        <span className="mas-perfil-ir">Ajustes ›</span>
      </Ir>
      <MasLista grupos={grupos} asistente={asistente} />
    </main>
  );
}

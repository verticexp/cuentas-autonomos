import Ir from '@/components/Ir';
import MasLista from '@/components/MasLista';
import { requerir } from '@/lib/auth';
import { permisosDe } from '@/lib/permisos';
import { sinFuncion } from '@/lib/planes';
import { plazosFiscales } from '@/lib/avisos';
import { conEquipo, fiscalDe } from '@/lib/empresa';
import { leer } from '@/lib/redis';
import { ahoraMadrid } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';
import { gruposVisibles } from '@/components/secciones';
import { planesQueFaltan } from '@/lib/modulos';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/mas.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Más' };

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

// «Más»: el resto de pantallas en listas por grupos, con favoritos arriba y un buscador que también pregunta a Fisquo.
// Ajustes, en el botón de arriba.
// Lo que sale depende de los permisos de cada persona y de si la empresa lleva inventario (components/secciones.js).
export default async function Mas() {
  const u = await requerir();
  const permisos = permisosDe(u);
  const hoy = ahoraMadrid().slice(0, 10);
  const hacienda = permisos.includes('resumen') ? avisoHacienda(u, hoy) : null;
  const equipo = permisos.includes('nominas') && conEquipo(u, (await leer(u, 'empleados')) || []);
  const grupos = gruposVisibles(permisos, Boolean(u.fiscal?.inventario), { fiscal: fiscalDe(u), faltan: planesQueFaltan(u.plan), equipo })
    .map((g) => ({ ...g, enlaces: g.enlaces.map((e) => (e.href === '/modelos' && hacienda ? { ...e, aviso: hacienda } : e)) }));
  // Quien ficha pero no lleva las nóminas: su «Fichar» en Equipo (el registro de jornada completo es de quien las lleva).
  if (!permisos.includes('nominas') && (await miEmpleado(u, hoy)).yo) {
    grupos.push({ titulo: 'Equipo', tono: 'violeta', enlaces: [{ href: '/jornada', nombre: 'Fichar', detalle: 'Entrada, salida, pausas y tus horas del mes', icono: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> }] });
  }
  const asistente = !(u.plan?.version >= 2 && sinFuncion(u.plan, 'asistente'));
  const tr = await textos();
  return (
    <main className="pagina mk-look mas-pagina">
      {/* El título grande y, a su derecha, «Ajustes» con su rueda (abre la hoja de Ajustes). Antes era tu avatar, como en
          App Store, pero no se entendía que llevaba a Ajustes: tu cuenta sale arriba dentro de la hoja. */}
      <div className="mas-cab">
        <h1 className="titulo">{tr('Más')}</h1>
        <Ir href="/ajustes" tipo="hoja" className="mas-ajustes">
          <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          <span>{tr('Ajustes')}</span>
        </Ir>
      </div>
      <MasLista grupos={grupos} asistente={asistente} />
    </main>
  );
}

import { redirect } from 'next/navigation';
import { bloquearPorEmail, exigirDesbloqueo, usuarioActual } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import Cuestionario from '@/components/Cuestionario';
import Logo from '@/components/Logo';

import '@/app/mk.css';
import { todasFichas } from '@/lib/indices';

export const dynamic = 'force-dynamic';

// Primer paso de una empresa nueva (o desde Ajustes para cambiarlo): cómo trabaja, sus datos y sus actividades.
export default async function Bienvenida({ searchParams }) {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  await exigirDesbloqueo(u);
  if (bloquearPorEmail(u)) redirect('/confirmar-email');
  if (!puede(u, 'empresa')) redirect('/');
  const editar = Boolean((await searchParams).editar);
  if (!u.pendiente && !editar) redirect('/');
  const conFacturas = [...new Set((await todasFichas(u, 'facturas')).map((f) => f.a))];
  return (
    <main className="pagina mk-look bienvenida">
      {/* Con la marca y una salida (auditoría D8-09): mientras la cuenta está a medias, todo lleva aquí. */}
      {!editar && (
        <header className="bienvenida-cab">
          <Logo className="logo-bienvenida" />
          <form method="post" action="/api/logout"><button type="submit" className="enlace">Salir</button></form>
        </header>
      )}
      <Cuestionario
        editar={editar}
        puedeFacturar={puede(u, 'facturar')}
        inicial={{
          fiscal: fiscalDe(u),
          emisor: { nombre: u.emisor?.nombre || (u.pendiente ? u.empresaNombre : ''), nif: u.emisor?.nif || '', direccion: u.emisor?.direccion || '', ciudad: u.emisor?.ciudad || '', cp: u.emisor?.cp || '', provincia: u.emisor?.provincia || '', iban: u.emisor?.iban || '', plazo: u.emisor?.plazo ?? 30 },
          actividades: u.pendiente ? [] : actividadesDe(u),
        }}
        conFacturas={conFacturas}
      />
    </main>
  );
}

// Desde Ajustes («Actividades e impuestos») abre lo mismo para editarlo: la pestaña dice lo que es.
export async function generateMetadata({ searchParams }) {
  return { title: (await searchParams)?.editar ? 'Actividades e impuestos' : 'Bienvenida' };
}

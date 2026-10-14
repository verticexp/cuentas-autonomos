import Ir from '@/components/Ir';
import Avatar from '@/components/Avatar';
import { requerir } from '@/lib/auth';
import { perfilDe, permisosDe } from '@/lib/permisos';
import { gruposVisibles } from '@/components/secciones';
import '@/app/mk.css';
import '@/app/mas.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Más · Netto' };

// «Más»: todas las pantallas que no caben en la barra del móvil, en una cuadrícula, y Ajustes dentro.
// Lo que sale depende de los permisos de cada persona y de si la empresa lleva inventario (components/secciones.js).
export default async function Mas() {
  const u = await requerir();
  const grupos = gruposVisibles(permisosDe(u), Boolean(u.fiscal?.inventario));
  return (
    <main className="pagina mk-look mas-pagina">
      <h1 className="titulo">Más</h1>
      <Ir href="/ajustes" className="mas-perfil">
        <Avatar nombre={u.nombre} size={44} />
        <span className="txt"><strong>{u.nombre}</strong><small>{perfilDe(u)} en {u.empresaNombre}</small></span>
        <span className="mas-perfil-ir">Ajustes ›</span>
      </Ir>
      {grupos.map((g) => (
        <section key={g.titulo} className="mas-grupo" aria-label={g.titulo}>
          <h2 className="grupo-t">{g.titulo}</h2>
          <div className="mas-rejilla">
            {g.enlaces.map((e) => (
              <Ir key={e.href} href={e.href} prefetch={false} className="mas-tile">
                <span className="mas-ico"><svg viewBox="0 0 24 24" aria-hidden>{e.icono}</svg></span>
                <span className="mas-nombre">{e.nombre}</span>
              </Ir>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

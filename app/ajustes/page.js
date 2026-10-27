import { headers } from 'next/headers';
import { esApp } from '@/lib/app';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { perfilDe } from '@/lib/permisos';
import Avatar from '@/components/Avatar';
import { CuentaYEmpresas } from '@/components/ListaAjustes';

export const dynamic = 'force-dynamic';

// /ajustes. La lista la pinta app/ajustes/layout.js. En el móvil no hay nada más (la hoja es la lista); en el ordenador,
// a la derecha de la lista va tu cuenta, como la cuenta de Apple arriba de los Ajustes del Sistema del Mac.
export default async function Page() {
  const u = await requerir();
  const app = esApp((await headers()).get('user-agent'));
  return (
    <main className="pagina mk-look ajustes-raiz">
      <div className="aj-solo-ordenador">
        <h1 className="solo-lectores">Tu cuenta</h1>
        <div className="aj-cuenta">
          <Avatar nombre={u.nombre} size={88} />
          <strong>{u.nombre}</strong>
          <small>{u.email} · {perfilDe(u)} en {u.empresaNombre}</small>
        </div>
        <section className="grupo">
          <div className="grupo-c"><Ir href="/ajustes/perfil" className="celda ir mas-fila"><span className="txt">Tu nombre</span><span className="mas-valor">{u.nombre}</span></Ir></div>
        </section>
        <CuentaYEmpresas u={u} app={app} />
      </div>
    </main>
  );
}

export const metadata = { title: 'Ajustes' };

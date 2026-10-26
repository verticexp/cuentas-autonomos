import Vacio from '@/components/Vacio';
import { fechaHora } from '@/lib/formato';
import { requerir } from '@/lib/auth';
import { leerAuditoria } from '@/lib/auditoria';
import Volver from '@/components/Volver';
import SinAcceso from '@/components/SinAcceso';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

const cuando = fechaHora;

// Registro de actividad de la empresa (lib/auditoria.js): solo para su administrador.
export default async function Actividad() {
  const u = await requerir();
  if (u.rol !== 'admin') return <SinAcceso />;
  const lista = await leerAuditoria(u.empresa);
  return (
    <main className="pagina mk-look">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Actividad</h1>
      <p className="resumen-linea">Quién ha cambiado permisos, datos de la empresa o la contraseña, y quién ha borrado o exportado facturas y gastos.</p>
      {lista.length ? (
        <ul className="grupo-lista">
          {lista.map((a, i) => (
            <li key={i} className="fila">
              <span className="txt">
                <strong>{a.accion}</strong>
                {a.detalle && <small>{a.detalle}</small>}
                <small>{a.nombre} · {cuando(a.fecha)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Vacio icono="actividad" titulo="Aún no hay actividad">Aquí aparecerán los cambios de permisos, de datos de la empresa, los borrados y las exportaciones, con quién los hizo.</Vacio>
      )}
    </main>
  );
}

export const metadata = { title: 'Actividad' };

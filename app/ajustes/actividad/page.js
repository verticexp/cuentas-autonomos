import { requerir } from '@/lib/auth';
import { leerAuditoria } from '@/lib/auditoria';
import Volver from '@/components/Volver';
import SinAcceso from '@/components/SinAcceso';

export const dynamic = 'force-dynamic';

const cuando = (f) => new Date(f).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Registro de actividad de la empresa (lib/auditoria.js): solo para su administrador.
export default async function Actividad() {
  const u = await requerir();
  if (u.rol !== 'admin') return <SinAcceso />;
  const lista = await leerAuditoria(u.empresa);
  return (
    <main className="pagina">
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
        <div className="vacio"><p>Aún no hay actividad</p><p>Aquí aparecerán los cambios de permisos, de datos de la empresa, los borrados y las exportaciones.</p></div>
      )}
    </main>
  );
}

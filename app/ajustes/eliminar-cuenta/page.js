import { requerir } from '@/lib/auth';
import { CONSERVAR } from '@/lib/baja';
import Volver from '@/components/Volver';
import EliminarCuenta from '@/components/EliminarCuenta';
import SinAcceso from '@/components/SinAcceso';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Eliminar la propia cuenta (app/api/baja/cuenta, lib/baja.js eliminarCuenta).
export default async function Page() {
  const u = await requerir();
  if (u.admin) return <SinAcceso texto="La cuenta del administrador de Kontix no se puede eliminar desde aquí." />;
  return (
    <main className="pagina mk-look">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Eliminar mi cuenta</h1>
      <div className="tarjeta bloque">
        <p>Al eliminar tu cuenta (<strong>{u.email}</strong>):</p>
        <ul className="nota">
          <li>Se borran tu nombre, tu email, tu contraseña y tus accesos con Face ID, y se cierran tus sesiones en todos los dispositivos.</li>
          <li>Dejas de tener acceso a tus empresas. Si eres la única persona de una empresa, la empresa se da de baja y deja de renovarse su suscripción.</li>
          <li>Las facturas, los gastos y el resto de registros que la ley obliga a conservar se guardan bloqueados {CONSERVAR} años y después se borran solos. Nadie puede verlos ni usarlos.</li>
        </ul>
        <p className="nota">No se puede deshacer. Antes, si quieres, <a href="/api/exportar/todo" download>descarga todos tus datos</a>.</p>
      </div>
      <EliminarCuenta email={u.email} />
    </main>
  );
}

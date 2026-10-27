import { requerir } from '@/lib/auth';
import { CONSERVAR } from '@/lib/baja';
import Volver from '@/components/Volver';
import EliminarCuenta from '@/components/EliminarCuenta';
import SinAcceso from '@/components/SinAcceso';
import { textos } from '@/lib/idiomaServidor';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Eliminar la propia cuenta (app/api/baja/cuenta, lib/baja.js eliminarCuenta).
export default async function Page() {
  const tr = await textos();
  const u = await requerir();
  if (u.admin) return <SinAcceso texto={tr('La cuenta del administrador de Fisquo no se puede eliminar desde aquí.')} />;
  const [antes, despues = ''] = tr('Al eliminar tu cuenta ({x}):', { x: '\u0001' }).split('\u0001');
  const [previo, posterior = ''] = tr('No se puede deshacer. Antes, si quieres, {x}.', { x: '\u0001' }).split('\u0001');
  return (
    <main className="pagina mk-look">
      <Volver href="/ajustes">{tr('Ajustes')}</Volver>
      <h1 className="titulo">{tr('Eliminar mi cuenta')}</h1>
      <div className="tarjeta bloque">
        <p>{antes}<strong>{u.email}</strong>{despues}</p>
        <ul className="nota">
          <li>{tr('Se borran tu nombre, tu email, tu contraseña y tus accesos con Face ID, y se cierran tus sesiones en todos los dispositivos.')}</li>
          <li>{tr('Dejas de tener acceso a tus empresas. Si eres la única persona de una empresa, la empresa se da de baja y deja de renovarse su suscripción.')}</li>
          <li>{tr('Las facturas, los gastos y el resto de registros que la ley obliga a conservar se guardan bloqueados {n} años y después se borran solos. Nadie puede verlos ni usarlos.', { n: CONSERVAR })}</li>
        </ul>
        <p className="nota">{previo}<a href="/api/exportar/todo" download>{tr('descarga todos tus datos')}</a>{posterior}</p>
      </div>
      <EliminarCuenta email={u.email} />
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Eliminar mi cuenta') }; }

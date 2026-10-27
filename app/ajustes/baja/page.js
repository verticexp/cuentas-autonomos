import { requerir } from '@/lib/auth';
import { CONSERVAR } from '@/lib/baja';
import Volver from '@/components/Volver';
import Baja from '@/components/Baja';
import SinAcceso from '@/components/SinAcceso';
import { textos } from '@/lib/idiomaServidor';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Dar de baja la empresa (lib/baja.js): solo su administrador.
export default async function Page() {
  const tr = await textos();
  const u = await requerir();
  if (u.rol !== 'admin') return <SinAcceso />;
  if (u.admin) return <SinAcceso texto={tr('La empresa del administrador de Fisquo no se puede dar de baja desde aquí.')} />;
  const [antes, despues = ''] = tr('Al dar de baja {x}:', { x: '\u0001' }).split('\u0001');
  const [previo, posterior = ''] = tr('No se puede deshacer. Antes, {x}.', { x: '\u0001' }).split('\u0001');
  return (
    <main className="pagina mk-look">
      <Volver href="/ajustes">{tr('Ajustes')}</Volver>
      <h1 className="titulo">{tr('Dar de baja la empresa')}</h1>
      <div className="tarjeta bloque">
        <p>{antes}<strong>{u.empresaNombre}</strong>{despues}</p>
        <ul className="nota">
          <li>{tr('Nadie podrá volver a entrar. Se borran las cuentas de quienes solo están en esta empresa (nombre, email, contraseña y Face ID).')}</li>
          <li>{tr('Se borran ya los presupuestos, las recurrentes, el catálogo, el banco y los enlaces del portal de clientes.')}</li>
          <li>{tr('Las facturas, los gastos, los clientes, las nóminas y el registro de jornada se guardan bloqueados {n} años, porque la ley obliga a conservarlos, y después se borran solos.', { n: CONSERVAR })}</li>
        </ul>
        <p className="nota">{previo}<a href="/api/exportar/todo" download>{tr('descarga todos tus datos')}</a>{posterior}</p>
      </div>
      <Baja empresa={u.empresaNombre} />
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Dar de baja la empresa') }; }

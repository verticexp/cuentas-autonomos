import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { CONSERVAR } from '@/lib/baja';
import Volver from '@/components/Volver';
import Baja from '@/components/Baja';

export const dynamic = 'force-dynamic';

// Dar de baja la empresa (lib/baja.js): solo su administrador.
export default async function Page() {
  const u = await requerir();
  if (u.rol !== 'admin' || u.admin) notFound();
  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Dar de baja la empresa</h1>
      <div className="tarjeta bloque">
        <p>Al dar de baja <strong>{u.empresaNombre}</strong>:</p>
        <ul className="nota">
          <li>Nadie podrá volver a entrar. Se borran las cuentas de quienes solo están en esta empresa (nombre, email, contraseña y Face ID).</li>
          <li>Se borran ya los presupuestos, las recurrentes, el catálogo, el banco y los enlaces del portal de clientes.</li>
          <li>Las facturas, los gastos, los clientes, las nóminas y el registro de jornada se guardan bloqueados {CONSERVAR} años, porque la ley obliga a conservarlos, y después se borran solos.</li>
        </ul>
        <p className="nota">No se puede deshacer. Antes, <a href="/api/exportar/todo" download>descarga todos tus datos</a>.</p>
      </div>
      <Baja empresa={u.empresaNombre} />
    </main>
  );
}

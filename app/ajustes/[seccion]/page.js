import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import Ajustes from '@/components/Ajustes';
import Controlat from '@/components/Controlat';
import Marca from '@/components/Marca';
import FaceId from '@/components/FaceId';
import AvisosPush from '@/components/AvisosPush';
import { pushListo } from '@/lib/push';
import Volver from '@/components/Volver';
import SinAcceso from '@/components/SinAcceso';
import Verifactu from '@/components/Verifactu';
import { certificadoListo } from '@/lib/verifactuEnvio';
import { leer } from '@/lib/redis';
import Importar from '@/components/Importar';
import { fiscalDe } from '@/lib/empresa';

export const dynamic = 'force-dynamic';

const TITULOS = { facturacion: 'Datos de facturación', marca: 'Logo y color', seguridad: 'Face ID y contraseña', drive: 'Google Drive', controlat: "Controla'T", avisos: 'Avisos en el móvil', importar: 'Importar datos', verifactu: 'Verifactu' };
const DE_EMPRESA = ['facturacion', 'marca', 'drive', 'controlat', 'importar', 'verifactu'];

export default async function Seccion({ params }) {
  const { seccion } = await params;
  if (!TITULOS[seccion]) notFound();
  const u = await requerir();
  if (DE_EMPRESA.includes(seccion) && !puede(u, 'empresa')) return <SinAcceso texto="Para cambiar esto necesitas el permiso «Datos de la empresa». Pídeselo al administrador." />;
  const llaves = seccion === 'seguridad'
    ? Object.entries((await redis.hgetall(`passkeys:${u.id}`)) || {}).map(([id, k]) => ({ id, nombre: k.nombre, creada: k.creada, usada: k.usada || null }))
    : [];
  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">{TITULOS[seccion]}</h1>
      {seccion === 'marca' && <Marca marca={u.marca} nombre={u.emisor?.nombre} />}
      {seccion === 'seguridad' && <FaceId lista={llaves} />}
      {seccion === 'controlat' && <Controlat activo={Boolean(u.controlat)} />}
      {seccion === 'avisos' && <AvisosPush listo={pushListo()} />}
      {seccion === 'importar' && <Importar />}
      {seccion === 'verifactu' && await (async () => {
        const regs = (await leer(u, 'registros')) || [];
        const cuentas = { hechas: regs.filter((r) => ['Correcto', 'AceptadoConErrores'].includes(r.envio?.estado)).length, rechazadas: regs.filter((r) => r.envio?.estado === 'Incorrecto').length };
        cuentas.pendientes = regs.length - cuentas.hechas - cuentas.rechazadas;
        return <Verifactu modo={u.verifactu || null} admin={u.rol === 'admin'} listo={certificadoListo()} faltaEmisor={!u.emisor?.nif || !u.emisor?.nombre} netto={{ razon: process.env.NETTO_RAZON || '', nif: process.env.NETTO_NIF || '' }} cuentas={cuentas} />;
      })()}
      {['facturacion', 'drive', 'seguridad'].includes(seccion) && <Ajustes seccion={seccion} emisor={u.emisor || {}} drive={u.drive} driveError={u.driveError} sociedad={fiscalDe(u).tipo === 'sociedad'} />}
      {seccion === 'seguridad' && <form method="post" action="/api/logout?todas=1"><button className="borrar ancho">Cerrar sesión en todos los dispositivos</button></form>}
    </main>
  );
}

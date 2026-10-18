import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { esApp } from '@/lib/app';
import { perderia, planQueLoIncluye } from '@/lib/planes';
import { genteDe, usoDe } from '@/lib/usoPlan';
import { estadoVerifactu } from '@/lib/verifactuEstado';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import Ajustes from '@/components/Ajustes';
import Controlat from '@/components/Controlat';
import Marca from '@/components/Marca';
import FaceId from '@/components/FaceId';
import ElegirPlan from '@/components/ElegirPlan';
import estilosPlan from '@/components/ElegirPlan.module.css';
import AvisosPush from '@/components/AvisosPush';
import { pushListo } from '@/lib/push';
import Volver from '@/components/Volver';
import SinAcceso from '@/components/SinAcceso';
import Verifactu from '@/components/Verifactu';
import { certificadoListo } from '@/lib/verifactuEnvio';
import { leer } from '@/lib/redis';
import Importar from '@/components/Importar';
import { fiscalDe } from '@/lib/empresa';

import '@/app/mk.css';
import { documentos } from '@/lib/indices';

export const dynamic = 'force-dynamic';

const TITULOS = { facturacion: 'Datos de facturación', marca: 'Logo y color', seguridad: 'Face ID y contraseña', drive: 'Google Drive', controlat: "Controla'T", avisos: 'Avisos en el móvil', importar: 'Importar datos', verifactu: 'Verifactu', plan: 'Tu plan' };
const DE_EMPRESA = ['plan', 'facturacion', 'marca', 'drive', 'controlat', 'importar', 'verifactu'];

export default async function Seccion({ params }) {
  const { seccion } = await params;
  if (!TITULOS[seccion]) notFound();
  const u = await requerir();
  if (DE_EMPRESA.includes(seccion) && !puede(u, 'empresa')) return <SinAcceso texto="Para cambiar esto necesitas el permiso «Datos de la empresa». Pídeselo al administrador." />;
  const llaves = seccion === 'seguridad'
    ? Object.entries((await redis.hgetall(`passkeys:${u.id}`)) || {}).map(([id, k]) => ({ id, nombre: k.nombre, creada: k.creada, usada: k.usada || null }))
    : [];
  // Tu plan: lo que ha usado en la prueba y su plan no incluye (lib/planes.js), con el plan que lo cubre.
  const usoPlan = seccion === 'plan' && u.plan && !u.plan.pagado
    ? await Promise.all([usoDe(u.empresa), genteDe(u.empresa, leer)]).then(([uso, gente]) => ({ perdidas: perderia(u.plan, uso, gente).map((x) => x.texto), recomendado: planQueLoIncluye(u.plan, uso, gente)?.n || null }))
    : null;
  return (
    <main className={`pagina mk-look${seccion === 'plan' ? ` ${estilosPlan.pagina}` : ''}`}>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">{TITULOS[seccion]}</h1>
      {seccion === 'marca' && <Marca marca={u.marca} nombre={u.emisor?.nombre} />}
      {seccion === 'seguridad' && <FaceId lista={llaves} bloqueo={Boolean(u.bloqueoPantalla)} />}
      {seccion === 'plan' && <ElegirPlan plan={u.plan} uso={usoPlan} admin={u.rol === 'admin'} app={esApp((await headers()).get('user-agent'))} />}
      {seccion === 'controlat' && <Controlat activo={Boolean(u.controlat)} />}
      {seccion === 'avisos' && <AvisosPush listo={pushListo()} />}
      {seccion === 'importar' && <Importar />}
      {seccion === 'verifactu' && await (async () => {
        const regs = await leer(u, 'registros');
        const facturas = await documentos(u, 'facturas', [...new Set((regs || []).map((r) => r.factura))]);
        const cuentas = estadoVerifactu(regs || [], { modo: u.verifactu || undefined, facturas: Object.fromEntries((facturas || []).map((f) => [f.id, f])) });
        return <Verifactu modo={u.verifactu || null} admin={u.rol === 'admin'} listo={certificadoListo()} faltaEmisor={!u.emisor?.nif || !u.emisor?.nombre} netto={{ razon: process.env.NETTO_RAZON || '', nif: process.env.NETTO_NIF || '' }} cuentas={cuentas} />;
      })()}
      {['facturacion', 'drive', 'seguridad'].includes(seccion) && <Ajustes seccion={seccion} emisor={u.emisor || {}} drive={u.drive} driveError={u.driveError} sociedad={fiscalDe(u).tipo === 'sociedad'} />}
      {seccion === 'seguridad' && <form method="post" action="/api/logout?todas=1"><button className="borrar ancho">Cerrar sesión en todos los dispositivos</button></form>}
    </main>
  );
}
